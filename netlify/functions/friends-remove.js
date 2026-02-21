const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const { ensureFriendsSchema } = require("./_friends");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureFriendsSchema();

    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");

    const me = Number(payload.uid);
    const targetId = Number.parseInt(body.userId, 10);
    if (!Number.isFinite(targetId) || targetId <= 0) return badRequest("invalid_user_id");

    await query(
      `delete from friends
       where (user_id = $1 and friend_user_id = $2)
          or (user_id = $2 and friend_user_id = $1)`,
      [me, targetId]
    );

    await query(
      `update friend_requests
       set status = 'rejected', updated_at = now()
       where status = 'pending'
         and ((from_user_id = $1 and to_user_id = $2) or (from_user_id = $2 and to_user_id = $1))`,
      [me, targetId]
    );

    return json(200, { ok: true });
  } catch (error) {
    return internalError(error);
  }
};
