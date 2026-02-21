const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const { ensureRoomsSchema, getRoomStateByCode, getUserCurrentRoomState, normalizeRoomCode } = require("./_rooms");

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
      `select id, status, max_players from game_rooms where room_code = $1 limit 1`,
      [roomCode]
    );
    if (roomResult.rowCount === 0) return badRequest("room_not_found");

    const roomId = Number(roomResult.rows[0].id);
    const status = roomResult.rows[0].status;
    if (status === "active") return badRequest("room_in_game");

    const existingMembership = await query(
      `select 1 from room_players where room_id = $1 and user_id = $2 limit 1`,
      [roomId, payload.uid]
    );
    if (existingMembership.rowCount > 0) {
      const room = await getRoomStateByCode(roomCode);
      return json(200, { ok: true, room, reused: true });
    }

    const currentRoom = await getUserCurrentRoomState(payload.uid, ["waiting", "active"]);
    if (currentRoom) {
      return json(200, { ok: true, room: currentRoom, reused: true, alreadyInRoom: true });
    }

    const playersResult = await query(
      `select slot from room_players where room_id = $1 order by slot asc`,
      [roomId]
    );
    const count = playersResult.rowCount;
    const maxPlayers = Number(roomResult.rows[0].max_players || 2);
    if (count >= maxPlayers) return badRequest("room_full");

    const occupied = new Set(playersResult.rows.map((row) => Number(row.slot)));
    let slot = 0;
    for (let i = 1; i <= maxPlayers; i += 1) {
      if (!occupied.has(i)) {
        slot = i;
        break;
      }
    }
    if (!slot) return badRequest("room_full");

    await query(
      `insert into room_players(room_id, user_id, slot, current_score, run_finished)
       values($1, $2, $3, 0, false)`,
      [roomId, payload.uid, slot]
    );

    await query(`update game_rooms set updated_at = now() where id = $1`, [roomId]);

    const room = await getRoomStateByCode(roomCode);
    return json(200, { ok: true, room });
  } catch (error) {
    return internalError(error);
  }
};
