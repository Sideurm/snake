const { query } = require("./_db");
const { json, methodNotAllowed, badRequest, internalError, parseBody } = require("./_http");
const {
  ensureModerationSchema,
  requireAuthenticatedUser,
  sanitizeText,
  normalizeSeverity,
  sanitizeDetails,
  getRequestIp,
  recordSecurityEvent
} = require("./_moderation");

const EVENT_REPORT_COOLDOWN_MS = 20 * 1000;

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
    const user = await requireAuthenticatedUser(event);

    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");

    const source = sanitizeText(body.source, 64, "client");
    const eventType = sanitizeText(body.eventType, 64, "suspicious_action");
    const severity = normalizeSeverity(body.severity);
    const details = sanitizeDetails(body.details);
    const ip = getRequestIp(event);

    const last = await query(
      `select created_at
       from security_events
       where user_id = $1 and source = $2 and event_type = $3
       order by id desc
       limit 1`,
      [user.id, source, eventType]
    );
    if (last.rowCount > 0) {
      const createdMs = Date.parse(last.rows[0].created_at);
      if (Number.isFinite(createdMs) && Date.now() - createdMs < EVENT_REPORT_COOLDOWN_MS) {
        return json(200, { ok: true, throttled: true });
      }
    }

    const inserted = await recordSecurityEvent({
      userId: user.id,
      source,
      eventType,
      severity,
      details,
      ip
    });

    return json(200, {
      ok: true,
      eventId: inserted.id,
      createdAt: inserted.createdAt
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return internalError(error);
  }
};
