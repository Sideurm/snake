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
      `select u.id,
              u.nickname,
              u.email,
              f.created_at,
              case
                when (up.progress_json ->> 'trophies') ~ '^-?[0-9]+$'
                  then greatest(0, (up.progress_json ->> 'trophies')::int)
                else 0
              end as trophies,
              room_info.room_code as room_code,
              room_info.room_status as room_status,
              room_info.room_is_public as room_is_public,
              room_info.players_count as room_players_count,
              room_info.max_players as room_max_players
       from friends f
       join users u on u.id = f.friend_user_id
       left join user_progress up on up.user_id = u.id
       left join lateral (
         select gr.room_code,
                gr.status as room_status,
                gr.is_public as room_is_public,
                gr.max_players,
                (select count(*)::int from room_players rp2 where rp2.room_id = gr.id) as players_count
         from room_players rp
         join game_rooms gr on gr.id = rp.room_id
         where rp.user_id = u.id
           and gr.status in ('waiting', 'active')
         order by gr.updated_at desc
         limit 1
       ) room_info on true
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
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        trophies: Number(r.trophies || 0),
        roomCode: r.room_code || null,
        roomStatus: r.room_status || null,
        roomIsPublic: r.room_is_public === true,
        roomPlayersCount: r.room_players_count == null ? null : Number(r.room_players_count),
        roomMaxPlayers: r.room_max_players == null ? null : Number(r.room_max_players)
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
