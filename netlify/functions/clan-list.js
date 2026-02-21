const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, internalError } = require("./_http");
const { ensureClansSchema, normalizeClanNameKey } = require("./_clans");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureClansSchema();

    const qRaw = (event.queryStringParameters && event.queryStringParameters.q) || "";
    const q = normalizeClanNameKey(qRaw);

    const result = await query(
      `select c.id, c.name, c.owner_user_id, c.coins,
              (select count(*)::int from clan_members cm where cm.clan_id = c.id) as members_count
       from clans c
       where ($1 = '' or c.name_norm like '%' || $1 || '%')
       order by c.id desc
       limit 30`,
      [q]
    );

    return json(200, {
      ok: true,
      clans: result.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        ownerUserId: Number(row.owner_user_id),
        membersCount: Number(row.members_count || 0),
        coins: Number(row.coins || 0)
      }))
    });
  } catch (error) {
    return internalError(error);
  }
};
