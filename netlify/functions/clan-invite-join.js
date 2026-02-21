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

    const inviteCode = normalizeInviteCode(body.inviteCode || "");
    if (!inviteCode || inviteCode.length < 6) return badRequest("invalid_invite_code");

    const existing = await getUserClan(payload.uid);
    if (existing) return badRequest("already_in_clan");

    const clanRes = await query(`select id, min_trophies from clans where invite_code = $1 limit 1`, [inviteCode]);
    if (clanRes.rowCount === 0) return badRequest("invite_not_found");

    const clanId = Number(clanRes.rows[0].id);
    const minTrophies = Number(clanRes.rows[0].min_trophies || 0);
    const progressResult = await query(
      `select case
                when (progress_json ->> 'trophies') ~ '^-?[0-9]+$'
                  then greatest(0, (progress_json ->> 'trophies')::int)
                else 0
              end as trophies
       from user_progress
       where user_id = $1
       limit 1`,
      [payload.uid]
    );
    const userTrophies = progressResult.rowCount ? Number(progressResult.rows[0].trophies || 0) : 0;
    if (userTrophies < minTrophies) return badRequest("insufficient_trophies");
    const membersRes = await query(`select count(*)::int as count from clan_members where clan_id = $1`, [clanId]);
    const membersCount = Number(membersRes.rows[0].count || 0);
    if (membersCount >= 30) return badRequest("clan_full");

    await query(
      `insert into clan_members(clan_id, user_id, role)
       values($1, $2, 'member')`,
      [clanId, payload.uid]
    );

    await addClanActivity(clanId, payload.uid, "member_joined", { via: "invite_link" });

    return json(200, { ok: true, clanId });
  } catch (error) {
    if (error && error.code === "23505") return badRequest("already_in_clan");
    return internalError(error);
  }
};
