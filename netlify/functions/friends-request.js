const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const { ensureFriendsSchema, areFriends, getPendingBetween, addMutualFriendship } = require("./_friends");

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
    if (targetId === me) return badRequest("cannot_add_self");

    const userExists = await query("select 1 from users where id = $1 limit 1", [targetId]);
    if (userExists.rowCount === 0) return badRequest("user_not_found");

    if (await areFriends(me, targetId)) return badRequest("already_friends");

    const pending = await getPendingBetween(me, targetId);
    if (pending) {
      if (Number(pending.from_user_id) === me) return badRequest("request_already_sent");

      await addMutualFriendship(me, targetId);
      await query(
        `update friend_requests
         set status = 'accepted', updated_at = now()
         where id = $1`,
        [pending.id]
      );
      return json(200, { ok: true, autoAccepted: true });
    }

    const inserted = await query(
      `insert into friend_requests(from_user_id, to_user_id, status, created_at, updated_at)
       values($1, $2, 'pending', now(), now())
       returning id`,
      [me, targetId]
    );

    return json(200, { ok: true, requestId: Number(inserted.rows[0].id) });
  } catch (error) {
    return internalError(error);
  }
};
