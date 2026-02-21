const { query } = require("./_db");
const { hashPassword, issueUserToken } = require("./_auth");
const { normalizeNickname, validateNickname } = require("./_nickname");
const { json, badRequest, methodNotAllowed, internalError, parseBody } = require("./_http");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const nickname = String(body.nickname || "").trim();
    const nicknameNorm = normalizeNickname(nickname);

    if (!email || !email.includes("@")) return badRequest("invalid_email");
    if (password.length < 6) return badRequest("password_too_short");
    const nickValidation = validateNickname(nickname);
    if (!nickValidation.ok) return badRequest(nickValidation.reason);

    const exists = await query("select id from users where email = $1 limit 1", [email]);
    if (exists.rowCount > 0) return json(409, { error: "email_already_exists" });
    const nickExists = await query("select id from users where nickname_norm = $1 limit 1", [nicknameNorm]);
    if (nickExists.rowCount > 0) return json(409, { error: "nickname_already_exists" });

    const passwordHash = hashPassword(password);
    const inserted = await query(
      "insert into users(email, password_hash, nickname, nickname_norm) values($1, $2, $3, $4) returning id, email, nickname",
      [email, passwordHash, nickname, nicknameNorm]
    );
    const user = inserted.rows[0];

    await query(
      "insert into user_progress(user_id, progress_json) values($1, $2::jsonb) on conflict (user_id) do nothing",
      [user.id, "{}"]
    );

    const token = issueUserToken(user);
    return json(200, {
      ok: true,
      token,
      user: { id: user.id, email: user.email, nickname: user.nickname }
    });
  } catch (error) {
    return internalError(error);
  }
};
