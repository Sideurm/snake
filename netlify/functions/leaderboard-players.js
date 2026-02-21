const { query } = require("./_db");
const { json, methodNotAllowed, internalError } = require("./_http");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    const result = await query(
      `select u.id,
              coalesce(nullif(u.nickname, ''), u.email, ('ID ' || u.id::text)) as display_name,
              case
                when (up.progress_json ->> 'trophies') ~ '^-?[0-9]+$'
                  then greatest(0, (up.progress_json ->> 'trophies')::int)
                else 0
              end as trophies
       from user_progress up
       join users u on u.id = up.user_id
       where coalesce(u.is_banned, false) = false
       order by trophies desc, u.id asc
       limit 100`,
      []
    );

    return json(200, {
      ok: true,
      players: result.rows.map((row, index) => ({
        rank: index + 1,
        userId: Number(row.id),
        name: row.display_name,
        trophies: Number(row.trophies || 0)
      }))
    });
  } catch (error) {
    return internalError(error);
  }
};
