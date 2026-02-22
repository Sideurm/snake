const { query } = require("./_db");

let weeklySchemaReady = false;

function weekKeyUTC(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function parseTrophiesFromProgress(progress) {
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) return 0;
  const raw = Number(progress.trophies);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw));
}

async function ensureWeeklyLeaderboardSchema() {
  if (weeklySchemaReady) return;

  await query(`
    create table if not exists player_weekly_stats (
      week_key text not null,
      user_id bigint not null references users(id) on delete cascade,
      start_trophies integer not null default 0,
      best_trophies integer not null default 0,
      last_trophies integer not null default 0,
      wins integer not null default 0,
      updated_at timestamptz not null default now(),
      primary key (week_key, user_id)
    );
  `);

  await query(`create index if not exists idx_player_weekly_stats_top on player_weekly_stats(week_key, best_trophies desc, updated_at asc, user_id asc);`);
  await query(`create index if not exists idx_player_weekly_stats_user on player_weekly_stats(user_id, week_key desc);`);

  weeklySchemaReady = true;
}

async function syncUserWeeklyStats(userId, progress = {}) {
  const safeUserId = Number.parseInt(String(userId || ""), 10);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0) return null;

  await ensureWeeklyLeaderboardSchema();

  const weekKey = weekKeyUTC();
  const trophies = parseTrophiesFromProgress(progress);

  await query(
    `insert into player_weekly_stats(week_key, user_id, start_trophies, best_trophies, last_trophies, wins, updated_at)
     values($1, $2, $3, $3, $3, 0, now())
     on conflict (week_key, user_id)
     do update set
       best_trophies = greatest(player_weekly_stats.best_trophies, excluded.best_trophies),
       wins = player_weekly_stats.wins + case
         when excluded.last_trophies > player_weekly_stats.last_trophies then 1
         else 0
       end,
       last_trophies = excluded.last_trophies,
       updated_at = now()`,
    [weekKey, safeUserId, trophies]
  );

  return { weekKey, userId: safeUserId, trophies };
}

async function backfillWeeklyStatsFromProgress(limit = 300) {
  await ensureWeeklyLeaderboardSchema();

  const weekKey = weekKeyUTC();
  const safeLimit = Math.max(50, Math.min(1000, Math.floor(Number(limit || 300))));

  await query(
    `insert into player_weekly_stats(week_key, user_id, start_trophies, best_trophies, last_trophies, wins, updated_at)
     select $1, src.user_id, src.trophies, src.trophies, src.trophies, 0, now()
     from (
       select up.user_id,
              case
                when (up.progress_json ->> 'trophies') ~ '^-?[0-9]+$'
                  then greatest(0, (up.progress_json ->> 'trophies')::int)
                else 0
              end as trophies
       from user_progress up
       join users u on u.id = up.user_id
       where coalesce(u.is_banned, false) = false
       order by trophies desc, up.updated_at desc
       limit $2
     ) src
     on conflict (week_key, user_id) do nothing`,
    [weekKey, safeLimit]
  );
}

async function listWeeklyTopPlayers(limit = 100) {
  await ensureWeeklyLeaderboardSchema();

  const safeLimit = Math.max(1, Math.min(1000, Math.floor(Number(limit || 100))));
  const weekKey = weekKeyUTC();

  const result = await query(
    `select w.user_id,
            w.start_trophies,
            w.best_trophies,
            w.last_trophies,
            w.wins,
            w.updated_at,
            (w.best_trophies - w.start_trophies) as weekly_gain,
            coalesce(nullif(u.nickname, ''), u.email, ('ID ' || u.id::text)) as display_name
     from player_weekly_stats w
     join users u on u.id = w.user_id
     where w.week_key = $1
       and coalesce(u.is_banned, false) = false
     order by weekly_gain desc, w.best_trophies desc, w.updated_at asc, w.user_id asc
     limit $2`,
    [weekKey, safeLimit]
  );

  return result.rows.map((row, index) => ({
    rank: index + 1,
    userId: Number(row.user_id),
    name: row.display_name,
    weeklyGain: Math.max(0, Number(row.weekly_gain || 0)),
    bestTrophies: Number(row.best_trophies || 0),
    currentTrophies: Number(row.last_trophies || 0),
    startTrophies: Number(row.start_trophies || 0),
    wins: Number(row.wins || 0)
  }));
}

module.exports = {
  weekKeyUTC,
  ensureWeeklyLeaderboardSchema,
  syncUserWeeklyStats,
  backfillWeeklyStatsFromProgress,
  listWeeklyTopPlayers
};
