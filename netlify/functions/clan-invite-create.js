const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError } = require("./_http");
const { ensureClansSchema, getUserClan, canManageClan, generateInviteCode, addClanActivity } = require("./_clans");

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

    let inviteCode = null;
    for (let i = 0; i < 6; i += 1) {
      const candidate = generateInviteCode();
      const updated = await query(
        `update clans set invite_code = $2 where id = $1 returning invite_code`,
        [clan.id, candidate]
      ).catch((error) => {
        if (error && error.code === "23505") return null;
        throw error;
      });
      if (updated && updated.rowCount > 0) {
        inviteCode = updated.rows[0].invite_code;
        break;
      }
    }

    if (!inviteCode) return badRequest("invite_generation_failed");

    await addClanActivity(clan.id, payload.uid, "invite_rotated", { inviteCode });

    return json(200, { ok: true, inviteCode, inviteLink: `?clanInvite=${encodeURIComponent(inviteCode)}` });
  } catch (error) {
    return internalError(error);
  }
};
