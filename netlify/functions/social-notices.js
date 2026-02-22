const { query } = require("./_db");
const { json, methodNotAllowed, internalError } = require("./_http");
const { ensureModerationSchema } = require("./_moderation");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    await ensureModerationSchema();
    const result = await query(
      `select n.id, n.title, n.message, n.is_pinned, n.created_at,
              u.id as staff_user_id, u.nickname, u.email, u.staff_role
       from social_notices n
       join users u on u.id = n.staff_user_id
       order by n.is_pinned desc, n.id desc
       limit 40`
    );

    return json(200, {
      ok: true,
      notices: result.rows.map((row) => ({
        id: Number(row.id),
        title: row.title || "",
        message: row.message || "",
        isPinned: !!row.is_pinned,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        staffUserId: Number(row.staff_user_id),
        authorNickname: row.nickname || null,
        authorEmail: row.email || null,
        authorRole: row.staff_role || "player"
      }))
    });
  } catch (error) {
    return internalError(error);
  }
};

