const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, internalError } = require("./_http");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    const result = await query(
      "select progress_json, updated_at from user_progress where user_id = $1 limit 1",
      [payload.uid]
    );
    const progress = result.rowCount ? (result.rows[0].progress_json || {}) : {};
    const updatedAt = result.rowCount && result.rows[0].updated_at
      ? new Date(result.rows[0].updated_at).toISOString()
      : null;

    return json(200, { ok: true, progress, updatedAt });
  } catch (error) {
    return internalError(error);
  }
};
