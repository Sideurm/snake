const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const { ensureRoomsSchema, getRoomStateByCode, normalizeRoomCode } = require("./_rooms");

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

    const room = await getRoomStateByCode(roomCode);
    if (!room) return badRequest("room_not_found");
    if (!room.isPublic) return unauthorized("room_private");

    return json(200, { ok: true, room, spectator: true });
  } catch (error) {
    return internalError(error);
  }
};
