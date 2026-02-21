const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const {
  ensureClansSchema,
  getUserClan,
  weekKeyUTC,
  ensureClanWeeklyTasks,
  canManageClan,
  addClanActivity
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
    const taskId = String(body.taskId || "").trim();
    if (!taskId) return badRequest("invalid_task_id");

    const weekKey = weekKeyUTC();
    await ensureClanWeeklyTasks(clan.id, weekKey);

    const rowRes = await query(
      `select task_id, target, progress, reward_coins, reward_xp, claimed
       from clan_weekly_tasks
       where clan_id = $1 and week_key = $2 and task_id = $3
       limit 1`,
      [clan.id, weekKey, taskId]
    );
    if (!rowRes.rowCount) return badRequest("task_not_found");
    const row = rowRes.rows[0];
    if (row.claimed) return badRequest("task_already_claimed");
    if (Number(row.progress || 0) < Number(row.target || 0)) return badRequest("task_not_ready");

    const updatedTask = await query(
      `update clan_weekly_tasks
       set claimed = true, updated_at = now()
       where clan_id = $1 and week_key = $2 and task_id = $3 and claimed = false
       returning reward_coins, reward_xp`,
      [clan.id, weekKey, taskId]
    );
    if (!updatedTask.rowCount) return badRequest("task_already_claimed");

    const rewardCoins = Number(updatedTask.rows[0].reward_coins || 0);
    const rewardXp = Number(updatedTask.rows[0].reward_xp || 0);
    const clanRes = await query(
      `update clans
       set coins = greatest(0, coins + $2),
           clan_xp = greatest(0, clan_xp + $3)
       where id = $1
       returning coins, clan_xp`,
      [clan.id, rewardCoins, rewardXp]
    );

    await addClanActivity(clan.id, payload.uid, "weekly_task_claimed", {
      taskId,
      rewardCoins,
      rewardXp
    });

    return json(200, {
      ok: true,
      taskId,
      rewardCoins,
      rewardXp,
      clanCoins: clanRes.rowCount ? Number(clanRes.rows[0].coins || 0) : Number(clan.coins || 0),
      clanXp: clanRes.rowCount ? Number(clanRes.rows[0].clan_xp || 0) : Number(clan.clanXp || 0)
    });
  } catch (error) {
    return internalError(error);
  }
};
