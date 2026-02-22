const { query } = require("./_db");

let seasonSchemaReady = false;

const SEASON_THEME_ROTATION = [
  {
    id: "solar_frontier",
    title: "Solar Frontier",
    subtitle: "Light vs void in open space",
    eventTitle: "Solar Hunt",
    eventDescription: "Rare and epic food appears more often this season."
  },
  {
    id: "neon_nights",
    title: "Neon Nights",
    subtitle: "Hyper city under electric rain",
    eventTitle: "Night Dash",
    eventDescription: "Daily and weekly events focus on speed and survival."
  },
  {
    id: "arctic_core",
    title: "Arctic Core",
    subtitle: "Frozen arena with unstable zones",
    eventTitle: "Core Storm",
    eventDescription: "Bonus rewards for long win streaks and active play."
  },
  {
    id: "toxic_reactor",
    title: "Toxic Reactor",
    subtitle: "Hazard season with aggressive tempo",
    eventTitle: "Reactor Rush",
    eventDescription: "Top leaderboard movement gives extra seasonal rewards."
  }
];

const SEASON_SKIN_POOL = [
  "food-plasma",
  "food-toxic",
  "food-void",
  "glow-arctic",
  "glow-toxic",
  "trail-pulse",
  "trail-dash",
  "death-ring",
  "death-shatter",
  "shape-diamond",
  "shape-star",
  "shape-cube"
];

const SEASON_REWARD_TIERS = [
  { tierId: "top_1", tierLabel: "Champion", rankFrom: 1, rankTo: 1, coins: 1500, rewardSkinSlot: 0 },
  { tierId: "top_10", tierLabel: "Elite", rankFrom: 2, rankTo: 10, coins: 900, rewardSkinSlot: 1 },
  { tierId: "top_50", tierLabel: "Master", rankFrom: 11, rankTo: 50, coins: 500, rewardSkinSlot: 2 },
  { tierId: "top_100", tierLabel: "Top 100", rankFrom: 51, rankTo: 100, coins: 250, rewardSkinSlot: 3 }
];

