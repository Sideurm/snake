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
    const spectateRequested = String((event.queryStringParameters && event.queryStringParameters.spectate) || "").trim() === "1";

    const room = await getRoomStateByCode(roomCode);
    if (!room) return badRequest("room_not_found");

    const me = room.players.find((p) => Number(p.userId) === Number(payload.uid)) || null;
    if (!me) {
      if (spectateRequested && room.isPublic) {
        return json(200, { ok: true, room, me: null, spectator: true });
      }
      return unauthorized("not_room_member");
    }
    return json(200, { ok: true, room, me, spectator: false });
  } catch (error) {
    return internalError(error);
  }
};
