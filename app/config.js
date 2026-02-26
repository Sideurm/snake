export const AB_VARIANT_KEY = "abVariantV1";
export const DAILY_LOGIN_KEY = "dailyLoginStateV1";
export const WEEKLY_CHALLENGE_KEY = "weeklyChallengeV1";
export const FRIEND_MISSION_KEY = "friendMissionStateV1";
export const QUALITY_LOG_KEY = "qualityLogsV1";
export const ONBOARDING_DONE_KEY = "onboardingDoneV1";
export const SEASON_PASS_KEY = "seasonPassStateV1";
export const CAREER_PROGRESS_KEY = "careerProgressV1";
export const FEATURE_FLAGS_KEY = "featureFlagsV1";
export const UI_LOCALE_KEY = "uiLocaleV1";

export const DEFAULT_FEATURE_FLAGS = {
    onboarding: true,
    dailyRewards: true,
    foodTiers: true,
    mapEvents: true,
    socialMissions: true,
    seasonPass: true,
    qualityWatch: true,
    experiments: true
};

export const FOOD_TIER_META = {
    common: { key: "common", score: 1, growth: 40, coinBonus: 0, chance: 0.8, color: "#ff8e1a", glow: "#ff7a00" },
    rare: { key: "rare", score: 2, growth: 55, coinBonus: 1, chance: 0.16, color: "#4fd4ff", glow: "#37d5ff" },
    epic: { key: "epic", score: 4, growth: 78, coinBonus: 3, chance: 0.04, color: "#ff5bc0", glow: "#ff2fa9" }
};

export const MUTATIONS = [
    { id: "phase", name: "Phase", durationMs: 9000 },
    { id: "magnet", name: "Magnet", durationMs: 11000 },
    { id: "overdrive", name: "Overdrive", durationMs: 8500 }
];

export const GLOBAL_DAILY_EVENTS = [
    {
        id: "red_day",
        titleRu: "Red Day",
        titleEn: "Red Day",
        descRu: "Вся еда даёт x2 к наградам.",
        descEn: "All food rewards are doubled."
    },
    {
        id: "chaos_hour",
        titleRu: "Chaos Hour",
        titleEn: "Chaos Hour",
        descRu: "Срабатывают случайные игровые эффекты.",
        descEn: "Random gameplay effects trigger over time."
    }
];

export const I18N = {
    ru: {
        title: "NEONIX",
        settings: "Настройки",
        social: "Социальное",
        season: "Сезон",
        moderation: "Модерация",
        effects: "Эффекты",
        shop: "Магазин",
        play: "Играть",
        socialTitle: "Социальное",
        settingsTitle: "Настройки",
        quickTutorial: "Туториал",
        seasonPrefix: "Сезон",
        globalEventPrefix: "Глобальное событие",
        careerPrefix: "Карьера",
        dailyPrefix: "Ежедневная награда",
        experimentPrefix: "Эксперимент"
    },
    en: {
        title: "NEONIX",
        settings: "Settings",
        social: "Social",
        season: "Season",
        moderation: "Moderation",
        effects: "Effects",
        shop: "Shop",
        play: "Play",
        socialTitle: "Social",
        settingsTitle: "Settings",
        quickTutorial: "Tutorial",
        seasonPrefix: "Season",
        globalEventPrefix: "Global event",
        careerPrefix: "Career",
        dailyPrefix: "Daily reward",
        experimentPrefix: "Experiment"
    }
};

export const TUTORIAL_STEPS = [
    {
        title: "Basics",
        text: "Use Arrow keys or WASD. Eat food, avoid walls and your own tail."
    },
    {
        title: "Modes and Events",
        text: "Pick game modes in Play menu. Survival+ has a storm zone, and food can be common, rare, or epic."
    },
    {
        title: "Social and Progress",
        text: "Add friends, join a clan, complete daily and weekly tasks, and climb the global leaderboard."
    }
];
