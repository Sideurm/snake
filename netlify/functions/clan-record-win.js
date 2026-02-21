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
  STREAK_REWARD_MILESTONES,
  clanLevelFromXp,
  clanPerksFromLevel,
  ensureClanWeeklyTasks,
  adjustClanReputation,
  writeClanSeasonSnapshot,
  unlockClanAchievement,
  addClanActivity
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
    await ensureClanWeeklyTasks(clan.id, weekKey);

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

    const eventBonusResult = await query(
      `select coalesce(max(bonus_pct), 0)::int as bonus_pct
       from clan_events
       where clan_id = $1
         and starts_at <= now()
         and ends_at >= now()`,
      [clan.id]
    );
    const eventBonusPct = eventBonusResult.rowCount ? Number(eventBonusResult.rows[0].bonus_pct || 0) : 0;
    const levelInfoBefore = clanLevelFromXp(clan.clanXp || 0);
    const perksBefore = clanPerksFromLevel(levelInfoBefore.level);
    const xpGainBase = Math.max(6, Math.floor(score / 8));
    const xpGain = xpGainBase + Math.floor((xpGainBase * Math.max(0, eventBonusPct)) / 100);
    const trophyGain = Math.max(1, Math.floor(trophyDelta + (trophyDelta * Math.max(0, perksBefore.trophyBonusPct)) / 100));
    const coinGain = Math.max(1, Math.floor(1 + (1 * Math.max(0, perksBefore.coinBonusPct + eventBonusPct)) / 100));
    const updatedClanRow = await query(
      `update clans
       set coins = greatest(0, coins + $2),
           trophies = greatest(0, trophies + $3),
           clan_xp = greatest(0, clan_xp + $4)
       where id = $1
       returning coins, trophies, clan_xp`,
      [clan.id, coinGain, trophyGain, xpGain]
    );
    const updatedClan = updatedClanRow.rowCount ? updatedClanRow.rows[0] : null;

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
    await query(
      `update clan_weekly_tasks
       set progress = least(target, progress + 1), updated_at = now()
       where clan_id = $1 and week_key = $2 and task_id = 'wins_25'`,
      [clan.id, weekKey]
    );
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
    const clanCoins = updatedClan ? Number(updatedClan.coins || 0) : 0;
    const clanTrophies = updatedClan ? Number(updatedClan.trophies || 0) : Number(clan.trophies || 0);
    const clanXp = updatedClan ? Number(updatedClan.clan_xp || 0) : Number(clan.clanXp || 0);
    const levelInfo = clanLevelFromXp(clanXp);
    const perks = clanPerksFromLevel(levelInfo.level);

    await adjustClanReputation(clan.id, payload.uid, {
      activityDelta: 2,
      contributionDelta: 1
    });
    await writeClanSeasonSnapshot(clan.id, dayKey, payload.uid);

    const totalWinsRes = await query(
      `select count(*)::int as total from clan_win_events where clan_id = $1`,
      [clan.id]
    );
    const totalWins = totalWinsRes.rowCount ? Number(totalWinsRes.rows[0].total || 0) : 0;
    const unlockedAchievements = [];
    if (totalWins >= 100 && await unlockClanAchievement(clan.id, "wins_100", { totalWins })) {
      unlockedAchievements.push("wins_100");
    }
    if (currentStreak >= 20 && await unlockClanAchievement(clan.id, "streak_20", { currentStreak })) {
      unlockedAchievements.push("streak_20");
    }
    if (weeklyRank > 0 && weeklyRank <= 10 && await unlockClanAchievement(clan.id, "weekly_top_10", { weeklyRank })) {
      unlockedAchievements.push("weekly_top_10");
    }
    if (unlockedAchievements.length) {
      await addClanActivity(clan.id, payload.uid, "achievement_unlocked", {
        achievements: unlockedAchievements
      });
    }

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
      totalWins,
      currentStreak,
      bestStreak,
      streakReward,
      coinGain,
      trophyGain,
      xpGain,
      clanTrophies,
      clanXp,
      level: levelInfo.level,
      perks,
      unlockedAchievements,
      eventBonusPct,
      targetWins: MONTH_TARGET_WINS,
      claimed,
      canClaim: wins >= MONTH_TARGET_WINS && !claimed,
      activeWar: war
    });
  } catch (error) {
    return internalError(error);
  }
};
