const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, internalError } = require("./_http");
const { ensureClansSchema } = require("./_clans");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");
    await ensureClansSchema();

    const style = String((event.queryStringParameters && event.queryStringParameters.style) || "any").trim().toLowerCase();
    const progress = await query(
      `select case
                when (progress_json ->> 'trophies') ~ '^-?[0-9]+$' then greatest(0, (progress_json ->> 'trophies')::int)
                else 0
              end as trophies
       from user_progress
       where user_id = $1
       limit 1`,
      [payload.uid]
    );
    const myTrophies = progress.rowCount ? Number(progress.rows[0].trophies || 0) : 0;

    const result = await query(
      `select c.id, c.name, c.trophies, c.min_trophies, c.style_tag, c.slogan, c.emblem, c.color,
              (select count(*)::int from clan_members m where m.clan_id = c.id) as members_count
       from clans c
       where ($1 = 'any' or c.style_tag = $1 or c.style_tag = 'any')
       order by
         abs(c.min_trophies - $2) asc,
         abs(c.trophies - $2) asc,
         c.trophies desc
       limit 20`,
      [style || "any", myTrophies]
    );

    return json(200, {
      ok: true,
      myTrophies,
      clans: result.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        trophies: Number(row.trophies || 0),
        minTrophies: Number(row.min_trophies || 0),
        styleTag: row.style_tag || "any",
        slogan: row.slogan || "",
        emblem: row.emblem || "",
        color: row.color || "",
        membersCount: Number(row.members_count || 0)
      }))
    });
  } catch (error) {
    return internalError(error);
  }
};
