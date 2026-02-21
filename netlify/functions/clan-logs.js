const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError } = require("./_http");
const { ensureClansSchema, getUserClan } = require("./_clans");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureClansSchema();

    const clan = await getUserClan(payload.uid);
    if (!clan) return badRequest("not_in_clan");

    const result = await query(
      `select l.id, l.user_id, l.event_type, l.details, l.created_at, u.nickname, u.email
       from clan_activity_logs l
       left join users u on u.id = l.user_id
       where l.clan_id = $1
       order by l.id desc
       limit 80`,
      [clan.id]
    );

    return json(200, {
      ok: true,
      logs: result.rows.map((row) => ({
        id: Number(row.id),
        userId: row.user_id ? Number(row.user_id) : null,
        nickname: row.nickname || null,
        email: row.email || null,
        eventType: row.event_type,
        details: row.details && typeof row.details === "object" ? row.details : {},
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
      }))
    });
  } catch (error) {
    return internalError(error);
  }
};
