const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const {
  ensureClansSchema,
  getUserClan,
  normalizeClanName,
  normalizeClanNameKey,
  validateClanName,
  generateInviteCode,
  addClanActivity
} = require("./_clans");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureClansSchema();

    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");

    const name = normalizeClanName(body.name);
    const nameNorm = normalizeClanNameKey(name);
    const minTrophies = Math.max(0, Math.min(200000, Number.parseInt(body.minTrophies, 10) || 0));
    const styleTag = String(body.styleTag || "any").trim().toLowerCase().slice(0, 24) || "any";
    const emblem = String(body.emblem || "").trim().slice(0, 24);
    const color = String(body.color || "").trim().slice(0, 24);
    const slogan = String(body.slogan || "").trim().slice(0, 80);
    const bannerText = String(body.bannerText || "").trim().slice(0, 80);
    const rulesText = String(body.rulesText || "").trim().slice(0, 500);
    if (!validateClanName(name)) return badRequest("invalid_clan_name");

    const existing = await getUserClan(payload.uid);
    if (existing) return badRequest("already_in_clan");

    let created = null;
    for (let i = 0; i < 5; i += 1) {
      const inviteCode = generateInviteCode();
      // Retry on rare invite-code/name collisions.
      created = await query(
        `insert into clans(name, name_norm, owner_user_id, invite_code, min_trophies, style_tag, emblem, color, slogan, banner_text, rules_text, wall_message)
         values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         returning id, invite_code`,
        [name, nameNorm, payload.uid, inviteCode, minTrophies, styleTag, emblem, color, slogan, bannerText, rulesText, rulesText]
      ).catch((error) => {
        if (error && error.code === "23505") return null;
        throw error;
      });
      if (created && created.rowCount > 0) break;
    }

    if (!created || created.rowCount === 0) return badRequest("clan_name_taken");

    const clanId = Number(created.rows[0].id);
    await query(
      `insert into clan_members(clan_id, user_id, role)
       values($1, $2, 'owner')`,
      [clanId, payload.uid]
    );
    await addClanActivity(clanId, payload.uid, "clan_created", { name });

    return json(200, { ok: true, clanId, inviteCode: created.rows[0].invite_code || null });
  } catch (error) {
    return internalError(error);
  }
};
