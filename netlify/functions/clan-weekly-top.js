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
              count(*)::int as weekly_wins
       from clan_win_events e
       join clans c on c.id = e.clan_id
       where e.created_at >= date_trunc('week', now() at time zone 'utc')
         and e.created_at < date_trunc('week', now() at time zone 'utc') + interval '7 day'
       group by c.id, c.name
       order by weekly_wins desc, c.id asc
       limit 20`,
      []
    );

    return json(200, {
      ok: true,
      weekTop: result.rows.map((row, index) => ({
        rank: index + 1,
        clanId: Number(row.id),
        name: row.name,
        weeklyWins: Number(row.weekly_wins || 0)
      }))
    });
  } catch (error) {
    return internalError(error);
  }
};

