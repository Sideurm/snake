const crypto = require("crypto");
const { query } = require("./_db");

let roomsSchemaReady = false;

function normalizeRoomCode(input) {
  if (!input || typeof input !== "string") return "";
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function clampTargetScore(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(5, Math.min(300, parsed));
}

function clampSnakeSpeed(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 320;
  return Math.max(170, Math.min(700, parsed));
}

function clampMaxPlayers(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(2, Math.min(8, parsed));
}

function normalizePublicFlag(value) {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  return false;
}

function randomRoomCode(length = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

async function ensureRoomsSchema() {
  if (roomsSchemaReady) return;

  await query(`
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
  `);

  await query(`alter table game_rooms add column if not exists snake_speed integer not null default 320;`);
  await query(`alter table game_rooms add column if not exists max_players smallint not null default 2;`);
  await query(`alter table game_rooms add column if not exists is_public boolean not null default false;`);
  await query(`alter table game_rooms add column if not exists last_death_user_id bigint references users(id) on delete set null;`);
  await query(`alter table game_rooms add column if not exists last_death_at timestamptz;`);
  await query(`alter table game_rooms drop constraint if exists game_rooms_snake_speed_check;`);
  await query(`alter table game_rooms add constraint game_rooms_snake_speed_check check (snake_speed >= 170 and snake_speed <= 700);`);

  await query(`
    create table if not exists room_players (
      room_id bigint not null references game_rooms(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      slot smallint not null,
      current_score integer not null default 0,
      run_finished boolean not null default false,
      joined_at timestamptz not null default now(),
      primary key (room_id, user_id),
      unique (room_id, slot),
      constraint room_players_slot_check check (slot in (1, 2))
    );
  `);
  await query(`alter table room_players drop constraint if exists room_players_slot_check;`);
  await query(`alter table room_players add constraint room_players_slot_check check (slot >= 1 and slot <= 16);`);

  await query(`create index if not exists idx_game_rooms_room_code on game_rooms(room_code);`);
  await query(`create index if not exists idx_room_players_room_id on room_players(room_id);`);

  roomsSchemaReady = true;
}

async function getRoomStateByCode(code) {
  const roomCode = normalizeRoomCode(code);
  if (!roomCode) return null;

  const roomResult = await query(
    `select id, room_code, leader_user_id, target_score, snake_speed, max_players, is_public, status, challenge_id, winner_user_id, winner_score, last_death_user_id, last_death_at
     from game_rooms
     where room_code = $1
     limit 1`,
    [roomCode]
  );
  if (roomResult.rowCount === 0) return null;

  const room = roomResult.rows[0];
  const playersResult = await query(
    `select rp.user_id, rp.slot, rp.current_score, rp.run_finished, u.nickname, u.email
     from room_players rp
     join users u on u.id = rp.user_id
     where rp.room_id = $1
     order by rp.slot asc`,
    [room.id]
  );

  return {
    roomId: Number(room.id),
    roomCode: room.room_code,
    leaderUserId: Number(room.leader_user_id),
    targetScore: Number(room.target_score),
    snakeSpeed: Number(room.snake_speed || 320),
    maxPlayers: Number(room.max_players || 2),
    isPublic: !!room.is_public,
    status: room.status,
    challengeId: Number(room.challenge_id || 0),
    winnerUserId: room.winner_user_id ? Number(room.winner_user_id) : null,
    winnerScore: Number.isFinite(Number(room.winner_score)) ? Number(room.winner_score) : null,
    lastDeathUserId: room.last_death_user_id ? Number(room.last_death_user_id) : null,
    lastDeathAt: room.last_death_at ? new Date(room.last_death_at).toISOString() : null,
    players: playersResult.rows.map((row) => ({
      userId: Number(row.user_id),
      slot: Number(row.slot),
      score: Number(row.current_score || 0),
      runFinished: !!row.run_finished,
      nickname: row.nickname || null,
      email: row.email || null
    }))
  };
}

async function getUserCurrentRoomState(userId, statuses = ["waiting", "active"]) {
  const safeUserId = Number(userId);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0) return null;
  const safeStatuses = Array.isArray(statuses) && statuses.length
    ? statuses.filter((s) => ["waiting", "active", "finished"].includes(String(s)))
    : ["waiting", "active"];
  if (!safeStatuses.length) return null;

  const roomResult = await query(
    `select gr.room_code
     from room_players rp
     join game_rooms gr on gr.id = rp.room_id
     where rp.user_id = $1
       and gr.status = any($2::text[])
     order by gr.updated_at desc, gr.id desc
     limit 1`,
    [safeUserId, safeStatuses]
  );
  if (roomResult.rowCount === 0) return null;
  return getRoomStateByCode(roomResult.rows[0].room_code);
}

module.exports = {
  ensureRoomsSchema,
  normalizeRoomCode,
  clampTargetScore,
  clampSnakeSpeed,
  clampMaxPlayers,
  normalizePublicFlag,
  randomRoomCode,
  getRoomStateByCode,
  getUserCurrentRoomState
};