function parseSeasonKey(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function buildSeasonKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function currentSeasonKeyUTC(now = new Date()) {
  return buildSeasonKey(now.getUTCFullYear(), now.getUTCMonth() + 1);
}

function shiftSeasonKey(seasonKey, monthDelta = 0) {
  const parsed = parseSeasonKey(seasonKey) || parseSeasonKey(currentSeasonKeyUTC());
  const totalMonths = (parsed.year * 12) + (parsed.month - 1) + Number(monthDelta || 0);
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return buildSeasonKey(year, month);
}

function seasonIndex(seasonKey) {
  const parsed = parseSeasonKey(seasonKey) || parseSeasonKey(currentSeasonKeyUTC());
  return (parsed.year * 12) + (parsed.month - 1);
}

function uniqueSeasonSkinIds(seedIndex, count, step) {
  const out = [];
  const used = new Set();
  const total = SEASON_SKIN_POOL.length;
  let offset = Math.abs(seedIndex) % total;
  let tries = 0;
  while (out.length < count && tries < total * 3) {
    const idx = (offset + tries * step) % total;
    const itemId = SEASON_SKIN_POOL[idx];
    if (!used.has(itemId)) {
      used.add(itemId);
      out.push(itemId);
    }
    tries += 1;
  }
  return out;
}

function getSeasonInfo(seasonKey = currentSeasonKeyUTC(), now = new Date()) {
  const parsed = parseSeasonKey(seasonKey) || parseSeasonKey(currentSeasonKeyUTC(now));
  const key = buildSeasonKey(parsed.year, parsed.month);
  const idx = seasonIndex(key);
  const theme = SEASON_THEME_ROTATION[Math.abs(idx) % SEASON_THEME_ROTATION.length];
  const startAtMs = Date.UTC(parsed.year, parsed.month - 1, 1, 0, 0, 0, 0);
  const endAtMs = Date.UTC(parsed.year, parsed.month, 1, 0, 0, 0, 0);
  const leftMs = Math.max(0, endAtMs - now.getTime());
  const leftDays = Math.ceil(leftMs / 86400000);
  const leftHours = Math.ceil(leftMs / 3600000);

  const featuredSkins = uniqueSeasonSkinIds(idx, 3, 5);
  const rewardSkins = uniqueSeasonSkinIds(idx + 7, 4, 7);

  return {
    key,
    title: theme.title,
    subtitle: theme.subtitle,
    themeId: theme.id,
    eventTitle: theme.eventTitle,
    eventDescription: theme.eventDescription,
    startAt: new Date(startAtMs).toISOString(),
    endAt: new Date(endAtMs).toISOString(),
    leftDays,
    leftHours,
    featuredSkins,
    rewardSkins
  };
}

function getSeasonRewardTiers(seasonKey = currentSeasonKeyUTC()) {
  const season = getSeasonInfo(seasonKey);
  return SEASON_REWARD_TIERS.map((tier) => ({
    tierId: tier.tierId,
    tierLabel: tier.tierLabel,
    rankFrom: tier.rankFrom,
    rankTo: tier.rankTo,
    coins: tier.coins,
    rewardSkinId: season.rewardSkins[tier.rewardSkinSlot] || null
  }));
}

function resolveSeasonTopReward(seasonKey, rankRaw) {
  const rank = Math.max(1, Math.floor(Number(rankRaw || 0)));
  const tiers = getSeasonRewardTiers(seasonKey);
  const tier = tiers.find((item) => rank >= item.rankFrom && rank <= item.rankTo);
  if (!tier) return null;
  return {
    rank,
    tierId: tier.tierId,
    tierLabel: tier.tierLabel,
    coins: tier.coins,
    skinId: tier.rewardSkinId || null
  };
}

async function ensureSeasonSchema() {
  if (seasonSchemaReady) return;

  await query(`
    create table if not exists season_player_stats (
      season_key text not null,
      user_id bigint not null references users(id) on delete cascade,
      trophies integer not null default 0,
      best_trophies integer not null default 0,
      updated_at timestamptz not null default now(),
      primary key (season_key, user_id)
    );
  `);

  await query(`
    create table if not exists season_reward_claims (
      season_key text not null,
      user_id bigint not null references users(id) on delete cascade,
      rank integer not null,
      reward_coins integer not null default 0,
      reward_skin_id text,
      claimed_at timestamptz not null default now(),
      primary key (season_key, user_id)
    );
  `);

  await query(`create index if not exists idx_season_player_stats_top on season_player_stats(season_key, trophies desc, updated_at asc, user_id asc);`);
  await query(`create index if not exists idx_season_player_stats_user on season_player_stats(user_id, season_key desc);`);
  await query(`create index if not exists idx_season_reward_claims_user on season_reward_claims(user_id, claimed_at desc);`);

  seasonSchemaReady = true;
}

function parseTrophiesFromProgress(progress) {
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) return 0;
  const raw = progress.trophies;
  const num = Number(raw);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

async function syncUserSeasonStats(userId, progress = {}) {
  const safeUserId = Number.parseInt(String(userId || ""), 10);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0) return null;
  await ensureSeasonSchema();

  const seasonKey = currentSeasonKeyUTC();
  const trophies = parseTrophiesFromProgress(progress);

  await query(
    `insert into season_player_stats(season_key, user_id, trophies, best_trophies, updated_at)
     values($1, $2, $3, $3, now())
     on conflict (season_key, user_id)
     do update set trophies = excluded.trophies,
                   best_trophies = greatest(season_player_stats.best_trophies, excluded.trophies),
                   updated_at = now()`,
    [seasonKey, safeUserId, trophies]
  );

  return { seasonKey, userId: safeUserId, trophies };
}

async function syncUserSeasonStatsFromStoredProgress(userId) {
  const safeUserId = Number.parseInt(String(userId || ""), 10);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0) return null;
  const result = await query(
    `select progress_json
     from user_progress
     where user_id = $1
     limit 1`,
    [safeUserId]
  );
  const progress = result.rowCount ? (result.rows[0].progress_json || {}) : {};
  return syncUserSeasonStats(safeUserId, progress);
}

