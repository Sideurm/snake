const { query } = require("./_db");

let clansSchemaReady = false;
const MONTH_TARGET_WINS = 300;
const CLAN_WAR_TARGET_SCORE = 20;
const STREAK_REWARD_MILESTONES = {
  3: 2,
  5: 4,
  10: 10
};
const DEFAULT_WEEKLY_TASKS = [
  { taskId: "wins_25", title: "25 побед кланом", target: 25, rewardCoins: 30, rewardXp: 120 },
  { taskId: "chat_40", title: "40 сообщений в чат", target: 40, rewardCoins: 20, rewardXp: 80 },
  { taskId: "contrib_500", title: "500 коинов в фонд", target: 500, rewardCoins: 45, rewardXp: 150 }
];

function monthKeyUTC(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function dayKeyUTC(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function weekKeyUTC(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function normalizeClanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeClanNameKey(value) {
  return normalizeClanName(value).toLowerCase();
}

function normalizeInviteCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function validateClanName(name) {
  if (typeof name !== "string") return false;
  const trimmed = normalizeClanName(name);
  if (trimmed.length < 3 || trimmed.length > 24) return false;
  return /^[\p{L}\p{N}_\-\s]+$/u.test(trimmed);
}

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function canManageClan(role) {
  return role === "owner" || role === "officer";
}

function canManageMembers(role) {
  return role === "owner" || role === "officer";
}

function canManageRoles(role) {
  return role === "owner";
}

function canRecruit(role) {
  return role === "owner" || role === "officer" || role === "recruiter";
}

function canManageEconomy(role) {
  return role === "owner" || role === "officer" || role === "treasurer";
}

function canManageWall(role) {
  return role === "owner" || role === "officer";
}

function rolePermissions(role) {
  return {
    canManageClan: canManageClan(role),
    canManageMembers: canManageMembers(role),
    canManageRoles: canManageRoles(role),
    canRecruit: canRecruit(role),
    canManageEconomy: canManageEconomy(role),
    canManageWall: canManageWall(role)
  };
}

function clanLevelFromXp(xpRaw) {
  const xp = Math.max(0, Number(xpRaw || 0));
  let level = 1;
  let remain = xp;
  let need = 120;
  while (remain >= need && level < 100) {
    remain -= need;
    level += 1;
    need = Math.floor(120 + level * 26);
  }
  return { level, xp, inLevelXp: remain, nextLevelXp: need };
}

function clanPerksFromLevel(levelRaw) {
  const level = Math.max(1, Number(levelRaw || 1));
  return {
    coinBonusPct: Math.min(25, Math.floor(level / 2)),
    trophyBonusPct: Math.min(15, Math.floor(level / 4)),
    warRewardBonusPct: Math.min(30, Math.floor(level / 2))
  };
}

function mapWarRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    clanAId: Number(row.clan_a_id),
    clanBId: Number(row.clan_b_id),
    scoreA: Number(row.score_a || 0),
    scoreB: Number(row.score_b || 0),
    targetScore: Number(row.target_score || CLAN_WAR_TARGET_SCORE),
    status: row.status,
    winnerClanId: row.winner_clan_id ? Number(row.winner_clan_id) : null,
    createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : null,
    finishedByUserId: row.finished_by_user_id ? Number(row.finished_by_user_id) : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null
  };
}

async function ensureClansSchema() {
  if (clansSchemaReady) return;

  await query(`
    create table if not exists clans (
      id bigserial primary key,
      name text not null,
      name_norm text not null unique,
      owner_user_id bigint not null references users(id) on delete cascade,
      invite_code text,
      coins bigint not null default 0,
      trophies bigint not null default 0,
      clan_xp bigint not null default 0,
      min_trophies integer not null default 0,
      style_tag text not null default 'any',
      banner_text text,
      emblem text,
      color text,
      slogan text,
      rules_text text,
      wall_message text,
      created_at timestamptz not null default now()
    );
  `);

  await query(`alter table clans add column if not exists invite_code text;`);
  await query(`alter table clans add column if not exists coins bigint not null default 0;`);
  await query(`alter table clans add column if not exists trophies bigint not null default 0;`);
  await query(`alter table clans add column if not exists clan_xp bigint not null default 0;`);
  await query(`alter table clans add column if not exists min_trophies integer not null default 0;`);
  await query(`alter table clans add column if not exists style_tag text not null default 'any';`);
  await query(`alter table clans add column if not exists banner_text text;`);
  await query(`alter table clans add column if not exists emblem text;`);
  await query(`alter table clans add column if not exists color text;`);
  await query(`alter table clans add column if not exists slogan text;`);
  await query(`alter table clans add column if not exists rules_text text;`);
  await query(`alter table clans add column if not exists wall_message text;`);

  await query(`
    create table if not exists clan_members (
      clan_id bigint not null references clans(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      role text not null default 'member',
      joined_at timestamptz not null default now(),
      primary key (clan_id, user_id),
      unique (user_id),
      constraint clan_members_role_check check (role in ('owner', 'officer', 'recruiter', 'treasurer', 'member'))
    );
  `);
  await query(`alter table clan_members drop constraint if exists clan_members_role_check;`);
  await query(`alter table clan_members add constraint clan_members_role_check check (role in ('owner', 'officer', 'recruiter', 'treasurer', 'member'));`);

  await query(`
    create table if not exists clan_monthly_progress (
      clan_id bigint not null references clans(id) on delete cascade,
      month_key text not null,
      wins integer not null default 0,
      updated_at timestamptz not null default now(),
      primary key (clan_id, month_key)
    );
  `);

  await query(`
    create table if not exists clan_daily_progress (
      clan_id bigint not null references clans(id) on delete cascade,
      day_key text not null,
      wins integer not null default 0,
      updated_at timestamptz not null default now(),
      primary key (clan_id, day_key)
    );
  `);

  await query(`
    create table if not exists clan_monthly_claims (
      clan_id bigint not null references clans(id) on delete cascade,
      month_key text not null,
      user_id bigint not null references users(id) on delete cascade,
      claimed_at timestamptz not null default now(),
      primary key (clan_id, month_key, user_id)
    );
  `);

  await query(`
    create table if not exists clan_win_events (
      id bigserial primary key,
      clan_id bigint not null references clans(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      created_at timestamptz not null default now()
    );
  `);

  await query(`
    create table if not exists clan_member_streaks (
      clan_id bigint not null references clans(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      current_streak integer not null default 0,
      best_streak integer not null default 0,
      last_win_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (clan_id, user_id)
    );
  `);

  await query(`
    create table if not exists clan_member_reputation (
      clan_id bigint not null references clans(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      activity_score integer not null default 0,
      contribution_score integer not null default 0,
      discipline_score integer not null default 100,
      updated_at timestamptz not null default now(),
      primary key (clan_id, user_id)
    );
  `);

  await query(`
    create table if not exists clan_contributions (
      id bigserial primary key,
      clan_id bigint not null references clans(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      amount integer not null check (amount > 0),
      resource_type text not null default 'coins',
      created_at timestamptz not null default now()
    );
  `);

  await query(`
    create table if not exists clan_weekly_tasks (
      clan_id bigint not null references clans(id) on delete cascade,
      week_key text not null,
      task_id text not null,
      target integer not null default 1,
      progress integer not null default 0,
      reward_coins integer not null default 0,
      reward_xp integer not null default 0,
      claimed boolean not null default false,
      updated_at timestamptz not null default now(),
      primary key (clan_id, week_key, task_id)
    );
  `);

  await query(`
    create table if not exists clan_achievements (
      clan_id bigint not null references clans(id) on delete cascade,
      achievement_id text not null,
      unlocked_at timestamptz not null default now(),
      extra jsonb not null default '{}'::jsonb,
      primary key (clan_id, achievement_id)
    );
  `);

  await query(`
    create table if not exists clan_season_history (
      clan_id bigint not null references clans(id) on delete cascade,
      season_key text not null,
      day_key text not null,
      trophies bigint not null default 0,
      weekly_rank integer,
      top_member_user_id bigint references users(id) on delete set null,
      updated_at timestamptz not null default now(),
      primary key (clan_id, season_key, day_key)
    );
  `);

  await query(`
    create table if not exists clan_events (
      id bigserial primary key,
      clan_id bigint not null references clans(id) on delete cascade,
      event_type text not null,
      title text not null,
      starts_at timestamptz not null,
      ends_at timestamptz not null,
      bonus_pct integer not null default 0,
      created_by_user_id bigint references users(id) on delete set null,
      created_at timestamptz not null default now()
    );
  `);

  await query(`
    create table if not exists clan_chat_messages (
      id bigserial primary key,
      clan_id bigint not null references clans(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      message text not null,
      created_at timestamptz not null default now()
    );
  `);

  await query(`
    create table if not exists clan_activity_logs (
      id bigserial primary key,
      clan_id bigint not null references clans(id) on delete cascade,
      user_id bigint references users(id) on delete set null,
      event_type text not null,
      details jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await query(`
    create table if not exists clan_shop_unlocks (
      clan_id bigint not null references clans(id) on delete cascade,
      item_id text not null,
      unlocked_by_user_id bigint references users(id) on delete set null,
      unlocked_at timestamptz not null default now(),
      primary key (clan_id, item_id)
    );
  `);

  await query(`
    create table if not exists clan_wars (
      id bigserial primary key,
      clan_a_id bigint not null references clans(id) on delete cascade,
      clan_b_id bigint not null references clans(id) on delete cascade,
      score_a integer not null default 0,
      score_b integer not null default 0,
      target_score integer not null default ${CLAN_WAR_TARGET_SCORE},
      status text not null default 'active',
      winner_clan_id bigint references clans(id) on delete set null,
      created_by_user_id bigint references users(id) on delete set null,
      finished_by_user_id bigint references users(id) on delete set null,
      created_at timestamptz not null default now(),
      finished_at timestamptz
    );
  `);

  await query(`alter table clan_wars drop constraint if exists clan_wars_status_check;`);
  await query(`alter table clan_wars add constraint clan_wars_status_check check (status in ('active', 'finished'));`);

  await query(`
    create unique index if not exists idx_clans_invite_code_unique
    on clans(invite_code)
    where invite_code is not null;
  `);
  await query(`create index if not exists idx_clan_members_clan_id on clan_members(clan_id);`);
  await query(`create index if not exists idx_clan_monthly_progress_month on clan_monthly_progress(month_key, wins desc);`);
  await query(`create index if not exists idx_clan_daily_progress_day on clan_daily_progress(day_key, wins desc);`);
  await query(`create index if not exists idx_clan_win_events_user_created on clan_win_events(user_id, created_at desc);`);
  await query(`create index if not exists idx_clan_win_events_clan_created on clan_win_events(clan_id, created_at desc);`);
  await query(`create index if not exists idx_clan_chat_messages_clan_created on clan_chat_messages(clan_id, created_at desc);`);
  await query(`create index if not exists idx_clan_activity_logs_clan_created on clan_activity_logs(clan_id, created_at desc);`);
  await query(`create index if not exists idx_clan_wars_active_a on clan_wars(clan_a_id, status, created_at desc);`);
  await query(`create index if not exists idx_clan_wars_active_b on clan_wars(clan_b_id, status, created_at desc);`);
  await query(`create index if not exists idx_clan_contrib_clan_created on clan_contributions(clan_id, created_at desc);`);
  await query(`create index if not exists idx_clan_reputation_clan on clan_member_reputation(clan_id, updated_at desc);`);
  await query(`create index if not exists idx_clan_season_history_clan_day on clan_season_history(clan_id, day_key desc);`);
  await query(`create index if not exists idx_clan_events_active on clan_events(clan_id, starts_at desc, ends_at desc);`);
  await query(`create index if not exists idx_clans_search on clans(style_tag, min_trophies, trophies desc);`);

  clansSchemaReady = true;
}

async function getClanById(clanId) {
  const result = await query(
    `select id, name, owner_user_id, invite_code, coins, trophies, clan_xp, min_trophies, style_tag,
            banner_text, emblem, color, slogan, rules_text, wall_message
     from clans
     where id = $1
     limit 1`,
    [clanId]
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  return {
    id: Number(row.id),
    name: row.name,
    ownerUserId: Number(row.owner_user_id),
    inviteCode: row.invite_code || null,
    coins: Number(row.coins || 0),
    trophies: Number(row.trophies || 0),
    clanXp: Number(row.clan_xp || 0),
    minTrophies: Number(row.min_trophies || 0),
    styleTag: row.style_tag || "any",
    bannerText: row.banner_text || "",
    emblem: row.emblem || "",
    color: row.color || "",
    slogan: row.slogan || "",
    rulesText: row.rules_text || "",
    wallMessage: row.wall_message || ""
  };
}

async function getUserClan(userId) {
  const result = await query(
    `select c.id, c.name, c.owner_user_id, c.invite_code, c.coins, c.trophies, c.clan_xp, c.min_trophies, c.style_tag,
            c.banner_text, c.emblem, c.color, c.slogan, c.rules_text, c.wall_message, cm.role
     from clan_members cm
     join clans c on c.id = cm.clan_id
     where cm.user_id = $1
     limit 1`,
    [userId]
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  return {
    id: Number(row.id),
    name: row.name,
    ownerUserId: Number(row.owner_user_id),
    inviteCode: row.invite_code || null,
    coins: Number(row.coins || 0),
    trophies: Number(row.trophies || 0),
    clanXp: Number(row.clan_xp || 0),
    minTrophies: Number(row.min_trophies || 0),
    styleTag: row.style_tag || "any",
    bannerText: row.banner_text || "",
    emblem: row.emblem || "",
    color: row.color || "",
    slogan: row.slogan || "",
    rulesText: row.rules_text || "",
    wallMessage: row.wall_message || "",
    role: row.role
  };
}

async function getClanMembers(clanId) {
  const result = await query(
    `select cm.user_id, cm.role, cm.joined_at, u.nickname, u.email
     from clan_members cm
     join users u on u.id = cm.user_id
     where cm.clan_id = $1
     order by cm.joined_at asc`,
    [clanId]
  );
  return result.rows.map((row) => ({
    userId: Number(row.user_id),
    role: row.role,
    joinedAt: row.joined_at ? new Date(row.joined_at).toISOString() : null,
    nickname: row.nickname || null,
    email: row.email || null
  }));
}

async function addClanActivity(clanId, userId, eventType, details = {}) {
  if (!clanId || !eventType) return;
  const safeDetails = details && typeof details === "object" && !Array.isArray(details) ? details : {};
  await query(
    `insert into clan_activity_logs(clan_id, user_id, event_type, details)
     values($1, $2, $3, $4::jsonb)`,
    [clanId, userId || null, eventType, JSON.stringify(safeDetails)]
  );
}

async function getClanActiveWar(clanId) {
  const result = await query(
    `select *
     from clan_wars
     where status = 'active'
       and (clan_a_id = $1 or clan_b_id = $1)
     order by created_at desc
     limit 1`,
    [clanId]
  );
  if (result.rowCount === 0) return null;
  return mapWarRow(result.rows[0]);
}

function buildWeeklyTaskTemplate() {
  return DEFAULT_WEEKLY_TASKS.map((task) => ({
    taskId: task.taskId,
    title: task.title,
    target: Number(task.target || 1),
    rewardCoins: Number(task.rewardCoins || 0),
    rewardXp: Number(task.rewardXp || 0)
  }));
}

async function ensureClanWeeklyTasks(clanId, weekKey) {
  const template = buildWeeklyTaskTemplate();
  for (const task of template) {
    await query(
      `insert into clan_weekly_tasks(clan_id, week_key, task_id, target, progress, reward_coins, reward_xp, claimed, updated_at)
       values($1, $2, $3, $4, 0, $5, $6, false, now())
       on conflict (clan_id, week_key, task_id) do nothing`,
      [clanId, weekKey, task.taskId, task.target, task.rewardCoins, task.rewardXp]
    );
  }
}

async function adjustClanReputation(clanId, userId, patch = {}) {
  if (!clanId || !userId) return;
  const activityDelta = Number(patch.activityDelta || 0);
  const contributionDelta = Number(patch.contributionDelta || 0);
  const disciplineDelta = Number(patch.disciplineDelta || 0);
  await query(
    `insert into clan_member_reputation(clan_id, user_id, activity_score, contribution_score, discipline_score, updated_at)
     values($1, $2, greatest(0, $3), greatest(0, $4), least(100, greatest(0, 100 + $5)), now())
     on conflict (clan_id, user_id)
     do update
       set activity_score = greatest(0, clan_member_reputation.activity_score + $3),
           contribution_score = greatest(0, clan_member_reputation.contribution_score + $4),
           discipline_score = least(100, greatest(0, clan_member_reputation.discipline_score + $5)),
           updated_at = now()`,
    [clanId, userId, activityDelta, contributionDelta, disciplineDelta]
  );
}

async function writeClanSeasonSnapshot(clanId, dayKey, topMemberUserId = null) {
  const seasonKey = String(dayKey || "").slice(0, 7);
  if (!seasonKey || !clanId) return;
  await query(
    `insert into clan_season_history(clan_id, season_key, day_key, trophies, top_member_user_id, updated_at)
     values(
       $1,
       $2,
       $3,
       (select trophies from clans where id = $1),
       $4,
       now()
     )
     on conflict (clan_id, season_key, day_key)
     do update
       set trophies = excluded.trophies,
           top_member_user_id = excluded.top_member_user_id,
           updated_at = now()`,
    [clanId, seasonKey, dayKey, topMemberUserId]
  );
}

async function unlockClanAchievement(clanId, achievementId, extra = {}) {
  if (!clanId || !achievementId) return false;
  const res = await query(
    `insert into clan_achievements(clan_id, achievement_id, extra)
     values($1, $2, $3::jsonb)
     on conflict do nothing
     returning achievement_id`,
    [clanId, achievementId, JSON.stringify(extra && typeof extra === "object" ? extra : {})]
  );
  return res.rowCount > 0;
}

async function applyClanWarProgress(clanId, scoreDelta, actorUserId) {
  const delta = Number(scoreDelta || 0);
  if (!Number.isFinite(delta) || delta <= 0) return null;

  const active = await getClanActiveWar(clanId);
  if (!active || active.status !== "active") return null;

  let updated;
  if (active.clanAId === Number(clanId)) {
    updated = await query(
      `update clan_wars
       set score_a = score_a + $2
       where id = $1 and status = 'active'
       returning *`,
      [active.id, delta]
    );
  } else {
    updated = await query(
      `update clan_wars
       set score_b = score_b + $2
       where id = $1 and status = 'active'
       returning *`,
      [active.id, delta]
    );
  }

  if (!updated.rowCount) return await getClanActiveWar(clanId);

  let war = mapWarRow(updated.rows[0]);
  if (war.status === "active" && (war.scoreA >= war.targetScore || war.scoreB >= war.targetScore)) {
    const winnerClanId = war.scoreA >= war.targetScore ? war.clanAId : war.clanBId;
    const finished = await query(
      `update clan_wars
       set status = 'finished',
           winner_clan_id = $2,
           finished_by_user_id = $3,
           finished_at = now()
       where id = $1 and status = 'active'
       returning *`,
      [war.id, winnerClanId, actorUserId || null]
    );
    if (finished.rowCount) {
      war = mapWarRow(finished.rows[0]);
      await addClanActivity(war.clanAId, actorUserId, "war_finished", {
        warId: war.id,
        winnerClanId: war.winnerClanId,
        scoreA: war.scoreA,
        scoreB: war.scoreB
      });
      await addClanActivity(war.clanBId, actorUserId, "war_finished", {
        warId: war.id,
        winnerClanId: war.winnerClanId,
        scoreA: war.scoreA,
        scoreB: war.scoreB
      });
    }
  }

  return war;
}

module.exports = {
  MONTH_TARGET_WINS,
  CLAN_WAR_TARGET_SCORE,
  STREAK_REWARD_MILESTONES,
  monthKeyUTC,
  dayKeyUTC,
  weekKeyUTC,
  normalizeClanName,
  normalizeClanNameKey,
  normalizeInviteCode,
  validateClanName,
  generateInviteCode,
  canManageClan,
  canManageMembers,
  canManageRoles,
  canRecruit,
  canManageEconomy,
  canManageWall,
  rolePermissions,
  clanLevelFromXp,
  clanPerksFromLevel,
  buildWeeklyTaskTemplate,
  ensureClanWeeklyTasks,
  adjustClanReputation,
  writeClanSeasonSnapshot,
  unlockClanAchievement,
  ensureClansSchema,
  getClanById,
  getUserClan,
  getClanMembers,
  addClanActivity,
  getClanActiveWar,
  applyClanWarProgress,
  mapWarRow
};
