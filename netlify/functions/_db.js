const { Pool } = require("pg");

let pool;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set (or NETLIFY_DATABASE_URL)");
  }
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  return pool;
}

async function query(text, params = []) {
  const p = getPool();
  return p.query(text, params);
}

module.exports = { query };
