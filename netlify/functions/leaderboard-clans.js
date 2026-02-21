const { query } = require("./_db");
const { json, methodNotAllowed, internalError } = require("./_http");
const { ensureClansSchema } = require("./_clans");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    await ensureClansSchema();

    const result = await query(
      `select c.id,
              c.name,
              coalesce(c.trophies, 0) as trophies,
              coalesce(m.members_count, 0) as members_count
       from clans c
       left join (
         select clan_id, count(*)::int as members_count
         from clan_members
         group by clan_id
       ) m on m.clan_id = c.id
       order by trophies desc, c.id asc
       limit 100`,
      []
    );

    return json(200, {
      ok: true,
      clans: result.rows.map((row, index) => ({
        rank: index + 1,
        clanId: Number(row.id),
        name: row.name,
        trophies: Number(row.trophies || 0),
        membersCount: Number(row.members_count || 0)
      }))
    });
  } catch (error) {
    return internalError(error);
  }
};
