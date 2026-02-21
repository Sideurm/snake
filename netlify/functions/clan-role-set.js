const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const { ensureClansSchema, getUserClan, canManageRoles, addClanActivity } = require("./_clans");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureClansSchema();

    const actorClan = await getUserClan(payload.uid);
    if (!actorClan) return badRequest("not_in_clan");
    if (!canManageRoles(actorClan.role)) return badRequest("forbidden_role");

    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");

    const userId = Number.parseInt(body.userId, 10);
    const role = String(body.role || "").trim();
    if (!Number.isFinite(userId) || userId <= 0) return badRequest("invalid_user_id");
    if (!["member", "officer", "recruiter", "treasurer"].includes(role)) return badRequest("invalid_role");

    if (userId === Number(actorClan.ownerUserId)) return badRequest("cant_change_owner_role");

    const target = await query(
      `select user_id, role from clan_members where clan_id = $1 and user_id = $2 limit 1`,
      [actorClan.id, userId]
    );
    if (target.rowCount === 0) return badRequest("member_not_found");

    await query(
      `update clan_members set role = $3 where clan_id = $1 and user_id = $2`,
      [actorClan.id, userId, role]
    );

    await addClanActivity(actorClan.id, payload.uid, "role_changed", {
      targetUserId: userId,
      role
    });

    return json(200, { ok: true });
  } catch (error) {
    return internalError(error);
  }
};
