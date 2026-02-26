const { withTransaction } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const { ensurePromoSchema, normalizePromoCode } = require("./_promo");
const { syncUserSeasonStats } = require("./_season");
const { syncUserWeeklyStats } = require("./_weekly_leaderboard");

function parseProgressValue(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensurePromoSchema();
    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");

    const code = normalizePromoCode(body.code);
    if (!code || code.length < 5 || code.length > 24) return badRequest("invalid_promo_code");

    const claimed = await withTransaction(async (client) => {
      const existingClaim = await client.query(
        `select pr.id
         from promo_redemptions pr
         join promo_codes pc on pc.id = pr.promo_code_id
         where pc.code = $1 and pr.user_id = $2
         limit 1`,
        [code, payload.uid]
      );
      if (existingClaim.rowCount > 0) return { ok: false, code: "promo_already_claimed" };

      const promoUpdate = await client.query(
        `update promo_codes
         set used_count = used_count + 1
         where code = $1
           and is_active = true
           and used_count < max_uses
         returning id, reward_coins, reward_trophies, used_count, max_uses`,
        [code]
      );

      if (promoUpdate.rowCount === 0) {
        const promoExists = await client.query(`select id from promo_codes where code = $1 limit 1`, [code]);
        if (promoExists.rowCount === 0) return { ok: false, code: "promo_not_found" };
        return { ok: false, code: "promo_spent_or_disabled" };
      }

      const promo = promoUpdate.rows[0];
      const rewardCoins = parseProgressValue(promo.reward_coins);
      const rewardTrophies = parseProgressValue(promo.reward_trophies);
      if (rewardCoins <= 0 && rewardTrophies <= 0) {
        return { ok: false, code: "promo_no_rewards" };
      }

      const progressResult = await client.query(
        `select progress_json
         from user_progress
         where user_id = $1
         limit 1
         for update`,
        [payload.uid]
      );
      const currentProgress =
        progressResult.rowCount > 0 &&
        progressResult.rows[0].progress_json &&
        typeof progressResult.rows[0].progress_json === "object"
          ? { ...progressResult.rows[0].progress_json }
          : {};

      const nextProgress = {
        ...currentProgress,
        coins: parseProgressValue(currentProgress.coins) + rewardCoins,
        trophies: parseProgressValue(currentProgress.trophies) + rewardTrophies
      };

      await client.query(
        `insert into user_progress(user_id, progress_json, updated_at)
         values($1, $2::jsonb, now())
         on conflict (user_id)
         do update set progress_json = excluded.progress_json, updated_at = now()`,
        [payload.uid, JSON.stringify(nextProgress)]
      );

      await client.query(
        `insert into promo_redemptions(promo_code_id, user_id, reward_coins, reward_trophies, redeemed_at)
         values($1, $2, $3, $4, now())`,
        [promo.id, payload.uid, rewardCoins, rewardTrophies]
      );

      return {
        ok: true,
        rewardCoins,
        rewardTrophies,
        progress: nextProgress,
        promoCode: code,
        usedCount: Number(promo.used_count || 0),
        maxUses: Number(promo.max_uses || 1)
      };
    });

    if (!claimed || !claimed.ok) return badRequest((claimed && claimed.code) || "promo_claim_failed");

    try {
      await syncUserSeasonStats(payload.uid, claimed.progress);
    } catch (seasonError) {
      console.error("promo_claim_season_sync_failed", seasonError);
    }
    try {
      await syncUserWeeklyStats(payload.uid, claimed.progress);
    } catch (weeklyError) {
      console.error("promo_claim_weekly_sync_failed", weeklyError);
    }

    return json(200, {
      ok: true,
      promoCode: claimed.promoCode,
      rewardCoins: claimed.rewardCoins,
      rewardTrophies: claimed.rewardTrophies,
      usedCount: claimed.usedCount,
      maxUses: claimed.maxUses,
      progress: claimed.progress
    });
  } catch (error) {
    return internalError(error);
  }
};
