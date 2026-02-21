create table if not exists users (
  id bigserial primary key,
  email text not null unique,
  password_hash text not null,
  nickname text,
  nickname_norm text,
  is_banned boolean not null default false,
  ban_reason text,
  created_at timestamptz not null default now()
);

alter table users add column if not exists nickname text;
alter table users add column if not exists nickname_norm text;
alter table users add column if not exists is_banned boolean not null default false;
alter table users add column if not exists ban_reason text;

create unique index if not exists idx_users_nickname_norm_unique
  on users(nickname_norm)
  where nickname_norm is not null;

create table if not exists user_progress (
  user_id bigint primary key references users(id) on delete cascade,
  progress_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_progress_updated_at on user_progress(updated_at desc);

create table if not exists game_rooms (
  id bigserial primary key,
  room_code text not null unique,
  leader_user_id bigint not null references users(id) on delete cascade,
  target_score integer not null default 20,
  snake_speed integer not null default 320,
  max_players smallint not null default 2,
  is_public boolean not null default false,
  status text not null default 'waiting',
  challenge_id bigint not null default 0,
  winner_user_id bigint references users(id) on delete set null,
  winner_score integer,
  last_death_user_id bigint references users(id) on delete set null,
  last_death_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_rooms_status_check check (status in ('waiting', 'active', 'finished')),
  constraint game_rooms_target_score_check check (target_score >= 5 and target_score <= 300),
  constraint game_rooms_snake_speed_check check (snake_speed >= 170 and snake_speed <= 700),
  constraint game_rooms_max_players_check check (max_players >= 2 and max_players <= 8)
);

alter table game_rooms add column if not exists snake_speed integer not null default 320;
alter table game_rooms add column if not exists max_players smallint not null default 2;
alter table game_rooms add column if not exists is_public boolean not null default false;
alter table game_rooms add column if not exists last_death_user_id bigint references users(id) on delete set null;
alter table game_rooms add column if not exists last_death_at timestamptz;
alter table game_rooms drop constraint if exists game_rooms_snake_speed_check;
alter table game_rooms add constraint game_rooms_snake_speed_check check (snake_speed >= 170 and snake_speed <= 700);

create table if not exists room_players (
  room_id bigint not null references game_rooms(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  slot smallint not null,
  current_score integer not null default 0,
  run_finished boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, slot)
);

alter table room_players drop constraint if exists room_players_slot_check;
alter table room_players add constraint room_players_slot_check check (slot >= 1 and slot <= 16);

create index if not exists idx_game_rooms_room_code on game_rooms(room_code);
create index if not exists idx_room_players_room_id on room_players(room_id);

create table if not exists friends (
  user_id bigint not null references users(id) on delete cascade,
  friend_user_id bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_user_id),
  constraint friends_not_self check (user_id <> friend_user_id)
);

create table if not exists friend_requests (
  id bigserial primary key,
  from_user_id bigint not null references users(id) on delete cascade,
  to_user_id bigint not null references users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_requests_not_self check (from_user_id <> to_user_id),
  constraint friend_requests_status_check check (status in ('pending', 'accepted', 'rejected'))
);

create index if not exists idx_friends_user_id on friends(user_id);
create index if not exists idx_friend_requests_to_status on friend_requests(to_user_id, status, created_at desc);
create index if not exists idx_friend_requests_from_status on friend_requests(from_user_id, status, created_at desc);
create unique index if not exists idx_friend_requests_unique_pending_pair
  on friend_requests(from_user_id, to_user_id)
  where status = 'pending';

create table if not exists clans (
  id bigserial primary key,
  name text not null,
  name_norm text not null unique,
  owner_user_id bigint not null references users(id) on delete cascade,
  invite_code text,
  coins bigint not null default 0,
  created_at timestamptz not null default now()
);
alter table clans add column if not exists invite_code text;
alter table clans add column if not exists coins bigint not null default 0;

