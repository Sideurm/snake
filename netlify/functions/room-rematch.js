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

    const room = roomResult.rows[0];
    if (Number(room.leader_user_id) !== Number(payload.uid)) return unauthorized("leader_only");

    const roomId = Number(room.id);

    await query(
      `update game_rooms
       set status = 'waiting',
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
