const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const { ensureClansSchema, getUserClan, normalizeInviteCode, addClanActivity } = require("./_clans");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureClansSchema();

    const body = parseBody(event);
    if (!body) return badRequest("invalid_json");

    let clanId = Number.parseInt(body.clanId, 10);
    const inviteCode = normalizeInviteCode(body.inviteCode || "");
    if ((!Number.isFinite(clanId) || clanId <= 0) && !inviteCode) return badRequest("invalid_clan_id");

    const existing = await getUserClan(payload.uid);
    if (existing) return badRequest("already_in_clan");

    let clanRes;
    if (inviteCode) {
      clanRes = await query(`select id from clans where invite_code = $1 limit 1`, [inviteCode]);
      if (clanRes.rowCount > 0) clanId = Number(clanRes.rows[0].id);
    } else {
      clanRes = await query(`select id from clans where id = $1 limit 1`, [clanId]);
    }
    if (clanRes.rowCount === 0) return badRequest("clan_not_found");

    const membersRes = await query(`select count(*)::int as count from clan_members where clan_id = $1`, [clanId]);
    const membersCount = Number(membersRes.rows[0].count || 0);
    if (membersCount >= 30) return badRequest("clan_full");

    await query(
      `insert into clan_members(clan_id, user_id, role)
       values($1, $2, 'member')`,
      [clanId, payload.uid]
    );
    await addClanActivity(clanId, payload.uid, "member_joined", {
      via: inviteCode ? "invite_code" : "clan_id"
    });

    return json(200, { ok: true });
  } catch (error) {
    if (error && error.code === "23505") return badRequest("already_in_clan");
    return internalError(error);
  }
};
