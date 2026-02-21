const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, internalError } = require("./_http");
const {
  ensureClansSchema,
  getUserClan,
  getClanMembers,
  monthKeyUTC,
  MONTH_TARGET_WINS,
  canManageClan,
  canManageMembers,
  canManageRoles,
  getClanActiveWar
} = require("./_clans");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureClansSchema();

    const clan = await getUserClan(payload.uid);
    if (!clan) {
      return json(200, { ok: true, clan: null, monthKey: monthKeyUTC(), targetWins: MONTH_TARGET_WINS });
    }

    const monthKey = monthKeyUTC();
    const progressResult = await query(
      `select wins from clan_monthly_progress where clan_id = $1 and month_key = $2 limit 1`,
      [clan.id, monthKey]
    );
    const wins = progressResult.rowCount ? Number(progressResult.rows[0].wins || 0) : 0;

    const claimedResult = await query(
      `select 1 from clan_monthly_claims where clan_id = $1 and month_key = $2 and user_id = $3 limit 1`,
      [clan.id, monthKey, payload.uid]
    );

    const members = await getClanMembers(clan.id);

    const activeWar = await getClanActiveWar(clan.id);
    const unlocksResult = await query(
      `select item_id, unlocked_by_user_id, unlocked_at
       from clan_shop_unlocks
       where clan_id = $1
       order by unlocked_at desc`,
      [clan.id]
    );

    return json(200, {
      ok: true,
      monthKey,
      targetWins: MONTH_TARGET_WINS,
      clan: {
        ...clan,
        members,
        wins,
        claimed: claimedResult.rowCount > 0,
        canClaim: wins >= MONTH_TARGET_WINS && claimedResult.rowCount === 0,
        permissions: {
          canManageClan: canManageClan(clan.role),
          canManageMembers: canManageMembers(clan.role),
          canManageRoles: canManageRoles(clan.role)
        },
        activeWar,
        shopUnlocks: unlocksResult.rows.map((row) => ({
          itemId: row.item_id,
          unlockedByUserId: row.unlocked_by_user_id ? Number(row.unlocked_by_user_id) : null,
          unlockedAt: row.unlocked_at ? new Date(row.unlocked_at).toISOString() : null
        }))
      },
      inviteLink: clan.inviteCode ? `?clanInvite=${encodeURIComponent(clan.inviteCode)}` : ""
    });
  } catch (error) {
    return internalError(error);
  }
};
