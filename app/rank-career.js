export const RANK_TIER_COLORS = [
    "#7CFC00",
    "#4cd7ff",
    "#ff7a00",
    "#ff4da6",
    "#b36bff",
    "#ff3b3b",
    "#00e6b8",
    "#ffd24d",
    "#5fa8ff",
    "#ffffff"
];

export const CAREER_STAGES = [
    { id: "rookie", title: "Rookie", minTrophies: 0, color: "#7CFC00" },
    { id: "predator", title: "Predator", minTrophies: 300, color: "#4cd7ff" },
    { id: "arena_lord", title: "Arena Lord", minTrophies: 900, color: "#ffb347" },
    { id: "neon_god", title: "Neon God", minTrophies: 2000, color: "#ffd966" }
];

export function getRankNumberFromTrophies(value) {
    const safe = Math.max(0, Math.floor(value));
    return Math.min(50, Math.floor(safe / 50) + 1);
}

export function getCareerStageByTrophies(value) {
    const safe = Math.max(0, Math.floor(Number(value || 0)));
    let index = 0;
    for (let i = 0; i < CAREER_STAGES.length; i++) {
        if (safe >= Number(CAREER_STAGES[i].minTrophies || 0)) {
            index = i;
        } else {
            break;
        }
    }
    const stage = CAREER_STAGES[index];
    const nextStage = CAREER_STAGES[index + 1] || null;
    const stageStart = Number(stage.minTrophies || 0);
    const stageEnd = nextStage ? Number(nextStage.minTrophies || stageStart) : stageStart;
    const inStage = nextStage ? Math.max(0, safe - stageStart) : 0;
    const stageNeed = nextStage ? Math.max(1, stageEnd - stageStart) : 1;
    return {
        ...stage,
        index,
        nextStage,
        remainingToNext: nextStage ? Math.max(0, stageEnd - safe) : 0,
        stagePercent: nextStage ? Math.max(0, Math.min(100, (inStage / stageNeed) * 100)) : 100
    };
}

export function normalizeCareerProgressState(raw, fallbackTrophies = 0) {
    const fallback = Math.max(0, Math.floor(Number(fallbackTrophies || 0)));
    const highestTrophies = Number.isFinite(Number(raw?.highestTrophies))
        ? Math.max(0, Math.floor(Number(raw.highestTrophies)))
        : fallback;
    const stageFromHighest = getCareerStageByTrophies(highestTrophies).index;
    const storedMaxStage = Number.isFinite(Number(raw?.maxStageIndex))
        ? Math.max(0, Math.min(CAREER_STAGES.length - 1, Math.floor(Number(raw.maxStageIndex))))
        : stageFromHighest;
    return {
        highestTrophies,
        maxStageIndex: Math.max(stageFromHighest, storedMaxStage)
    };
}
