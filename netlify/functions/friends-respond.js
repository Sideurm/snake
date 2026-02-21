const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const { ensureFriendsSchema, addMutualFriendship } = require("./_friends");

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
    const requestId = Number.parseInt(body.requestId, 10);
    const action = String(body.action || "").toLowerCase();
    if (!Number.isFinite(requestId) || requestId <= 0) return badRequest("invalid_request_id");
    if (!["accept", "reject"].includes(action)) return badRequest("invalid_action");

    const requestResult = await query(
      `select id, from_user_id, to_user_id, status
       from friend_requests
       where id = $1
       limit 1`,
      [requestId]
    );
    if (requestResult.rowCount === 0) return badRequest("request_not_found");

    const req = requestResult.rows[0];
    if (Number(req.to_user_id) !== me) return unauthorized("not_request_receiver");
    if (req.status !== "pending") return badRequest("request_not_pending");

    if (action === "accept") {
      await addMutualFriendship(Number(req.from_user_id), Number(req.to_user_id));
      await query(
        `update friend_requests set status = 'accepted', updated_at = now() where id = $1`,
        [requestId]
      );
      return json(200, { ok: true, accepted: true });
    }

    await query(
      `update friend_requests set status = 'rejected', updated_at = now() where id = $1`,
      [requestId]
    );
    return json(200, { ok: true, rejected: true });
  } catch (error) {
    return internalError(error);
  }
};
