const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError } = require("./_http");
const { ensureClansSchema, getUserClan, monthKeyUTC, MONTH_TARGET_WINS, addClanActivity } = require("./_clans");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureClansSchema();

    const clan = await getUserClan(payload.uid);
    if (!clan) return badRequest("not_in_clan");

    const monthKey = monthKeyUTC();
    const progressResult = await query(
      `select wins from clan_monthly_progress where clan_id = $1 and month_key = $2 limit 1`,
      [clan.id, monthKey]
    );
    const wins = progressResult.rowCount ? Number(progressResult.rows[0].wins || 0) : 0;
    if (wins < MONTH_TARGET_WINS) return badRequest("target_not_reached");

    const inserted = await query(
      `insert into clan_monthly_claims(clan_id, month_key, user_id)
       values($1, $2, $3)
       on conflict do nothing
       returning user_id`,
      [clan.id, monthKey, payload.uid]
    );
    if (inserted.rowCount === 0) return badRequest("already_claimed");

    const rewards = {
      commonBoxes: 5,
      rareBoxes: 3,
      superBoxes: Math.random() < 0.4 ? 1 : 0
    };

    const progressUpdate = await query(
      `insert into user_progress(user_id, progress_json, updated_at)
       values($1, jsonb_build_object(
         'boxInventory',
         jsonb_build_object('common', $2, 'rare', $3, 'super', $4)
       ), now())
       on conflict (user_id)
       do update set
         progress_json = jsonb_set(
           jsonb_set(
             jsonb_set(
               coalesce(user_progress.progress_json, '{}'::jsonb),
               '{boxInventory,common}',
               to_jsonb(greatest(
                 0,
                 coalesce((coalesce(user_progress.progress_json, '{}'::jsonb)->'boxInventory'->>'common')::int, 0) + $2
               )),
               true
             ),
             '{boxInventory,rare}',
             to_jsonb(greatest(
               0,
               coalesce((coalesce(user_progress.progress_json, '{}'::jsonb)->'boxInventory'->>'rare')::int, 0) + $3
             )),
             true
           ),
           '{boxInventory,super}',
           to_jsonb(greatest(
             0,
             coalesce((coalesce(user_progress.progress_json, '{}'::jsonb)->'boxInventory'->>'super')::int, 0) + $4
           )),
           true
         ),
         updated_at = now()
       returning progress_json`,
      [payload.uid, rewards.commonBoxes, rewards.rareBoxes, rewards.superBoxes]
    );
    const progressJson = progressUpdate.rowCount ? (progressUpdate.rows[0].progress_json || {}) : {};
    const nextBoxInventoryRaw = progressJson.boxInventory && typeof progressJson.boxInventory === "object"
      ? progressJson.boxInventory
      : {};
    const boxInventory = {
      common: Math.max(0, Number(nextBoxInventoryRaw.common || 0)),
      rare: Math.max(0, Number(nextBoxInventoryRaw.rare || 0)),
      super: Math.max(0, Number(nextBoxInventoryRaw.super || 0))
    };
    await addClanActivity(clan.id, payload.uid, "mega_claimed", {
      monthKey,
      rewards
    });

    return json(200, {
      ok: true,
      monthKey,
      wins,
      targetWins: MONTH_TARGET_WINS,
      rewards,
      boxInventory
    });
  } catch (error) {
    return internalError(error);
  }
};
