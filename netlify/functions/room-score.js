const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const { ensureRoomsSchema, normalizeRoomCode, getRoomStateByCode } = require("./_rooms");

function clampScore(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100000, parsed));
}

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

    const score = clampScore(body.score);
    const isFinal = !!body.isFinal;

    const roomResult = await query(
      `select id, status, target_score, winner_user_id
       from game_rooms
       where room_code = $1
       limit 1`,
      [roomCode]
    );
    if (roomResult.rowCount === 0) return badRequest("room_not_found");

    const room = roomResult.rows[0];
    const roomId = Number(room.id);

    const membership = await query(
      `select 1 from room_players where room_id = $1 and user_id = $2 limit 1`,
      [roomId, payload.uid]
    );
    if (membership.rowCount === 0) return unauthorized("not_room_member");

    if (room.status === "active") {
      await query(
        `update room_players
         set current_score = greatest(current_score, $3),
             run_finished = false
         where room_id = $1 and user_id = $2`,
        [roomId, payload.uid, score]
      );

      if (isFinal) {
        await query(
          `update game_rooms
           set last_death_user_id = $2,
               last_death_at = now(),
               updated_at = now()
           where id = $1
             and status = 'active'`,
          [roomId, payload.uid]
        );
      }

      await query(
        `update game_rooms
         set winner_user_id = $2,
             winner_score = $3,
             status = 'finished',
             updated_at = now()
         where id = $1
           and status = 'active'
           and winner_user_id is null
           and $3 >= target_score`,
        [roomId, payload.uid, score]
      );

    }

    const updatedRoom = await getRoomStateByCode(roomCode);
    return json(200, { ok: true, room: updatedRoom });
  } catch (error) {
    return internalError(error);
  }
};
