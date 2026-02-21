const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const {
  ensureClansSchema,
  getUserClan,
  monthKeyUTC,
  dayKeyUTC,
  weekKeyUTC,
  MONTH_TARGET_WINS,
  applyClanWarProgress,
  mapWarRow,
  STREAK_REWARD_MILESTONES
} = require("./_clans");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureClansSchema();

    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");

    const trophyDelta = Number(body.trophyDelta || 0);
    const score = Number(body.score || 0);
    if (!Number.isFinite(trophyDelta) || trophyDelta <= 0) return badRequest("not_win");
    if (!Number.isFinite(score) || score <= 0) return badRequest("invalid_score");

    const clan = await getUserClan(payload.uid);
    if (!clan) return json(200, { ok: true, skipped: true, reason: "not_in_clan" });

    const cooldownRes = await query(
      `select created_at from clan_win_events
       where user_id = $1
       order by created_at desc
       limit 1`,
      [payload.uid]
    );
    if (cooldownRes.rowCount > 0) {
      const lastMs = Date.parse(cooldownRes.rows[0].created_at);
      if (Number.isFinite(lastMs) && Date.now() - lastMs < 15000) {
        const monthKey = monthKeyUTC();
        const p = await query(`select wins from clan_monthly_progress where clan_id = $1 and month_key = $2 limit 1`, [clan.id, monthKey]);
        const wins = p.rowCount ? Number(p.rows[0].wins || 0) : 0;
        const coinsResult = await query(`select coins from clans where id = $1 limit 1`, [clan.id]);
        const clanCoins = coinsResult.rowCount ? Number(coinsResult.rows[0].coins || 0) : 0;
        const claimedResult = await query(
          `select 1 from clan_monthly_claims where clan_id = $1 and month_key = $2 and user_id = $3 limit 1`,
          [clan.id, monthKey, payload.uid]
        );
        const claimed = claimedResult.rowCount > 0;
        const activeWar = await query(
          `select * from clan_wars
           where status = 'active' and (clan_a_id = $1 or clan_b_id = $1)
           order by created_at desc
           limit 1`,
          [clan.id]
        );
        return json(200, {
          ok: true,
          skipped: true,
          reason: "cooldown",
          monthKey,
          wins,
          clanCoins,
          targetWins: MONTH_TARGET_WINS,
          claimed,
          canClaim: wins >= MONTH_TARGET_WINS && !claimed,
          activeWar: activeWar.rowCount ? mapWarRow(activeWar.rows[0]) : null
        });
      }
    }

    const monthKey = monthKeyUTC();
    const dayKey = dayKeyUTC();
    const weekKey = weekKeyUTC();

    await query(`insert into clan_win_events(clan_id, user_id) values($1, $2)`, [clan.id, payload.uid]);
    await query(
      `insert into clan_monthly_progress(clan_id, month_key, wins, updated_at)
       values($1, $2, 1, now())
       on conflict (clan_id, month_key)
       do update set wins = clan_monthly_progress.wins + 1, updated_at = now()`,
      [clan.id, monthKey]
    );
    await query(
      `insert into clan_daily_progress(clan_id, day_key, wins, updated_at)
       values($1, $2, 1, now())
       on conflict (clan_id, day_key)
       do update set wins = clan_daily_progress.wins + 1, updated_at = now()`,
      [clan.id, dayKey]
    );

    const streakRes = await query(
      `select current_streak, best_streak, last_win_at
       from clan_member_streaks
       where clan_id = $1 and user_id = $2
       limit 1`,
      [clan.id, payload.uid]
    );
    let currentStreak = 1;
    let bestStreak = 1;
    if (streakRes.rowCount > 0) {
      const row = streakRes.rows[0];
      const prevCurrent = Number(row.current_streak || 0);
      const prevBest = Number(row.best_streak || 0);
      const lastWinAtMs = Date.parse(row.last_win_at);
      const withinWindow = Number.isFinite(lastWinAtMs) && (Date.now() - lastWinAtMs <= 15 * 60 * 1000);
      currentStreak = withinWindow ? prevCurrent + 1 : 1;
      bestStreak = Math.max(prevBest, currentStreak);
      await query(
        `update clan_member_streaks
         set current_streak = $3, best_streak = $4, last_win_at = now(), updated_at = now()
         where clan_id = $1 and user_id = $2`,
        [clan.id, payload.uid, currentStreak, bestStreak]
      );
    } else {
      await query(
        `insert into clan_member_streaks(clan_id, user_id, current_streak, best_streak, last_win_at, updated_at)
         values($1, $2, 1, 1, now(), now())`,
        [clan.id, payload.uid]
      );
    }

    const streakReward = Number(STREAK_REWARD_MILESTONES[currentStreak] || 0);
    if (streakReward > 0) {
      await query(`update clans set coins = greatest(0, coins + $2) where id = $1`, [clan.id, streakReward]);
    }

    await query(`update clans set coins = greatest(0, coins + 1) where id = $1`, [clan.id]);

    const result = await query(
      `select wins from clan_monthly_progress where clan_id = $1 and month_key = $2 limit 1`,
      [clan.id, monthKey]
    );
    const wins = result.rowCount ? Number(result.rows[0].wins || 0) : 0;
    const todayResult = await query(
      `select wins from clan_daily_progress where clan_id = $1 and day_key = $2 limit 1`,
      [clan.id, dayKey]
    );
    const todayWins = todayResult.rowCount ? Number(todayResult.rows[0].wins || 0) : 0;
    const dayRecordResult = await query(
      `select coalesce(max(wins), 0)::int as value from clan_daily_progress where clan_id = $1`,
      [clan.id]
    );
    const dayRecord = dayRecordResult.rowCount ? Number(dayRecordResult.rows[0].value || 0) : 0;
    const weekResult = await query(
      `select count(*)::int as wins
       from clan_win_events
       where clan_id = $1
         and created_at >= date_trunc('week', now() at time zone 'utc')
         and created_at < date_trunc('week', now() at time zone 'utc') + interval '7 day'`,
      [clan.id]
    );
    const weeklyWins = weekResult.rowCount ? Number(weekResult.rows[0].wins || 0) : 0;
    const rankResult = await query(
      `select 1 + count(*)::int as rank
       from (
         select clan_id, count(*)::int as weekly_wins
         from clan_win_events
         where created_at >= date_trunc('week', now() at time zone 'utc')
           and created_at < date_trunc('week', now() at time zone 'utc') + interval '7 day'
         group by clan_id
       ) t
       where t.weekly_wins > $1`,
      [weeklyWins]
    );
    const weeklyRank = rankResult.rowCount ? Number(rankResult.rows[0].rank || 1) : 1;
    const coinsResult = await query(`select coins from clans where id = $1 limit 1`, [clan.id]);
    const clanCoins = coinsResult.rowCount ? Number(coinsResult.rows[0].coins || 0) : 0;
    const claimedResult = await query(
      `select 1 from clan_monthly_claims where clan_id = $1 and month_key = $2 and user_id = $3 limit 1`,
      [clan.id, monthKey, payload.uid]
    );
    const claimed = claimedResult.rowCount > 0;
    const war = await applyClanWarProgress(clan.id, 1, payload.uid);

    return json(200, {
      ok: true,
      monthKey,
      wins,
      clanCoins,
      dayKey,
      weekKey,
      todayWins,
      dayRecord,
      weeklyWins,
      weeklyRank,
      currentStreak,
      bestStreak,
      streakReward,
      targetWins: MONTH_TARGET_WINS,
      claimed,
      canClaim: wins >= MONTH_TARGET_WINS && !claimed,
      activeWar: war
    });
  } catch (error) {
    return internalError(error);
  }
};
