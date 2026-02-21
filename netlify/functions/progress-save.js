const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");

    const progress = body.progress;
    if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
      return badRequest("invalid_progress");
    }

    const result = await query(
      `insert into user_progress(user_id, progress_json, updated_at)
       values($1, $2::jsonb, now())
       on conflict (user_id)
       do update set progress_json = excluded.progress_json, updated_at = now()
       returning updated_at`,
      [payload.uid, JSON.stringify(progress)]
    );

    const updatedAt = result.rowCount && result.rows[0].updated_at
      ? new Date(result.rows[0].updated_at).toISOString()
      : null;
    return json(200, { ok: true, updatedAt });
  } catch (error) {
    return internalError(error);
  }
};
