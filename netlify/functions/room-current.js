const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, internalError } = require("./_http");
const { ensureRoomsSchema, getUserCurrentRoomState } = require("./_rooms");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureRoomsSchema();

    const room = await getUserCurrentRoomState(payload.uid, ["waiting", "active", "finished"]);
    return json(200, { ok: true, room: room || null });
  } catch (error) {
    return internalError(error);
  }
};
