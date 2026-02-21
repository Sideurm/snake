const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const {
  ensureRoomsSchema,
  normalizeRoomCode,
  clampTargetScore,
  clampSnakeSpeed,
  clampMaxPlayers,
  normalizePublicFlag,
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
    if (!body) return badRequest("invalid_json");

    const roomCode = normalizeRoomCode(body.roomCode);
    if (!roomCode) return badRequest("invalid_room_code");

    const targetScore = clampTargetScore(body.targetScore);
    const snakeSpeed = clampSnakeSpeed(body.snakeSpeed);
    const maxPlayers = clampMaxPlayers(body.maxPlayers);
    const isPublic = normalizePublicFlag(body.isPublic);

    const roomResult = await query(
      `select id, leader_user_id, status from game_rooms where room_code = $1 limit 1`,
      [roomCode]
    );
    if (roomResult.rowCount === 0) return badRequest("room_not_found");

    const room = roomResult.rows[0];
    if (Number(room.leader_user_id) !== Number(payload.uid)) return unauthorized("leader_only");
    if (room.status === "active") return badRequest("room_in_game");

    const playersCountResult = await query(
      `select count(*)::int as cnt from room_players where room_id = $1`,
      [Number(room.id)]
    );
    const currentPlayers = Number(playersCountResult.rows[0].cnt || 0);
    if (maxPlayers < currentPlayers) return badRequest("max_players_too_low");

    await query(
      `update game_rooms
       set target_score = $2,
           snake_speed = $3,
           max_players = $4,
           is_public = $5,
           updated_at = now()
       where id = $1`,
      [Number(room.id), targetScore, snakeSpeed, maxPlayers, isPublic]
    );

    const updatedRoom = await getRoomStateByCode(roomCode);
    return json(200, { ok: true, room: updatedRoom });
  } catch (error) {
    return internalError(error);
  }
};
