const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");

const STAFF_ROLE_SET = new Set(["moderator", "admin"]);
const SEVERITY_SET = new Set(["low", "medium", "high", "critical"]);

let moderationSchemaReady = false;
let moderationSchemaPromise = null;

function normalizeStaffRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (STAFF_ROLE_SET.has(role)) return role;
  return "player";
}

function isStaffRole(value) {
  return STAFF_ROLE_SET.has(normalizeStaffRole(value));
}

function normalizeSeverity(value) {
  const severity = String(value || "").trim().toLowerCase();
  if (SEVERITY_SET.has(severity)) return severity;
  return "medium";
}

function sanitizeText(value, maxLen, fallback = "") {
  const text = String(value == null ? "" : value).trim();
  if (!text) return fallback;
  if (!Number.isFinite(maxLen) || maxLen <= 0) return text;
  return text.slice(0, maxLen);
}

function sanitizeDetails(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  try {
    const packed = JSON.stringify(raw);
    if (!packed) return {};
    if (packed.length > 3000) {
      return {
        truncated: true,
        preview: packed.slice(0, 1200)
      };
    }
    return JSON.parse(packed);
  } catch (_) {
    return {};
  }
}

function getRequestIp(event) {
  const headers = event && event.headers ? event.headers : {};
  const raw = headers["x-forwarded-for"] || headers["X-Forwarded-For"] || headers["client-ip"] || headers["Client-Ip"] || "";
  const first = String(raw).split(",")[0] || "";
  return sanitizeText(first, 96, "");
}

async function ensureModerationSchema() {
  if (moderationSchemaReady) return;
  if (moderationSchemaPromise) {
    await moderationSchemaPromise;
    return;
  }

  moderationSchemaPromise = (async () => {
    await query(`alter table users add column if not exists staff_role text not null default 'player';`);
    try {
      await query(`alter table users add constraint users_staff_role_check check (staff_role in ('player', 'moderator', 'admin'));`);
    } catch (error) {
      if (!error || error.code !== "42710") throw error; // duplicate_object
    }
    await query(`create index if not exists idx_users_staff_role on users(staff_role);`);

    await query(`
      create table if not exists admin_chat_messages (
        id bigserial primary key,
        user_id bigint not null references users(id) on delete cascade,
        kind text not null default 'note',
        message text not null,
        created_at timestamptz not null default now(),
        constraint admin_chat_messages_kind_check check (kind in ('note', 'bug', 'alert'))
      );
    `);
    await query(`create index if not exists idx_admin_chat_messages_created on admin_chat_messages(created_at desc);`);

    await query(`
      create table if not exists social_notices (
        id bigserial primary key,
        staff_user_id bigint not null references users(id) on delete cascade,
        title text not null,
        message text not null,
        is_pinned boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);
    await query(`create index if not exists idx_social_notices_order on social_notices(is_pinned desc, id desc);`);

    await query(`
      create table if not exists security_events (
        id bigserial primary key,
        user_id bigint references users(id) on delete set null,
        staff_user_id bigint references users(id) on delete set null,
        source text not null,
        event_type text not null default 'suspicious_action',
        severity text not null default 'medium',
        details jsonb not null default '{}'::jsonb,
        ip text,
        created_at timestamptz not null default now(),
        constraint security_events_severity_check check (severity in ('low', 'medium', 'high', 'critical'))
      );
    `);
    await query(`create index if not exists idx_security_events_created on security_events(created_at desc);`);
    await query(`create index if not exists idx_security_events_severity_created on security_events(severity, created_at desc);`);
    await query(`create index if not exists idx_security_events_user_source_type on security_events(user_id, source, event_type, created_at desc);`);

    moderationSchemaReady = true;
  })();

  try {
    await moderationSchemaPromise;
  } finally {
    moderationSchemaPromise = null;
  }
}

async function findUserById(userIdRaw) {
  const userId = Number(userIdRaw);
  if (!Number.isFinite(userId) || userId <= 0) return null;
  await ensureModerationSchema();
  const result = await query(
    `select id, email, nickname, staff_role, is_banned, ban_reason
     from users
     where id = $1
     limit 1`,
    [userId]
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  return {
    id: Number(row.id),
    email: row.email || null,
    nickname: row.nickname || null,
    staffRole: normalizeStaffRole(row.staff_role),
    isBanned: !!row.is_banned,
    banReason: row.ban_reason || ""
  };
}

async function requireAuthenticatedUser(event) {
  const token = extractBearerToken(event && event.headers ? event.headers : {});
  const payload = verifyToken(token);
  if (!payload || !payload.uid) {
    throw { statusCode: 401, error: "invalid_token" };
  }
  const user = await findUserById(payload.uid);
  if (!user) {
    throw { statusCode: 401, error: "user_not_found" };
  }
  if (user.isBanned) {
    throw { statusCode: 403, error: "user_banned", reason: user.banReason || "" };
  }
  return user;
}

async function requireStaffUser(event) {
  const user = await requireAuthenticatedUser(event);
  if (!isStaffRole(user.staffRole)) {
    throw { statusCode: 403, error: "staff_only" };
  }
  return user;
}

async function recordSecurityEvent(options = {}) {
  await ensureModerationSchema();
  const userId = Number.isFinite(Number(options.userId)) ? Number(options.userId) : null;
  const staffUserId = Number.isFinite(Number(options.staffUserId)) ? Number(options.staffUserId) : null;
  const source = sanitizeText(options.source, 64, "unknown_source");
  const eventType = sanitizeText(options.eventType, 64, "suspicious_action");
  const severity = normalizeSeverity(options.severity);
  const details = sanitizeDetails(options.details);
  const ip = sanitizeText(options.ip, 96, "");

  const inserted = await query(
    `insert into security_events(user_id, staff_user_id, source, event_type, severity, details, ip)
     values($1, $2, $3, $4, $5, $6::jsonb, $7)
     returning id, created_at`,
    [userId, staffUserId, source, eventType, severity, JSON.stringify(details), ip || null]
  );
  const row = inserted.rows[0];
  return {
    id: Number(row.id),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
  };
}

module.exports = {
  ensureModerationSchema,
  normalizeStaffRole,
  normalizeSeverity,
  sanitizeText,
  sanitizeDetails,
  getRequestIp,
  isStaffRole,
  requireAuthenticatedUser,
  requireStaffUser,
  recordSecurityEvent
};
