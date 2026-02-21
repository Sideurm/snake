const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const { ensureClansSchema, getUserClan, canManageClan, addClanActivity } = require("./_clans");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");
    await ensureClansSchema();

    const clan = await getUserClan(payload.uid);
    if (!clan) return badRequest("not_in_clan");
    if (!canManageClan(clan.role)) return badRequest("forbidden_role");

    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");
    const eventType = String(body.eventType || "happy_hour").trim().toLowerCase();
    const title = String(body.title || "Счастливые часы").trim().slice(0, 80) || "Счастливые часы";
    const bonusPct = Math.max(0, Math.min(100, Number.parseInt(body.bonusPct, 10) || 0));
    const durationHours = Math.max(1, Math.min(24, Number.parseInt(body.durationHours, 10) || 2));
    if (!eventType) return badRequest("invalid_event_type");

    const created = await query(
      `insert into clan_events(clan_id, event_type, title, starts_at, ends_at, bonus_pct, created_by_user_id)
       values($1, $2, $3, now(), now() + ($4 || ' hour')::interval, $5, $6)
       returning id, event_type, title, starts_at, ends_at, bonus_pct`,
      [clan.id, eventType, title, String(durationHours), bonusPct, payload.uid]
    );

    await addClanActivity(clan.id, payload.uid, "clan_event_created", {
      eventType,
      title,
      bonusPct,
      durationHours
    });

    const row = created.rows[0];
    return json(200, {
      ok: true,
      event: {
        id: Number(row.id),
        eventType: row.event_type,
        title: row.title,
        startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null,
        endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
        bonusPct: Number(row.bonus_pct || 0)
      }
    });
  } catch (error) {
    return internalError(error);
  }
};
