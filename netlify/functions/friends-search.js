const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError } = require("./_http");
const { ensureFriendsSchema, areFriends, getPendingBetween } = require("./_friends");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureFriendsSchema();

    const rawId = event.queryStringParameters && event.queryStringParameters.id;
    const targetId = Number.parseInt(rawId, 10);
    if (!Number.isFinite(targetId) || targetId <= 0) return badRequest("invalid_user_id");

    const userResult = await query(
      `select id, nickname, email from users where id = $1 limit 1`,
      [targetId]
    );
    if (userResult.rowCount === 0) return badRequest("user_not_found");

    const me = Number(payload.uid);
    let state = "none";
    let requestId = null;

    if (targetId === me) {
      state = "self";
    } else if (await areFriends(me, targetId)) {
      state = "friends";
    } else {
      const pending = await getPendingBetween(me, targetId);
      if (pending) {
        requestId = Number(pending.id);
        if (Number(pending.from_user_id) === me) state = "pending_sent";
        else state = "pending_received";
      }
    }

    const u = userResult.rows[0];
    return json(200, {
      ok: true,
      user: {
        id: Number(u.id),
        nickname: u.nickname || null,
        email: u.email
      },
      relation: {
        state,
        requestId
      }
    });
  } catch (error) {
    return internalError(error);
  }
};
