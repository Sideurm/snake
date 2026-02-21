const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, internalError } = require("./_http");
const {
  ensureClansSchema,
  getUserClan,
  getClanMembers,
  monthKeyUTC,
  dayKeyUTC,
  MONTH_TARGET_WINS,
  canManageClan,
  canManageMembers,
  canManageRoles,
  getClanActiveWar
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

    return json(200, {
      ok: true,
      monthKey,
      targetWins: MONTH_TARGET_WINS,
      clan: {
        ...clan,
        members,
        wins,
        claimed: claimedResult.rowCount > 0,
        canClaim: wins >= MONTH_TARGET_WINS && claimedResult.rowCount === 0,
        permissions: {
          canManageClan: canManageClan(clan.role),
          canManageMembers: canManageMembers(clan.role),
          canManageRoles: canManageRoles(clan.role)
        },
        activeWar,
        dayKey,
        todayWins,
        dayRecord,
        weeklyWins,
        weeklyRank,
        currentStreak,
        bestStreak,
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
