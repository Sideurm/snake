const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const { ensureClansSchema, getUserClan, canManageMembers, addClanActivity } = require("./_clans");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureClansSchema();

    const actorClan = await getUserClan(payload.uid);
    if (!actorClan) return badRequest("not_in_clan");
    if (!canManageMembers(actorClan.role)) return badRequest("forbidden_role");

    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");

    const userId = Number.parseInt(body.userId, 10);
    if (!Number.isFinite(userId) || userId <= 0) return badRequest("invalid_user_id");
    if (userId === payload.uid) return badRequest("cant_kick_self");
    if (userId === Number(actorClan.ownerUserId)) return badRequest("cant_kick_owner");

    const targetRes = await query(
      `select role from clan_members where clan_id = $1 and user_id = $2 limit 1`,
      [actorClan.id, userId]
    );
    if (targetRes.rowCount === 0) return badRequest("member_not_found");

    const targetRole = targetRes.rows[0].role;
    if (actorClan.role === "officer" && targetRole === "officer") return badRequest("officer_cant_kick_officer");

    await query(`delete from clan_members where clan_id = $1 and user_id = $2`, [actorClan.id, userId]);

    await addClanActivity(actorClan.id, payload.uid, "member_kicked", {
      targetUserId: userId,
      targetRole
    });

    return json(200, { ok: true });
  } catch (error) {
    return internalError(error);
  }
};
