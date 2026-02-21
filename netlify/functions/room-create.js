const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const {
  ensureRoomsSchema,
  clampTargetScore,
  clampSnakeSpeed,
  clampMaxPlayers,
  normalizePublicFlag,
  randomRoomCode,
  getRoomStateByCode
} = require("./_rooms");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureRoomsSchema();

    const body = parseBody(event);
    if (body === null) return badRequest("invalid_json");

    const targetScore = clampTargetScore(body && body.targetScore);
    const snakeSpeed = clampSnakeSpeed(body && body.snakeSpeed);
    const maxPlayers = clampMaxPlayers(body && body.maxPlayers);
    const isPublic = normalizePublicFlag(body && body.isPublic);

    const userResult = await query("select id from users where id = $1 limit 1", [payload.uid]);
    if (userResult.rowCount === 0) return unauthorized("user_not_found");

    const inRoomResult = await query(
      `select gr.room_code
       from room_players rp
       join game_rooms gr on gr.id = rp.room_id
       where rp.user_id = $1 and gr.status in ('waiting', 'active')
       order by gr.id desc
       limit 1`,
      [payload.uid]
    );
    if (inRoomResult.rowCount > 0) {
      const room = await getRoomStateByCode(inRoomResult.rows[0].room_code);
      return json(200, { ok: true, room, reused: true });
    }

    let roomCode = "";
    let roomId = null;

    for (let i = 0; i < 8; i += 1) {
      roomCode = randomRoomCode(6);
      try {
        const created = await query(
          `insert into game_rooms(room_code, leader_user_id, target_score, snake_speed, max_players, is_public, status, challenge_id, winner_user_id, winner_score, updated_at)
           values($1, $2, $3, $4, $5, $6, 'waiting', 0, null, null, now())
           returning id`,
          [roomCode, payload.uid, targetScore, snakeSpeed, maxPlayers, isPublic]
        );
        roomId = Number(created.rows[0].id);
        break;
      } catch (error) {
        if (error && error.code === "23505") continue;
        throw error;
      }
    }

    if (!roomId || !roomCode) {
      return internalError(new Error("room_code_generation_failed"));
    }

    await query(
      `insert into room_players(room_id, user_id, slot, current_score, run_finished)
       values($1, $2, 1, 0, false)
       on conflict (room_id, user_id)
       do update set slot = 1`,
      [roomId, payload.uid]
    );

    const room = await getRoomStateByCode(roomCode);
    return json(200, { ok: true, room });
  } catch (error) {
    return internalError(error);
  }
};
