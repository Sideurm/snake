const { json, methodNotAllowed, unauthorized, badRequest, internalError, parseBody } = require("./_http");
const { createPromoCode } = require("./_promo");

const DEFAULT_ALLOWED_USERNAMES = ["zmixl", "sdolk", "matvey_borodkin"];
const MAX_PROMO_REWARD = 1000000;

const QUICK_KEYBOARD = {
  keyboard: [
    [{ text: "/promo 500 25 1" }, { text: "/promo 1000 50 3" }],
    [{ text: "/promo 2500 120 1" }, { text: "/whoami" }],
    [{ text: "/help" }]
  ],
  resize_keyboard: true,
  selective: true
};

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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatUserTag(message = {}) {
  const first = String(message?.from?.first_name || "").trim();
  const last = String(message?.from?.last_name || "").trim();
  const name = [first, last].filter(Boolean).join(" ").trim();
  const username = normalizeUsername(message?.from?.username);
  if (name && username) return `${name} (@${username})`;
  if (username) return `@${username}`;
  if (name) return name;
  return "unknown_user";
}

function helpText() {
  return [
    "<b>LUMETRA Promo Bot</b>",
    "",
    "Генерирует промокоды для игры с наградой в монетах и трофеях.",
    "",
    "<b>Основная команда</b>",
    "<code>/promo &lt;coins&gt; &lt;trophies&gt; [uses]</code>",
    "",
    "<b>Примеры</b>",
    "<code>/promo 500 30 1</code>",
    "<code>/promo 1200 50 3</code>",
    "",
    "<b>Пояснение</b>",
    "coins: сколько монет выдаст код",
    "trophies: сколько трофеев выдаст код",
    "uses: сколько раз код можно активировать (по умолчанию 1)",
    "",
    "<b>Лимиты</b>",
    `0..${MAX_PROMO_REWARD} для coins и trophies`,
    "1..100000 для uses"
  ].join("\n");
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
  if (command === "/whoami" || command === "/me") {
    return { type: "whoami" };
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

  const safeCoins = Math.max(0, Math.floor(coins));
  const safeTrophies = Math.max(0, Math.floor(trophies));
  const safeUses = Math.max(1, Math.min(100000, Math.floor(uses)));

  if (safeCoins <= 0 && safeTrophies <= 0) {
    return { type: "invalid_reward" };
  }
  if (safeCoins > MAX_PROMO_REWARD || safeTrophies > MAX_PROMO_REWARD) {
    return { type: "limit_exceeded" };
  }

  return {
    type: "promo",
    coins: safeCoins,
    trophies: safeTrophies,
    uses: safeUses
  };
}

async function sendTelegramMessage(botToken, chatId, text, replyToMessageId, options = {}) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text || ""),
      reply_to_message_id: replyToMessageId || undefined,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: options.replyMarkup || QUICK_KEYBOARD
    })
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`telegram_send_failed: ${response.status} ${detail}`);
  }
}

function buildPromoCreatedText(promo, createdBy, chatType) {
  const createdAt = new Date().toLocaleString("ru-RU", { hour12: false });
  return [
    "<b>Промокод успешно создан</b>",
    "",
    `<b>Код:</b> <code>${escapeHtml(promo.code)}</code>`,
    `<b>Монеты:</b> +${Number(promo.rewardCoins || 0)}`,
    `<b>Трофеи:</b> +${Number(promo.rewardTrophies || 0)}`,
    `<b>Лимит активаций:</b> ${Number(promo.maxUses || 1)}`,
    "",
    `<b>Создал:</b> ${escapeHtml(createdBy)}`,
    `<b>Чат:</b> ${escapeHtml(chatType || "private")}`,
    `<b>Время:</b> ${escapeHtml(createdAt)}`,
    "",
    "Скопируй код и отправь игрокам."
  ].join("\n");
}

function buildWhoAmIText(username, allowed, message) {
  const userTag = formatUserTag(message);
  const access = allowed.has(username) ? "разрешён" : "запрещён";
  return [
    "<b>Данные пользователя</b>",
    "",
    `<b>Пользователь:</b> ${escapeHtml(userTag)}`,
    `<b>Username:</b> ${escapeHtml(username ? `@${username}` : "не задан")}`,
    `<b>Доступ:</b> ${escapeHtml(access)}`,
    "",
    "Если username пустой, задай его в Telegram Settings."
  ].join("\n");
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
        [
          "<b>Доступ запрещён</b>",
          "",
          "Этот бот доступен только для утверждённых администраторов.",
          "Обратитесь к владельцу проекта."
        ].join("\n"),
        message.message_id
      );
      return json(200, { ok: true, handled: "forbidden_user" });
    }

    const parsed = parsePromoCommand(message.text || "");
    if (parsed.type === "whoami") {
      await sendTelegramMessage(
        botToken,
        message.chat.id,
        buildWhoAmIText(username, allowed, message),
        message.message_id
      );
      return json(200, { ok: true, handled: "whoami" });
    }

    if (parsed.type === "help" || parsed.type === "empty") {
      await sendTelegramMessage(
        botToken,
        message.chat.id,
        helpText(),
        message.message_id
      );
      return json(200, { ok: true, handled: "help" });
    }

    if (parsed.type === "unsupported") {
      await sendTelegramMessage(
        botToken,
        message.chat.id,
        [
          "<b>Неизвестная команда</b>",
          "",
          "Поддерживается только:",
          "<code>/promo &lt;coins&gt; &lt;trophies&gt; [uses]</code>",
          "<code>/help</code>",
          "<code>/whoami</code>"
        ].join("\n"),
        message.message_id
      );
      return json(200, { ok: true, handled: "unsupported" });
    }

    if (parsed.type === "invalid" || parsed.type === "invalid_reward" || parsed.type === "limit_exceeded") {
      const reason =
        parsed.type === "invalid_reward"
          ? "Награда не может быть нулевой одновременно по монетам и трофеям."
          : parsed.type === "limit_exceeded"
            ? `Значения coins/trophies не должны превышать ${MAX_PROMO_REWARD}.`
            : "Проверь формат и числовые значения.";
      await sendTelegramMessage(
        botToken,
        message.chat.id,
        [
          "<b>Некорректные параметры</b>",
          "",
          escapeHtml(reason),
          "",
          "<b>Пример</b>",
          "<code>/promo 500 30 1</code>"
        ].join("\n"),
        message.message_id
      );
      return json(200, { ok: true, handled: "invalid_input" });
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
      buildPromoCreatedText(promo, formatUserTag(message), message?.chat?.type || "private"),
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
