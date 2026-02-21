const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError } = require("./_http");
const { ensureClansSchema, getUserClan, mapWarRow } = require("./_clans");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureClansSchema();

    const clan = await getUserClan(payload.uid);
    if (!clan) return badRequest("not_in_clan");

    const active = await query(
      `select * from clan_wars
       where status = 'active' and (clan_a_id = $1 or clan_b_id = $1)
       order by created_at desc
       limit 1`,
      [clan.id]
    );

    const recent = await query(
      `select * from clan_wars
       where (clan_a_id = $1 or clan_b_id = $1)
       order by created_at desc
       limit 10`,
      [clan.id]
    );

    return json(200, {
      ok: true,
      activeWar: active.rowCount ? mapWarRow(active.rows[0]) : null,
      recentWars: recent.rows.map((row) => mapWarRow(row))
    });
  } catch (error) {
    return internalError(error);
  }
};
