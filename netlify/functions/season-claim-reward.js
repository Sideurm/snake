const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError } = require("./_http");
const { claimPreviousSeasonReward, syncUserSeasonStatsFromStoredProgress } = require("./_season");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await syncUserSeasonStatsFromStoredProgress(payload.uid);
    const result = await claimPreviousSeasonReward(payload.uid);
    if (!result || !result.ok) {
      return badRequest((result && result.code) || "season_reward_unavailable");
    }

    return json(200, {
      ok: true,
      previousSeasonKey: result.previousSeasonKey,
      alreadyClaimed: !!result.alreadyClaimed,
      rank: Number(result.rank || 0),
      reward: result.reward || null,
      claimedAt: result.claimedAt || null,
      patch: result.patch || null
    });
  } catch (error) {
    return internalError(error);
  }
};
