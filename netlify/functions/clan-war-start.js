const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const {
  ensureClansSchema,
  getUserClan,
  getClanById,
  canManageClan,
  CLAN_WAR_TARGET_SCORE,
  addClanActivity,
  mapWarRow
} = require("./_clans");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureClansSchema();

    const clan = await getUserClan(payload.uid);
    if (!clan) return badRequest("not_in_clan");
    if (!canManageClan(clan.role)) return badRequest("forbidden_role");

    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");

    const opponentClanId = Number.parseInt(body.opponentClanId, 10);
    if (!Number.isFinite(opponentClanId) || opponentClanId <= 0) return badRequest("invalid_opponent_clan_id");
    if (opponentClanId === clan.id) return badRequest("invalid_opponent_clan_id");

    const opponent = await getClanById(opponentClanId);
    if (!opponent) return badRequest("opponent_not_found");

    const activeMine = await query(
      `select id from clan_wars where status = 'active' and (clan_a_id = $1 or clan_b_id = $1) limit 1`,
      [clan.id]
    );
    if (activeMine.rowCount > 0) return badRequest("active_war_exists");

    const activeOpp = await query(
      `select id from clan_wars where status = 'active' and (clan_a_id = $1 or clan_b_id = $1) limit 1`,
      [opponentClanId]
    );
    if (activeOpp.rowCount > 0) return badRequest("opponent_in_active_war");

    const created = await query(
      `insert into clan_wars(clan_a_id, clan_b_id, target_score, status, created_by_user_id)
       values($1, $2, $3, 'active', $4)
       returning *`,
      [clan.id, opponentClanId, CLAN_WAR_TARGET_SCORE, payload.uid]
    );

    const war = mapWarRow(created.rows[0]);

    await addClanActivity(clan.id, payload.uid, "war_started", {
      warId: war.id,
      opponentClanId
    });
    await addClanActivity(opponentClanId, payload.uid, "war_started", {
      warId: war.id,
      opponentClanId: clan.id
    });

    return json(200, { ok: true, war });
  } catch (error) {
    return internalError(error);
  }
};
