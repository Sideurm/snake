const { Pool } = require("pg");

let pool;

function resolveConnectionString() {
  return (
    process.env.SUPABASE_DB_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL ||
    ""
  ).trim();
}

function getPool() {
  if (pool) return pool;
  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new Error(
      "DB URL is not set. Expected SUPABASE_DB_URL/SUPABASE_DATABASE_URL or DATABASE_URL/NETLIFY_DATABASE_URL"
    );
  }
  const preferStrictSsl = String(process.env.DB_SSL_STRICT || "").toLowerCase() === "true";
  pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: preferStrictSsl
    }
  });
  return pool;
}

async function query(text, params = []) {
  const p = getPool();
  return p.query(text, params);
}

module.exports = { query };
