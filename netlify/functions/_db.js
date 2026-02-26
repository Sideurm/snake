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

async function withTransaction(handler) {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query("begin");
    const result = await handler(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch (_) {
      // ignore rollback errors to preserve original failure
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { query, withTransaction };
