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
    if (!validateClanName(name)) return badRequest("invalid_clan_name");

    const existing = await getUserClan(payload.uid);
    if (existing) return badRequest("already_in_clan");

    let created = null;
    for (let i = 0; i < 5; i += 1) {
      const inviteCode = generateInviteCode();
      // Retry on rare invite-code/name collisions.
      created = await query(
        `insert into clans(name, name_norm, owner_user_id, invite_code)
         values($1, $2, $3, $4)
         returning id, invite_code`,
        [name, nameNorm, payload.uid, inviteCode]
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
