const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, internalError } = require("./_http");
const {
  ensureSeasonSchema,
  getSeasonInfo,
  getSeasonRewardTiers,
  shiftSeasonKey,
  resolveSeasonTopReward,
  syncUserSeasonStatsFromStoredProgress,
  backfillCurrentSeasonFromProgress,
  listSeasonTopPlayers,
  getUserSeasonRank,
  getSeasonRewardClaim
} = require("./_season");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    await ensureSeasonSchema();

    const season = getSeasonInfo();
    let topPlayers = await listSeasonTopPlayers(season.key, 100);
    if (!topPlayers.length) {
      await backfillCurrentSeasonFromProgress(300);
      topPlayers = await listSeasonTopPlayers(season.key, 100);
    }

    let me = null;
    let previousSeasonReward = null;
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);

    if (payload && payload.uid) {
      await syncUserSeasonStatsFromStoredProgress(payload.uid);
      me = await getUserSeasonRank(season.key, payload.uid);
      if (me && Number(me.rank || 0) >= 1 && Number(me.rank || 0) <= 100) {
        topPlayers = await listSeasonTopPlayers(season.key, 100);
      }

      const previousSeasonKey = shiftSeasonKey(season.key, -1);
      const previousRank = await getUserSeasonRank(previousSeasonKey, payload.uid);
      const claim = await getSeasonRewardClaim(previousSeasonKey, payload.uid);
      const reward = previousRank ? resolveSeasonTopReward(previousSeasonKey, previousRank.rank) : null;

      previousSeasonReward = {
        seasonKey: previousSeasonKey,
        rank: previousRank ? Number(previousRank.rank || 0) : null,
        eligible: !!(previousRank && Number(previousRank.rank || 0) >= 1 && Number(previousRank.rank || 0) <= 100),
        claimed: !!claim,
        claimedAt: claim ? claim.claimedAt : null,
        reward: claim
          ? {
            rank: claim.rank,
            coins: claim.coins,
            skinId: claim.skinId
          }
          : reward
      };
    }

    return json(200, {
      ok: true,
      season,
      rewardTiers: getSeasonRewardTiers(season.key),
      featuredSkins: Array.isArray(season.featuredSkins)
        ? season.featuredSkins.map((itemId) => ({ itemId }))
        : [],
      topPlayers,
      me: me
        ? {
          rank: Number(me.rank || 0),
          trophies: Number(me.trophies || 0),
          bestTrophies: Number(me.bestTrophies || 0)
        }
        : null,
      previousSeasonReward
    });
  } catch (error) {
    return internalError(error);
  }
};
