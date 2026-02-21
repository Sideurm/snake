const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, internalError } = require("./_http");
const {
  ensureClansSchema,
  getUserClan,
  getClanMembers,
  monthKeyUTC,
  dayKeyUTC,
  weekKeyUTC,
  MONTH_TARGET_WINS,
  getClanActiveWar,
  rolePermissions,
  clanLevelFromXp,
  clanPerksFromLevel,
  ensureClanWeeklyTasks
} = require("./_clans");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureClansSchema();

    const clan = await getUserClan(payload.uid);
    if (!clan) {
      return json(200, { ok: true, clan: null, monthKey: monthKeyUTC(), targetWins: MONTH_TARGET_WINS });
    }

    const monthKey = monthKeyUTC();
    const dayKey = dayKeyUTC();
    const weekKey = weekKeyUTC();
    const progressResult = await query(
      `select wins from clan_monthly_progress where clan_id = $1 and month_key = $2 limit 1`,
      [clan.id, monthKey]
    );
    const wins = progressResult.rowCount ? Number(progressResult.rows[0].wins || 0) : 0;

    const claimedResult = await query(
      `select 1 from clan_monthly_claims where clan_id = $1 and month_key = $2 and user_id = $3 limit 1`,
      [clan.id, monthKey, payload.uid]
    );

    const members = await getClanMembers(clan.id);
    await ensureClanWeeklyTasks(clan.id, weekKey);

    const levelInfo = clanLevelFromXp(clan.clanXp || 0);
    const perks = clanPerksFromLevel(levelInfo.level);

    const dailyResult = await query(
      `select wins from clan_daily_progress where clan_id = $1 and day_key = $2 limit 1`,
      [clan.id, dayKey]
    );
    const todayWins = dailyResult.rowCount ? Number(dailyResult.rows[0].wins || 0) : 0;
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
    const streakResult = await query(
      `select current_streak, best_streak
       from clan_member_streaks
       where clan_id = $1 and user_id = $2
       limit 1`,
      [clan.id, payload.uid]
    );
    const currentStreak = streakResult.rowCount ? Number(streakResult.rows[0].current_streak || 0) : 0;
    const bestStreak = streakResult.rowCount ? Number(streakResult.rows[0].best_streak || 0) : 0;

    const activeWar = await getClanActiveWar(clan.id);
    const unlocksResult = await query(
      `select item_id, unlocked_by_user_id, unlocked_at
       from clan_shop_unlocks
       where clan_id = $1
       order by unlocked_at desc`,
      [clan.id]
    );

    const tasksResult = await query(
      `select task_id, target, progress, reward_coins, reward_xp, claimed, updated_at
       from clan_weekly_tasks
       where clan_id = $1 and week_key = $2
       order by task_id asc`,
      [clan.id, weekKey]
    );
    const achievementsResult = await query(
      `select achievement_id, unlocked_at, extra
       from clan_achievements
       where clan_id = $1
       order by unlocked_at desc
       limit 60`,
      [clan.id]
    );
    const contributionResult = await query(
      `select coalesce(sum(amount), 0)::int as total
       from clan_contributions
       where clan_id = $1`,
      [clan.id]
    );
    const contributionLogsResult = await query(
      `select c.id, c.user_id, c.amount, c.resource_type, c.created_at, u.nickname, u.email
       from clan_contributions c
       left join users u on u.id = c.user_id
       where c.clan_id = $1
       order by c.id desc
       limit 80`,
      [clan.id]
    );
    const repResult = await query(
      `select r.user_id, r.activity_score, r.contribution_score, r.discipline_score, r.updated_at, u.nickname, u.email
       from clan_member_reputation r
       left join users u on u.id = r.user_id
       where r.clan_id = $1
       order by (r.activity_score + r.contribution_score + r.discipline_score) desc, r.updated_at desc
       limit 60`,
      [clan.id]
    );
    const seasonHistoryResult = await query(
      `select season_key, day_key, trophies, weekly_rank, top_member_user_id, updated_at
       from clan_season_history
       where clan_id = $1
       order by day_key desc
       limit 60`,
      [clan.id]
    );
    const eventsResult = await query(
      `select id, event_type, title, starts_at, ends_at, bonus_pct, created_by_user_id, created_at
       from clan_events
       where clan_id = $1
       order by starts_at desc
       limit 40`,
      [clan.id]
    );

    return json(200, {
      ok: true,
      monthKey,
      weekKey,
      targetWins: MONTH_TARGET_WINS,
      clan: {
        ...clan,
        level: levelInfo.level,
        clanXp: levelInfo.xp,
        nextLevelXp: levelInfo.nextLevelXp,
        inLevelXp: levelInfo.inLevelXp,
        perks,
        members,
        wins,
        claimed: claimedResult.rowCount > 0,
        canClaim: wins >= MONTH_TARGET_WINS && claimedResult.rowCount === 0,
        permissions: rolePermissions(clan.role),
        activeWar,
        dayKey,
        todayWins,
        dayRecord,
        weeklyWins,
        weeklyRank,
        currentStreak,
        bestStreak,
        weeklyTasks: tasksResult.rows.map((row) => ({
          taskId: row.task_id,
          target: Number(row.target || 0),
          progress: Number(row.progress || 0),
          rewardCoins: Number(row.reward_coins || 0),
          rewardXp: Number(row.reward_xp || 0),
          claimed: !!row.claimed,
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
        })),
        achievements: achievementsResult.rows.map((row) => ({
          achievementId: row.achievement_id,
          unlockedAt: row.unlocked_at ? new Date(row.unlocked_at).toISOString() : null,
          extra: row.extra && typeof row.extra === "object" ? row.extra : {}
        })),
        totalContributions: contributionResult.rowCount ? Number(contributionResult.rows[0].total || 0) : 0,
        contributionLogs: contributionLogsResult.rows.map((row) => ({
          id: Number(row.id),
          userId: Number(row.user_id),
          amount: Number(row.amount || 0),
          resourceType: row.resource_type || "coins",
          nickname: row.nickname || null,
          email: row.email || null,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
        })),
        reputation: repResult.rows.map((row) => ({
          userId: Number(row.user_id),
          nickname: row.nickname || null,
          email: row.email || null,
          activityScore: Number(row.activity_score || 0),
          contributionScore: Number(row.contribution_score || 0),
          disciplineScore: Number(row.discipline_score || 0),
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
        })),
        seasonHistory: seasonHistoryResult.rows
          .map((row) => ({
            seasonKey: row.season_key,
            dayKey: row.day_key,
            trophies: Number(row.trophies || 0),
            weeklyRank: row.weekly_rank == null ? null : Number(row.weekly_rank),
            topMemberUserId: row.top_member_user_id == null ? null : Number(row.top_member_user_id),
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
          }))
          .reverse(),
        events: eventsResult.rows.map((row) => ({
          id: Number(row.id),
          eventType: row.event_type,
          title: row.title,
          startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null,
          endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
          bonusPct: Number(row.bonus_pct || 0),
          createdByUserId: row.created_by_user_id == null ? null : Number(row.created_by_user_id),
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
        })),
        shopUnlocks: unlocksResult.rows.map((row) => ({
          itemId: row.item_id,
          unlockedByUserId: row.unlocked_by_user_id ? Number(row.unlocked_by_user_id) : null,
          unlockedAt: row.unlocked_at ? new Date(row.unlocked_at).toISOString() : null
        }))
      },
      inviteLink: clan.inviteCode ? `?clanInvite=${encodeURIComponent(clan.inviteCode)}` : ""
    });
  } catch (error) {
    return internalError(error);
  }
};
