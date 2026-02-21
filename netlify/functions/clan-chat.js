const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const { ensureClansSchema, getUserClan, addClanActivity, weekKeyUTC, ensureClanWeeklyTasks, adjustClanReputation } = require("./_clans");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureClansSchema();

    const clan = await getUserClan(payload.uid);
    if (!clan) return badRequest("not_in_clan");

    if (event.httpMethod === "GET") {
      const beforeId = Number.parseInt((event.queryStringParameters && event.queryStringParameters.beforeId) || "0", 10);
      const args = [clan.id];
      let whereExtra = "";
      if (Number.isFinite(beforeId) && beforeId > 0) {
        whereExtra = " and m.id < $2 ";
        args.push(beforeId);
      }
      const result = await query(
        `select m.id, m.user_id, m.message, m.created_at, u.nickname, u.email
         from clan_chat_messages m
         join users u on u.id = m.user_id
         where m.clan_id = $1 ${whereExtra}
         order by m.id desc
         limit 50`,
        args
      );
      return json(200, {
        ok: true,
        messages: result.rows
          .map((row) => ({
            id: Number(row.id),
            userId: Number(row.user_id),
            nickname: row.nickname || null,
            email: row.email || null,
            message: row.message,
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
          }))
          .reverse()
      });
    }

    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");

    const message = String(body.message || "").trim();
    if (!message) return badRequest("empty_message");
    if (message.length > 240) return badRequest("message_too_long");

    const inserted = await query(
      `insert into clan_chat_messages(clan_id, user_id, message)
       values($1, $2, $3)
       returning id, created_at`,
      [clan.id, payload.uid, message]
    );
    const weekKey = weekKeyUTC();
    await ensureClanWeeklyTasks(clan.id, weekKey);
    await query(
      `update clan_weekly_tasks
       set progress = least(target, progress + 1), updated_at = now()
       where clan_id = $1 and week_key = $2 and task_id = 'chat_40'`,
      [clan.id, weekKey]
    );
    await adjustClanReputation(clan.id, payload.uid, { activityDelta: 1 });

    await addClanActivity(clan.id, payload.uid, "chat_message", {
      messagePreview: message.slice(0, 40)
    });

    return json(200, {
      ok: true,
      message: {
        id: Number(inserted.rows[0].id),
        userId: payload.uid,
        message,
        createdAt: inserted.rows[0].created_at ? new Date(inserted.rows[0].created_at).toISOString() : null
      }
    });
  } catch (error) {
    return internalError(error);
  }
};
