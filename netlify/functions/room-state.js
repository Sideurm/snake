const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError } = require("./_http");
const { ensureRoomsSchema, getRoomStateByCode, normalizeRoomCode } = require("./_rooms");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureRoomsSchema();

    const roomCode = normalizeRoomCode(event.queryStringParameters && event.queryStringParameters.code);
    if (!roomCode) return badRequest("invalid_room_code");

    const room = await getRoomStateByCode(roomCode);
    if (!room) return badRequest("room_not_found");

    const me = room.players.find((p) => Number(p.userId) === Number(payload.uid)) || null;
    if (!me) return unauthorized("not_room_member");
    return json(200, { ok: true, room, me });
  } catch (error) {
    return internalError(error);
  }
};
