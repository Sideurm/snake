const { query } = require("./_db");
const { json, methodNotAllowed, internalError } = require("./_http");
const { ensureModerationSchema, requireStaffUser } = require("./_moderation");

function authErrorResponse(error) {
  if (!error || !Number.isFinite(Number(error.statusCode)) || !error.error) return null;
  const payload = { error: error.error };
  if (error.reason) payload.reason = String(error.reason);
  return json(Number(error.statusCode), payload);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    await ensureModerationSchema();
    const staffUser = await requireStaffUser(event);

    const rawLimit = Number.parseInt((event.queryStringParameters && event.queryStringParameters.limit) || "80", 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(20, Math.min(250, rawLimit)) : 80;

    const [eventsResult, severityResult, typeResult, bugsResult] = await Promise.all([
      query(
        `select e.id, e.user_id, e.staff_user_id, e.source, e.event_type, e.severity, e.details, e.ip, e.created_at,
                u.nickname as user_nickname, u.email as user_email,
                s.nickname as staff_nickname, s.email as staff_email
         from security_events e
         left join users u on u.id = e.user_id
         left join users s on s.id = e.staff_user_id
         order by e.id desc
         limit $1`,
        [limit]
      ),
      query(
        `select severity, count(*)::int as total
         from security_events
         where created_at >= now() - interval '24 hours'
         group by severity`
      ),
      query(
        `select event_type, count(*)::int as total
         from security_events
         where created_at >= now() - interval '24 hours'
         group by event_type
         order by total desc, event_type asc
         limit 16`
      ),
      query(
        `select m.id, m.user_id, m.kind, m.message, m.created_at, u.nickname, u.email, u.staff_role
         from admin_chat_messages m
         left join users u on u.id = m.user_id
         where m.kind = 'bug'
         order by m.id desc
         limit 30`
      )
    ]);

    const bySeverity = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };
    for (const row of severityResult.rows) {
      const key = String(row.severity || "").toLowerCase();
      if (!(key in bySeverity)) continue;
      bySeverity[key] = Number(row.total || 0);
    }

    const events24h = bySeverity.low + bySeverity.medium + bySeverity.high + bySeverity.critical;

    return json(200, {
      ok: true,
      viewer: {
        id: staffUser.id,
        nickname: staffUser.nickname || null,
        email: staffUser.email || null,
        staffRole: staffUser.staffRole
      },
      summary: {
        events24h,
        bySeverity,
        topEventTypes: typeResult.rows.map((row) => ({
          eventType: row.event_type || "suspicious_action",
          total: Number(row.total || 0)
        }))
      },
      events: eventsResult.rows.map((row) => ({
        id: Number(row.id),
        userId: row.user_id == null ? null : Number(row.user_id),
        staffUserId: row.staff_user_id == null ? null : Number(row.staff_user_id),
        source: row.source || "unknown_source",
        eventType: row.event_type || "suspicious_action",
        severity: row.severity || "medium",
        details: row.details && typeof row.details === "object" ? row.details : {},
        ip: row.ip || null,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        userNickname: row.user_nickname || null,
        userEmail: row.user_email || null,
        staffNickname: row.staff_nickname || null,
        staffEmail: row.staff_email || null
      })),
      bugReports: bugsResult.rows.map((row) => ({
        id: Number(row.id),
        userId: row.user_id == null ? null : Number(row.user_id),
        kind: row.kind || "bug",
        message: row.message || "",
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        nickname: row.nickname || null,
        email: row.email || null,
        staffRole: row.staff_role || "player"
      }))
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return internalError(error);
  }
};
