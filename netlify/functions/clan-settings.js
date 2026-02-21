const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const { ensureClansSchema, getUserClan, canManageClan, canManageWall, addClanActivity } = require("./_clans");

function cleanText(value, maxLen) {
  return String(value || "").trim().slice(0, maxLen);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");
    await ensureClansSchema();

    const clan = await getUserClan(payload.uid);
    if (!clan) return badRequest("not_in_clan");

    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");

    const updates = {};
    if (Object.prototype.hasOwnProperty.call(body, "wallMessage")) {
      if (!canManageWall(clan.role)) return badRequest("forbidden_role");
      updates.wall_message = cleanText(body.wallMessage, 500);
    }
    if (Object.prototype.hasOwnProperty.call(body, "rulesText")) {
      if (!canManageWall(clan.role)) return badRequest("forbidden_role");
      updates.rules_text = cleanText(body.rulesText, 500);
    }
    if (Object.prototype.hasOwnProperty.call(body, "bannerText")) {
      if (!canManageClan(clan.role)) return badRequest("forbidden_role");
      updates.banner_text = cleanText(body.bannerText, 80);
    }
    if (Object.prototype.hasOwnProperty.call(body, "slogan")) {
      if (!canManageClan(clan.role)) return badRequest("forbidden_role");
      updates.slogan = cleanText(body.slogan, 80);
    }
    if (Object.prototype.hasOwnProperty.call(body, "styleTag")) {
      if (!canManageClan(clan.role)) return badRequest("forbidden_role");
      updates.style_tag = cleanText(body.styleTag, 24).toLowerCase() || "any";
    }
    if (Object.prototype.hasOwnProperty.call(body, "emblem")) {
      if (!canManageClan(clan.role)) return badRequest("forbidden_role");
      updates.emblem = cleanText(body.emblem, 24);
    }
    if (Object.prototype.hasOwnProperty.call(body, "color")) {
      if (!canManageClan(clan.role)) return badRequest("forbidden_role");
      updates.color = cleanText(body.color, 24);
    }
    if (Object.prototype.hasOwnProperty.call(body, "minTrophies")) {
      if (!canManageClan(clan.role)) return badRequest("forbidden_role");
      updates.min_trophies = Math.max(0, Math.min(200000, Number.parseInt(body.minTrophies, 10) || 0));
    }

    const keys = Object.keys(updates);
    if (!keys.length) return badRequest("nothing_to_update");
    const sets = keys.map((key, idx) => `${key} = $${idx + 2}`).join(", ");
    const params = [clan.id, ...keys.map((key) => updates[key])];

    const updated = await query(
      `update clans
       set ${sets}
       where id = $1
       returning id, wall_message, rules_text, banner_text, slogan, style_tag, emblem, color, min_trophies`,
      params
    );
    await addClanActivity(clan.id, payload.uid, "clan_settings_updated", { fields: keys });

    return json(200, {
      ok: true,
      clan: updated.rowCount ? updated.rows[0] : null
    });
  } catch (error) {
    return internalError(error);
  }
};
