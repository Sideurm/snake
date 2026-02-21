const { query } = require("./_db");
const { verifyPassword, issueUserToken } = require("./_auth");
const { normalizeNickname } = require("./_nickname");
const { json, badRequest, methodNotAllowed, unauthorized, internalError, parseBody } = require("./_http");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");

    const identifier = String(body.identifier || body.email || "").trim();
    const identifierEmail = identifier.toLowerCase();
    const identifierNick = normalizeNickname(identifier);
    const password = String(body.password || "");

    if (!identifier || !password) return badRequest("identifier_password_required");

    const result = await query(
      `select id, email, nickname, password_hash, is_banned, ban_reason
       from users
       where email = $1 or nickname_norm = $2
       limit 1`,
      [identifierEmail, identifierNick]
    );
    if (result.rowCount === 0) return unauthorized("invalid_credentials");

    const user = result.rows[0];
    if (user.is_banned) {
      return json(403, {
        error: "user_banned",
        reason: user.ban_reason || ""
      });
    }
    if (!verifyPassword(password, user.password_hash)) return unauthorized("invalid_credentials");

    const token = issueUserToken(user);
    return json(200, {
      ok: true,
      token,
      user: { id: user.id, email: user.email, nickname: user.nickname || null }
    });
  } catch (error) {
    return internalError(error);
  }
};
