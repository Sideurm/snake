const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError } = require("./_http");
const { ensureClansSchema, getUserClan, addClanActivity } = require("./_clans");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const token = extractBearerToken(event.headers);
    const payload = verifyToken(token);
    if (!payload) return unauthorized("invalid_token");

    await ensureClansSchema();

    const clan = await getUserClan(payload.uid);
    if (!clan) return badRequest("not_in_clan");

    await query(`delete from clan_members where clan_id = $1 and user_id = $2`, [clan.id, payload.uid]);
    await addClanActivity(clan.id, payload.uid, "member_left", { role: clan.role });

    const membersRes = await query(
      `select user_id from clan_members where clan_id = $1 order by joined_at asc`,
      [clan.id]
    );

    if (membersRes.rowCount === 0) {
      await query(`delete from clans where id = $1`, [clan.id]);
      return json(200, { ok: true, deletedClan: true });
    }

    if (clan.role === "owner") {
      const newOwnerId = Number(membersRes.rows[0].user_id);
      await query(`update clans set owner_user_id = $2 where id = $1`, [clan.id, newOwnerId]);
      await query(
        `update clan_members
         set role = case when user_id = $2 then 'owner' when role = 'owner' then 'member' else role end
         where clan_id = $1`,
        [clan.id, newOwnerId]
      );
      await addClanActivity(clan.id, newOwnerId, "owner_transferred", { fromUserId: payload.uid, toUserId: newOwnerId });
    }

    return json(200, { ok: true });
  } catch (error) {
    return internalError(error);
  }
};
