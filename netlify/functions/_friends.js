const { query } = require("./_db");

let friendsSchemaReady = false;

async function ensureFriendsSchema() {
  if (friendsSchemaReady) return;

  await query(`
    create table if not exists friends (
      user_id bigint not null references users(id) on delete cascade,
      friend_user_id bigint not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (user_id, friend_user_id),
      constraint friends_not_self check (user_id <> friend_user_id)
    );
  `);

  await query(`
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
  `);

  await query(`create index if not exists idx_friends_user_id on friends(user_id);`);
  await query(`create index if not exists idx_friend_requests_to_status on friend_requests(to_user_id, status, created_at desc);`);
  await query(`create index if not exists idx_friend_requests_from_status on friend_requests(from_user_id, status, created_at desc);`);
  await query(`create unique index if not exists idx_friend_requests_unique_pending_pair on friend_requests(from_user_id, to_user_id) where status = 'pending';`);

  friendsSchemaReady = true;
}

async function areFriends(aUserId, bUserId) {
  const result = await query(
    `select 1 from friends where user_id = $1 and friend_user_id = $2 limit 1`,
    [aUserId, bUserId]
  );
  return result.rowCount > 0;
}

async function getPendingBetween(aUserId, bUserId) {
  const result = await query(
    `select id, from_user_id, to_user_id, status
     from friend_requests
     where status = 'pending'
       and ((from_user_id = $1 and to_user_id = $2) or (from_user_id = $2 and to_user_id = $1))
     order by id desc
     limit 1`,
    [aUserId, bUserId]
  );
  if (result.rowCount === 0) return null;
  return result.rows[0];
}

async function addMutualFriendship(aUserId, bUserId) {
  await query(
    `insert into friends(user_id, friend_user_id)
     values($1, $2), ($2, $1)
     on conflict do nothing`,
    [aUserId, bUserId]
  );
}

module.exports = {
  ensureFriendsSchema,
  areFriends,
  getPendingBetween,
  addMutualFriendship
};
