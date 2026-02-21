const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, internalError } = require("./_http");
const { ensureRoomsSchema } = require("./_rooms");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureRoomsSchema();

    const result = await query(
      `select
         gr.room_code,
         gr.target_score,
         gr.snake_speed,
         gr.max_players,
         gr.status,
         count(rp.user_id)::int as players_count,
         lead_u.nickname as leader_nickname,
         lead_u.email as leader_email
       from game_rooms gr
       left join room_players rp on rp.room_id = gr.id
       join users lead_u on lead_u.id = gr.leader_user_id
       where gr.is_public = true
         and gr.status = 'waiting'
       group by gr.id, lead_u.id
       order by gr.updated_at desc
       limit 50`
    );

    const rooms = result.rows
      .map((row) => ({
        roomCode: row.room_code,
        targetScore: Number(row.target_score || 20),
        snakeSpeed: Number(row.snake_speed || 320),
        maxPlayers: Number(row.max_players || 2),
        status: row.status,
        playersCount: Number(row.players_count || 0),
        leaderName: row.leader_nickname || row.leader_email || "Лидер"
      }))
      .filter((room) => room.playersCount < room.maxPlayers);

    return json(200, { ok: true, rooms });
  } catch (error) {
    return internalError(error);
  }
};
