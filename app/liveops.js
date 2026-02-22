import { GLOBAL_DAILY_EVENTS } from "./config.js";
import { getWeekKey, hashString, mulberry32, todayKey } from "./utils.js";

const DAILY_CHALLENGE_TEMPLATES = [
    { type: "eat", target: 20, reward: 18 },
    { type: "survive", target: 180000, reward: 22 },
    { type: "eat", target: 12, reward: 12 },
    { type: "survive", target: 120000, reward: 16 },
    { type: "score", target: 18, reward: 14 },
    { type: "score", target: 24, reward: 20 }
];

const WEEKLY_CHALLENGE_TEMPLATES = [
    { type: "eat", target: 80, reward: 60, title: "Съешь 80 еды за неделю" },
    { type: "score", target: 140, reward: 70, title: "Набери 140 очков за неделю" },
    { type: "survive", target: 12 * 60 * 1000, reward: 85, title: "Выживи 12 минут за неделю" }
];

export function getSeasonState(now = new Date()) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const id = `${year}-${month}`;
    const start = new Date(year, now.getMonth(), 1);
    const end = new Date(year, now.getMonth() + 1, 1);
    const leftMs = Math.max(0, end.getTime() - now.getTime());
    const leftDays = Math.ceil(leftMs / 86400000);
    return { id, leftDays, startMs: start.getTime(), endMs: end.getTime() };
}

export function createInitialGlobalEventState() {
    return {
        dayKey: "",
        eventId: "",
        titleRu: "",
        titleEn: "",
        descRu: "",
        descEn: "",
        chaosNextTickMs: 0,
        chaosDoubleUntilMs: 0
    };
}

export function utcDayKey(date = new Date()) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export function resolveGlobalDailyEvent(dayKey) {
    const source = String(dayKey || utcDayKey());
    const idx = Math.abs(hashString(`global:${source}`)) % GLOBAL_DAILY_EVENTS.length;
    return GLOBAL_DAILY_EVENTS[idx];
}

export function ensureGlobalEventState(currentState, options = {}) {
    const forceReset = !!options.forceReset;
    const nowDate = options.nowDate instanceof Date ? options.nowDate : new Date();
    const state = currentState && typeof currentState === "object"
        ? currentState
        : createInitialGlobalEventState();
    const dayKey = utcDayKey(nowDate);
    const eventMeta = resolveGlobalDailyEvent(dayKey);
    const changed = state.dayKey !== dayKey || state.eventId !== eventMeta.id;

    if (!changed && !forceReset) {
        return state;
    }

    return {
        dayKey,
        eventId: eventMeta.id,
        titleRu: eventMeta.titleRu,
        titleEn: eventMeta.titleEn,
        descRu: eventMeta.descRu,
        descEn: eventMeta.descEn,
        chaosNextTickMs: 0,
        chaosDoubleUntilMs: 0
    };
}

export function getArenaBounds(eventId, grid, cell) {
    const miniActive = eventId === "mini_arena";
    const marginCells = miniActive ? 8 : 0;
    const minCell = Math.max(0, marginCells);
    const maxCell = Math.max(minCell, (grid - 1) - marginCells);
    const innerMinPx = minCell * cell;
    const innerMaxPx = (maxCell + 1) * cell;
    return {
        miniActive,
        minCell,
        maxCell,
        innerMinPx,
        innerMaxPx,
        minCoord: innerMinPx + cell / 2,
        maxCoord: innerMaxPx - cell / 2
    };
}

export function getFoodRewardMultiplier(eventState, nowMs = performance.now()) {
    const state = eventState && typeof eventState === "object"
        ? eventState
        : createInitialGlobalEventState();
    let multiplier = state.eventId === "red_day" ? 2 : 1;
    if (state.eventId === "chaos_hour" && Number(nowMs) < Number(state.chaosDoubleUntilMs || 0)) {
        multiplier *= 2;
    }
    return Math.max(1, multiplier);
}

export function getHazardZone(now = performance.now(), arenaSize = 720) {
    const t = now * 0.001;
    const orbitX = 120 + Math.sin(t * 0.5) * 24;
    const orbitY = 90 + Math.cos(t * 0.4) * 20;
    return {
        x: arenaSize / 2 + Math.cos(t * 0.8) * orbitX,
        y: arenaSize / 2 + Math.sin(t * 1.05) * orbitY,
        r: 68 + Math.sin(t * 1.8) * 8
    };
}

export function createChallengeByTemplate(template, idx) {
    const baseId = `${template.type}-${template.target}-${idx}`;
    if (template.type === "eat") {
        return {
            id: baseId,
            type: "eat",
            target: template.target,
            reward: template.reward,
            progress: 0,
            done: false,
            title: `Съешь ${template.target} еды`
        };
    }
    if (template.type === "survive") {
        return {
            id: baseId,
            type: "survive",
            target: template.target,
            reward: template.reward,
            progress: 0,
            done: false,
            title: `Выживи ${Math.round(template.target / 60000)} минуты`
        };
    }
    return {
        id: baseId,
        type: "score",
        target: template.target,
        reward: template.reward,
        progress: 0,
        done: false,
        title: `Набери ${template.target} очков`
    };
}

export function generateDailyChallenges(dayKey = todayKey()) {
    const key = String(dayKey || todayKey());
    const random = mulberry32(hashString(key));
    const first = Math.floor(random() * DAILY_CHALLENGE_TEMPLATES.length);
    let second = Math.floor(random() * DAILY_CHALLENGE_TEMPLATES.length);
    if (second === first) {
        second = (second + 1) % DAILY_CHALLENGE_TEMPLATES.length;
    }
    return {
        dateKey: key,
        tasks: [
            createChallengeByTemplate(DAILY_CHALLENGE_TEMPLATES[first], 1),
            createChallengeByTemplate(DAILY_CHALLENGE_TEMPLATES[second], 2)
        ]
    };
}

export function challengeProgressText(task) {
    if (task.type === "survive") {
        const seconds = Math.floor(task.progress / 1000);
        const targetSec = Math.floor(task.target / 1000);
        return `${task.title}: ${seconds}/${targetSec} сек (+${task.reward} монет)`;
    }
    return `${task.title}: ${task.progress}/${task.target} (+${task.reward} монет)`;
}

export function createWeeklyChallenge(date = new Date()) {
    const key = getWeekKey(date);
    const random = mulberry32(hashString(`weekly-${key}`));
    const picked = WEEKLY_CHALLENGE_TEMPLATES[Math.floor(random() * WEEKLY_CHALLENGE_TEMPLATES.length)];
    return {
        weekKey: key,
        type: picked.type,
        target: picked.target,
        reward: picked.reward,
        title: picked.title,
        progress: 0,
        done: false
    };
}

export function createFriendMission(dayKey = todayKey()) {
    return {
        dateKey: dayKey,
        target: 3,
        progress: 0,
        reward: 25,
        claimed: false
    };
}