async function backfillCurrentSeasonFromProgress(limit = 300) {
  await ensureSeasonSchema();
  const safeLimit = Math.max(50, Math.min(1000, Math.floor(Number(limit || 300))));
  const seasonKey = currentSeasonKeyUTC();

  await query(
    `insert into season_player_stats(season_key, user_id, trophies, best_trophies, updated_at)
     select $1, src.user_id, src.trophies, src.trophies, now()
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
     on conflict (season_key, user_id)
     do update set trophies = excluded.trophies,
                   best_trophies = greatest(season_player_stats.best_trophies, excluded.trophies),
                   updated_at = now()`,
    [seasonKey, safeLimit]
  );
}

async function listSeasonTopPlayers(seasonKey, limit = 100) {
  await ensureSeasonSchema();
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(Number(limit || 100))));
  const key = parseSeasonKey(seasonKey) ? seasonKey : currentSeasonKeyUTC();

  const result = await query(
    `select s.user_id,
            s.trophies,
            s.best_trophies,
            s.updated_at,
            coalesce(nullif(u.nickname, ''), u.email, ('ID ' || u.id::text)) as display_name
     from season_player_stats s
     join users u on u.id = s.user_id
     where s.season_key = $1
       and coalesce(u.is_banned, false) = false
     order by s.trophies desc, s.updated_at asc, s.user_id asc
     limit $2`,
    [key, safeLimit]
  );

  return result.rows.map((row, index) => ({
    rank: index + 1,
    userId: Number(row.user_id),
    name: row.display_name,
    trophies: Number(row.trophies || 0),
    bestTrophies: Number(row.best_trophies || 0)
  }));
}

async function getUserSeasonRank(seasonKey, userId) {
  await ensureSeasonSchema();
  const safeUserId = Number.parseInt(String(userId || ""), 10);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0) return null;
  const key = parseSeasonKey(seasonKey) ? seasonKey : currentSeasonKeyUTC();

  const result = await query(
    `select ranked.rank, ranked.trophies, ranked.best_trophies
     from (
       select s.user_id,
              s.trophies,
              s.best_trophies,
              row_number() over (order by s.trophies desc, s.updated_at asc, s.user_id asc) as rank
       from season_player_stats s
       join users u on u.id = s.user_id
       where s.season_key = $1
         and coalesce(u.is_banned, false) = false
     ) ranked
     where ranked.user_id = $2
     limit 1`,
    [key, safeUserId]
  );

  if (!result.rowCount) return null;
  const row = result.rows[0];
  return {
    rank: Number(row.rank || 0),
    trophies: Number(row.trophies || 0),
    bestTrophies: Number(row.best_trophies || 0)
  };
}

async function getSeasonRewardClaim(seasonKey, userId) {
  await ensureSeasonSchema();
  const safeUserId = Number.parseInt(String(userId || ""), 10);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0) return null;
  const key = parseSeasonKey(seasonKey) ? seasonKey : currentSeasonKeyUTC();

  const result = await query(
    `select season_key, rank, reward_coins, reward_skin_id, claimed_at
     from season_reward_claims
     where season_key = $1 and user_id = $2
     limit 1`,
    [key, safeUserId]
  );

  if (!result.rowCount) return null;
  const row = result.rows[0];
  return {
    seasonKey: row.season_key,
    rank: Number(row.rank || 0),
    coins: Number(row.reward_coins || 0),
    skinId: row.reward_skin_id || null,
    claimedAt: row.claimed_at ? new Date(row.claimed_at).toISOString() : null
  };
}

function normalizeCosmeticsForReward(cosmeticsRaw, rewardSkinId) {
  const base = (cosmeticsRaw && typeof cosmeticsRaw === "object" && !Array.isArray(cosmeticsRaw))
    ? { ...cosmeticsRaw }
    : {};
  const unlocked = Array.isArray(base.unlocked) ? base.unlocked : [];
  const merged = new Set(["classic"]);
  for (const item of unlocked) {
    merged.add(String(item));
  }
  if (rewardSkinId) merged.add(String(rewardSkinId));
  base.unlocked = Array.from(merged);
  return base;
}

