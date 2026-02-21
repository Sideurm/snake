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
    const style = String((event.queryStringParameters && event.queryStringParameters.style) || "any").trim().toLowerCase();
    const maxMinTrophies = Math.max(0, Math.min(200000, Number.parseInt((event.queryStringParameters && event.queryStringParameters.maxMinTrophies) || "0", 10) || 0));
    const myTrophies = Math.max(0, Number.parseInt((event.queryStringParameters && event.queryStringParameters.myTrophies) || "0", 10) || 0);

    const result = await query(
      `select c.id, c.name, c.owner_user_id, c.coins, c.trophies, c.min_trophies, c.style_tag, c.emblem, c.color, c.slogan,
              (select count(*)::int from clan_members cm where cm.clan_id = c.id) as members_count
       from clans c
       where ($1 = '' or c.name_norm like '%' || $1 || '%')
         and ($2 = 'any' or c.style_tag = $2 or c.style_tag = 'any')
         and ($3 <= 0 or c.min_trophies <= $3)
       order by
         case when c.min_trophies <= $4 then 0 else 1 end asc,
         c.trophies desc,
         c.id asc
       limit 30`,
      [q, style || "any", maxMinTrophies, myTrophies]
    );

    return json(200, {
      ok: true,
      clans: result.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        ownerUserId: Number(row.owner_user_id),
        membersCount: Number(row.members_count || 0),
        coins: Number(row.coins || 0),
        trophies: Number(row.trophies || 0),
        minTrophies: Number(row.min_trophies || 0),
        styleTag: row.style_tag || "any",
        emblem: row.emblem || "",
        color: row.color || "",
        slogan: row.slogan || ""
      }))
    });
  } catch (error) {
    return internalError(error);
  }
};
