const { query } = require("./_db");
const { verifyPassword, issueUserToken } = require("./_auth");
const { normalizeNickname } = require("./_nickname");
const { json, badRequest, methodNotAllowed, unauthorized, internalError, parseBody } = require("./_http");
const { ensureModerationSchema, normalizeStaffRole, recordSecurityEvent, getRequestIp } = require("./_moderation");

async function safeRecordSecurityEvent(payload) {
  try {
    await recordSecurityEvent(payload);
  } catch (_) {
    // do not break auth flow if security log insert fails
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    await ensureModerationSchema();
    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");

    const identifier = String(body.identifier || body.email || "").trim();
    const identifierEmail = identifier.toLowerCase();
    const identifierNick = normalizeNickname(identifier);
    const password = String(body.password || "");

    if (!identifier || !password) return badRequest("identifier_password_required");

    const result = await query(
      `select id, email, nickname, password_hash, is_banned, ban_reason, staff_role
       from users
       where email = $1 or nickname_norm = $2
       limit 1`,
      [identifierEmail, identifierNick]
    );
    if (result.rowCount === 0) {
      await safeRecordSecurityEvent({
        source: "auth_login",
        eventType: "unknown_identifier",
        severity: "low",
        ip: getRequestIp(event),
        details: {
          identifierPreview: identifierEmail.slice(0, 80)
        }
      });
      return unauthorized("invalid_credentials");
    }

    const user = result.rows[0];
    if (user.is_banned) {
      await safeRecordSecurityEvent({
        userId: Number(user.id),
        source: "auth_login",
        eventType: "banned_login_attempt",
        severity: "high",
        ip: getRequestIp(event)
      });
      return json(403, {
        error: "user_banned",
        reason: user.ban_reason || ""
      });
    }
    if (!verifyPassword(password, user.password_hash)) {
      await safeRecordSecurityEvent({
        userId: Number(user.id),
        source: "auth_login",
        eventType: "invalid_password",
        severity: "medium",
        ip: getRequestIp(event)
      });
      return unauthorized("invalid_credentials");
    }

    const token = issueUserToken(user);
    return json(200, {
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname || null,
        staffRole: normalizeStaffRole(user.staff_role)
      }
    });
  } catch (error) {
    return internalError(error);
  }
};