create table if not exists clan_members (
  clan_id bigint not null references clans(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (clan_id, user_id),
  unique (user_id),
  constraint clan_members_role_check check (role in ('owner', 'officer', 'member'))
);
alter table clan_members drop constraint if exists clan_members_role_check;
alter table clan_members add constraint clan_members_role_check check (role in ('owner', 'officer', 'member'));

create table if not exists clan_monthly_progress (
  clan_id bigint not null references clans(id) on delete cascade,
  month_key text not null,
  wins integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (clan_id, month_key)
);

create table if not exists clan_daily_progress (
  clan_id bigint not null references clans(id) on delete cascade,
  day_key text not null,
  wins integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (clan_id, day_key)
);

create table if not exists clan_monthly_claims (
  clan_id bigint not null references clans(id) on delete cascade,
  month_key text not null,
  user_id bigint not null references users(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (clan_id, month_key, user_id)
);

create table if not exists clan_win_events (
  id bigserial primary key,
  clan_id bigint not null references clans(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists clan_member_streaks (
  clan_id bigint not null references clans(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  last_win_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clan_id, user_id)
);

create table if not exists clan_chat_messages (
  id bigserial primary key,
  clan_id bigint not null references clans(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists clan_activity_logs (
  id bigserial primary key,
  clan_id bigint not null references clans(id) on delete cascade,
  user_id bigint references users(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists clan_shop_unlocks (
  clan_id bigint not null references clans(id) on delete cascade,
  item_id text not null,
  unlocked_by_user_id bigint references users(id) on delete set null,
  unlocked_at timestamptz not null default now(),
  primary key (clan_id, item_id)
);

create table if not exists clan_wars (
  id bigserial primary key,
  clan_a_id bigint not null references clans(id) on delete cascade,
  clan_b_id bigint not null references clans(id) on delete cascade,
  score_a integer not null default 0,
  score_b integer not null default 0,
  target_score integer not null default 20,
  status text not null default 'active',
  winner_clan_id bigint references clans(id) on delete set null,
  created_by_user_id bigint references users(id) on delete set null,
  finished_by_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table clan_wars drop constraint if exists clan_wars_status_check;
alter table clan_wars add constraint clan_wars_status_check check (status in ('active', 'finished'));

create index if not exists idx_clan_members_clan_id on clan_members(clan_id);
create index if not exists idx_clan_monthly_progress_month on clan_monthly_progress(month_key, wins desc);
create index if not exists idx_clan_daily_progress_day on clan_daily_progress(day_key, wins desc);
create index if not exists idx_clan_win_events_user_created on clan_win_events(user_id, created_at desc);
create index if not exists idx_clan_win_events_clan_created on clan_win_events(clan_id, created_at desc);
create unique index if not exists idx_clans_invite_code_unique on clans(invite_code) where invite_code is not null;
create index if not exists idx_clan_chat_messages_clan_created on clan_chat_messages(clan_id, created_at desc);
create index if not exists idx_clan_activity_logs_clan_created on clan_activity_logs(clan_id, created_at desc);
create index if not exists idx_clan_wars_active_a on clan_wars(clan_a_id, status, created_at desc);
create index if not exists idx_clan_wars_active_b on clan_wars(clan_b_id, status, created_at desc);

alter table clans add column if not exists trophies bigint not null default 0;
alter table clans add column if not exists clan_xp bigint not null default 0;
alter table clans add column if not exists min_trophies integer not null default 0;
alter table clans add column if not exists style_tag text not null default 'any';
alter table clans add column if not exists banner_text text;
alter table clans add column if not exists emblem text;
alter table clans add column if not exists color text;
alter table clans add column if not exists slogan text;
alter table clans add column if not exists rules_text text;
alter table clans add column if not exists wall_message text;

alter table clan_members drop constraint if exists clan_members_role_check;
alter table clan_members add constraint clan_members_role_check
  check (role in ('owner', 'officer', 'recruiter', 'treasurer', 'member'));

create table if not exists clan_member_reputation (
  clan_id bigint not null references clans(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  activity_score integer not null default 0,
  contribution_score integer not null default 0,
  discipline_score integer not null default 100,
  updated_at timestamptz not null default now(),
  primary key (clan_id, user_id)
);

create table if not exists clan_contributions (
  id bigserial primary key,
  clan_id bigint not null references clans(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  amount integer not null check (amount > 0),
  resource_type text not null default 'coins',
  created_at timestamptz not null default now()
);

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

create table if not exists clan_achievements (
  clan_id bigint not null references clans(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  extra jsonb not null default '{}'::jsonb,
  primary key (clan_id, achievement_id)
);

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

create index if not exists idx_clan_contrib_clan_created on clan_contributions(clan_id, created_at desc);
create index if not exists idx_clan_reputation_clan on clan_member_reputation(clan_id, updated_at desc);
create index if not exists idx_clan_season_history_clan_day on clan_season_history(clan_id, day_key desc);
create index if not exists idx_clan_events_active on clan_events(clan_id, starts_at desc, ends_at desc);
create index if not exists idx_clans_search on clans(style_tag, min_trophies, trophies desc);
