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
      `select id, leader_user_id, max_players from game_rooms where room_code = $1 limit 1`,
      [roomCode]
    );
    if (roomResult.rowCount === 0) return badRequest("room_not_found");

    const room = roomResult.rows[0];
    const roomId = Number(room.id);
    if (Number(room.leader_user_id) !== Number(payload.uid)) return unauthorized("leader_only");

    const playersCountResult = await query(
      `select count(*)::int as cnt from room_players where room_id = $1`,
      [roomId]
    );
    const playersCount = Number(playersCountResult.rows[0].cnt || 0);
    const maxPlayers = Number(room.max_players || 2);
    if (playersCount !== maxPlayers) return badRequest("room_not_full");

    await query(
      `update game_rooms
       set status = 'active',
           challenge_id = challenge_id + 1,
           winner_user_id = null,
           winner_score = null,
           last_death_user_id = null,
           last_death_at = null,
           updated_at = now()
       where id = $1`,
      [roomId]
    );

    await query(
      `update room_players
       set current_score = 0,
           run_finished = false
       where room_id = $1`,
      [roomId]
    );

    const updatedRoom = await getRoomStateByCode(roomCode);
    return json(200, { ok: true, room: updatedRoom });
  } catch (error) {
    return internalError(error);
  }
};