async function claimPreviousSeasonReward(userId) {
  await ensureSeasonSchema();
  const safeUserId = Number.parseInt(String(userId || ""), 10);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0) {
    return { ok: false, code: "invalid_user" };
  }

  const currentSeasonKey = currentSeasonKeyUTC();
  const previousSeasonKey = shiftSeasonKey(currentSeasonKey, -1);
  const previousRank = await getUserSeasonRank(previousSeasonKey, safeUserId);

  if (!previousRank || !Number.isFinite(previousRank.rank) || previousRank.rank > 100) {
    return {
      ok: false,
      code: "not_in_top_100",
      previousSeasonKey
    };
  }

  const reward = resolveSeasonTopReward(previousSeasonKey, previousRank.rank);
  if (!reward) {
    return {
      ok: false,
      code: "reward_not_found",
      previousSeasonKey
    };
  }

  const existingClaim = await getSeasonRewardClaim(previousSeasonKey, safeUserId);
  if (existingClaim) {
    return {
      ok: true,
      alreadyClaimed: true,
      previousSeasonKey,
      rank: existingClaim.rank,
      reward: {
        rank: existingClaim.rank,
        tierId: reward.tierId,
        tierLabel: reward.tierLabel,
        coins: existingClaim.coins,
        skinId: existingClaim.skinId
      },
      claimedAt: existingClaim.claimedAt,
      patch: null
    };
  }

  const insertClaimResult = await query(
    `insert into season_reward_claims(season_key, user_id, rank, reward_coins, reward_skin_id, claimed_at)
     values($1, $2, $3, $4, $5, now())
     on conflict (season_key, user_id) do nothing
     returning claimed_at`,
    [previousSeasonKey, safeUserId, reward.rank, reward.coins, reward.skinId]
  );

  if (!insertClaimResult.rowCount) {
    const raceClaim = await getSeasonRewardClaim(previousSeasonKey, safeUserId);
    return {
      ok: true,
      alreadyClaimed: true,
      previousSeasonKey,
      rank: raceClaim ? raceClaim.rank : reward.rank,
      reward: {
        rank: raceClaim ? raceClaim.rank : reward.rank,
        tierId: reward.tierId,
        tierLabel: reward.tierLabel,
        coins: raceClaim ? raceClaim.coins : reward.coins,
        skinId: raceClaim ? raceClaim.skinId : reward.skinId
      },
      claimedAt: raceClaim ? raceClaim.claimedAt : null,
      patch: null
    };
  }

  const progressResult = await query(
    `select progress_json
     from user_progress
     where user_id = $1
     limit 1`,
    [safeUserId]
  );

  const progress = progressResult.rowCount && progressResult.rows[0].progress_json && typeof progressResult.rows[0].progress_json === "object"
    ? { ...progressResult.rows[0].progress_json }
    : {};

  const currentCoins = Number.isFinite(Number(progress.coins)) ? Math.max(0, Math.floor(Number(progress.coins))) : 0;
  const nextCoins = currentCoins + Number(reward.coins || 0);
  const nextCosmetics = normalizeCosmeticsForReward(progress.cosmetics, reward.skinId);

  const nextProgress = {
    ...progress,
    coins: nextCoins,
    cosmetics: nextCosmetics
  };

  await query(
    `insert into user_progress(user_id, progress_json, updated_at)
     values($1, $2::jsonb, now())
     on conflict (user_id)
     do update set progress_json = excluded.progress_json, updated_at = now()`,
    [safeUserId, JSON.stringify(nextProgress)]
  );

  return {
    ok: true,
    alreadyClaimed: false,
    previousSeasonKey,
    rank: reward.rank,
    reward,
    claimedAt: insertClaimResult.rows[0].claimed_at
      ? new Date(insertClaimResult.rows[0].claimed_at).toISOString()
      : null,
    patch: {
      coins: nextCoins,
      cosmetics: nextCosmetics
    }
  };
}

module.exports = {
  ensureSeasonSchema,
  currentSeasonKeyUTC,
  shiftSeasonKey,
  getSeasonInfo,
  getSeasonRewardTiers,
  resolveSeasonTopReward,
  syncUserSeasonStats,
  syncUserSeasonStatsFromStoredProgress,
  backfillCurrentSeasonFromProgress,
  listSeasonTopPlayers,
  getUserSeasonRank,
  getSeasonRewardClaim,
  claimPreviousSeasonReward
};
