const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, internalError } = require("./_http");
const { ensureFriendsSchema } = require("./_friends");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureFriendsSchema();

    const friendsResult = await query(
      `select u.id, u.nickname, u.email, f.created_at
       from friends f
       join users u on u.id = f.friend_user_id
       where f.user_id = $1
       order by f.created_at desc`,
      [payload.uid]
    );

    const incomingResult = await query(
      `select fr.id, fr.from_user_id, u.nickname, u.email, fr.created_at
       from friend_requests fr
       join users u on u.id = fr.from_user_id
       where fr.to_user_id = $1 and fr.status = 'pending'
       order by fr.created_at desc`,
      [payload.uid]
    );

    const outgoingResult = await query(
      `select fr.id, fr.to_user_id, u.nickname, u.email, fr.created_at
       from friend_requests fr
       join users u on u.id = fr.to_user_id
       where fr.from_user_id = $1 and fr.status = 'pending'
       order by fr.created_at desc`,
      [payload.uid]
    );

    return json(200, {
      ok: true,
      friends: friendsResult.rows.map((r) => ({
        id: Number(r.id),
        nickname: r.nickname || null,
        email: r.email,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null
      })),
      incoming: incomingResult.rows.map((r) => ({
        requestId: Number(r.id),
        userId: Number(r.from_user_id),
        nickname: r.nickname || null,
        email: r.email,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null
      })),
      outgoing: outgoingResult.rows.map((r) => ({
        requestId: Number(r.id),
        userId: Number(r.to_user_id),
        nickname: r.nickname || null,
        email: r.email,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null
      }))
    });
  } catch (error) {
    return internalError(error);
  }
};
