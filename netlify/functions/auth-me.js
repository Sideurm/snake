const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, internalError } = require("./_http");
const { ensureModerationSchema, normalizeStaffRole } = require("./_moderation");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    await ensureModerationSchema();
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    const result = await query(
      "select id, email, nickname, is_banned, ban_reason, staff_role from users where id = $1 limit 1",
      [payload.uid]
    );
    if (result.rowCount === 0) return unauthorized("user_not_found");

    const user = result.rows[0];
    if (user.is_banned) {
      return json(403, {
        error: "user_banned",
        reason: user.ban_reason || ""
      });
    }
    return json(200, {
      ok: true,
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
