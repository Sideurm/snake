const crypto = require("crypto");
const { query } = require("./_db");

let promoSchemaReady = false;

function normalizePromoCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

function safeRewardValue(value, max = 1000000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(max, Math.floor(parsed)));
}

function safeMaxUses(value) {
  if (value === undefined || value === null || value === "") return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(100000, Math.floor(parsed)));
}

function generatePromoCode() {
  const entropy = crypto.randomBytes(5).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `LUM-${entropy.slice(0, 8)}`;
}

async function ensurePromoSchema() {
  if (promoSchemaReady) return;

  await query(`
    create table if not exists promo_codes (
      id bigserial primary key,
      code text not null unique,
      reward_coins integer not null default 0,
      reward_trophies integer not null default 0,
      max_uses integer not null default 1,
      used_count integer not null default 0,
      created_by text not null default '',
      is_active boolean not null default true,
      created_at timestamptz not null default now()
    );
  `);
  await query(`alter table promo_codes add column if not exists max_uses integer not null default 1;`);
  await query(`alter table promo_codes add column if not exists used_count integer not null default 0;`);
  await query(`alter table promo_codes add column if not exists created_by text not null default '';`);
  await query(`alter table promo_codes add column if not exists reward_coins integer not null default 0;`);
  await query(`alter table promo_codes add column if not exists reward_trophies integer not null default 0;`);
  await query(`alter table promo_codes add column if not exists is_active boolean not null default true;`);
  await query(`alter table promo_codes add column if not exists created_at timestamptz not null default now();`);
  await query(`create unique index if not exists idx_promo_codes_code_unique on promo_codes(code);`);

  await query(`
    create table if not exists promo_redemptions (
      id bigserial primary key,
      promo_code_id bigint not null references promo_codes(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      reward_coins integer not null default 0,
      reward_trophies integer not null default 0,
      redeemed_at timestamptz not null default now(),
      unique(promo_code_id, user_id)
    );
  `);
  await query(`create index if not exists idx_promo_redemptions_user_id on promo_redemptions(user_id, redeemed_at desc);`);

  promoSchemaReady = true;
}

async function createPromoCode({ rewardCoins = 0, rewardTrophies = 0, maxUses = 1, createdBy = "" }) {
  await ensurePromoSchema();
  const safeCoins = safeRewardValue(rewardCoins);
  const safeTrophies = safeRewardValue(rewardTrophies);
  const safeUses = safeMaxUses(maxUses);
  const safeCreator = String(createdBy || "").trim().slice(0, 120);

  if (safeCoins <= 0 && safeTrophies <= 0) {
    throw new Error("invalid_reward_values");
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generatePromoCode();
    try {
      const inserted = await query(
        `insert into promo_codes(code, reward_coins, reward_trophies, max_uses, used_count, created_by, is_active, created_at)
         values($1, $2, $3, $4, 0, $5, true, now())
         returning id, code, reward_coins, reward_trophies, max_uses, used_count, created_by, created_at`,
        [code, safeCoins, safeTrophies, safeUses, safeCreator]
      );
      if (inserted.rowCount > 0) {
        const row = inserted.rows[0];
        return {
          id: Number(row.id),
          code: row.code,
          rewardCoins: Number(row.reward_coins || 0),
          rewardTrophies: Number(row.reward_trophies || 0),
          maxUses: Number(row.max_uses || 1),
          usedCount: Number(row.used_count || 0),
          createdBy: row.created_by || "",
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
        };
      }
    } catch (error) {
      if (error && error.code === "23505") continue;
      throw error;
    }
  }

  throw new Error("promo_code_generation_failed");
}

module.exports = {
  normalizePromoCode,
  safeRewardValue,
  safeMaxUses,
  ensurePromoSchema,
  createPromoCode
};
