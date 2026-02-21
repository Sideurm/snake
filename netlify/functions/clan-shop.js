const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError } = require("./_http");
const { ensureClansSchema, getUserClan } = require("./_clans");
const { CLAN_SHOP_OFFERS } = require("./_clan_shop");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureClansSchema();

    const clan = await getUserClan(payload.uid);
    if (!clan) return badRequest("not_in_clan");

    const unlocksRes = await query(
      `select item_id, unlocked_by_user_id, unlocked_at
       from clan_shop_unlocks
       where clan_id = $1
       order by unlocked_at desc`,
      [clan.id]
    );

    return json(200, {
      ok: true,
      clanId: clan.id,
      clanCoins: Number(clan.coins || 0),
      offers: CLAN_SHOP_OFFERS,
      unlocks: unlocksRes.rows.map((row) => ({
        itemId: row.item_id,
        unlockedByUserId: row.unlocked_by_user_id ? Number(row.unlocked_by_user_id) : null,
        unlockedAt: row.unlocked_at ? new Date(row.unlocked_at).toISOString() : null
      }))
    });
  } catch (error) {
    return internalError(error);
  }
};
