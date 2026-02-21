const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { normalizeNickname, validateNickname } = require("./_nickname");
const { json, badRequest, methodNotAllowed, unauthorized, internalError, parseBody } = require("./_http");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");

    const nickname = String(body.nickname || "").trim();
    const nicknameNorm = normalizeNickname(nickname);
    const check = validateNickname(nickname);
    if (!check.ok) return badRequest(check.reason);

    const exists = await query(
      "select id from users where nickname_norm = $1 and id <> $2 limit 1",
      [nicknameNorm, payload.uid]
    );
    if (exists.rowCount > 0) return json(409, { error: "nickname_already_exists" });

    const updated = await query(
      "update users set nickname = $1, nickname_norm = $2 where id = $3 returning id, email, nickname",
      [nickname, nicknameNorm, payload.uid]
    );
    if (updated.rowCount === 0) return unauthorized("user_not_found");

    const user = updated.rows[0];
    return json(200, { ok: true, user: { id: user.id, email: user.email, nickname: user.nickname } });
  } catch (error) {
    return internalError(error);
  }
};
