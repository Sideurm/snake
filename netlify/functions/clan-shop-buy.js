const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const { ensureClansSchema, getUserClan, canManageClan, addClanActivity } = require("./_clans");
const { getClanShopOffer, CLAN_SHOP_OFFERS } = require("./_clan_shop");

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

    const itemId = String(body.itemId || "").trim();
    const offer = getClanShopOffer(itemId);
    if (!offer) return badRequest("item_not_found");

    const already = await query(
      `select 1 from clan_shop_unlocks where clan_id = $1 and item_id = $2 limit 1`,
      [clan.id, itemId]
    );
    if (already.rowCount > 0) return badRequest("already_unlocked");

    const debited = await query(
      `update clans
       set coins = coins - $2
       where id = $1 and coins >= $2
       returning coins`,
      [clan.id, offer.cost]
    );
    if (debited.rowCount === 0) return badRequest("not_enough_clan_coins");

    await query(
      `insert into clan_shop_unlocks(clan_id, item_id, unlocked_by_user_id)
       values($1, $2, $3)
       on conflict do nothing`,
      [clan.id, itemId, payload.uid]
    );

    await addClanActivity(clan.id, payload.uid, "shop_unlock", {
      itemId,
      cost: offer.cost
    });

    const unlocksRes = await query(
      `select item_id, unlocked_by_user_id, unlocked_at
       from clan_shop_unlocks
       where clan_id = $1
       order by unlocked_at desc`,
      [clan.id]
    );

    return json(200, {
      ok: true,
      clanCoins: Number(debited.rows[0].coins || 0),
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
