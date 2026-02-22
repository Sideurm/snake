const { query } = require("./_db");
const { json, methodNotAllowed, badRequest, internalError, parseBody } = require("./_http");
const {
  ensureModerationSchema,
  requireStaffUser,
  sanitizeText,
  getRequestIp,
  recordSecurityEvent
} = require("./_moderation");

function authErrorResponse(error) {
  if (!error || !Number.isFinite(Number(error.statusCode)) || !error.error) return null;
  const payload = { error: error.error };
  if (error.reason) payload.reason = String(error.reason);
  return json(Number(error.statusCode), payload);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    await ensureModerationSchema();
    const staffUser = await requireStaffUser(event);

    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");

    const title = sanitizeText(body.title, 90, "");
    const message = sanitizeText(body.message, 1000, "");
    const isPinned = !!body.isPinned;
    if (!title) return badRequest("empty_title");
    if (!message) return badRequest("empty_message");

    const inserted = await query(
      `insert into social_notices(staff_user_id, title, message, is_pinned)
       values($1, $2, $3, $4)
       returning id, created_at`,
      [staffUser.id, title, message, isPinned]
    );
    const row = inserted.rows[0];

    try {
      await recordSecurityEvent({
        userId: staffUser.id,
        staffUserId: staffUser.id,
        source: "social_notice",
        eventType: "staff_publish_notice",
        severity: "low",
        details: { titlePreview: title.slice(0, 64) },
        ip: getRequestIp(event)
      });
    } catch (_) {}

    return json(200, {
      ok: true,
      notice: {
        id: Number(row.id),
        title,
        message,
        isPinned,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        authorNickname: staffUser.nickname || null,
        authorEmail: staffUser.email || null,
        authorRole: staffUser.staffRole
      }
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return internalError(error);
  }
};

