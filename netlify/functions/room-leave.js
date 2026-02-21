const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const { ensureRoomsSchema, normalizeRoomCode, getRoomStateByCode } = require("./_rooms");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureRoomsSchema();

    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");

    const roomCode = normalizeRoomCode(body.roomCode);
    if (!roomCode) return badRequest("invalid_room_code");

    const roomResult = await query(
      `select id, leader_user_id from game_rooms where room_code = $1 limit 1`,
      [roomCode]
    );
    if (roomResult.rowCount === 0) return badRequest("room_not_found");

    const roomId = Number(roomResult.rows[0].id);
    const previousLeaderUserId = Number(roomResult.rows[0].leader_user_id);

    const membershipResult = await query(
      `select 1 from room_players where room_id = $1 and user_id = $2 limit 1`,
      [roomId, payload.uid]
    );
    if (membershipResult.rowCount === 0) return unauthorized("not_room_member");

    await query(`delete from room_players where room_id = $1 and user_id = $2`, [roomId, payload.uid]);

    const playersLeftResult = await query(
      `select user_id from room_players where room_id = $1 order by slot asc`,
      [roomId]
    );

    if (playersLeftResult.rowCount === 0) {
      await query(`delete from game_rooms where id = $1`, [roomId]);
      return json(200, { ok: true, room: null });
    }

    const playersLeft = playersLeftResult.rows.map((row) => Number(row.user_id));
    const isLeaderLeaving = Number(payload.uid) === previousLeaderUserId;
    let newLeader = previousLeaderUserId;

    if (isLeaderLeaving) {
      if (playersLeft.length >= 2) {
        const randomIndex = Math.floor(Math.random() * playersLeft.length);
        newLeader = playersLeft[randomIndex];
      } else {
        newLeader = playersLeft[0];
      }
    }

    await query(
      `update game_rooms
       set leader_user_id = $2,
           status = 'waiting',
           winner_user_id = null,
           winner_score = null,
           updated_at = now()
       where id = $1`,
      [roomId, newLeader]
    );

    await query(
      `update room_players
       set current_score = 0,
           run_finished = false
       where room_id = $1`,
      [roomId]
    );

    const room = await getRoomStateByCode(roomCode);
    return json(200, { ok: true, room });
  } catch (error) {
    return internalError(error);
  }
};
