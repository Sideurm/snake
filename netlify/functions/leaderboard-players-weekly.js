const { json, methodNotAllowed, internalError } = require("./_http");
const { backfillWeeklyStatsFromProgress, listWeeklyTopPlayers, weekKeyUTC } = require("./_weekly_leaderboard");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    let players = await listWeeklyTopPlayers(100);
    if (!players.length) {
      await backfillWeeklyStatsFromProgress(300);
      players = await listWeeklyTopPlayers(100);
    }

    return json(200, {
      ok: true,
      weekKey: weekKeyUTC(),
      players
    });
  } catch (error) {
    return internalError(error);
  }
};
