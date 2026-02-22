const { query } = require("./_db");
const { json, methodNotAllowed, badRequest, internalError, parseBody } = require("./_http");
const {
  ensureModerationSchema,
  requireStaffUser,
  sanitizeText,
  getRequestIp,
  recordSecurityEvent
} = require("./_moderation");

function normalizeKind(value) {
  const kind = String(value || "").trim().toLowerCase();
  if (kind === "bug" || kind === "alert") return kind;
  return "note";
}

function authErrorResponse(error) {
  if (!error || !Number.isFinite(Number(error.statusCode)) || !error.error) return null;
  const payload = { error: error.error };
  if (error.reason) payload.reason = String(error.reason);
  return json(Number(error.statusCode), payload);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return methodNotAllowed();

  try {
    await ensureModerationSchema();
    const staffUser = await requireStaffUser(event);

    if (event.httpMethod === "GET") {
      const beforeId = Number.parseInt((event.queryStringParameters && event.queryStringParameters.beforeId) || "0", 10);
      const args = [];
      let whereSql = "";
      if (Number.isFinite(beforeId) && beforeId > 0) {
        whereSql = "where m.id < $1";
        args.push(beforeId);
      }
      const result = await query(
        `select m.id, m.user_id, m.kind, m.message, m.created_at,
                u.nickname, u.email, u.staff_role
         from admin_chat_messages m
         join users u on u.id = m.user_id
         ${whereSql}
         order by m.id desc
         limit 120`,
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
            staffRole: row.staff_role || "player",
            kind: row.kind || "note",
            message: row.message || "",
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
          }))
          .reverse()
      });
    }

    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");
    const message = sanitizeText(body.message, 500, "");
    if (!message) return badRequest("empty_message");

    const kind = normalizeKind(body.kind);
    if (kind === "alert" && staffUser.staffRole !== "admin") {
      return json(403, { error: "alert_requires_admin" });
    }

    const inserted = await query(
      `insert into admin_chat_messages(user_id, kind, message)
       values($1, $2, $3)
       returning id, created_at`,
      [staffUser.id, kind, message]
    );
    const row = inserted.rows[0];

    if (kind === "bug" || kind === "alert") {
      try {
        await recordSecurityEvent({
          userId: staffUser.id,
          staffUserId: staffUser.id,
          source: "staff_chat",
          eventType: kind === "bug" ? "bug_report" : "staff_alert",
          severity: kind === "bug" ? "low" : "high",
          details: {
            messagePreview: message.slice(0, 180)
          },
          ip: getRequestIp(event)
        });
      } catch (_) {
        // chat should stay available even if security log insert fails
      }
    }

    return json(200, {
      ok: true,
      message: {
        id: Number(row.id),
        userId: staffUser.id,
        nickname: staffUser.nickname || null,
        email: staffUser.email || null,
        staffRole: staffUser.staffRole,
        kind,
        message,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
      }
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return internalError(error);
  }
};
