import { getWeekKey, todayKey } from "./utils.js";
import { createWeeklyChallenge, createFriendMission, challengeProgressText } from "./liveops.js";

export function ensureWeeklyChallengeState(currentState, nowDate = new Date()) {
    const key = getWeekKey(nowDate);
    const state = currentState && typeof currentState === "object" ? currentState : null;
    if (
        !state ||
        state.weekKey !== key ||
        !state.type ||
        !Number.isFinite(Number(state.target))
    ) {
        return {
            state: createWeeklyChallenge(nowDate),
            changed: true
        };
    }
    return {
        state,
        changed: false
    };
}

export function formatWeeklyChallengeText(state) {
    if (!state) return "";
    if (state.type === "survive") {
        const sec = Math.floor((state.progress || 0) / 1000);
        const targetSec = Math.floor((state.target || 0) / 1000);
        return `${state.title}: ${sec}/${targetSec} сек (+${state.reward})${state.done ? " [DONE]" : ""}`;
    }
    return `${state.title}: ${state.progress || 0}/${state.target || 0} (+${state.reward})${state.done ? " [DONE]" : ""}`;
}

export function updateWeeklyChallengeState(currentState, type, amountOrValue) {
    const state = currentState && typeof currentState === "object" ? currentState : null;
    if (!state || state.done || state.type !== type) {
        return { state, changed: false, rewardCoins: 0, completedNow: false };
    }

    const progressBase = Number(state.progress || 0);
    const updateValue = Number(amountOrValue || 0);
    const progress = (type === "survive" || type === "score")
        ? Math.max(progressBase, updateValue)
        : Math.max(0, progressBase + updateValue);

    const next = {
        ...state,
        progress
    };

    let rewardCoins = 0;
    let completedNow = false;
    if (progress >= Number(state.target || 0)) {
        next.done = true;
        rewardCoins = Number(state.reward || 0);
        completedNow = true;
    }

    return {
        state: next,
        changed: true,
        rewardCoins,
        completedNow
    };
}

export function ensureFriendMissionState(currentState, dayKey = todayKey()) {
    const key = String(dayKey || todayKey());
    const state = currentState && typeof currentState === "object" ? currentState : null;
    if (
        !state ||
        state.dateKey !== key ||
        !Number.isFinite(Number(state.target))
    ) {
        return {
            state: createFriendMission(key),
            changed: true
        };
    }
    return {
        state,
        changed: false
    };
}

export function formatFriendMissionText(state, locale = "ru") {
    if (!state) return "";
    const status = state.claimed ? " [DONE]" : "";
    if (locale === "en") {
        return `Friends mission: play ${state.target} matches while you have friends (${state.progress}/${state.target})${status}`;
    }
    return `Миссия друзей: сыграй ${state.target} матч(а) при наличии друзей (${state.progress}/${state.target})${status}`;
}

export function advanceFriendMissionState(currentState, options = {}) {
    const enabled = !!options.enabled;
    const friendsCount = Number(options.friendsCount || 0);
    const increment = Math.max(1, Number(options.increment || 1));
    if (!enabled) {
        return { state: currentState, changed: false, rewardCoins: 0, completedNow: false };
    }
    const state = currentState && typeof currentState === "object" ? currentState : null;
    if (!state || state.claimed || friendsCount < 1) {
        return { state, changed: false, rewardCoins: 0, completedNow: false };
    }

    const target = Math.max(1, Number(state.target || 0));
    const progress = Math.min(target, Number(state.progress || 0) + increment);
    const next = {
        ...state,
        progress
    };

    let rewardCoins = 0;
    let completedNow = false;
    if (progress >= target && !state.claimed) {
        next.claimed = true;
        rewardCoins = Number(state.reward || 0);
        completedNow = true;
    }

    return {
        state: next,
        changed: true,
        rewardCoins,
        completedNow
    };
}

export function updateDailyChallengesState(currentState, type, amountOrValue) {
    const state = currentState && typeof currentState === "object" ? currentState : null;
    if (!state || !Array.isArray(state.tasks)) {
        return { state, changed: false, rewardCoins: 0 };
    }

    let changed = false;
    let rewardCoins = 0;
    const nextTasks = state.tasks.map((task) => {
        if (!task || task.done || task.type !== type) return task;
        changed = true;
        const progressBase = Number(task.progress || 0);
        const updateValue = Number(amountOrValue || 0);
        const progress = (type === "survive" || type === "score")
            ? Math.max(progressBase, updateValue)
            : (progressBase + updateValue);
        const nextTask = {
            ...task,
            progress
        };
        if (progress >= Number(task.target || 0)) {
            nextTask.done = true;
            rewardCoins += Number(task.reward || 0);
        }
        return nextTask;
    });

    if (!changed) {
        return { state, changed: false, rewardCoins: 0 };
    }

    return {
        state: {
            ...state,
            tasks: nextTasks
        },
        changed: true,
        rewardCoins
    };
}

export function formatDailyChallengeLine(task) {
    return challengeProgressText(task);
}
