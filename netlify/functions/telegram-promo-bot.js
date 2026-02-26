const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const { createPromoCode } = require("./_promo");

const DEFAULT_ALLOWED_USERNAMES = ["zmixl", "sdolk", "matvey_borodkin"];

function parseAllowedUsernames() {
  const raw = String(process.env.TG_PROMO_ALLOWED_USERNAMES || "")
    .split(",")
    .map((item) => item.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  const list = raw.length > 0 ? raw : DEFAULT_ALLOWED_USERNAMES;
  return new Set(list);
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
}

function parsePromoCommand(text) {
  const line = String(text || "").trim();
  if (!line) return { type: "empty" };

  const clean = line.split("\n")[0].trim();
  const [commandRaw, coinsRaw, trophiesRaw, usesRaw] = clean.split(/\s+/);
  const command = String(commandRaw || "").toLowerCase();

  if (command === "/start" || command === "/help") {
    return { type: "help" };
  }
  if (command !== "/promo") {
    return { type: "unsupported" };
  }

  const coins = Number(coinsRaw);
  const trophies = Number(trophiesRaw);
  const uses = usesRaw === undefined ? 1 : Number(usesRaw);
  if (!Number.isFinite(coins) || !Number.isFinite(trophies) || !Number.isFinite(uses)) {
    return { type: "invalid" };
  }

  return {
    type: "promo",
    coins: Math.max(0, Math.floor(coins)),
    trophies: Math.max(0, Math.floor(trophies)),
    uses: Math.max(1, Math.min(100000, Math.floor(uses)))
  };
}

async function sendTelegramMessage(botToken, chatId, text, replyToMessageId) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text || ""),
      reply_to_message_id: replyToMessageId || undefined
    })
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
    if (!botToken) return badRequest("missing_telegram_bot_token");

    const secretRequired = String(process.env.TG_PROMO_WEBHOOK_SECRET || "").trim();
    if (secretRequired) {
      const incomingSecret = String(
        (event.headers && (event.headers["x-telegram-bot-api-secret-token"] || event.headers["X-Telegram-Bot-Api-Secret-Token"])) || ""
      ).trim();
      if (incomingSecret !== secretRequired) return unauthorized("invalid_webhook_secret");
    }

    const payload = parseBody(event);
    if (!payload) return badRequest("invalid_json");

    const message = payload.message || payload.edited_message || null;
    if (!message || !message.chat || !message.chat.id) return json(200, { ok: true, ignored: "no_message" });

    const username = normalizeUsername(message?.from?.username);
    const allowed = parseAllowedUsernames();

    if (!allowed.has(username)) {
      await sendTelegramMessage(
        botToken,
        message.chat.id,
        "Доступ запрещён. Этот бот доступен только для утверждённых администраторов.",
        message.message_id
      );
      return json(200, { ok: true, handled: "forbidden_user" });
    }

    const parsed = parsePromoCommand(message.text || "");
    if (parsed.type === "help" || parsed.type === "unsupported" || parsed.type === "invalid" || parsed.type === "empty") {
      await sendTelegramMessage(
        botToken,
        message.chat.id,
        "Команда: /promo <coins> <trophies> [uses]\nПример: /promo 500 30 1",
        message.message_id
      );
      return json(200, { ok: true, handled: "help" });
    }

    const promo = await createPromoCode({
      rewardCoins: parsed.coins,
      rewardTrophies: parsed.trophies,
      maxUses: parsed.uses,
      createdBy: `@${username}`
    });

    await sendTelegramMessage(
      botToken,
      message.chat.id,
      `Промокод создан: ${promo.code}\nМонеты: +${promo.rewardCoins}\nТрофеи: +${promo.rewardTrophies}\nИспользований: ${promo.maxUses}`,
      message.message_id
    );

    return json(200, {
      ok: true,
      promo: {
        code: promo.code,
        rewardCoins: promo.rewardCoins,
        rewardTrophies: promo.rewardTrophies,
        maxUses: promo.maxUses
      }
    });
  } catch (error) {
    return internalError(error);
  }
};
