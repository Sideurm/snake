const { query } = require("./_db");
const { extractBearerToken, verifyToken } = require("./_auth");
const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const {
  ensureClansSchema,
  getUserClan,
  monthKeyUTC,
  MONTH_TARGET_WINS,
  applyClanWarProgress,
  mapWarRow
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

    const trophyDelta = Number(body.trophyDelta || 0);
    const score = Number(body.score || 0);
    if (!Number.isFinite(trophyDelta) || trophyDelta <= 0) return badRequest("not_win");
    if (!Number.isFinite(score) || score <= 0) return badRequest("invalid_score");

    const clan = await getUserClan(payload.uid);
    if (!clan) return json(200, { ok: true, skipped: true, reason: "not_in_clan" });

    const cooldownRes = await query(
      `select created_at from clan_win_events
       where user_id = $1
       order by created_at desc
       limit 1`,
      [payload.uid]
    );
    if (cooldownRes.rowCount > 0) {
      const lastMs = Date.parse(cooldownRes.rows[0].created_at);
      if (Number.isFinite(lastMs) && Date.now() - lastMs < 15000) {
        const monthKey = monthKeyUTC();
        const p = await query(`select wins from clan_monthly_progress where clan_id = $1 and month_key = $2 limit 1`, [clan.id, monthKey]);
        const wins = p.rowCount ? Number(p.rows[0].wins || 0) : 0;
        const coinsResult = await query(`select coins from clans where id = $1 limit 1`, [clan.id]);
        const clanCoins = coinsResult.rowCount ? Number(coinsResult.rows[0].coins || 0) : 0;
        const claimedResult = await query(
          `select 1 from clan_monthly_claims where clan_id = $1 and month_key = $2 and user_id = $3 limit 1`,
          [clan.id, monthKey, payload.uid]
        );
        const claimed = claimedResult.rowCount > 0;
        const activeWar = await query(
          `select * from clan_wars
           where status = 'active' and (clan_a_id = $1 or clan_b_id = $1)
           order by created_at desc
           limit 1`,
          [clan.id]
        );
        return json(200, {
          ok: true,
          skipped: true,
          reason: "cooldown",
          monthKey,
          wins,
          clanCoins,
          targetWins: MONTH_TARGET_WINS,
          claimed,
          canClaim: wins >= MONTH_TARGET_WINS && !claimed,
          activeWar: activeWar.rowCount ? mapWarRow(activeWar.rows[0]) : null
        });
      }
    }

    const monthKey = monthKeyUTC();

    await query(`insert into clan_win_events(clan_id, user_id) values($1, $2)`, [clan.id, payload.uid]);
    await query(
      `insert into clan_monthly_progress(clan_id, month_key, wins, updated_at)
       values($1, $2, 1, now())
       on conflict (clan_id, month_key)
       do update set wins = clan_monthly_progress.wins + 1, updated_at = now()`,
      [clan.id, monthKey]
    );
    await query(`update clans set coins = greatest(0, coins + 1) where id = $1`, [clan.id]);

    const result = await query(
      `select wins from clan_monthly_progress where clan_id = $1 and month_key = $2 limit 1`,
      [clan.id, monthKey]
    );
    const wins = result.rowCount ? Number(result.rows[0].wins || 0) : 0;
    const coinsResult = await query(`select coins from clans where id = $1 limit 1`, [clan.id]);
    const clanCoins = coinsResult.rowCount ? Number(coinsResult.rows[0].coins || 0) : 0;
    const claimedResult = await query(
      `select 1 from clan_monthly_claims where clan_id = $1 and month_key = $2 and user_id = $3 limit 1`,
      [clan.id, monthKey, payload.uid]
    );
    const claimed = claimedResult.rowCount > 0;
    const war = await applyClanWarProgress(clan.id, 1, payload.uid);

    return json(200, {
      ok: true,
      monthKey,
      wins,
      clanCoins,
      targetWins: MONTH_TARGET_WINS,
      claimed,
      canClaim: wins >= MONTH_TARGET_WINS && !claimed,
      activeWar: war
    });
  } catch (error) {
    return internalError(error);
  }
};
