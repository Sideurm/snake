const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const {
  ensureClansSchema,
  getUserClan,
  canManageEconomy,
  addClanActivity,
  weekKeyUTC,
  ensureClanWeeklyTasks,
  adjustClanReputation
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
    if (!canManageEconomy(clan.role) && clan.role !== "member" && clan.role !== "recruiter") return badRequest("forbidden_role");

    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");
    const amount = Math.max(1, Math.min(100000, Number.parseInt(body.amount, 10) || 0));
    if (!Number.isFinite(amount) || amount <= 0) return badRequest("invalid_amount");

    const debit = await query(
      `update user_progress
       set progress_json = jsonb_set(
         progress_json,
         '{coins}',
         to_jsonb(greatest(0, (case when coalesce(progress_json ->> 'coins', '0') ~ '^-?[0-9]+$' then (progress_json ->> 'coins')::int else 0 end) - $2)),
         true
       ),
       updated_at = now()
       where user_id = $1
         and (case when coalesce(progress_json ->> 'coins', '0') ~ '^-?[0-9]+$' then (progress_json ->> 'coins')::int else 0 end) >= $2
       returning (case when coalesce(progress_json ->> 'coins', '0') ~ '^-?[0-9]+$' then (progress_json ->> 'coins')::int else 0 end) as coins_left`,
      [payload.uid, amount]
    );
    if (!debit.rowCount) return badRequest("not_enough_personal_coins");

    const credit = await query(
      `update clans
       set coins = greatest(0, coins + $2)
       where id = $1
       returning coins`,
      [clan.id, amount]
    );
    const clanCoins = credit.rowCount ? Number(credit.rows[0].coins || 0) : Number(clan.coins || 0);

    await query(
      `insert into clan_contributions(clan_id, user_id, amount, resource_type)
       values($1, $2, $3, 'coins')`,
      [clan.id, payload.uid, amount]
    );
    await addClanActivity(clan.id, payload.uid, "contribution_added", { amount, resourceType: "coins" });
    await adjustClanReputation(clan.id, payload.uid, {
      activityDelta: 1,
      contributionDelta: Math.max(1, Math.floor(amount / 50))
    });

    const weekKey = weekKeyUTC();
    await ensureClanWeeklyTasks(clan.id, weekKey);
    await query(
      `update clan_weekly_tasks
       set progress = least(target, progress + $3), updated_at = now()
       where clan_id = $1 and week_key = $2 and task_id = 'contrib_500'`,
      [clan.id, weekKey, amount]
    );

    return json(200, {
      ok: true,
      amount,
      clanCoins,
      playerCoinsLeft: Number(debit.rows[0].coins_left || 0)
    });
  } catch (error) {
    return internalError(error);
  }
};
