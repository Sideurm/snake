import { initFoodRenderer, renderFood, setFoodRenderConfig } from "./foodRenderer.js";
import { initAI, runAI, resetAI } from "./ai/index.js";
import { initBackgroundRenderer, renderBackground } from "./backgroundRenderer.js";
import { createReplayManager } from "./replay.js";
import {
    AB_VARIANT_KEY,
    DAILY_LOGIN_KEY,
    WEEKLY_CHALLENGE_KEY,
    FRIEND_MISSION_KEY,
    QUALITY_LOG_KEY,
    ONBOARDING_DONE_KEY,
    SEASON_PASS_KEY,
    CAREER_PROGRESS_KEY,
    FEATURE_FLAGS_KEY,
    UI_LOCALE_KEY,
    DEFAULT_FEATURE_FLAGS,
    FOOD_TIER_META,
    MUTATIONS,
    I18N,
    TUTORIAL_STEPS
} from "./app/config.js";
import { safeParseJson, todayKey } from "./app/utils.js";
import {
    RANK_TIER_COLORS,
    CAREER_STAGES,
    getRankNumberFromTrophies,
    getCareerStageByTrophies,
    normalizeCareerProgressState
} from "./app/rank-career.js";
import { BOX_ODDS, BOX_REWARD_POOLS, randomInt, weightedPick, rarityLabel } from "./app/loot.js";
import { hexToRgba } from "./app/color.js";
import {
    getSeasonState,
    createInitialGlobalEventState,
    ensureGlobalEventState as ensureGlobalEventStateHelper,
    getArenaBounds as getArenaBoundsByEvent,
    getFoodRewardMultiplier as getFoodRewardMultiplierByEvent,
    getHazardZone as getHazardZoneBySize,
    generateDailyChallenges,
    createWeeklyChallenge,
    createFriendMission
} from "./app/liveops.js";
import {
    ensureWeeklyChallengeState,
    formatWeeklyChallengeText,
    updateWeeklyChallengeState,
    ensureFriendMissionState,
    formatFriendMissionText,
    advanceFriendMissionState,
    updateDailyChallengesState,
    formatDailyChallengeLine
} from "./app/challenge-state.js";
import {
    detectMobileViewport,
    detectPrefersReducedMotion,
    buildPerformanceProfile,
    calcPerfShadow,
    calcPerfParticleCount,
    calcTrailDrawStride,
    computeResponsiveScale
} from "./app/performance.js";
import {
    OVERLAY_MENU_IDS,
    computeIsAnyMenuVisible,
    showOnlyMenuDom
} from "./app/ui-menus.js";
import {
    parseIsoMs,
    getPlayerDisplayName,
    getRoomConfiguredSpeedFromState,
    getRoomWinnerText as getRoomWinnerTextByState
} from "./app/room-helpers.js";
import {
    formatFriendName,
    relationToLabel,
    setFriendsSearchResultByDom,
    renderFriendsUserActionRow,
    friendRoomMeta
} from "./app/friends-ui.js";
import { initMainButtons } from "./app/main-buttons.js";
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
initFoodRenderer(ctx);
initBackgroundRenderer(ctx, 720);
const size = 720;
const CELL = 20;
const GRID = size / CELL;

let aiTimer = 0;
let gameFrame = 0;
let currentReplayData = null;
let replayFoodIndex = 0;
let foodHistory = [];
let accumulator = 0;
let FIXED_STEP = 1000 / 120; // runtime-tuned: desktop/mobile
let mobileOptimized = false;
let lowPowerMobile = false;
let reducedFxMode = false;
let isReplaying = false;
let gameStartTime = 0;
let gameHistory = JSON.parse(localStorage.getItem("gameHistory")) || [];
const HIGHLIGHT_CLIPS_KEY = "highlightClipsV1";
let highlightClips = JSON.parse(localStorage.getItem(HIGHLIGHT_CLIPS_KEY) || "[]");
let trophies = parseInt(localStorage.getItem("trophies")) || 0;
let coins = parseInt(localStorage.getItem("coins")) || 0;
let rankRewardClaimedRank = parseInt(localStorage.getItem("rankRewardClaimedRank")) || 0;
let careerProgress = (() => {
    try {
        const parsed = JSON.parse(localStorage.getItem(CAREER_PROGRESS_KEY) || "{}");
        return {
            highestTrophies: Number.isFinite(Number(parsed.highestTrophies))
                ? Math.max(0, Math.floor(Number(parsed.highestTrophies)))
                : Math.max(0, Math.floor(trophies)),
            maxStageIndex: Number.isFinite(Number(parsed.maxStageIndex))
                ? Math.max(0, Math.floor(Number(parsed.maxStageIndex)))
                : 0
        };
    } catch (_) {
        return {
            highestTrophies: Math.max(0, Math.floor(trophies)),
            maxStageIndex: 0
        };
    }
})();
let careerPromotionBootstrapped = false;
setHudTrophiesValue(trophies);
setHudCoinsValue(coins);
const SHOP_ITEMS = [
    { id: "eat-burst", type: "eatEffect", title: "Эффект: Burst", price: 25, value: "burst" },
    { id: "eat-ring", type: "eatEffect", title: "Эффект: Ring", price: 40, value: "ring" },
    { id: "food-plasma", type: "foodType", title: "Еда: Plasma", price: 30, value: "plasma" },
    { id: "food-void", type: "foodType", title: "Еда: Void", price: 45, value: "void" },
    { id: "food-toxic", type: "foodType", title: "Еда: Toxic", price: 50, value: "toxic" },
    { id: "glow-arctic", type: "foodGlow", title: "Свечение: Arctic", price: 55, value: "#37d5ff" },
    { id: "glow-toxic", type: "foodGlow", title: "Свечение: Toxic", price: 55, value: "#78ff00" },
    { id: "trail-pulse", type: "trailEffect", title: "След: Pulse", price: 65, value: "pulse" },
    { id: "trail-dash", type: "trailEffect", title: "След: Dash", price: 70, value: "dash" },
    { id: "death-ring", type: "deathAnimation", title: "Смерть: Ring", price: 80, value: "ring" },
    { id: "death-shatter", type: "deathAnimation", title: "Смерть: Shatter", price: 95, value: "shatter" },
    { id: "shape-diamond", type: "foodShape", title: "Форма еды: Diamond", price: 75, value: "diamond" },
    { id: "shape-star", type: "foodShape", title: "Форма еды: Star", price: 85, value: "star" },
    { id: "shape-cube", type: "foodShape", title: "Форма еды: Cube", price: 90, value: "cube" }
];
const SNAKE_SKINS = [
    {
        id: "neon-classic",
        title: "Neon Classic",
        subtitle: "Базовый стиль змейки",
        badge: "C",
        price: 0,
        primary: "#ff7a00",
        secondary: "#ff4a4a",
        shadow: "rgba(255,122,0,0.72)",
        stroke: "#ff7a00",
        glow: "#ff7a00"
    },
    {
        id: "frost-viper",
        title: "Frost Viper",
        subtitle: "Ледяной неон",
        badge: "R",
        price: 650,
        primary: "#35d7ff",
        secondary: "#8cf2ff",
        shadow: "rgba(70,221,255,0.7)",
        stroke: "#45ddff",
        glow: "#1cb6e3"
    },
    {
        id: "toxic-cobra",
        title: "Toxic Cobra",
        subtitle: "Ядовитый импульс",
        badge: "E",
        price: 900,
        primary: "#6bff2f",
        secondary: "#b8ff6e",
        shadow: "rgba(122,255,64,0.7)",
        stroke: "#78ff00",
        glow: "#65d94a"
    },
    {
        id: "void-ember",
        title: "Void Ember",
        subtitle: "Темный жар арены",
        badge: "L",
        price: 1400,
        primary: "#b55cff",
        secondary: "#ff66d9",
        shadow: "rgba(209,98,255,0.78)",
        stroke: "#d26bff",
        glow: "#9f48e6"
    }
];
const NEON_PACKS = {
    sunburst: {
        foodColor: "#ff9e2f",
        foodGlow: "#ff7a00",
        particleColor: "#ffd27a",
        neonBoost: 1.05
    },
    arctic: {
        foodColor: "#58d7ff",
        foodGlow: "#37d5ff",
        particleColor: "#b7f5ff",
        neonBoost: 1.2
    },
    toxic: {
        foodColor: "#a7ff31",
        foodGlow: "#78ff00",
        particleColor: "#d4ff93",
        neonBoost: 1.15
    }
};
const defaultCosmetics = {
    foodColor: "#ff8e1a",
    foodGlow: "#ff7a00",
    particleColor: "#ffd27a",
    neonBoost: 1,
    eatEffect: "spark",
    foodType: "solar",
    trailEffect: "classic",
    deathAnimation: "flash",
    foodShape: "orb",
    unlocked: ["classic"],
    snakeSkin: "neon-classic",
    snakeSkinsUnlocked: ["neon-classic"],
    randomSnakeSkin: false
};
const defaultSnakeProgress = {
    level: 1,
    xp: 0,
    xpNeed: 10
};
let snakeProgress = (() => {
    try {
        const parsed = JSON.parse(localStorage.getItem("snakeProgress") || "{}");
        return {
            level: Number.isFinite(parsed.level) ? Math.max(1, parsed.level) : 1,
            xp: Number.isFinite(parsed.xp) ? Math.max(0, parsed.xp) : 0,
            xpNeed: Number.isFinite(parsed.xpNeed) ? Math.max(5, parsed.xpNeed) : 10
        };
    } catch (e) {
        return { ...defaultSnakeProgress };
    }
})();
let cosmetics = (() => {
    try {
        const parsed = JSON.parse(localStorage.getItem("cosmetics") || "{}");
        const unlocked = Array.isArray(parsed.unlocked) ? parsed.unlocked : [];
        const snakeSkinsUnlocked = Array.isArray(parsed.snakeSkinsUnlocked) ? parsed.snakeSkinsUnlocked : [];
        const fallbackSkin = String(parsed.snakeSkin || "neon-classic");
        const safeSnakeSkin = SNAKE_SKINS.some((skin) => skin.id === fallbackSkin) ? fallbackSkin : "neon-classic";
        return {
            ...defaultCosmetics,
            ...parsed,
            unlocked: Array.from(new Set(["classic", ...unlocked])),
            snakeSkin: safeSnakeSkin,
            snakeSkinsUnlocked: Array.from(new Set(["neon-classic", ...snakeSkinsUnlocked]))
        };
    } catch (e) {
        return { ...defaultCosmetics };
    }
})();
let shopPreviewItemId = null;
let snakeSkinPreviewId = "";
let dailyChallenges = buildDailyChallenges();
let survivalMsCurrentRun = 0;
let eatFx = [];
let activeMutation = null;
let aiInterval = 22; // миллисекунды
let snake, dir, food;
let pendingPlayerDir = null;
let trophyAnimationFrame = 0;
let trophyAnimationStartTimeout = 0;
let stateFrames = [];
let currentReplay = [];
let hamiltonianPath = buildHamiltonianPath();
initAI(hamiltonianPath, CELL);
let score=0;
let replaySeed = 0;
let level = 1;
let running=false;
let lastTime=0;
let targetLength=120;
let aiMode=false;
 let baseSpeed = 350;
let speed = baseSpeed;
let sessionStartSpeed = baseSpeed;
let sessionStartTargetLength = 120;
let sessionStartDir = {x:1, y:0};
let sessionStartTrophies = trophies;
let sessionUsedAI = false;
let sessionNoRewards = false;
const GAME_MODE_KEY = "snakeGameMode";
const SEASON_PASS_LEVEL_CAP = 50;
const SEASON_PASS_XP_PER_LEVEL = 950;
const SEASON_PASS_BUY_COST_COINS = 3000;
const TROPHY_ROAD_KEY = "trophyRoadStateV1";
const GAME_MODES = {
    classic: { label: "CLASSIC", timed: false },
    time_attack: { label: "TIME", timed: true, durationMs: 180000 },
    king: { label: "KING", timed: false },
    slow: { label: "SLOW", timed: false },
    survival_plus: { label: "SURV+", timed: false }
};
const MODE_SWITCH_TAB_KEY = "snakeModeTab";
const MODE_CARD_META = {
    classic: { title: "СТОЛКНОВЕНИЕ", subtitle: "Неоновое поле", palette: "linear-gradient(140deg,#91e92f,#4ebc1f 50%,#2c7f11)" },
    time_attack: { title: "БРОУЛБОЛ", subtitle: "Тайм-атака 3:00", palette: "linear-gradient(140deg,#63a5ff,#3f72f2 55%,#2d4bc8)" },
    king: { title: "НОКАУТ", subtitle: "Король арены", palette: "linear-gradient(140deg,#ff9c2f,#f56a1b 56%,#bc3f09)" },
    slow: { title: "ЗАХВАТ", subtitle: "Медленный режим", palette: "linear-gradient(140deg,#b85cff,#8d43f2 56%,#5f2bb4)" },
    survival_plus: { title: "ГОРЯЧАЯ ЗОНА", subtitle: "События карты", palette: "linear-gradient(140deg,#ff5b95,#ee3f75 56%,#b82763)" }
};
const MODE_SWITCH_TABS = {
    special: { label: "ОСОБЫЕ", modes: ["classic", "survival_plus"] },
    trophy: { label: "С ТРОФЕЯМИ", modes: ["time_attack", "slow"] },
    ranked: { label: "РАНГОВЫЙ БОЙ", modes: ["king"] },
    community: { label: "СООБЩЕСТВО", modes: [] }
};
let selectedGameMode = localStorage.getItem(GAME_MODE_KEY) || "classic";
if (!GAME_MODES[selectedGameMode]) selectedGameMode = "classic";
let currentGameMode = "classic";
let selectedModeTab = localStorage.getItem(MODE_SWITCH_TAB_KEY) || "special";
if (!MODE_SWITCH_TABS[selectedModeTab]) selectedModeTab = "special";
let modeTimeLeftMs = 0;
let kingTickAccumMs = 0;
let deathReason = "";
let deathFx = null;
let audioCtx = null;
let best = localStorage.getItem("best") || 0;
updateBestDisplay();
gameHistory = Array.isArray(gameHistory)
    ? gameHistory.map((item) => normalizeHistoryRecord(item, !!item?.imported)).filter(Boolean).slice(0, 50)
    : [];
highlightClips = Array.isArray(highlightClips)
    ? highlightClips.map((item) => normalizeHighlightClip(item)).filter(Boolean).slice(0, 20)
    : [];
persistHistory();
persistHighlights();
function init(){
    snake = [{x:360, y:360}];
    dir = {x:1, y:0};
    pendingPlayerDir = null;
    food = randomFood();
    score = 0;
    level = 1;
    survivalMsCurrentRun = 0;
    eatFx = [];
    deathFx = null;
    deathReason = "";
    kingTickAccumMs = 0;
    modeTimeLeftMs = 0;
    clearMutation();
    speed = baseSpeed;
    targetLength = 120;
    updateScoreDisplay();
    document.getElementById("levelDisplay").innerText = level;
    updateSpeedByTrophies();
    updateSpeedDisplay();
    updateModeDisplay();
}
function seededRandom() {
    replaySeed = (replaySeed * 1664525 + 1013904223) % 4294967296;
    return replaySeed / 4294967296;
}

function saveCareerProgress() {
    localStorage.setItem(CAREER_PROGRESS_KEY, JSON.stringify(careerProgress));
}

function getCareerData() {
    careerProgress = normalizeCareerProgressState(careerProgress, trophies);
    const reachedStage = CAREER_STAGES[Math.max(0, Math.min(CAREER_STAGES.length - 1, Number(careerProgress.maxStageIndex || 0)))];
    const stageView = getCareerStageByTrophies(careerProgress.highestTrophies);
    const activeStage = stageView.index > Number(careerProgress.maxStageIndex || 0)
        ? stageView
        : {
            ...reachedStage,
            index: Number(careerProgress.maxStageIndex || 0),
            nextStage: CAREER_STAGES[Math.min(CAREER_STAGES.length - 1, Number(careerProgress.maxStageIndex || 0)) + 1] || null,
            remainingToNext: Math.max(0, Number((CAREER_STAGES[Math.min(CAREER_STAGES.length - 1, Number(careerProgress.maxStageIndex || 0)) + 1]?.minTrophies || 0)) - Number(careerProgress.highestTrophies || 0)),
            stagePercent: stageView.stagePercent
        };
    return {
        ...activeStage,
        highestTrophies: Math.max(0, Math.floor(Number(careerProgress.highestTrophies || 0)))
    };
}

function renderCareerUI() {
    const career = getCareerData();
    const badge = document.getElementById("careerBadge");
    const topBadge = document.getElementById("topCareerBadge");
    const line = document.getElementById("careerLine");
    if (badge) {
        badge.innerText = career.title;
        badge.style.color = career.color;
    }
    if (topBadge) {
        topBadge.innerText = career.title;
        topBadge.style.color = career.color;
    }
    if (line) {
        const lang = I18N[uiLocale] || I18N.ru;
        const nextTitle = career.nextStage ? career.nextStage.title : "MAX";
        if (career.nextStage) {
            if (uiLocale === "en") {
                line.innerText = `${lang.careerPrefix}: ${career.title} • to ${nextTitle}: ${career.remainingToNext} trophies.`;
            } else {
                line.innerText = `${lang.careerPrefix}: ${career.title} • до ${nextTitle}: ${career.remainingToNext} трофеев.`;
            }
        } else {
            line.innerText = `${lang.careerPrefix}: ${career.title} • MAX`;
        }
    }
}

function updateCareerProgressByTrophies(value, options = {}) {
    const safe = Math.max(0, Math.floor(Number(value || 0)));
    const prev = normalizeCareerProgressState(careerProgress, safe);
    const prevStageIndex = Number(prev.maxStageIndex || 0);
    let changed = false;

    if (safe > Number(prev.highestTrophies || 0)) {
        prev.highestTrophies = safe;
        changed = true;
    }

    const stageFromHighest = getCareerStageByTrophies(prev.highestTrophies).index;
    if (stageFromHighest > prev.maxStageIndex) {
        prev.maxStageIndex = stageFromHighest;
        changed = true;
    }

    careerProgress = prev;
    if (changed) {
        saveCareerProgress();
    }

    const shouldToast = !options.silent && careerPromotionBootstrapped && Number(careerProgress.maxStageIndex || 0) > prevStageIndex;
    if (shouldToast) {
        const stage = CAREER_STAGES[Number(careerProgress.maxStageIndex || 0)];
        if (stage) {
            showRoomEventToast(`Карьера повышена: ${stage.title}`);
            playTone(980, 95, "triangle", 0.06);
        }
    }

    renderCareerUI();
    careerPromotionBootstrapped = true;
}

function getRankData(){
    const rankNumber = getRankNumberFromTrophies(trophies);
    const tier = Math.min(RANK_TIER_COLORS.length - 1, Math.floor((rankNumber - 1) / 5));
    return {
        rankNumber,
        name: String(rankNumber),
        color: RANK_TIER_COLORS[tier]
    };
}

function getRankProgressData() {
    const safeTrophies = Math.max(0, Math.floor(trophies));
    const rankNumber = getRankNumberFromTrophies(safeTrophies);
    const maxRank = 50;
    const trophiesPerRank = 50;
    if (rankNumber >= maxRank) {
        return {
            percent: 100,
            label: "MAX",
            mobileLabel: "MAX"
        };
    }

    const rankStart = (rankNumber - 1) * trophiesPerRank;
    const inRank = Math.max(0, safeTrophies - rankStart);
    const clampedInRank = Math.min(trophiesPerRank, inRank);
    const remaining = Math.max(0, trophiesPerRank - clampedInRank);
    return {
        percent: (clampedInRank / trophiesPerRank) * 100,
        label: `${clampedInRank}/${trophiesPerRank} • до ${rankNumber + 1}: ${remaining}`,
        mobileLabel: `${clampedInRank}/${trophiesPerRank}`
    };
}

let currentRankName = getRankData().name;

function grantAchievementCosmeticsByRank(rankNumber) {
    if (!Array.isArray(cosmetics.unlocked)) cosmetics.unlocked = ["classic"];
    let changed = false;
    if (rankNumber >= 10 && !cosmetics.unlocked.includes("trail-pulse")) {
        cosmetics.unlocked.push("trail-pulse");
        changed = true;
    }
    if (rankNumber >= 20 && !cosmetics.unlocked.includes("death-ring")) {
        cosmetics.unlocked.push("death-ring");
        changed = true;
    }
    if (rankNumber >= 30 && !cosmetics.unlocked.includes("shape-diamond")) {
        cosmetics.unlocked.push("shape-diamond");
        changed = true;
    }
    if (changed) {
        saveCosmetics();
        applyCosmetics();
        syncSkinInputs();
    }
}

function updateRank(){

    const rank = getRankData();
    const progress = getRankProgressData();
    const el = document.getElementById("rankDisplay");
    const topRank = document.getElementById("topRank");
    const rankProgressFill = document.getElementById("rankProgressFill");
    const rankProgressText = document.getElementById("rankProgressText");
    const topRankProgressFill = document.getElementById("topRankProgressFill");
    const topRankProgressText = document.getElementById("topRankProgressText");

    if(rank.name !== currentRankName){
        el.style.transform = "scale(1.3)";
        setTimeout(()=> el.style.transform="scale(1)", 300);
    }

    currentRankName = rank.name;

    let rewarded = false;
    while (rankRewardClaimedRank + 5 <= rank.rankNumber && rankRewardClaimedRank < 50) {
        rankRewardClaimedRank += 5;
        coins += rankRewardClaimedRank;
        rewarded = true;
    }
    if (rewarded) {
        localStorage.setItem("rankRewardClaimedRank", String(rankRewardClaimedRank));
        localStorage.setItem("coins", String(coins));
        setHudCoinsValue(coins);
        updateMenuTrophies();
    }

    el.innerText = rank.name;
    el.style.color = rank.color;
    if (rankProgressFill) {
        rankProgressFill.style.width = `${progress.percent}%`;
        rankProgressFill.style.color = rank.color;
    }
    if (rankProgressText) {
        rankProgressText.innerText = progress.label;
    }
    if (topRank) {
        topRank.innerText = rank.name;
        topRank.style.color = rank.color;
    }
    if (topRankProgressFill) {
        topRankProgressFill.style.width = `${progress.percent}%`;
        topRankProgressFill.style.color = rank.color;
    }
    if (topRankProgressText) {
        topRankProgressText.innerText = progress.mobileLabel;
    }
    grantAchievementCosmeticsByRank(rank.rankNumber);
    applySeasonPassRewards();
    updateCareerProgressByTrophies(trophies);
}

function updateBestDisplay() {
    const bestEl = document.getElementById("bestScore");
    if (bestEl) bestEl.innerText = String(best);
    const corner = document.getElementById("cornerBestValue");
    if (corner) corner.innerText = String(best);
}

function updateMenuTrophies(){
document.getElementById("menuTrophies").innerText = trophies;
    const menuCoins = document.getElementById("menuCoins");
    if (menuCoins) {
        menuCoins.innerText = coins;
    }
    const shopCoins = document.getElementById("shopCoins");
    if (shopCoins) {
        shopCoins.innerText = coins;
    }
    renderPlayerProfileStats();
    renderTrophyRoad();
    renderSnakeSkinMenu();
}
updateMenuTrophies();

const ACCOUNT_TOKEN_KEY = "snakeAuthToken";
let accountToken = localStorage.getItem(ACCOUNT_TOKEN_KEY) || "";
let accountUser = null;
let cloudSyncTimer = 0;
let cloudSyncInFlight = false;
let cloudAutoSyncInterval = 0;
let lastKnownCloudUpdatedAtMs = 0;
let lastSyncedProgressJson = "";
let friendsState = {
    friends: [],
    incoming: [],
    outgoing: []
};
let friendsUiTab = "friends";
let friendSuggestions = [];
const BOX_INVENTORY_KEY = "boxInventory";
const defaultBoxInventory = { common: 0, rare: 0, super: 0 };
let boxInventory = (() => {
    try {
        const parsed = JSON.parse(localStorage.getItem(BOX_INVENTORY_KEY) || "{}");
        return {
            common: Math.max(0, Math.floor(Number(parsed.common || 0))),
            rare: Math.max(0, Math.floor(Number(parsed.rare || 0))),
            super: Math.max(0, Math.floor(Number(parsed.super || 0)))
        };
    } catch (_) {
        return { ...defaultBoxInventory };
    }
})();
let clanState = {
    clan: null,
    monthKey: "",
    targetWins: 300
};
let clanShopState = {
    clanCoins: 0,
    offers: [],
    unlocks: []
};
let clanWarState = {
    activeWar: null,
    recentWars: []
};
let clanChatMessages = [];
let clanLogs = [];
let clanWeeklyTop = [];
let clanUiPollTimer = 0;
let clanMembersPanelOpen = false;
let leaderboardState = {
    activeTab: "players",
    players: [],
    weeklyPlayers: [],
    clans: []
};
let seasonHubState = {
    season: null,
    featuredSkins: [],
    topPlayers: [],
    rewardTiers: [],
    me: null,
    previousSeasonReward: null,
    loadedAt: 0
};
const STAFF_ROLE_SET = new Set(["moderator", "admin"]);
let moderationConsoleState = {
    summary: null,
    events: []
};
let adminChatMessages = [];
let socialNotices = [];
let moderationPollTimer = 0;
let moderationOnlyCritical = false;
const moderationClientReportAt = new Map();
let roomState = null;
let roomPollTimer = 0;
let roomLastStartedChallengeId = 0;
let roomScorePostTimer = 0;
let roomLastPostedScore = -1;
let roomLastDeathSeenAtMs = 0;
let roomToastTimer = 0;
let roomPullInFlight = false;
let roomSpectatorMode = false;
let publicRooms = [];
let isBannedUser = false;
let bannedReason = "";
const AUTH_REQUIRED_FOR_PLAY = true;
const ACCOUNT_PROFILE_META_KEY = "accountProfileMetaV1";
let roomSession = {
    active: false,
    roomCode: "",
    challengeId: 0
};

let globalEventState = createInitialGlobalEventState();

function ensureGlobalEventState(options = {}) {
    globalEventState = ensureGlobalEventStateHelper(globalEventState, options);
    return globalEventState;
}

function currentGlobalEventMeta() {
    const state = ensureGlobalEventState();
    return {
        id: state.eventId,
        title: uiLocale === "en" ? state.titleEn : state.titleRu,
        description: uiLocale === "en" ? state.descEn : state.descRu
    };
}

function getArenaBounds() {
    const state = ensureGlobalEventState();
    return getArenaBoundsByEvent(state.eventId, GRID, CELL);
}

function getFoodRewardMultiplier(nowMs = performance.now()) {
    const state = ensureGlobalEventState();
    return getFoodRewardMultiplierByEvent(state, nowMs);
}

function maybeRunChaosHourTick(nowMs = performance.now()) {
    const state = ensureGlobalEventState();
    if (state.eventId !== "chaos_hour" || !running || isReplaying) return;

    if (!Number.isFinite(state.chaosNextTickMs) || state.chaosNextTickMs <= 0) {
        state.chaosNextTickMs = nowMs + 6500 + seededRandom() * 3500;
        return;
    }
    if (nowMs < state.chaosNextTickMs) return;

    state.chaosNextTickMs = nowMs + 6500 + seededRandom() * 4500;
    const roll = seededRandom();
    if (roll < 0.34) {
        const mutation = MUTATIONS[Math.floor(seededRandom() * MUTATIONS.length)];
        const duration = 4200 + Math.floor(seededRandom() * 3800);
        activateMutation(mutation.id, duration);
        showRoomEventToast(`Chaos Hour: ${mutation.name}!`);
        return;
    }
    if (roll < 0.68) {
        food = randomFood();
        foodHistory.push({
            x: food.x,
            y: food.y,
            eaten: false,
            tier: food.tier || "common"
        });
        spawnEatEffect(food.x, food.y);
        playTone(760, 70, "triangle", 0.05);
        showRoomEventToast("Chaos Hour: еда телепортирована!");
        return;
    }
    state.chaosDoubleUntilMs = nowMs + 9000;
    playTone(640, 80, "square", 0.05);
    showRoomEventToast("Chaos Hour: x2 еда на 9 секунд!");
}

function assignAbVariant() {
    const existing = String(localStorage.getItem(AB_VARIANT_KEY) || "").trim();
    if (existing === "alpha" || existing === "beta") return existing;
    const variant = Math.random() < 0.5 ? "alpha" : "beta";
    localStorage.setItem(AB_VARIANT_KEY, variant);
    return variant;
}

let featureFlags = {
    ...DEFAULT_FEATURE_FLAGS,
    ...safeParseJson(localStorage.getItem(FEATURE_FLAGS_KEY), {})
};
let uiLocale = String(localStorage.getItem(UI_LOCALE_KEY) || "ru").toLowerCase();
if (!(uiLocale in I18N)) uiLocale = "ru";
let abVariant = assignAbVariant();
let dailyLoginState = safeParseJson(localStorage.getItem(DAILY_LOGIN_KEY), { lastClaimKey: "", streak: 0 });
let weeklyChallenge = safeParseJson(localStorage.getItem(WEEKLY_CHALLENGE_KEY), null);
let friendMissionState = safeParseJson(localStorage.getItem(FRIEND_MISSION_KEY), null);
let qualityLogs = Array.isArray(safeParseJson(localStorage.getItem(QUALITY_LOG_KEY), []))
    ? safeParseJson(localStorage.getItem(QUALITY_LOG_KEY), [])
    : [];
let seasonPassState = safeParseJson(localStorage.getItem(SEASON_PASS_KEY), null);
let trophyRoadState = safeParseJson(localStorage.getItem(TROPHY_ROAD_KEY), null);
let onboardingDone = localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
let tutorialStepIndex = 0;
let seasonState = getSeasonState();
let hazardInsideMs = 0;
let activeHazardZone = null;
trophyRoadState = normalizeTrophyRoadState();
saveTrophyRoadState();

function getProgressSnapshot() {
    return {
        trophies,
        coins,
        rankRewardClaimedRank,
        best,
        snakeProgress,
        cosmetics,
        boxInventory,
        featureFlags,
        uiLocale,
        dailyLoginState,
        weeklyChallenge,
        friendMissionState,
        seasonPassState,
        trophyRoadState,
        careerProgress,
        dailyChallenges,
        gameHistory,
        highlightClips
    };
}

function getProgressSnapshotJson() {
    try {
        return JSON.stringify(getProgressSnapshot());
    } catch (_) {
        return "";
    }
}

function parseUpdatedAtMs(value) {
    if (!value) return 0;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
}

function progressHasMeaningfulData(cloud) {
    if (!cloud || typeof cloud !== "object") return false;
    return (
        Number.isFinite(cloud.trophies) ||
        Number.isFinite(cloud.coins) ||
        Number.isFinite(cloud.best) ||
        (cloud.snakeProgress && typeof cloud.snakeProgress === "object") ||
        (cloud.cosmetics && typeof cloud.cosmetics === "object") ||
        (cloud.careerProgress && typeof cloud.careerProgress === "object") ||
        (cloud.dailyChallenges && typeof cloud.dailyChallenges === "object") ||
        Array.isArray(cloud.gameHistory) ||
        Array.isArray(cloud.highlightClips)
    );
}

async function apiRequest(path, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };
    if (accountToken) {
        headers.Authorization = `Bearer ${accountToken}`;
    }
    const response = await fetch(`/api/${path}`, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    let data = {};
    try {
        data = await response.json();
    } catch (_) {
        data = {};
    }
    if (!response.ok) {
        if ((data.error || "") === "user_banned") {
            applyBanState(data.reason || data.detail || "");
        }
        const err = new Error(data.error || `http_${response.status}`);
        err.code = data.error || `http_${response.status}`;
        err.detail = data.detail || "";
        err.reason = data.reason || "";
        throw err;
    }
    return data;
}

function applyBanState(reason = "") {
    isBannedUser = true;
    bannedReason = String(reason || "").trim();
    running = false;
    isReplaying = false;
    const overlay = document.getElementById("banOverlay");
    const reasonEl = document.getElementById("banReasonText");
    if (reasonEl) {
        reasonEl.innerText = bannedReason
            ? `Причина: ${bannedReason}`
            : "Причина: нарушение правил.";
    }
    if (overlay) {
        overlay.classList.remove("hidden");
    }
    renderAuthState(
        bannedReason
            ? `вы забанены • ${bannedReason}`
            : "вы забанены"
    );
}

function renderAuthState(statusText = "") {
    const statusEl = document.getElementById("authStatus");
    const accountIdEl = document.getElementById("accountIdText");
    const guestButtons = document.getElementById("authGuestButtons");
    const closeAccountBtn = document.getElementById("closeAccountMenuBtn");
    const authGateHint = document.getElementById("authGateHint");
    const userButtons = document.getElementById("authUserButtons");
    const formRow = document.getElementById("authFormRow");
    const nickRow = document.getElementById("authNicknameRow");
    const nickEditInput = document.getElementById("authNicknameEdit");
    const base = accountUser
        ? `Аккаунт: ${accountUser.nickname || "без_ника"} (${accountUser.email})`
        : "Аккаунт: не выполнен вход";
    statusEl.innerText = statusText ? `${base} • ${statusText}` : base;
    if (accountIdEl) {
        accountIdEl.innerText = accountUser && accountUser.id ? `ID: ${accountUser.id}` : "ID: -";
    }
    guestButtons.classList.toggle("hidden", !!accountUser);
    if (authGateHint) {
        authGateHint.classList.toggle("hidden", !!accountUser);
    }
    formRow.classList.toggle("hidden", !!accountUser);
    nickRow.classList.toggle("hidden", !!accountUser);
    if (accountUser && nickEditInput) {
        nickEditInput.value = accountUser.nickname || "";
    }
    userButtons.classList.toggle("hidden", !accountUser);
    if (closeAccountBtn) {
        closeAccountBtn.classList.toggle("hidden", AUTH_REQUIRED_FOR_PLAY && !accountUser);
    }
    syncModerationButtonVisibility();
    renderSocialNotices();
    renderPlayerProfileStats();
}

function ensureAccountProfileMeta() {
    const raw = safeParseJson(localStorage.getItem(ACCOUNT_PROFILE_META_KEY), {});
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function touchAccountSeenAt() {
    if (!accountUser || !accountUser.id) return;
    const meta = ensureAccountProfileMeta();
    const key = String(accountUser.id);
    if (!meta[key] || !meta[key].firstSeenAt) {
        meta[key] = { firstSeenAt: new Date().toISOString() };
        localStorage.setItem(ACCOUNT_PROFILE_META_KEY, JSON.stringify(meta));
    }
}

function modeLabelByKey(modeKey) {
    const key = String(modeKey || "classic");
    return GAME_MODES[key]?.label || key.toUpperCase();
}

function modeRotationLine(modeKey) {
    const now = Date.now();
    const offsets = {
        classic: 13,
        time_attack: 1,
        king: 19,
        slow: 17,
        survival_plus: 11
    };
    const addHours = Number(offsets[modeKey] || 6);
    const next = now + addHours * 3600000 + 12 * 60000;
    const left = Math.max(0, next - now);
    const hh = Math.floor(left / 3600000);
    const mm = Math.floor((left % 3600000) / 60000);
    return `Новая карта через ${hh}ч. ${mm}м.`;
}

function setSelectedGameMode(modeKey) {
    const normalized = GAME_MODES[modeKey] ? modeKey : "classic";
    selectedGameMode = normalized;
    localStorage.setItem(GAME_MODE_KEY, selectedGameMode);
    const modeSelect = document.getElementById("gameModeSelect");
    if (modeSelect) modeSelect.value = selectedGameMode;
}

function renderModeSwitchUI() {
    const gridEl = document.getElementById("modeSwitchGrid");
    if (!gridEl) return;
    const tabButtons = Array.from(document.querySelectorAll("#modeSwitchTabs .modeTabBtn"));
    for (const btn of tabButtons) {
        const tab = String(btn.dataset.modeTab || "");
        btn.classList.toggle("active", tab === selectedModeTab);
    }

    const tabCfg = MODE_SWITCH_TABS[selectedModeTab] || MODE_SWITCH_TABS.special;
    const modes = Array.isArray(tabCfg.modes) ? tabCfg.modes.filter((m) => GAME_MODES[m]) : [];
    if (!modes.length) {
        gridEl.innerHTML = '<div class="modeCardPlaceholder">Скоро появятся режимы сообщества</div>';
        return;
    }
    gridEl.innerHTML = "";
    modes.forEach((modeKey, idx) => {
        const meta = MODE_CARD_META[modeKey] || {};
        const card = document.createElement("button");
        card.type = "button";
        card.className = `modeCard${idx === 0 ? " featured" : ""}${modeKey === selectedGameMode ? " selected" : ""}`;
        card.style.background = String(meta.palette || "linear-gradient(140deg,#3e76d8,#2651a4)");
        card.innerHTML = `<div class="modeCardTop">${escapeHtml(modeRotationLine(modeKey))}</div>
<div class="modeCardBody">
<div class="modeCardTitle">${escapeHtml(meta.title || modeLabelByKey(modeKey))}</div>
<div class="modeCardSub">${escapeHtml(meta.subtitle || GAME_MODES[modeKey].label)}</div>
</div>`;
        card.addEventListener("click", () => {
            setSelectedGameMode(modeKey);
            renderModeSwitchUI();
        });
        gridEl.appendChild(card);
    });
}

function computePlayerCompetitiveStats() {
    const rows = Array.isArray(gameHistory) ? gameHistory : [];
    const games = rows
        .filter((g) => g && !g.imported && !g.isAI && !g.noRewards)
        .slice()
        .reverse();
    const matches = games.length;
    let wins = 0;
    let totalScore = 0;
    let currentStreak = 0;
    let maxStreak = 0;
    const modeCount = {};
    for (const g of games) {
        const trophyDelta = Number(g.trophies || 0);
        const isWin = trophyDelta > 0;
        if (isWin) {
            wins += 1;
            currentStreak += 1;
            if (currentStreak > maxStreak) maxStreak = currentStreak;
        } else {
            currentStreak = 0;
        }
        totalScore += Math.max(0, Number(g.score || 0));
        const modeKey = String(g.gameMode || "classic");
        modeCount[modeKey] = Number(modeCount[modeKey] || 0) + 1;
    }
    const favoriteModeKey = Object.entries(modeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "classic";
    return {
        matches,
        wins,
        winRate: matches > 0 ? Math.round((wins / matches) * 100) : 0,
        maxStreak,
        totalScore,
        favoriteModeLabel: modeLabelByKey(favoriteModeKey)
    };
}

function renderPlayerProfileStats() {
    const card = document.getElementById("playerProfileCard");
    if (!card) return;

    const nameEl = document.getElementById("profileNameLine");
    const tagEl = document.getElementById("profileTagLine");
    const sinceEl = document.getElementById("profileSinceLine");
    const clanEl = document.getElementById("profileClanLine");
    const trophiesEl = document.getElementById("profileTrophiesValue");
    const recordEl = document.getElementById("profileRecordValue");
    const winsEl = document.getElementById("profileWinsValue");
    const matchesEl = document.getElementById("profileMatchesValue");
    const winrateEl = document.getElementById("profileWinrateValue");
    const streakEl = document.getElementById("profileStreakValue");
    const modeEl = document.getElementById("profileFavModeValue");
    const totalScoreEl = document.getElementById("profileTotalScoreValue");

    if (!nameEl || !tagEl || !sinceEl || !clanEl || !trophiesEl || !recordEl || !winsEl || !matchesEl || !winrateEl || !streakEl || !modeEl || !totalScoreEl) return;

    if (!accountUser) {
        nameEl.innerText = "Гость";
        tagEl.innerText = "ID: -";
        sinceEl.innerText = "Аккаунт: войдите в игру";
        clanEl.innerText = "Клуб: -";
        trophiesEl.innerText = "0";
        recordEl.innerText = "0";
        winsEl.innerText = "0";
        matchesEl.innerText = "0";
        winrateEl.innerText = "0%";
        streakEl.innerText = "0";
        modeEl.innerText = "-";
        totalScoreEl.innerText = "0";
        return;
    }

    touchAccountSeenAt();
    const profileMeta = ensureAccountProfileMeta();
    const firstSeenAt = profileMeta[String(accountUser.id)]?.firstSeenAt || null;
    const firstYear = (() => {
        const d = firstSeenAt ? new Date(firstSeenAt) : null;
        return d && !Number.isNaN(d.getTime()) ? d.getFullYear() : new Date().getFullYear();
    })();
    const stats = computePlayerCompetitiveStats();
    const allTimeRecord = Math.max(0, Number(careerProgress?.highestTrophies || trophies || 0));
    const clan = clanState?.clan;
    const clanLabel = clan ? `${clan.name || "Клан"} • ${clanRoleLabel(clan.role)}` : "Без клана";

    nameEl.innerText = accountUser.nickname || accountUser.email || `Игрок ${accountUser.id}`;
    tagEl.innerText = `ID: ${accountUser.id}`;
    sinceEl.innerText = `Аккаунт с ${firstYear} года`;
    clanEl.innerText = `Клуб: ${clanLabel}`;
    trophiesEl.innerText = String(Math.max(0, Number(trophies || 0)));
    recordEl.innerText = String(allTimeRecord);
    winsEl.innerText = String(stats.wins);
    matchesEl.innerText = String(stats.matches);
    winrateEl.innerText = `${stats.winRate}%`;
    streakEl.innerText = String(stats.maxStreak);
    modeEl.innerText = stats.favoriteModeLabel;
    totalScoreEl.innerText = String(stats.totalScore);
}

function normalizeStaffRole(value) {
    const role = String(value || "").trim().toLowerCase();
    if (role === "admin" || role === "moderator") return role;
    return "player";
}

function hasModerationAccess() {
    if (!accountUser || !accountToken) return false;
    const role = normalizeStaffRole(accountUser.staffRole);
    return STAFF_ROLE_SET.has(role);
}

function setModerationStatus(text) {
    const el = document.getElementById("moderationStatusText");
    if (el) el.innerText = text || "";
}

function setSocialNoticeStatus(text) {
    const el = document.getElementById("socialNoticeStatusText");
    if (el) el.innerText = String(text || "");
}

function formatSocialNoticeAuthor(row) {
    const role = normalizeStaffRole(row?.authorRole || "player");
    const nick = row?.authorNickname || row?.authorEmail || `ID ${Number(row?.staffUserId || 0) || "?"}`;
    return `${role}: ${nick}`;
}

function renderSocialNotices() {
    const listEl = document.getElementById("socialNoticesList");
    const publishPanel = document.getElementById("socialNoticePublishPanel");
    if (!listEl || !publishPanel) return;
    const canPublish = hasModerationAccess();
    publishPanel.classList.toggle("hidden", !canPublish);

    listEl.innerHTML = "";
    if (!Array.isArray(socialNotices) || !socialNotices.length) {
        listEl.innerHTML = '<div class="friendsItem">Пока нет новостей.</div>';
        return;
    }

    for (const row of socialNotices) {
        const item = document.createElement("div");
        item.className = "friendsItem";
        const pinMark = row?.isPinned ? " [PIN]" : "";
        const created = row?.createdAt ? formatShortTime(row.createdAt) : "--:--";
        item.innerHTML = `
<div class="clanEntryTitle">${escapeHtml(String(row?.title || "Новость"))}${pinMark}</div>
<div class="clanEntryMeta">${escapeHtml(formatSocialNoticeAuthor(row))} • ${escapeHtml(created)}</div>
<div style="margin-top:4px;color:#ffe9cb;">${escapeHtml(String(row?.message || ""))}</div>`;
        listEl.appendChild(item);
    }
}

async function refreshSocialNotices() {
    try {
        const data = await apiRequest("social-notices", { method: "GET" });
        socialNotices = Array.isArray(data?.notices) ? data.notices : [];
        renderSocialNotices();
        setSocialNoticeStatus(hasModerationAccess() ? "Можно публиковать новости." : "Новости публикуют только админы/модераторы.");
    } catch (error) {
        socialNotices = [];
        renderSocialNotices();
        const msg = error && error.code ? error.code : "ошибка загрузки";
        setSocialNoticeStatus(`Ошибка: ${msg}`);
    }
}

async function publishSocialNotice() {
    if (!hasModerationAccess()) {
        setSocialNoticeStatus("Публикация доступна только модераторам и админам.");
        return;
    }
    const titleInput = document.getElementById("socialNoticeTitleInput");
    const messageInput = document.getElementById("socialNoticeMessageInput");
    const pinnedInput = document.getElementById("socialNoticePinnedInput");
    const title = String(titleInput?.value || "").trim();
    const message = String(messageInput?.value || "").trim();
    const isPinned = !!pinnedInput?.checked;
    if (!title) {
        setSocialNoticeStatus("Введите заголовок новости.");
        return;
    }
    if (!message) {
        setSocialNoticeStatus("Введите текст новости.");
        return;
    }
    try {
        await apiRequest("social-notice-publish", {
            method: "POST",
            body: { title, message, isPinned }
        });
        if (titleInput) titleInput.value = "";
        if (messageInput) messageInput.value = "";
        if (pinnedInput) pinnedInput.checked = false;
        await refreshSocialNotices();
        setSocialNoticeStatus("Новость опубликована.");
    } catch (error) {
        const msg = error && error.code ? error.code : "ошибка публикации";
        setSocialNoticeStatus(`Ошибка: ${msg}`);
    }
}

function syncModerationButtonVisibility() {
    const btn = document.getElementById("moderationBtn");
    const kindInput = document.getElementById("adminChatKindInput");
    const role = normalizeStaffRole(accountUser?.staffRole);
    if (btn) {
        btn.classList.toggle("hidden", !hasModerationAccess());
    }
    if (kindInput) {
        const alertOption = kindInput.querySelector('option[value="alert"]');
        if (alertOption) alertOption.disabled = role !== "admin";
        if (role !== "admin" && kindInput.value === "alert") {
            kindInput.value = "note";
        }
    }
    const menu = document.getElementById("moderationMenu");
    const social = document.getElementById("socialMenu");
    if (menu && social && !hasModerationAccess() && !menu.classList.contains("hidden")) {
        menu.classList.add("hidden");
        social.classList.remove("hidden");
        syncMenuOverlayState();
    }
    if (!hasModerationAccess()) {
        stopModerationPolling();
    }
}

function moderationActorLabel(item) {
    if (!item) return "system";
    if (item.userNickname || item.userEmail) {
        return item.userNickname || item.userEmail;
    }
    if (item.staffNickname || item.staffEmail) {
        return item.staffNickname || item.staffEmail;
    }
    if (item.userId) return `ID ${item.userId}`;
    if (item.staffUserId) return `STAFF ${item.staffUserId}`;
    return "system";
}

function renderModerationConsole() {
    const summaryEl = document.getElementById("moderationSummaryLine");
    const listEl = document.getElementById("moderationEventsList");
    const filterBtn = document.getElementById("moderationCriticalFilterBtn");
    if (!summaryEl || !listEl || !filterBtn) return;

    const summary = moderationConsoleState.summary || null;
    if (!summary) {
        summaryEl.innerText = "Сводка: -";
    } else {
        const bySeverity = summary.bySeverity || {};
        summaryEl.innerText = `24ч: ${Number(summary.events24h || 0)} • low ${Number(bySeverity.low || 0)} • medium ${Number(bySeverity.medium || 0)} • high ${Number(bySeverity.high || 0)} • critical ${Number(bySeverity.critical || 0)}`;
    }
    filterBtn.innerText = moderationOnlyCritical
        ? "Показывать все"
        : "Показывать high/critical";

    const allEvents = Array.isArray(moderationConsoleState.events) ? moderationConsoleState.events : [];
    const rows = moderationOnlyCritical
        ? allEvents.filter((item) => {
            const sev = String(item?.severity || "").toLowerCase();
            return sev === "high" || sev === "critical";
        })
        : allEvents;

    if (!rows.length) {
        listEl.innerHTML = '<div class="friendsItem">Подозрительных действий пока нет.</div>';
        return;
    }

    listEl.innerHTML = "";
    for (const item of rows.slice(0, 120)) {
        const row = document.createElement("div");
        row.className = "friendsItem clanTableRow clanSearchRow";
        const head = document.createElement("div");
        head.className = "clanEntryTitle";
        const severity = String(item?.severity || "medium").toUpperCase();
        head.innerText = `${severity} • ${item.eventType || "suspicious_action"} • ${item.source || "client"}`;
        const meta = document.createElement("div");
        meta.className = "clanEntryMeta";
        const time = formatShortTime(item.createdAt);
        const actor = moderationActorLabel(item);
        meta.innerText = `${time} • ${actor}${item.ip ? ` • ip ${item.ip}` : ""}`;
        row.appendChild(head);
        row.appendChild(meta);

        const details = item && item.details && typeof item.details === "object" ? item.details : {};
        const detailText = JSON.stringify(details);
        if (detailText && detailText !== "{}") {
            const body = document.createElement("div");
            body.className = "clanEntryBody";
            body.innerText = detailText.length > 240 ? `${detailText.slice(0, 240)}...` : detailText;
            row.appendChild(body);
        }
        listEl.appendChild(row);
    }
}

function renderAdminChat() {
    const listEl = document.getElementById("adminChatList");
    if (!listEl) return;
    const rows = Array.isArray(adminChatMessages) ? adminChatMessages : [];
    if (!rows.length) {
        listEl.innerHTML = '<div class="friendsItem">Чат модерации пуст.</div>';
        return;
    }
    listEl.innerHTML = "";
    for (const item of rows.slice(-140)) {
        const row = document.createElement("div");
        row.className = "friendsItem clanTableRow clanShopRow";
        const nick = item.nickname || item.email || `ID ${item.userId || "?"}`;
        const role = normalizeStaffRole(item.staffRole || "player");
        const head = document.createElement("div");
        head.className = "clanEntryMeta";
        head.innerText = `${formatShortTime(item.createdAt)} • ${role} • ${nick} • ${item.kind || "note"}`;
        const body = document.createElement("div");
        body.className = "clanEntryBody";
        body.innerText = item.message || "";
        row.appendChild(head);
        row.appendChild(body);
        listEl.appendChild(row);
    }
}

async function refreshModerationConsole() {
    if (!hasModerationAccess()) {
        moderationConsoleState = { summary: null, events: [] };
        renderModerationConsole();
        return;
    }
    try {
        const data = await apiRequest("moderation-console", { method: "GET" });
        moderationConsoleState = {
            summary: data?.summary || null,
            events: Array.isArray(data?.events) ? data.events : []
        };
        if (Array.isArray(data?.bugReports) && !adminChatMessages.length) {
            adminChatMessages = data.bugReports;
            renderAdminChat();
        }
        setModerationStatus("Консоль обновлена.");
    } catch (error) {
        const msg = error && error.code ? error.code : "ошибка консоли модерации";
        setModerationStatus(`Ошибка: ${msg}`);
        console.error(error);
    }
    renderModerationConsole();
}

async function refreshAdminChatMessages() {
    if (!hasModerationAccess()) {
        adminChatMessages = [];
        renderAdminChat();
        return;
    }
    try {
        const data = await apiRequest("admin-chat", { method: "GET" });
        adminChatMessages = Array.isArray(data?.messages) ? data.messages : [];
    } catch (error) {
        const msg = error && error.code ? error.code : "ошибка чата модерации";
        setModerationStatus(`Ошибка: ${msg}`);
        console.error(error);
    }
    renderAdminChat();
}

async function refreshModerationPanel() {
    await Promise.all([
        refreshModerationConsole(),
        refreshAdminChatMessages()
    ]);
}

function startModerationPolling() {
    if (moderationPollTimer) return;
    moderationPollTimer = setInterval(() => {
        const menu = document.getElementById("moderationMenu");
        if (!menu || menu.classList.contains("hidden")) return;
        if (!hasModerationAccess()) return;
        refreshModerationPanel().catch(() => {});
    }, 8000);
}

function stopModerationPolling() {
    if (!moderationPollTimer) return;
    clearInterval(moderationPollTimer);
    moderationPollTimer = 0;
}

async function reportSuspiciousAction(source, eventType, severity = "medium", details = {}, cooldownMs = 60000) {
    if (!accountUser || !accountToken) return;
    const normalizedSource = String(source || "").trim().slice(0, 64) || "client";
    const normalizedType = String(eventType || "").trim().slice(0, 64) || "suspicious_action";
    const severityRaw = String(severity || "").trim().toLowerCase();
    const normalizedSeverity = ["low", "medium", "high", "critical"].includes(severityRaw) ? severityRaw : "medium";
    const key = `${normalizedSource}|${normalizedType}|${normalizedSeverity}`;
    const now = Date.now();
    const lastAt = moderationClientReportAt.get(key) || 0;
    if (now - lastAt < Math.max(1000, Number(cooldownMs) || 60000)) return;
    moderationClientReportAt.set(key, now);
    try {
        await apiRequest("moderation-security-log", {
            method: "POST",
            body: {
                source: normalizedSource,
                eventType: normalizedType,
                severity: normalizedSeverity,
                details: details && typeof details === "object" ? details : {}
            }
        });
    } catch (_) {
        // silent on purpose to avoid recursive error loops
    }
}

function hasAuthorizedAccount() {
    return !!(accountUser && accountToken);
}

function openAccountGate(statusText = "") {
    showOnlyMenu("accountMenu");
    renderAuthState(statusText || "войдите в аккаунт, чтобы играть");
}

function requireAuthorizedAccount(statusText = "") {
    if (!AUTH_REQUIRED_FOR_PLAY) return true;
    if (hasAuthorizedAccount()) return true;
    openAccountGate(statusText || "войдите в аккаунт, чтобы начать игру");
    return false;
}

function setFriendsSearchResult(text) {
    setFriendsSearchResultByDom(text, (id) => document.getElementById(id));
}

function setFriendsTab(tab) {
    const normalized = tab === "possible" || tab === "requests" ? tab : "friends";
    friendsUiTab = normalized;
    const btnFriends = document.getElementById("friendsTabFriendsBtn");
    const btnPossible = document.getElementById("friendsTabPossibleBtn");
    const btnRequests = document.getElementById("friendsTabRequestsBtn");
    const paneFriends = document.getElementById("friendsTabFriends");
    const panePossible = document.getElementById("friendsTabPossible");
    const paneRequests = document.getElementById("friendsTabRequests");
    if (btnFriends) btnFriends.classList.toggle("active", normalized === "friends");
    if (btnPossible) btnPossible.classList.toggle("active", normalized === "possible");
    if (btnRequests) btnRequests.classList.toggle("active", normalized === "requests");
    if (paneFriends) paneFriends.classList.toggle("hidden", normalized !== "friends");
    if (panePossible) panePossible.classList.toggle("hidden", normalized !== "possible");
    if (paneRequests) paneRequests.classList.toggle("hidden", normalized !== "requests");
}

function refreshFriendsProfileCard() {
    const avatarEl = document.getElementById("friendsProfileAvatar");
    const nameEl = document.getElementById("friendsProfileName");
    const idEl = document.getElementById("friendsProfileIdValue");
    if (!avatarEl || !nameEl || !idEl) return;
    if (!accountUser) {
        avatarEl.innerText = "NS";
        nameEl.innerText = "Гость";
        idEl.innerText = "ID —";
        return;
    }
    const nickname = String(accountUser.nickname || accountUser.email || "Player").trim();
    const clean = nickname.replace(/[^a-zA-Zа-яА-Я0-9]/g, "");
    const initials = (clean.slice(0, 2) || "NS").toUpperCase();
    avatarEl.innerText = initials;
    nameEl.innerText = nickname;
    idEl.innerText = `ID ${Number(accountUser.id || 0)}`;
}

async function refreshFriendSuggestions() {
    if (!accountUser || !accountToken) {
        friendSuggestions = [];
        return;
    }
    try {
        const data = await apiRequest("leaderboard-players", { method: "GET" });
        const rows = Array.isArray(data?.players) ? data.players : [];
        const blockedIds = new Set([Number(accountUser.id || 0)]);
        for (const item of friendsState.friends) blockedIds.add(Number(item.id || item.userId || 0));
        for (const item of friendsState.incoming) blockedIds.add(Number(item.userId || item.id || 0));
        for (const item of friendsState.outgoing) blockedIds.add(Number(item.userId || item.id || 0));
        friendSuggestions = rows
            .filter((row) => !blockedIds.has(Number(row.userId || 0)))
            .slice(0, 24);
    } catch (_) {
        friendSuggestions = [];
    }
}

function renderFriendsSearchUser(user, relation, requestId = null) {
    const el = document.getElementById("friendsSearchResult");
    if (!el) return;
    const name = formatFriendName(user);
    el.innerText = `${name} (ID ${user?.id}) • ${relationToLabel(relation)}`;
    if (!accountUser || !accountToken) return;

    if (relation === "none" && user && Number(user.id) !== Number(accountUser.id)) {
        const btn = document.createElement("button");
        btn.style.marginTop = "8px";
        btn.innerText = "Отправить заявку";
        btn.addEventListener("click", async () => {
            try {
                await sendFriendRequest(user.id);
                await refreshFriendsState();
                setFriendsSearchResult(`${name} (ID ${user?.id}) • заявка отправлена.`);
            } catch (error) {
                const msg = error && error.code ? error.code : "ошибка заявки";
                setFriendsSearchResult(`Ошибка: ${msg}`);
                console.error(error);
            }
        });
        el.appendChild(document.createElement("br"));
        el.appendChild(btn);
        return;
    }

    if (relation === "pending_received" && requestId) {
        const btn = document.createElement("button");
        btn.style.marginTop = "8px";
        btn.innerText = "Принять заявку";
        btn.addEventListener("click", async () => {
            try {
                await apiRequest("friends-respond", {
                    method: "POST",
                    body: { requestId, action: "accept" }
                });
                await refreshFriendsState();
                setFriendsSearchResult(`${name} (ID ${user?.id}) • добавлен в друзья.`);
            } catch (error) {
                const msg = error && error.code ? error.code : "ошибка принятия";
                setFriendsSearchResult(`Ошибка: ${msg}`);
                console.error(error);
            }
        });
        el.appendChild(document.createElement("br"));
        el.appendChild(btn);
    }
}

async function refreshFriendsState() {
    if (!accountUser || !accountToken) {
        friendsState = { friends: [], incoming: [], outgoing: [] };
        friendSuggestions = [];
        refreshFriendsProfileCard();
        renderFriendsUI();
        return;
    }
    try {
        const data = await apiRequest("friends-list", { method: "GET" });
        friendsState = {
            friends: Array.isArray(data?.friends) ? data.friends : [],
            incoming: Array.isArray(data?.incoming) ? data.incoming : [],
            outgoing: Array.isArray(data?.outgoing) ? data.outgoing : []
        };
    } catch (error) {
        console.error(error);
        friendsState = { friends: [], incoming: [], outgoing: [] };
        friendSuggestions = [];
    }
    await refreshFriendSuggestions();
    refreshFriendsProfileCard();
    renderFriendsUI();
}

async function joinFriendRoom(roomCode) {
    const code = String(roomCode || "").trim().toUpperCase();
    if (!code) {
        setFriendsSearchResult("У друга нет активной комнаты.");
        return;
    }
    try {
        const data = await apiRequest("room-join", {
            method: "POST",
            body: { roomCode: code }
        });
        applyRoomState(data.room || null, { spectator: false });
        roomLastStartedChallengeId = roomState ? Number(roomState.challengeId || 0) : 0;
        startRoomPolling();
        setRoomStatus(`Вы вошли в комнату друга: ${code}`);
        setFriendsSearchResult(`Подключено к комнате ${code}.`);
    } catch (error) {
        const msg = error && error.code ? error.code : "ошибка входа в комнату";
        setFriendsSearchResult(`Ошибка: ${msg}`);
        console.error(error);
    }
}

function renderFriendsUI() {
    const incomingEl = document.getElementById("friendsIncomingList");
    const outgoingEl = document.getElementById("friendsOutgoingList");
    const friendsEl = document.getElementById("friendsList");
    const possibleEl = document.getElementById("friendsPossibleList");
    if (!incomingEl || !outgoingEl || !friendsEl || !possibleEl) return;
    setFriendsTab(friendsUiTab);

    if (!accountUser || !accountToken) {
        incomingEl.innerHTML = '<div class="friendsItem">Нужен вход в аккаунт.</div>';
        outgoingEl.innerHTML = '<div class="friendsItem">Нужен вход в аккаунт.</div>';
        friendsEl.innerHTML = '<div class="friendsItem">Нужен вход в аккаунт.</div>';
        possibleEl.innerHTML = '<div class="friendsItem">Нужен вход в аккаунт.</div>';
        return;
    }

    incomingEl.innerHTML = "";
    if (!friendsState.incoming.length) {
        incomingEl.innerHTML = '<div class="friendsItem">Нет входящих заявок.</div>';
    } else {
        for (const item of friendsState.incoming) {
            const div = document.createElement("div");
            div.className = "friendsItem";
            div.innerHTML = `<div class="clanEntryTitle">${escapeHtml(formatFriendName(item))}</div>
<div class="friendsMetaRow">ID ${Number(item.userId || 0)}</div>`;
            renderFriendsUserActionRow(div, [
                {
                    label: "Принять",
                    onClick: async () => {
                        try {
                            await apiRequest("friends-respond", {
                                method: "POST",
                                body: { requestId: item.requestId, action: "accept" }
                            });
                            await refreshFriendsState();
                            setFriendsSearchResult("Заявка принята.");
                        } catch (error) {
                            const msg = error && error.code ? error.code : "ошибка принятия";
                            setFriendsSearchResult(`Ошибка: ${msg}`);
                            console.error(error);
                        }
                    }
                },
                {
                    label: "Отклонить",
                    onClick: async () => {
                        try {
                            await apiRequest("friends-respond", {
                                method: "POST",
                                body: { requestId: item.requestId, action: "reject" }
                            });
                            await refreshFriendsState();
                            setFriendsSearchResult("Заявка отклонена.");
                        } catch (error) {
                            const msg = error && error.code ? error.code : "ошибка отклонения";
                            setFriendsSearchResult(`Ошибка: ${msg}`);
                            console.error(error);
                        }
                    }
                }
            ]);
            incomingEl.appendChild(div);
        }
    }

    outgoingEl.innerHTML = "";
    if (!friendsState.outgoing.length) {
        outgoingEl.innerHTML = '<div class="friendsItem">Нет исходящих заявок.</div>';
    } else {
        for (const item of friendsState.outgoing) {
            const div = document.createElement("div");
            div.className = "friendsItem";
            div.innerHTML = `<div class="clanEntryTitle">${escapeHtml(formatFriendName(item))}</div>
<div class="friendsMetaRow">ID ${Number(item.userId || 0)}</div>`;
            outgoingEl.appendChild(div);
        }
    }

    friendsEl.innerHTML = "";
    if (!friendsState.friends.length) {
        friendsEl.innerHTML = '<div class="friendsItem">Друзей пока нет.</div>';
    } else {
        for (const item of friendsState.friends) {
            const div = document.createElement("div");
            div.className = "friendsItem";
            const title = document.createElement("div");
            title.className = "clanEntryTitle";
            title.innerText = formatFriendName(item);
            const meta = document.createElement("div");
            meta.className = "clanEntryMeta";
            meta.innerHTML = `ID ${Number(item.id || 0)} • <span class="friendsTrophy">🏆 ${Number(item.trophies || 0)}</span> • ${escapeHtml(friendRoomMeta(item))}`;
            div.appendChild(title);
            div.appendChild(meta);
            renderFriendsUserActionRow(div, [
                {
                    label: "Войти в комнату",
                    disabled: !item.roomCode,
                    onClick: async () => {
                        await joinFriendRoom(item.roomCode || "");
                    }
                },
                {
                    label: "Копировать код",
                    disabled: !item.roomCode,
                    onClick: async () => {
                        if (!item.roomCode) {
                            setFriendsSearchResult("У друга нет активной комнаты.");
                            return;
                        }
                        const copied = await copyTextToClipboard(String(item.roomCode).toUpperCase());
                        setFriendsSearchResult(copied ? `Код комнаты ${item.roomCode} скопирован.` : "Не удалось скопировать код.");
                    }
                },
                {
                    label: "Открыть профиль",
                    onClick: async () => {
                        const input = document.getElementById("friendsSearchIdInput");
                        if (input) input.value = String(item.id);
                        try {
                            const data = await apiRequest(`friends-search?id=${encodeURIComponent(String(item.id))}`, { method: "GET" });
                            const relation = data?.relation?.state || "none";
                            const user = data?.user || null;
                            renderFriendsSearchUser(user, relation, data?.relation?.requestId || null);
                        } catch (error) {
                            const msg = error && error.code ? error.code : "ошибка профиля";
                            setFriendsSearchResult(`Ошибка: ${msg}`);
                        }
                    }
                },
                {
                    label: "Удалить",
                    onClick: async () => {
                        try {
                            await apiRequest("friends-remove", {
                                method: "POST",
                                body: { userId: item.id }
                            });
                            await refreshFriendsState();
                            setFriendsSearchResult("Друг удалён.");
                        } catch (error) {
                            const msg = error && error.code ? error.code : "ошибка удаления";
                            setFriendsSearchResult(`Ошибка: ${msg}`);
                            console.error(error);
                        }
                    }
                }
            ]);
            friendsEl.appendChild(div);
        }
    }

    possibleEl.innerHTML = "";
    if (!friendSuggestions.length) {
        possibleEl.innerHTML = '<div class="friendsItem">Нет рекомендаций. Используйте поиск по ID слева.</div>';
    } else {
        for (const row of friendSuggestions) {
            const targetId = Number(row.userId || 0);
            const name = String(row.name || `Игрок ${targetId}`);
            const item = document.createElement("div");
            item.className = "friendsItem";
            item.innerHTML = `<div class="clanEntryTitle">${escapeHtml(name)}</div>
<div class="friendsMetaRow">ID ${targetId} • <span class="friendsTrophy">🏆 ${Number(row.trophies || 0)}</span></div>`;
            renderFriendsUserActionRow(item, [
                {
                    label: "Предложить дружить",
                    onClick: async () => {
                        try {
                            await sendFriendRequest(targetId);
                            await refreshFriendsState();
                            setFriendsSearchResult(`Заявка отправлена игроку #${targetId}.`);
                            setFriendsTab("requests");
                        } catch (error) {
                            const msg = error && error.code ? error.code : "ошибка заявки";
                            setFriendsSearchResult(`Ошибка: ${msg}`);
                        }
                    }
                }
            ]);
            possibleEl.appendChild(item);
        }
    }
}

function saveBoxInventory() {
    localStorage.setItem(BOX_INVENTORY_KEY, JSON.stringify(boxInventory));
    scheduleCloudSync(0);
}

function setClanStatus(text) {
    const el = document.getElementById("clanStatusText");
    if (el) el.innerText = text || "";
}

function clanMemberName(member) {
    if (!member) return "Участник";
    return member.nickname || member.email || `ID ${member.userId || ""}`.trim();
}

function clanRoleLabel(role) {
    if (role === "owner") return "лидер";
    if (role === "officer") return "офицер";
    if (role === "recruiter") return "рекрутер";
    if (role === "treasurer") return "казначей";
    return "участник";
}

function formatShortTime(iso) {
    if (!iso) return "--:--";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "--:--";
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function escapeHtml(value) {
    const text = String(value == null ? "" : value);
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}

async function copyTextToClipboard(text) {
    const value = String(text || "");
    if (!value) return false;
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch (_) {}
    try {
        const tmp = document.createElement("textarea");
        tmp.value = value;
        tmp.setAttribute("readonly", "readonly");
        tmp.style.position = "absolute";
        tmp.style.left = "-9999px";
        document.body.appendChild(tmp);
        tmp.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(tmp);
        return !!ok;
    } catch (_) {
        return false;
    }
}

function buildClanInviteUrl(inviteCode) {
    const code = String(inviteCode || "").trim();
    if (!code) return "";
    try {
        return `${window.location.origin}${window.location.pathname}?clanInvite=${encodeURIComponent(code)}`;
    } catch (_) {
        return `?clanInvite=${encodeURIComponent(code)}`;
    }
}

function renderClanSearchList(clans = []) {
    const listEl = document.getElementById("clanSearchList");
    if (!listEl) return;
    if (!accountUser || !accountToken) {
        listEl.innerHTML = '<div class="friendsItem">Нужен вход в аккаунт.</div>';
        return;
    }
    if (!clans.length) {
        listEl.innerHTML = '<div class="friendsItem">Кланы не найдены.</div>';
        return;
    }
    listEl.innerHTML = "";
    for (const clan of clans) {
        const row = document.createElement("div");
        row.className = "friendsItem clanChatMessageRow";
        const title = document.createElement("div");
        title.className = "clanEntryTitle";
        title.innerText = `#${clan.id} ${clan.name || "Без названия"}`;
        const meta = document.createElement("div");
        meta.className = "clanEntryMeta";
        meta.innerText = `Участников: ${Number(clan.membersCount || 0)} • Трофеи: ${Number(clan.trophies || 0)} • Мин.вход: ${Number(clan.minTrophies || 0)} • Стиль: ${clan.styleTag || "any"}`;
        const joinBtn = document.createElement("button");
        joinBtn.innerText = "Вступить";
        joinBtn.addEventListener("click", async () => {
            try {
                await apiRequest("clan-join", { method: "POST", body: { clanId: clan.id } });
                await refreshClanState();
            } catch (error) {
                const msg = error && error.code ? error.code : "ошибка вступления";
                setClanStatus(`Ошибка: ${msg}`);
                console.error(error);
            }
        });
        const actions = document.createElement("div");
        actions.className = "clanInlineActions";
        actions.appendChild(joinBtn);
        row.appendChild(title);
        row.appendChild(meta);
        row.appendChild(actions);
        listEl.appendChild(row);
    }
}

function renderClanShop() {
    const line = document.getElementById("clanShopLine");
    const list = document.getElementById("clanShopList");
    if (!line || !list) return;
    if (!clanState.clan) {
        line.innerText = "";
        list.innerHTML = "";
        return;
    }
    const clan = clanState.clan;
    const canManageClan = !!clan?.permissions?.canManageClan;
    line.innerText = `Клановые коины: ${Number(clanShopState.clanCoins || clan.coins || 0)}`;
    const unlockMap = new Map((Array.isArray(clanShopState.unlocks) ? clanShopState.unlocks : []).map((x) => [x.itemId, x]));
    const offers = Array.isArray(clanShopState.offers) ? clanShopState.offers : [];
    if (!offers.length) {
        list.innerHTML = '<div class="friendsItem">Магазин пуст.</div>';
        return;
    }
    list.innerHTML = "";
    for (const offer of offers) {
        const row = document.createElement("div");
        row.className = "friendsItem clanTableRow clanLogRow";
        const unlocked = unlockMap.has(offer.id);
        const title = document.createElement("div");
        title.className = "clanEntryTitle";
        title.innerText = `${offer.title || "Предмет"} • ${Number(offer.cost || 0)} коинов`;
        const description = document.createElement("div");
        description.className = "clanEntryBody";
        description.innerText = offer.description || "Без описания.";
        const state = document.createElement("div");
        state.className = "clanEntryMeta";
        state.innerText = unlocked ? "Статус: уже куплено" : "Статус: доступно к покупке";
        row.appendChild(title);
        row.appendChild(description);
        row.appendChild(state);
        if (!unlocked) {
            const btn = document.createElement("button");
            btn.innerText = "Купить";
            btn.disabled = !canManageClan;
            btn.addEventListener("click", async () => {
                try {
                    await apiRequest("clan-shop-buy", {
                        method: "POST",
                        body: { itemId: offer.id }
                    });
                    await refreshClanShopState();
                    await refreshClanLogs();
                    setClanStatus(`Куплено: ${offer.title}`);
                } catch (error) {
                    const msg = error && error.code ? error.code : "ошибка покупки";
                    setClanStatus(`Ошибка: ${msg}`);
                    console.error(error);
                }
            });
            const actions = document.createElement("div");
            actions.className = "clanInlineActions";
            actions.appendChild(btn);
            row.appendChild(actions);
        }
        list.appendChild(row);
    }
}

function renderClanWar() {
    const line = document.getElementById("clanWarLine");
    if (!line) return;
    if (!clanState.clan) {
        line.innerText = "";
        return;
    }
    const activeWar = clanWarState.activeWar || clanState.clan.activeWar || null;
    if (activeWar && activeWar.status === "active") {
        const mineIsA = Number(activeWar.clanAId) === Number(clanState.clan.id);
        const myScore = mineIsA ? Number(activeWar.scoreA || 0) : Number(activeWar.scoreB || 0);
        const opScore = mineIsA ? Number(activeWar.scoreB || 0) : Number(activeWar.scoreA || 0);
        line.innerText = `Активная война #${activeWar.id}: ${myScore}:${opScore} (цель ${activeWar.targetScore})`;
        return;
    }
    const recent = Array.isArray(clanWarState.recentWars) ? clanWarState.recentWars : [];
    if (!recent.length) {
        line.innerText = "Активной войны нет.";
        return;
    }
    const latest = recent[0];
    const mineIsA = Number(latest.clanAId) === Number(clanState.clan.id);
    const myScore = mineIsA ? Number(latest.scoreA || 0) : Number(latest.scoreB || 0);
    const opScore = mineIsA ? Number(latest.scoreB || 0) : Number(latest.scoreA || 0);
    const outcome = Number(latest.winnerClanId || 0) === Number(clanState.clan.id) ? "победа" : (latest.winnerClanId ? "поражение" : "ничья");
    line.innerText = `Последняя война #${latest.id}: ${myScore}:${opScore} • ${outcome}`;
}

function renderClanChat() {
    const list = document.getElementById("clanChatList");
    if (!list) return;
    if (!clanState.clan) {
        list.innerHTML = "";
        return;
    }
    const messages = Array.isArray(clanChatMessages) ? clanChatMessages : [];
    if (!messages.length) {
        list.innerHTML = '<div class="friendsItem">Чат пуст.</div>';
        return;
    }
    list.innerHTML = "";
    for (const item of messages) {
        const row = document.createElement("div");
        row.className = "friendsItem";
        const nick = item.nickname || item.email || `ID ${item.userId || "?"}`;
        const head = document.createElement("div");
        head.className = "clanEntryMeta";
        head.innerText = `${formatShortTime(item.createdAt)} • ${nick}`;
        const body = document.createElement("div");
        body.className = "clanEntryBody";
        body.innerText = item.message || "";
        row.appendChild(head);
        row.appendChild(body);
        list.appendChild(row);
    }
}

function renderClanLogs() {
    const list = document.getElementById("clanLogsList");
    if (!list) return;
    if (!clanState.clan) {
        list.innerHTML = "";
        return;
    }
    const items = Array.isArray(clanLogs) ? clanLogs : [];
    if (!items.length) {
        list.innerHTML = '<div class="friendsItem">Логи пусты.</div>';
        return;
    }
    list.innerHTML = "";
    for (const item of items.slice(0, 40)) {
        const row = document.createElement("div");
        row.className = "friendsItem";
        const nick = item.nickname || item.email || (item.userId ? `ID ${item.userId}` : "system");
        const head = document.createElement("div");
        head.className = "clanEntryMeta";
        head.innerText = `${formatShortTime(item.createdAt)} • ${nick}`;
        const body = document.createElement("div");
        body.className = "clanEntryBody";
        body.innerText = item.eventType || "Событие";
        row.appendChild(head);
        row.appendChild(body);
        list.appendChild(row);
    }
}

function renderClanWeeklyTop() {
    const list = document.getElementById("clanWeeklyTopList");
    if (!list) return;
    const rows = Array.isArray(clanWeeklyTop) ? clanWeeklyTop : [];
    if (!rows.length) {
        list.innerHTML = '<div class="friendsItem">Пока нет данных за эту неделю.</div>';
        return;
    }
    list.innerHTML = "";
    for (const row of rows) {
        const item = document.createElement("div");
        item.className = "friendsItem clanTableRow clanTopRow";
        item.innerHTML = `<div class="clanEntryTitle">#${Number(row.rank || 0)} • ${escapeHtml(row.name || "Клан")}</div>
<div class="clanEntryMeta">ID: ${Number(row.clanId || 0)} • Побед за неделю: ${Number(row.weeklyWins || 0)}</div>`;
        list.appendChild(item);
    }
}

function renderClanWeeklyTasks() {
    const list = document.getElementById("clanWeeklyTasksList");
    if (!list) return;
    const clan = clanState?.clan;
    if (!clan) {
        list.innerHTML = "";
        return;
    }
    const tasks = Array.isArray(clan.weeklyTasks) ? clan.weeklyTasks : [];
    if (!tasks.length) {
        list.innerHTML = '<div class="friendsItem">Задания недели будут доступны после первой активности.</div>';
        return;
    }
    list.innerHTML = "";
    for (const task of tasks) {
        const row = document.createElement("div");
        row.className = "friendsItem clanTableRow clanTaskRow";
        const title = document.createElement("div");
        title.className = "clanEntryTitle";
        title.innerText = `${task.taskId}: ${Number(task.progress || 0)}/${Number(task.target || 0)}`;
        const meta = document.createElement("div");
        meta.className = "clanEntryMeta";
        meta.innerText = `Награда: ${Number(task.rewardCoins || 0)} коинов + ${Number(task.rewardXp || 0)} XP`;
        row.appendChild(title);
        row.appendChild(meta);
        const ready = Number(task.progress || 0) >= Number(task.target || 0) && !task.claimed;
        if (ready) {
            const actions = document.createElement("div");
            actions.className = "clanInlineActions";
            const claimBtn = document.createElement("button");
            claimBtn.innerText = "Забрать награду";
            claimBtn.disabled = !clan.permissions?.canManageClan;
            claimBtn.addEventListener("click", async () => {
                try {
                    await apiRequest("clan-weekly-task-claim", {
                        method: "POST",
                        body: { taskId: task.taskId }
                    });
                    await refreshClanState();
                    setClanStatus("Награда за недельное задание получена.");
                } catch (error) {
                    const msg = error && error.code ? error.code : "ошибка задания";
                    setClanStatus(`Ошибка: ${msg}`);
                }
            });
            actions.appendChild(claimBtn);
            row.appendChild(actions);
        }
        list.appendChild(row);
    }
}

function renderClanContributions() {
    const totalLine = document.getElementById("clanContributionTotalLine");
    const list = document.getElementById("clanContributionList");
    if (!totalLine || !list) return;
    const clan = clanState?.clan;
    if (!clan) {
        totalLine.innerText = "";
        list.innerHTML = "";
        return;
    }
    totalLine.innerText = `Всего внесено: ${Number(clan.totalContributions || 0)} коинов`;
    const rows = Array.isArray(clan.contributionLogs) ? clan.contributionLogs : [];
    if (!rows.length) {
        list.innerHTML = '<div class="friendsItem">Вкладов пока нет.</div>';
        return;
    }
    list.innerHTML = "";
    for (const row of rows.slice(0, 40)) {
        const item = document.createElement("div");
        item.className = "friendsItem clanTableRow clanContributionRow";
        const name = row.nickname || row.email || `ID ${row.userId || "?"}`;
        item.innerHTML = `<div class="clanEntryTitle">${escapeHtml(name)} • +${Number(row.amount || 0)} ${escapeHtml(row.resourceType || "coins")}</div>
<div class="clanEntryMeta">${formatShortTime(row.createdAt)}</div>`;
        list.appendChild(item);
    }
}

function renderClanReputation() {
    const list = document.getElementById("clanReputationList");
    if (!list) return;
    const clan = clanState?.clan;
    if (!clan) {
        list.innerHTML = "";
        return;
    }
    const rows = Array.isArray(clan.reputation) ? clan.reputation : [];
    if (!rows.length) {
        list.innerHTML = '<div class="friendsItem">Репутация появится после активности.</div>';
        return;
    }
    list.innerHTML = "";
    for (const row of rows.slice(0, 40)) {
        const item = document.createElement("div");
        item.className = "friendsItem clanTableRow clanReputationRow";
        const name = row.nickname || row.email || `ID ${row.userId || "?"}`;
        item.innerHTML = `<div class="clanEntryTitle">${escapeHtml(name)}</div>
<div class="clanEntryMeta">Активность: ${Number(row.activityScore || 0)} • Вклад: ${Number(row.contributionScore || 0)} • Дисциплина: ${Number(row.disciplineScore || 0)}</div>`;
        list.appendChild(item);
    }
}

function renderClanSeasonAndAchievements() {
    const achList = document.getElementById("clanAchievementsList");
    const historyList = document.getElementById("clanSeasonHistoryList");
    if (!achList || !historyList) return;
    const clan = clanState?.clan;
    if (!clan) {
        achList.innerHTML = "";
        historyList.innerHTML = "";
        return;
    }
    const achievements = Array.isArray(clan.achievements) ? clan.achievements : [];
    const history = Array.isArray(clan.seasonHistory) ? clan.seasonHistory : [];
    achList.innerHTML = achievements.length
        ? achievements.slice(0, 20).map((item) => `<div class="friendsItem clanTableRow clanAchievementRow"><div class="clanEntryTitle">${escapeHtml(item.achievementId)}</div><div class="clanEntryMeta">${escapeHtml(formatShortTime(item.unlockedAt))}</div></div>`).join("")
        : '<div class="friendsItem">Достижения пока не открыты.</div>';
    historyList.innerHTML = history.length
        ? history.slice(-20).map((item) => `<div class="friendsItem clanTableRow clanSeasonRow"><div class="clanEntryTitle">${escapeHtml(item.dayKey)}</div><div class="clanEntryMeta">Трофеи: ${Number(item.trophies || 0)}${item.weeklyRank ? ` • Недельный ранг: #${Number(item.weeklyRank)}` : ""}</div></div>`).join("")
        : '<div class="friendsItem">История сезона пустая.</div>';
}

function renderClanEvents() {
    const list = document.getElementById("clanEventsList");
    if (!list) return;
    const clan = clanState?.clan;
    if (!clan) {
        list.innerHTML = "";
        return;
    }
    const events = Array.isArray(clan.events) ? clan.events : [];
    if (!events.length) {
        list.innerHTML = '<div class="friendsItem">Событий пока нет.</div>';
        return;
    }
    list.innerHTML = "";
    for (const event of events.slice(0, 20)) {
        const row = document.createElement("div");
        row.className = "friendsItem clanTableRow clanEventRow";
        row.innerHTML = `<div class="clanEntryTitle">${escapeHtml(event.title || event.eventType)}</div>
<div class="clanEntryMeta">+${Number(event.bonusPct || 0)}% • ${formatShortTime(event.startsAt)}-${formatShortTime(event.endsAt)}</div>`;
        list.appendChild(row);
    }
}

function renderLeaderboard() {
    const listEl = document.getElementById("leaderboardList");
    const statusEl = document.getElementById("leaderboardStatus");
    const playersTabBtn = document.getElementById("leaderboardPlayersTabBtn");
    const weeklyTabBtn = document.getElementById("leaderboardWeeklyTabBtn");
    const clansTabBtn = document.getElementById("leaderboardClansTabBtn");
    if (!listEl || !statusEl || !playersTabBtn || !weeklyTabBtn || !clansTabBtn) return;

    const isPlayers = leaderboardState.activeTab === "players";
    const isWeekly = leaderboardState.activeTab === "weekly";
    const isClans = leaderboardState.activeTab === "clans";
    playersTabBtn.classList.toggle("active", isPlayers);
    weeklyTabBtn.classList.toggle("active", isWeekly);
    clansTabBtn.classList.toggle("active", isClans);

    const rows = isPlayers
        ? leaderboardState.players
        : (isWeekly ? leaderboardState.weeklyPlayers : leaderboardState.clans);
    if (!Array.isArray(rows) || !rows.length) {
        statusEl.innerText = "Список пока пуст.";
        listEl.innerHTML = "";
        return;
    }

    statusEl.innerText = isPlayers
        ? "Топ игроков по трофеям"
        : (isWeekly ? "Топ игроков недели (прирост трофеев)" : "Топ кланов по трофеям");
    listEl.className = "friendsList";
    listEl.innerHTML = "";
    for (const row of rows) {
        const div = document.createElement("div");
        div.className = "friendsItem";
        if (isPlayers) {
            div.innerHTML = `<div class="clanEntryTitle">#${Number(row.rank || 0)} • ${escapeHtml(row.name || "Игрок")}</div>
<div class="clanEntryMeta">ID: ${Number(row.userId || 0)} • Трофеи: ${Number(row.trophies || 0)}</div>`;
        } else if (isWeekly) {
            div.innerHTML = `<div class="clanEntryTitle">#${Number(row.rank || 0)} • ${escapeHtml(row.name || "Игрок")}</div>
<div class="clanEntryMeta">ID: ${Number(row.userId || 0)} • +${Number(row.weeklyGain || 0)} за неделю • Сейчас: ${Number(row.currentTrophies || 0)} • Победы: ${Number(row.wins || 0)}</div>`;
        } else {
            div.innerHTML = `<div class="clanEntryTitle">#${Number(row.rank || 0)} • ${escapeHtml(row.name || "Клан")}</div>
<div class="clanEntryMeta">ID клана: ${Number(row.clanId || 0)} • Трофеи: ${Number(row.trophies || 0)} • Участников: ${Number(row.membersCount || 0)}</div>`;
        }
        listEl.appendChild(div);
    }
}

async function refreshLeaderboardPlayers() {
    const statusEl = document.getElementById("leaderboardStatus");
    if (statusEl) statusEl.innerText = "Загрузка игроков...";
    const data = await apiRequest("leaderboard-players", { method: "GET" });
    leaderboardState.players = Array.isArray(data?.players) ? data.players : [];
}

async function refreshLeaderboardWeeklyPlayers() {
    const statusEl = document.getElementById("leaderboardStatus");
    if (statusEl) statusEl.innerText = "Загрузка недельного топа...";
    const data = await apiRequest("leaderboard-players-weekly", { method: "GET" });
    leaderboardState.weeklyPlayers = Array.isArray(data?.players) ? data.players : [];
}

async function refreshLeaderboardClans() {
    const statusEl = document.getElementById("leaderboardStatus");
    if (statusEl) statusEl.innerText = "Загрузка кланов...";
    const data = await apiRequest("leaderboard-clans", { method: "GET" });
    leaderboardState.clans = Array.isArray(data?.clans) ? data.clans : [];
}

async function refreshLeaderboard(force = false) {
    try {
        if (leaderboardState.activeTab === "players") {
            if (force || !leaderboardState.players.length) {
                await refreshLeaderboardPlayers();
            }
        } else if (leaderboardState.activeTab === "weekly") {
            if (force || !leaderboardState.weeklyPlayers.length) {
                await refreshLeaderboardWeeklyPlayers();
            }
        } else if (force || !leaderboardState.clans.length) {
            await refreshLeaderboardClans();
        }
        renderLeaderboard();
    } catch (error) {
        const statusEl = document.getElementById("leaderboardStatus");
        const msg = error && error.code ? error.code : "ошибка рейтинга";
        if (statusEl) statusEl.innerText = `Ошибка: ${msg}`;
        console.error(error);
    }
}

function setSeasonStatus(text) {
    const el = document.getElementById("seasonStatusText");
    if (el) el.innerText = text || "";
}

function seasonShopItemById(itemId) {
    const id = String(itemId || "");
    if (!id) return null;
    return SHOP_ITEMS.find((x) => x.id === id) || null;
}

function seasonSkinTitle(itemId) {
    const item = seasonShopItemById(itemId);
    return item ? item.title : String(itemId || "Season skin");
}

function getSeasonPassReward(level, lane = "free") {
    const safeLevel = Math.max(1, Math.floor(Number(level || 1)));
    if (lane === "premium") {
        if (safeLevel % 10 === 0) {
            const cosmeticPool = SHOP_ITEMS.map((item) => item.id);
            const idx = (Math.floor(safeLevel / 10) - 1) % cosmeticPool.length;
            const itemId = cosmeticPool[Math.max(0, idx)];
            return {
                kind: "cosmetic",
                amount: 1,
                itemId,
                title: seasonSkinTitle(itemId),
                description: "Косметика сезона"
            };
        }
        if (safeLevel % 4 === 0) {
            return {
                kind: "box",
                amount: 1,
                boxType: "rare",
                title: "Редкий ящик",
                description: "Награда премиума"
            };
        }
        return {
            kind: "coins",
            amount: 260 + safeLevel * 10,
            title: `${260 + safeLevel * 10} монет`,
            description: "Премиум награда"
        };
    }
    if (safeLevel % 5 === 0) {
        return {
            kind: "box",
            amount: 1,
            boxType: "common",
            title: "Обычный ящик",
            description: "Бесплатная награда"
        };
    }
    if (safeLevel % 3 === 0) {
        return {
            kind: "xp",
            amount: 180 + safeLevel * 8,
            title: `XP ${180 + safeLevel * 8}`,
            description: "Опыт пасса"
        };
    }
    return {
        kind: "coins",
        amount: 110 + safeLevel * 6,
        title: `${110 + safeLevel * 6} монет`,
        description: "Бесплатная награда"
    };
}

function normalizeSeasonPassState() {
    const safe = seasonPassState && typeof seasonPassState === "object" ? seasonPassState : {};
    const legacyClaimed = Array.isArray(safe.claimedTiers) ? safe.claimedTiers : [];
    const toNumArray = (arr) => Array.from(new Set((Array.isArray(arr) ? arr : []).map((x) => Math.floor(Number(x || 0))).filter((x) => x > 0)));
    return {
        seasonId: String(safe.seasonId || seasonState.id || getSeasonState().id),
        claimedFree: toNumArray(safe.claimedFree).concat(toNumArray(legacyClaimed.map((id) => Number(String(id).replace(/\D/g, ""))))),
        claimedPremium: toNumArray(safe.claimedPremium),
        premiumUnlocked: !!safe.premiumUnlocked,
        passXp: Math.max(0, Math.floor(Number(safe.passXp || 0))),
        claimedTiers: Array.isArray(safe.claimedTiers) ? safe.claimedTiers : []
    };
}

function saveSeasonPassState() {
    localStorage.setItem(SEASON_PASS_KEY, JSON.stringify(seasonPassState));
}

function computeSeasonPassProgress() {
    ensureSeasonPassState();
    const historyCount = Array.isArray(gameHistory) ? gameHistory.filter((x) => x && !x.imported).length : 0;
    const derivedXp = Math.max(
        0,
        Math.floor(Number(trophies || 0) * 6 + Number(snakeProgress?.level || 1) * 55 + historyCount * 22)
    );
    if (derivedXp > Number(seasonPassState.passXp || 0)) {
        seasonPassState.passXp = derivedXp;
        saveSeasonPassState();
    }
    const xp = Math.max(0, Math.floor(Number(seasonPassState.passXp || 0)));
    const level = Math.min(SEASON_PASS_LEVEL_CAP, Math.floor(xp / SEASON_PASS_XP_PER_LEVEL) + 1);
    const inLevelXp = xp % SEASON_PASS_XP_PER_LEVEL;
    return { xp, level, inLevelXp };
}

function isSeasonPassClaimed(level, lane = "free") {
    ensureSeasonPassState();
    const safeLevel = Math.max(1, Math.floor(Number(level || 1)));
    if (lane === "premium") {
        return Array.isArray(seasonPassState.claimedPremium) && seasonPassState.claimedPremium.includes(safeLevel);
    }
    return Array.isArray(seasonPassState.claimedFree) && seasonPassState.claimedFree.includes(safeLevel);
}

function markSeasonPassClaimed(level, lane = "free") {
    ensureSeasonPassState();
    const safeLevel = Math.max(1, Math.floor(Number(level || 1)));
    const key = lane === "premium" ? "claimedPremium" : "claimedFree";
    if (!Array.isArray(seasonPassState[key])) seasonPassState[key] = [];
    if (!seasonPassState[key].includes(safeLevel)) seasonPassState[key].push(safeLevel);
    saveSeasonPassState();
}

function applySeasonPassReward(reward) {
    if (!reward || typeof reward !== "object") return;
    if (reward.kind === "coins") {
        coins += Math.max(0, Math.floor(Number(reward.amount || 0)));
        localStorage.setItem("coins", String(coins));
        setHudCoinsValue(coins);
        updateMenuTrophies();
        return;
    }
    if (reward.kind === "xp") {
        seasonPassState.passXp = Math.max(0, Math.floor(Number(seasonPassState.passXp || 0) + Number(reward.amount || 0)));
        saveSeasonPassState();
        return;
    }
    if (reward.kind === "box") {
        const type = String(reward.boxType || "common");
        if (!["common", "rare", "super"].includes(type)) return;
        boxInventory[type] = Math.max(0, Math.floor(Number(boxInventory[type] || 0) + Number(reward.amount || 1)));
        saveBoxInventory();
        return;
    }
    if (reward.kind === "cosmetic" && reward.itemId) {
        const item = seasonShopItemById(reward.itemId);
        if (item) {
            unlockItem(item);
            renderShop();
        }
    }
}

function claimSeasonPassTier(level, lane = "free") {
    if (!featureFlags.seasonPass) {
        showRoomEventToast("Сезонный пасс отключён.");
        return;
    }
    const progress = computeSeasonPassProgress();
    const safeLevel = Math.max(1, Math.floor(Number(level || 1)));
    const isPremiumLane = lane === "premium";
    if (safeLevel > progress.level) {
        showRoomEventToast("Уровень пасса ещё не достигнут.");
        return;
    }
    if (isPremiumLane && !seasonPassState.premiumUnlocked) {
        showRoomEventToast("Сначала купите сезонный пасс.");
        return;
    }
    if (isSeasonPassClaimed(safeLevel, lane)) {
        showRoomEventToast("Награда уже получена.");
        return;
    }
    const reward = getSeasonPassReward(safeLevel, lane);
    applySeasonPassReward(reward);
    markSeasonPassClaimed(safeLevel, lane);
    scheduleCloudSync(0);
    renderSeasonHub();
    showRoomEventToast(`Получено: ${reward.title}`);
}

function buySeasonPass() {
    ensureSeasonPassState();
    if (!featureFlags.seasonPass) {
        showRoomEventToast("Сезонный пасс отключён.");
        return;
    }
    if (seasonPassState.premiumUnlocked) {
        showRoomEventToast("Сезонный пасс уже активен.");
        return;
    }
    if (coins < SEASON_PASS_BUY_COST_COINS) {
        showRoomEventToast(`Нужно ${SEASON_PASS_BUY_COST_COINS} монет.`);
        return;
    }
    coins -= SEASON_PASS_BUY_COST_COINS;
    localStorage.setItem("coins", String(coins));
    setHudCoinsValue(coins);
    updateMenuTrophies();
    seasonPassState.premiumUnlocked = true;
    saveSeasonPassState();
    scheduleCloudSync(0);
    renderSeasonHub();
    showRoomEventToast("Сезонный пасс куплен!");
}

function renderSeasonPassTrack(container, levelNow) {
    if (!container) return;
    const current = Math.max(1, Math.floor(Number(levelNow || 1)));
    const start = Math.max(1, current - 2);
    const end = Math.min(SEASON_PASS_LEVEL_CAP, start + 11);
    container.innerHTML = "";
    for (let level = start; level <= end; level++) {
        const premiumReward = getSeasonPassReward(level, "premium");
        const freeReward = getSeasonPassReward(level, "free");
        const premiumClaimed = isSeasonPassClaimed(level, "premium");
        const freeClaimed = isSeasonPassClaimed(level, "free");
        const unlocked = level <= current;
        const premiumLocked = !seasonPassState.premiumUnlocked;

        const tier = document.createElement("div");
        tier.className = "seasonPassTier";
        tier.innerHTML = `<div class="seasonPassTierHeader">${level}</div>`;

        const premiumLane = document.createElement("div");
        premiumLane.className = `seasonPassLane premium${premiumLocked || !unlocked ? " locked" : ""}${premiumClaimed ? " claimed" : ""}`;
        premiumLane.innerHTML = `<div class="seasonPassLaneLabel">Premium</div>
<div class="seasonPassLaneReward">${escapeHtml(premiumReward.title)}</div>
<div class="seasonPassLaneMeta">${escapeHtml(premiumReward.description)}</div>`;
        if (premiumClaimed) {
            premiumLane.insertAdjacentHTML("beforeend", "<div class=\"seasonPassLaneMeta\">Получено</div>");
        } else if (unlocked && !premiumLocked) {
            const btn = document.createElement("button");
            btn.innerText = "Забрать";
            btn.addEventListener("click", () => claimSeasonPassTier(level, "premium"));
            premiumLane.appendChild(btn);
        }

        const freeLane = document.createElement("div");
        freeLane.className = `seasonPassLane${!unlocked ? " locked" : ""}${freeClaimed ? " claimed" : ""}`;
        freeLane.innerHTML = `<div class="seasonPassLaneLabel">Free</div>
<div class="seasonPassLaneReward">${escapeHtml(freeReward.title)}</div>
<div class="seasonPassLaneMeta">${escapeHtml(freeReward.description)}</div>`;
        if (freeClaimed) {
            freeLane.insertAdjacentHTML("beforeend", "<div class=\"seasonPassLaneMeta\">Получено</div>");
        } else if (unlocked) {
            const btn = document.createElement("button");
            btn.innerText = "Забрать";
            btn.addEventListener("click", () => claimSeasonPassTier(level, "free"));
            freeLane.appendChild(btn);
        }

        tier.appendChild(premiumLane);
        tier.appendChild(freeLane);
        container.appendChild(tier);
    }
}

function normalizeTrophyRoadState() {
    const raw = trophyRoadState && typeof trophyRoadState === "object" ? trophyRoadState : {};
    const claimed = Array.isArray(raw.claimed) ? raw.claimed : [];
    return {
        claimed: Array.from(new Set(claimed.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)))
    };
}

function saveTrophyRoadState() {
    localStorage.setItem(TROPHY_ROAD_KEY, JSON.stringify(trophyRoadState));
}

function isTrophyRoadClaimed(trophyTarget) {
    return Array.isArray(trophyRoadState?.claimed) && trophyRoadState.claimed.includes(Number(trophyTarget || 0));
}

function trophyRoadRewardForTarget(target) {
    const value = Math.max(100, Math.floor(Number(target || 0)));
    const step = Math.floor(value / 100);
    if (step % 10 === 0) {
        const pool = SHOP_ITEMS.map((item) => item.id);
        const idx = Math.max(0, (Math.floor(step / 10) - 1) % Math.max(1, pool.length));
        const itemId = pool[idx];
        return {
            kind: "cosmetic",
            title: "Легендарная награда",
            detail: seasonSkinTitle(itemId),
            itemId
        };
    }
    if (step % 6 === 0) {
        return { kind: "box", title: "Трофейный ящик", detail: "Редкий ящик", boxType: "rare", amount: 1 };
    }
    if (step % 3 === 0) {
        return { kind: "box", title: "Трофейный ящик", detail: "Обычный ящик", boxType: "common", amount: 1 };
    }
    return {
        kind: "coins",
        title: "Монеты",
        detail: `${140 + step * 3}`,
        amount: 140 + step * 3
    };
}

function buildTrophyRoadMilestones() {
    const current = Math.max(0, Math.floor(Number(trophies || 0)));
    const start = Math.max(100, Math.floor((current - 500) / 100) * 100);
    const milestones = [];
    for (let i = 0; i < 12; i++) {
        const target = start + i * 100;
        milestones.push({
            target,
            reward: trophyRoadRewardForTarget(target),
            reached: current >= target,
            claimed: isTrophyRoadClaimed(target),
            current: current >= target && current < target + 100
        });
    }
    return milestones;
}

function applyTrophyRoadReward(reward) {
    if (!reward || typeof reward !== "object") return;
    if (reward.kind === "coins") {
        coins += Math.max(0, Math.floor(Number(reward.amount || 0)));
        localStorage.setItem("coins", String(coins));
        setHudCoinsValue(coins);
        updateMenuTrophies();
        return;
    }
    if (reward.kind === "box") {
        const boxType = String(reward.boxType || "common");
        if (!["common", "rare", "super"].includes(boxType)) return;
        boxInventory[boxType] = Math.max(0, Math.floor(Number(boxInventory[boxType] || 0) + Number(reward.amount || 1)));
        saveBoxInventory();
        return;
    }
    if (reward.kind === "cosmetic" && reward.itemId) {
        const item = seasonShopItemById(reward.itemId);
        if (item) {
            unlockItem(item);
            renderShop();
        }
    }
}

function claimTrophyRoadReward(target) {
    trophyRoadState = normalizeTrophyRoadState();
    const safeTarget = Math.max(1, Math.floor(Number(target || 0)));
    if (isTrophyRoadClaimed(safeTarget)) {
        showRoomEventToast("Эта награда уже получена.");
        return;
    }
    if (Number(trophies || 0) < safeTarget) {
        showRoomEventToast("Недостаточно трофеев для этой награды.");
        return;
    }
    const reward = trophyRoadRewardForTarget(safeTarget);
    applyTrophyRoadReward(reward);
    trophyRoadState.claimed.push(safeTarget);
    saveTrophyRoadState();
    scheduleCloudSync(0);
    renderTrophyRoad();
    showRoomEventToast(`Путь трофеев: ${reward.title} получено.`);
}

function renderTrophyRoad() {
    trophyRoadState = normalizeTrophyRoadState();
    const totalEl = document.getElementById("trophyRoadTotalLine");
    const boxEl = document.getElementById("trophyRoadBoxLine");
    const nextMajorEl = document.getElementById("trophyRoadNextMajorLine");
    const trackEl = document.getElementById("trophyRoadTrack");
    if (!totalEl || !boxEl || !nextMajorEl || !trackEl) return;

    const current = Math.max(0, Math.floor(Number(trophies || 0)));
    const milestones = buildTrophyRoadMilestones();
    const progressToBox = current % 100;
    const nextMajor = Math.ceil((current + 1) / 1000) * 1000;
    const nextMajorReward = trophyRoadRewardForTarget(nextMajor);

    totalEl.innerText = `🏆 ${current}`;
    boxEl.innerText = `Трофейный ящик: ${progressToBox}/100`;
    nextMajorEl.innerText = `Следующая крупная награда: ${nextMajor} • ${nextMajorReward.title}`;

    trackEl.innerHTML = "";
    for (const milestone of milestones) {
        const node = document.createElement("div");
        node.className = `trophyRoadNode${milestone.claimed ? " claimed" : ""}${milestone.reached ? "" : " locked"}${milestone.current ? " current" : ""}`;
        node.innerHTML = `<div class="trophyRoadRewardTitle">${escapeHtml(milestone.reward.title)}</div>
<div class="trophyRoadTrophies">${Number(milestone.target)}</div>
<div class="trophyRoadMeta">${escapeHtml(String(milestone.reward.detail || ""))}</div>`;
        if (milestone.claimed) {
            node.insertAdjacentHTML("beforeend", '<div class="trophyRoadDone">Получено</div>');
        } else if (milestone.reached) {
            const btn = document.createElement("button");
            btn.className = "trophyRoadClaimBtn";
            btn.innerText = "Забрать";
            btn.addEventListener("click", () => claimTrophyRoadReward(milestone.target));
            node.appendChild(btn);
        } else {
            node.insertAdjacentHTML("beforeend", `<div class="trophyRoadMeta">Нужно ещё ${Math.max(0, milestone.target - current)}</div>`);
        }
        trackEl.appendChild(node);
    }
}

function renderSeasonHub() {
    const currentLine = document.getElementById("seasonCurrentLine");
    const eventLine = document.getElementById("seasonEventLine");
    const skinsList = document.getElementById("seasonSkinsList");
    const topList = document.getElementById("seasonTopList");
    const rewardTiers = document.getElementById("seasonRewardTiers");
    const myRankLine = document.getElementById("seasonMyRankLine");
    const claimLine = document.getElementById("seasonClaimLine");
    const claimBtn = document.getElementById("seasonClaimBtn");
    const passSeasonLine = document.getElementById("seasonPassSeasonLine");
    const passXpLine = document.getElementById("seasonPassXpLine");
    const passXpFill = document.getElementById("seasonPassXpFill");
    const passLevelLine = document.getElementById("seasonPassLevelLine");
    const passCurrencyLine = document.getElementById("seasonPassCurrencyLine");
    const passStatusLine = document.getElementById("seasonPassStatusLine");
    const passTrack = document.getElementById("seasonPassTrack");
    const passBuyBtn = document.getElementById("seasonPassBuyBtn");
    if (!currentLine || !eventLine || !skinsList || !topList || !rewardTiers || !myRankLine || !claimLine || !claimBtn || !passSeasonLine || !passXpLine || !passXpFill || !passLevelLine || !passCurrencyLine || !passStatusLine || !passTrack || !passBuyBtn) return;

    ensureSeasonPassState();
    const passProgress = computeSeasonPassProgress();
    passSeasonLine.innerText = `Сезонный пасс • ${seasonState.id}`;
    passXpLine.innerText = `XP ${Number(passProgress.inLevelXp || 0)}/${SEASON_PASS_XP_PER_LEVEL}`;
    passXpFill.style.width = `${Math.max(0, Math.min(100, Math.round((Number(passProgress.inLevelXp || 0) / SEASON_PASS_XP_PER_LEVEL) * 100)))}%`;
    passLevelLine.innerText = `Ур. ${Number(passProgress.level || 1)}`;
    passCurrencyLine.innerText = `Монеты: ${Number(coins || 0)}`;
    if (!featureFlags.seasonPass) {
        passStatusLine.innerText = "Сезонный пасс выключен в настройках фич.";
        passBuyBtn.disabled = true;
        passBuyBtn.innerText = "Пасс отключён";
    } else {
        passStatusLine.innerText = seasonPassState.premiumUnlocked
            ? "Премиум трек активен."
            : `Премиум трек закрыт • цена ${SEASON_PASS_BUY_COST_COINS} монет.`;
        passBuyBtn.disabled = seasonPassState.premiumUnlocked;
        passBuyBtn.innerText = seasonPassState.premiumUnlocked ? "Пасс куплен" : "Купить пасс";
    }
    renderSeasonPassTrack(passTrack, passProgress.level);

    const season = seasonHubState.season;
    if (!season) {
        currentLine.innerText = "Сезон: -";
        eventLine.innerText = "Ивент: -";
        skinsList.innerHTML = '<div class="friendsItem">Сезонные скины загружаются...</div>';
        topList.innerHTML = '<div class="friendsItem">Топ-100 загружается...</div>';
        rewardTiers.innerHTML = "";
        myRankLine.innerText = "Ваш ранг: -";
        claimLine.innerText = "Награда прошлого сезона: -";
        claimBtn.disabled = true;
        return;
    }

    currentLine.innerText = `${season.title || "Season"} • ${season.key} • осталось ${Number(season.leftDays || 0)} дн.`;
    eventLine.innerText = `${season.eventTitle || "Event"}: ${season.eventDescription || "-"}`;

    if (seasonHubState.me && Number(seasonHubState.me.rank || 0) > 0) {
        myRankLine.innerText = `Ваш ранг: #${Number(seasonHubState.me.rank || 0)} • трофеи: ${Number(seasonHubState.me.trophies || 0)}`;
    } else {
        myRankLine.innerText = accountToken ? "Ваш ранг: пока вне сезонного топа." : "Войдите в аккаунт, чтобы увидеть ваш ранг.";
    }

    const previous = seasonHubState.previousSeasonReward;
    if (!previous) {
        claimLine.innerText = accountToken
            ? "Награда прошлого сезона: данные недоступны."
            : "Награда прошлого сезона: нужен вход в аккаунт.";
        claimBtn.disabled = !accountToken;
    } else if (previous.claimed) {
        const reward = previous.reward || {};
        const rewardSkinText = reward.skinId ? `, скин: ${seasonSkinTitle(reward.skinId)}` : "";
        claimLine.innerText = `Награда прошлого сезона уже получена (#${Number(previous.rank || 0)}): +${Number(reward.coins || 0)} монет${rewardSkinText}.`;
        claimBtn.disabled = true;
    } else if (previous.eligible) {
        const reward = previous.reward || {};
        const rewardSkinText = reward.skinId ? ` + ${seasonSkinTitle(reward.skinId)}` : "";
        claimLine.innerText = `Доступна награда за прошлый сезон (#${Number(previous.rank || 0)}): +${Number(reward.coins || 0)} монет${rewardSkinText}.`;
        claimBtn.disabled = !accountToken;
    } else {
        claimLine.innerText = "Прошлый сезон: вы не вошли в топ-100.";
        claimBtn.disabled = true;
    }

    const featuredSkins = Array.isArray(seasonHubState.featuredSkins) ? seasonHubState.featuredSkins : [];
    if (!featuredSkins.length) {
        skinsList.innerHTML = '<div class="friendsItem">Сезонные скины не заданы.</div>';
    } else {
        skinsList.innerHTML = "";
        for (const skin of featuredSkins) {
            const itemId = String(skin.itemId || "");
            const shopItem = seasonShopItemById(itemId);
            const row = document.createElement("div");
            row.className = "friendsItem";
            const owned = !!shopItem && isOwned(shopItem);
            row.innerHTML = `<div class="clanEntryTitle">${escapeHtml(seasonSkinTitle(itemId))}</div>
<div class="clanEntryMeta">${owned ? "Куплено" : "Сезонный предмет"}${shopItem ? ` • ${Number(shopItem.price || 0)} монет` : ""}</div>`;
            if (shopItem) {
                const action = document.createElement("button");
                action.innerText = "Предпросмотр";
                action.addEventListener("click", () => {
                    toggleShopPreview(shopItem);
                    showRoomEventToast(`Предпросмотр: ${shopItem.title}`);
                });
                row.appendChild(action);
            }
            skinsList.appendChild(row);
        }
    }

    const topPlayers = Array.isArray(seasonHubState.topPlayers) ? seasonHubState.topPlayers : [];
    if (!topPlayers.length) {
        topList.innerHTML = '<div class="friendsItem">Сезонный топ пока пуст.</div>';
    } else {
        topList.innerHTML = "";
        for (const row of topPlayers) {
            const div = document.createElement("div");
            div.className = "friendsItem";
            div.innerHTML = `<div class="clanEntryTitle">#${Number(row.rank || 0)} • ${escapeHtml(row.name || "Игрок")}</div>
<div class="clanEntryMeta">ID: ${Number(row.userId || 0)} • Трофеи: ${Number(row.trophies || 0)}</div>`;
            topList.appendChild(div);
        }
    }

    const tiers = Array.isArray(seasonHubState.rewardTiers) ? seasonHubState.rewardTiers : [];
    if (!tiers.length) {
        rewardTiers.innerHTML = '<div class="friendsItem">Награды недоступны.</div>';
    } else {
        rewardTiers.innerHTML = "";
        for (const tier of tiers) {
            const from = Number(tier.rankFrom || 0);
            const to = Number(tier.rankTo || 0);
            const range = from === to ? `#${from}` : `#${from}-${to}`;
            const skinText = tier.rewardSkinId ? seasonSkinTitle(tier.rewardSkinId) : "-";
            const row = document.createElement("div");
            row.className = "friendsItem";
            row.innerHTML = `<div class="clanEntryTitle">${escapeHtml(range)} • ${escapeHtml(tier.tierLabel || "Tier")}</div>
<div class="clanEntryMeta">Монеты: +${Number(tier.coins || 0)} • Скин: ${escapeHtml(skinText)}</div>`;
            rewardTiers.appendChild(row);
        }
    }
}

function applySeasonRewardPatch(patch, reward) {
    const rewardCoins = Number(reward?.coins || 0);
    if (patch && Number.isFinite(Number(patch.coins))) {
        coins = Math.max(0, Math.floor(Number(patch.coins)));
    } else if (Number.isFinite(rewardCoins) && rewardCoins > 0) {
        coins += Math.floor(rewardCoins);
    }

    const rewardSkinId = String(reward?.skinId || "").trim();
    const patchCosmetics = (patch && patch.cosmetics && typeof patch.cosmetics === "object" && !Array.isArray(patch.cosmetics))
        ? patch.cosmetics
        : null;

    if (patchCosmetics) {
        const unlockedRaw = Array.isArray(patchCosmetics.unlocked) ? patchCosmetics.unlocked : [];
        cosmetics = {
            ...defaultCosmetics,
            ...cosmetics,
            ...patchCosmetics,
            unlocked: Array.from(new Set(["classic", ...unlockedRaw]))
        };
    } else if (rewardSkinId) {
        if (!Array.isArray(cosmetics.unlocked)) cosmetics.unlocked = ["classic"];
        if (!cosmetics.unlocked.includes(rewardSkinId)) {
            cosmetics.unlocked.push(rewardSkinId);
        }
    }

    localStorage.setItem("coins", String(coins));
    setHudCoinsValue(coins);
    updateMenuTrophies();
    saveCosmetics();
    applyCosmetics();
    syncSkinInputs();
    renderShop();
    scheduleCloudSync(0);
}

async function refreshSeasonHub(force = false) {
    const staleMs = Date.now() - Number(seasonHubState.loadedAt || 0);
    if (!force && staleMs < 15000 && seasonHubState.season) {
        renderSeasonHub();
        return;
    }
    try {
        setSeasonStatus("Загрузка сезона...");
        const data = await apiRequest("season-state", { method: "GET" });
        seasonHubState = {
            season: data?.season || null,
            featuredSkins: Array.isArray(data?.featuredSkins) ? data.featuredSkins : [],
            topPlayers: Array.isArray(data?.topPlayers) ? data.topPlayers : [],
            rewardTiers: Array.isArray(data?.rewardTiers) ? data.rewardTiers : [],
            me: data?.me || null,
            previousSeasonReward: data?.previousSeasonReward || null,
            loadedAt: Date.now()
        };
        renderSeasonHub();
        setSeasonStatus("Сезон обновлен.");
        refreshReleaseSummaryUI();
    } catch (error) {
        renderSeasonHub();
        const msg = error && error.code ? error.code : "season_error";
        setSeasonStatus(`Ошибка сезона: ${msg}`);
        console.error(error);
    }
}

async function claimSeasonReward() {
    if (!accountToken || !accountUser) {
        setSeasonStatus("Войдите в аккаунт для получения награды.");
        return;
    }
    const claimBtn = document.getElementById("seasonClaimBtn");
    if (claimBtn) claimBtn.disabled = true;
    try {
        setSeasonStatus("Получаем награду...");
        const data = await apiRequest("season-claim-reward", { method: "POST" });
        applySeasonRewardPatch(data?.patch || null, data?.reward || null);
        await refreshSeasonHub(true);
        if (data?.alreadyClaimed) {
            setSeasonStatus("Награда прошлого сезона уже была получена.");
            return;
        }
        const reward = data?.reward || {};
        const skinText = reward.skinId ? ` + ${seasonSkinTitle(reward.skinId)}` : "";
        const coinsText = Number(reward.coins || 0);
        setSeasonStatus(`Награда получена: +${coinsText} монет${skinText}.`);
        showRoomEventToast(`Сезонная награда: +${coinsText} монет`);
    } catch (error) {
        const code = String(error && error.code ? error.code : "season_reward_error");
        if (code === "not_in_top_100") {
            setSeasonStatus("Вы не вошли в топ-100 прошлого сезона.");
        } else if (code === "reward_not_found") {
            setSeasonStatus("Награда для вашего места пока недоступна.");
        } else if (code === "invalid_token") {
            setSeasonStatus("Сессия истекла. Войдите снова.");
        } else {
            setSeasonStatus(`Ошибка получения награды: ${code}`);
        }
        console.error(error);
    } finally {
        renderSeasonHub();
    }
}

function startClanUiPolling() {
    if (clanUiPollTimer) return;
    clanUiPollTimer = setInterval(() => {
        const menu = document.getElementById("clanMenu");
        if (!menu || menu.classList.contains("hidden")) return;
        if (!clanState.clan || !accountUser || !accountToken) return;
        refreshClanState();
    }, 6000);
}

function stopClanUiPolling() {
    if (clanUiPollTimer) {
        clearInterval(clanUiPollTimer);
        clanUiPollTimer = 0;
    }
}

function syncClanMembersPanel() {
    const panel = document.getElementById("clanMembersPanel");
    const btn = document.getElementById("clanMembersToggleBtn");
    if (!panel || !btn) return;
    panel.classList.toggle("hidden", !clanMembersPanelOpen);
    btn.innerText = clanMembersPanelOpen ? "Скрыть участников клана" : "Показать участников клана";
}

function renderClanUI() {
    const noClanPanel = document.getElementById("clanNoClanPanel");
    const inPanel = document.getElementById("clanInPanel");
    const metaEl = document.getElementById("clanMetaLine");
    const levelEl = document.getElementById("clanLevelLine");
    const megaEl = document.getElementById("clanMegaLine");
    const inviteEl = document.getElementById("clanInviteLine");
    const ratingEl = document.getElementById("clanRatingLine");
    const streakEl = document.getElementById("clanStreakLine");
    const wallEl = document.getElementById("clanWallLine");
    const warOpponentInput = document.getElementById("clanWarOpponentIdInput");
    const membersEl = document.getElementById("clanMembersList");
    const membersToggleBtn = document.getElementById("clanMembersToggleBtn");
    const membersPanel = document.getElementById("clanMembersPanel");
    const claimBtn = document.getElementById("clanClaimMegaBtn");
    const rotateInviteBtn = document.getElementById("clanRotateInviteBtn");
    const warStartBtn = document.getElementById("clanWarStartBtn");
    const settingsSaveBtn = document.getElementById("clanSettingsSaveBtn");
    const settingsInputs = [
        document.getElementById("clanSloganInput"),
        document.getElementById("clanBannerInput"),
        document.getElementById("clanStyleInput"),
        document.getElementById("clanMinTrophiesInput"),
        document.getElementById("clanEmblemInput"),
        document.getElementById("clanColorInput"),
        document.getElementById("clanWallInput"),
        document.getElementById("clanRulesInput")
    ];
    if (!noClanPanel || !inPanel || !metaEl || !levelEl || !megaEl || !inviteEl || !ratingEl || !streakEl || !wallEl || !membersEl || !membersToggleBtn || !membersPanel || !claimBtn || !rotateInviteBtn || !warStartBtn || !settingsSaveBtn) return;

    if (!accountUser || !accountToken) {
        noClanPanel.classList.remove("hidden");
        inPanel.classList.add("hidden");
        stopClanUiPolling();
        clanMembersPanelOpen = false;
        syncClanMembersPanel();
        setClanStatus("Войдите в аккаунт для кланов.");
        return;
    }

    if (!clanState.clan) {
        noClanPanel.classList.remove("hidden");
        inPanel.classList.add("hidden");
        stopClanUiPolling();
        clanMembersPanelOpen = false;
        syncClanMembersPanel();
        setClanStatus("Вы не состоите в клане.");
        return;
    }

    noClanPanel.classList.add("hidden");
    inPanel.classList.remove("hidden");
    const clan = clanState.clan;
    const wins = Number(clan.wins || 0);
    const target = Number(clanState.targetWins || 300);
    const permissions = clan.permissions || {};
    const inviteUrl = buildClanInviteUrl(clan.inviteCode);
    metaEl.innerText = `#${clan.id} • ${clan.name} • роль: ${clanRoleLabel(clan.role)} • коины: ${Number(clan.coins || clanShopState.clanCoins || 0)} • трофеи: ${Number(clan.trophies || 0)}`;
    levelEl.innerText = `Уровень клана: ${Number(clan.level || 1)} • XP: ${Number(clan.inLevelXp || 0)}/${Number(clan.nextLevelXp || 0)} • Перки: +${Number(clan?.perks?.coinBonusPct || 0)}% коинов, +${Number(clan?.perks?.trophyBonusPct || 0)}% трофеев`;
    megaEl.innerText = `Мегакопилка ${clanState.monthKey}: ${wins}/${target} побед • ${clan.claimed ? "награда уже забрана" : (clan.canClaim ? "награда доступна" : "идет накопление")}`;
    inviteEl.innerHTML = "";
    const inviteCode = String(clan.inviteCode || "-");
    const codeSpan = document.createElement("span");
    codeSpan.innerText = `Инвайт-код: ${inviteCode}`;
    inviteEl.appendChild(codeSpan);
    if (inviteUrl) {
        inviteEl.appendChild(document.createTextNode(" • "));
        const linkSpan = document.createElement("span");
        linkSpan.className = "clanInviteLink";
        linkSpan.title = "Нажмите, чтобы скопировать ссылку";
        linkSpan.innerText = inviteUrl;
        linkSpan.addEventListener("click", async () => {
            const copied = await copyTextToClipboard(inviteUrl);
            setClanStatus(copied ? "Ссылка-приглашение скопирована." : "Не удалось скопировать ссылку.");
        });
        inviteEl.appendChild(linkSpan);
    }
    ratingEl.innerText = `Неделя: #${Number(clan.weeklyRank || 0)} • ${Number(clan.weeklyWins || 0)} побед | Рекорд дня: ${Number(clan.dayRecord || 0)} | Сегодня: ${Number(clan.todayWins || 0)}`;
    streakEl.innerText = `Серия побед: ${Number(clan.currentStreak || 0)} (лучший: ${Number(clan.bestStreak || 0)})`;
    wallEl.innerText = `Стенa: ${clan.wallMessage || clan.rulesText || "нет сообщения"}`;
    claimBtn.disabled = !clan.canClaim;
    rotateInviteBtn.disabled = !permissions.canManageClan;
    warStartBtn.disabled = !permissions.canManageClan;
    settingsSaveBtn.disabled = !permissions.canManageClan && !permissions.canManageWall;
    settingsInputs.forEach((el) => {
        if (!el) return;
        el.disabled = !permissions.canManageClan && !permissions.canManageWall;
    });
    const sloganInput = document.getElementById("clanSloganInput");
    const bannerInput = document.getElementById("clanBannerInput");
    const styleInput = document.getElementById("clanStyleInput");
    const minTrophiesInput = document.getElementById("clanMinTrophiesInput");
    const emblemInput = document.getElementById("clanEmblemInput");
    const colorInput = document.getElementById("clanColorInput");
    const wallInput = document.getElementById("clanWallInput");
    const rulesInput = document.getElementById("clanRulesInput");
    if (sloganInput && document.activeElement !== sloganInput) sloganInput.value = clan.slogan || "";
    if (bannerInput && document.activeElement !== bannerInput) bannerInput.value = clan.bannerText || "";
    if (styleInput && document.activeElement !== styleInput) styleInput.value = clan.styleTag || "";
    if (minTrophiesInput && document.activeElement !== minTrophiesInput) minTrophiesInput.value = String(Number(clan.minTrophies || 0));
    if (emblemInput && document.activeElement !== emblemInput) emblemInput.value = clan.emblem || "";
    if (colorInput && document.activeElement !== colorInput) colorInput.value = clan.color || "";
    if (wallInput && document.activeElement !== wallInput) wallInput.value = clan.wallMessage || "";
    if (rulesInput && document.activeElement !== rulesInput) rulesInput.value = clan.rulesText || "";
    if (warOpponentInput) warOpponentInput.disabled = !permissions.canManageClan;
    membersEl.innerHTML = "";
    syncClanMembersPanel();
    const members = Array.isArray(clan.members) ? clan.members : [];
    for (const member of members) {
        const row = document.createElement("div");
        row.className = "friendsItem clanTableRow clanMemberRow";
        const role = member.role === "owner" ? " [Лидер]" : ` [${clanRoleLabel(member.role)}]`;
        const title = document.createElement("div");
        title.className = "clanEntryTitle";
        title.innerText = `${clanMemberName(member)}${role}`;
        const meta = document.createElement("div");
        meta.className = "clanEntryMeta";
        meta.innerText = `ID: ${member.userId}`;
        row.appendChild(title);
        row.appendChild(meta);
        const actions = document.createElement("div");
        actions.className = "clanInlineActions";
        if (permissions.canManageRoles && member.role !== "owner" && Number(member.userId) !== Number(accountUser?.id)) {
            const roles = ["member", "officer", "recruiter", "treasurer"];
            for (const roleTarget of roles) {
                if (roleTarget === member.role) continue;
                const roleBtn = document.createElement("button");
                roleBtn.innerText = `Сделать ${clanRoleLabel(roleTarget)}`;
                roleBtn.addEventListener("click", async () => {
                    try {
                        await apiRequest("clan-role-set", {
                            method: "POST",
                            body: {
                                userId: member.userId,
                                role: roleTarget
                            }
                        });
                        await refreshClanState();
                    } catch (error) {
                        const msg = error && error.code ? error.code : "ошибка роли";
                        setClanStatus(`Ошибка: ${msg}`);
                        console.error(error);
                    }
                });
                actions.appendChild(roleBtn);
            }
        }
        if (permissions.canManageMembers && member.role !== "owner" && Number(member.userId) !== Number(accountUser?.id)) {
            const kickBtn = document.createElement("button");
            kickBtn.innerText = "Исключить";
            kickBtn.addEventListener("click", async () => {
                try {
                    await apiRequest("clan-kick", {
                        method: "POST",
                        body: { userId: member.userId }
                    });
                    await refreshClanState();
                } catch (error) {
                    const msg = error && error.code ? error.code : "ошибка исключения";
                    setClanStatus(`Ошибка: ${msg}`);
                    console.error(error);
                }
            });
            actions.appendChild(kickBtn);
        }
        if (actions.childElementCount > 0) {
            row.appendChild(actions);
        }
        membersEl.appendChild(row);
    }
    renderClanShop();
    renderClanWar();
    renderClanChat();
    renderClanLogs();
    renderClanWeeklyTop();
    renderClanWeeklyTasks();
    renderClanContributions();
    renderClanReputation();
    renderClanSeasonAndAchievements();
    renderClanEvents();
    renderPlayerProfileStats();
    startClanUiPolling();
    setClanStatus(clan.canClaim ? "Мегакопилка готова к выдаче!" : "Клан активен.");
}

async function refreshClanState() {
    if (!accountUser || !accountToken) {
        clanState = { clan: null, monthKey: "", targetWins: 300 };
        clanShopState = { clanCoins: 0, offers: [], unlocks: [] };
        clanWarState = { activeWar: null, recentWars: [] };
        clanChatMessages = [];
        clanLogs = [];
        clanWeeklyTop = [];
        stopClanUiPolling();
        renderClanUI();
        return;
    }
    try {
        const data = await apiRequest("clan-info", { method: "GET" });
        clanState = {
            clan: data?.clan || null,
            monthKey: data?.monthKey || "",
            targetWins: Number(data?.targetWins || 300)
        };
        if (clanState.clan) {
            clanWarState.activeWar = data?.clan?.activeWar || null;
        }
    } catch (error) {
        console.error(error);
        clanState = { clan: null, monthKey: "", targetWins: 300 };
        clanWeeklyTop = [];
        stopClanUiPolling();
        setClanStatus("Не удалось загрузить клан.");
    }
    renderClanUI();
    if (clanState.clan) {
        await Promise.all([
            refreshClanShopState(),
            refreshClanWarState(),
            refreshClanChat(),
            refreshClanLogs(),
            refreshClanWeeklyTop()
        ]);
        renderClanUI();
    }
}

async function refreshClanShopState() {
    if (!accountUser || !accountToken || !clanState.clan) return;
    try {
        const data = await apiRequest("clan-shop", { method: "GET" });
        clanShopState = {
            clanCoins: Number(data?.clanCoins || clanState.clan.coins || 0),
            offers: Array.isArray(data?.offers) ? data.offers : [],
            unlocks: Array.isArray(data?.unlocks) ? data.unlocks : []
        };
        if (clanState.clan) clanState.clan.coins = clanShopState.clanCoins;
    } catch (error) {
        console.error(error);
    }
    renderClanShop();
}

async function refreshClanWarState() {
    if (!accountUser || !accountToken || !clanState.clan) return;
    try {
        const data = await apiRequest("clan-war-state", { method: "GET" });
        clanWarState = {
            activeWar: data?.activeWar || null,
            recentWars: Array.isArray(data?.recentWars) ? data.recentWars : []
        };
    } catch (error) {
        console.error(error);
    }
    renderClanWar();
}

async function refreshClanChat() {
    if (!accountUser || !accountToken || !clanState.clan) return;
    try {
        const data = await apiRequest("clan-chat", { method: "GET" });
        clanChatMessages = Array.isArray(data?.messages) ? data.messages : [];
    } catch (error) {
        console.error(error);
    }
    renderClanChat();
}

async function refreshClanLogs() {
    const logsListEl = document.getElementById("clanLogsList");
    if (!logsListEl) return;
    if (!accountUser || !accountToken || !clanState.clan) return;
    try {
        const data = await apiRequest("clan-logs", { method: "GET" });
        clanLogs = Array.isArray(data?.logs) ? data.logs : [];
    } catch (error) {
        console.error(error);
    }
    renderClanLogs();
}

async function refreshClanWeeklyTop() {
    const list = document.getElementById("clanWeeklyTopList");
    if (!list) return;
    try {
        const data = await apiRequest("clan-weekly-top", { method: "GET" });
        clanWeeklyTop = Array.isArray(data?.weekTop) ? data.weekTop : [];
    } catch (error) {
        clanWeeklyTop = [];
        const msg = error && error.code ? error.code : "ошибка топа";
        setClanStatus(`Ошибка: ${msg}`);
        console.error(error);
    }
    renderClanWeeklyTop();
}

async function refreshClanList() {
    if (!accountUser || !accountToken) {
        renderClanSearchList([]);
        return;
    }
    const q = document.getElementById("clanSearchInput")?.value?.trim() || "";
    const style = document.getElementById("clanSearchStyleInput")?.value?.trim() || "any";
    const maxMinTrophies = Number.parseInt(document.getElementById("clanSearchMaxTrophiesInput")?.value || "0", 10) || 0;
    const myTrophies = Math.max(0, Number(trophies || 0));
    try {
        const data = await apiRequest(`clan-list?q=${encodeURIComponent(q)}&style=${encodeURIComponent(style)}&maxMinTrophies=${encodeURIComponent(String(maxMinTrophies))}&myTrophies=${encodeURIComponent(String(myTrophies))}`, { method: "GET" });
        renderClanSearchList(Array.isArray(data?.clans) ? data.clans : []);
    } catch (error) {
        console.error(error);
        renderClanSearchList([]);
        setClanStatus("Не удалось загрузить список кланов.");
    }
}

async function refreshClanRecommendations() {
    if (!accountUser || !accountToken) {
        renderClanSearchList([]);
        return;
    }
    const style = document.getElementById("clanSearchStyleInput")?.value?.trim() || "any";
    try {
        const data = await apiRequest(`clan-recommend?style=${encodeURIComponent(style)}`, { method: "GET" });
        renderClanSearchList(Array.isArray(data?.clans) ? data.clans : []);
        setClanStatus("Показаны рекомендованные кланы.");
    } catch (error) {
        const msg = error && error.code ? error.code : "ошибка автопоиска";
        setClanStatus(`Ошибка: ${msg}`);
        console.error(error);
    }
}

async function sendFriendRequest(targetUserId) {
    if (!accountUser || !accountToken) {
        setFriendsSearchResult("Сначала войдите в аккаунт.");
        return;
    }
    try {
        await apiRequest("friends-request", {
            method: "POST",
            body: { userId: targetUserId }
        });
        await refreshFriendsState();
        setFriendsSearchResult("Заявка отправлена.");
    } catch (error) {
        const msg = error && error.code ? error.code : "ошибка запроса";
        setFriendsSearchResult(`Ошибка: ${msg}`);
        console.error(error);
    }
}

function setAccountToken(token) {
    accountToken = token || "";
    if (accountToken) {
        localStorage.setItem(ACCOUNT_TOKEN_KEY, accountToken);
    } else {
        localStorage.removeItem(ACCOUNT_TOKEN_KEY);
    }
}

function logoutAccount(withMessage = true) {
    if (isBannedUser) return;
    if (cloudSyncTimer) {
        clearTimeout(cloudSyncTimer);
        cloudSyncTimer = 0;
    }
    if (cloudAutoSyncInterval) {
        clearInterval(cloudAutoSyncInterval);
        cloudAutoSyncInterval = 0;
    }
    lastKnownCloudUpdatedAtMs = 0;
    lastSyncedProgressJson = "";
    applyRoomState(null);
    stopRoomPolling();
    publicRooms = [];
    friendsState = { friends: [], incoming: [], outgoing: [] };
    clanState = { clan: null, monthKey: "", targetWins: 300 };
    clanShopState = { clanCoins: 0, offers: [], unlocks: [] };
    clanWarState = { activeWar: null, recentWars: [] };
    clanChatMessages = [];
    clanLogs = [];
    clanWeeklyTop = [];
    seasonHubState = {
        season: null,
        featuredSkins: [],
        topPlayers: [],
        rewardTiers: [],
        me: null,
        previousSeasonReward: null,
        loadedAt: 0
    };
    stopClanUiPolling();
    moderationConsoleState = { summary: null, events: [] };
    adminChatMessages = [];
    moderationOnlyCritical = false;
    moderationClientReportAt.clear();
    stopModerationPolling();
    setAccountToken("");
    accountUser = null;
    renderAuthState(withMessage ? "выход выполнен" : "");
    refreshRoomUI();
    renderFriendsUI();
    renderClanUI();
    if (AUTH_REQUIRED_FOR_PLAY) {
        openAccountGate("войдите в аккаунт, чтобы продолжить");
    }
}

async function loadCloudProgress() {
    if (!accountToken || !accountUser) return;
    const data = await apiRequest("progress-get");
    const cloud = data && data.progress && typeof data.progress === "object" ? data.progress : null;
    lastKnownCloudUpdatedAtMs = Math.max(lastKnownCloudUpdatedAtMs, parseUpdatedAtMs(data.updatedAt));
    if (progressHasMeaningfulData(cloud)) {
        applyImportedProgress(cloud);
        lastSyncedProgressJson = getProgressSnapshotJson();
        return;
    }
    await syncCloudProgressNow(true);
}

async function syncCloudProgressNow(silent = false) {
    if (!accountToken || !accountUser || cloudSyncInFlight) return;
    cloudSyncInFlight = true;
    try {
        const payload = getProgressSnapshot();
        const result = await apiRequest("progress-save", {
            method: "POST",
            body: { progress: payload }
        });
        lastKnownCloudUpdatedAtMs = Math.max(lastKnownCloudUpdatedAtMs, parseUpdatedAtMs(result.updatedAt));
        lastSyncedProgressJson = getProgressSnapshotJson();
        if (!silent) {
            renderAuthState("синхронизировано");
        }
    } catch (error) {
        if ((error && error.message === "invalid_token") || (error && error.message === "user_not_found")) {
            logoutAccount(false);
            return;
        }
        if (!silent) {
            renderAuthState("ошибка синхронизации");
        }
        console.error(error);
    } finally {
        cloudSyncInFlight = false;
    }
}

async function pullCloudIfRemoteIsNewer() {
    if (!accountToken || !accountUser || cloudSyncInFlight) return;
    const data = await apiRequest("progress-get");
    const remoteMs = parseUpdatedAtMs(data.updatedAt);
    if (remoteMs <= 0 || remoteMs <= lastKnownCloudUpdatedAtMs) return;

    const cloud = data && data.progress && typeof data.progress === "object" ? data.progress : null;
    if (!progressHasMeaningfulData(cloud)) {
        lastKnownCloudUpdatedAtMs = remoteMs;
        return;
    }

    applyImportedProgress(cloud);
    lastKnownCloudUpdatedAtMs = remoteMs;
    lastSyncedProgressJson = getProgressSnapshotJson();
    renderAuthState("получены изменения из облака");
}

function startAutoCloudSyncLoop() {
    if (cloudAutoSyncInterval) {
        clearInterval(cloudAutoSyncInterval);
    }
    cloudAutoSyncInterval = setInterval(async () => {
        if (!accountToken || !accountUser || cloudSyncInFlight) return;
        try {
            await pullCloudIfRemoteIsNewer();
            const currentJson = getProgressSnapshotJson();
            if (currentJson && currentJson !== lastSyncedProgressJson) {
                await syncCloudProgressNow(true);
            }
        } catch (error) {
            console.error(error);
        }
    }, 12000);
}

function scheduleCloudSync(delayMs = 600) {
    if (!accountToken || !accountUser) return;
    if (cloudSyncTimer) {
        clearTimeout(cloudSyncTimer);
    }
    cloudSyncTimer = setTimeout(() => {
        cloudSyncTimer = 0;
        const currentJson = getProgressSnapshotJson();
        if (currentJson && currentJson === lastSyncedProgressJson) return;
        syncCloudProgressNow();
    }, delayMs);
}

async function loginOrRegister(action) {
    if (isBannedUser) return;
    const identifier = document.getElementById("authEmail").value.trim();
    const email = String(identifier || "").toLowerCase();
    const password = document.getElementById("authPassword").value;
    const nickname = document.getElementById("authNickname").value.trim();
    if (!identifier || !password) {
        renderAuthState("введите email/ник и пароль");
        return;
    }
    if (action === "auth-register" && nickname.length < 3) {
        renderAuthState("ник минимум 3 символа");
        return;
    }
    try {
        renderAuthState(action === "auth-login" ? "вход..." : "регистрация...");
        const data = await apiRequest(action, {
            method: "POST",
            body: action === "auth-login"
                ? { identifier: email, password }
                : { email, password, nickname }
        });
        setAccountToken(data.token || "");
        accountUser = data.user || null;
        if (action === "auth-register") {
            grantRegistrationFoodSkin();
        }
        renderAuthState("загрузка прогресса...");
        await loadCloudProgress();
        await restoreCurrentRoomState(false);
        await refreshPublicRoomsList();
        await refreshFriendsState();
        await refreshClanState();
        await refreshSeasonHub(true);
        maybeClaimDailyLoginReward();
        await tryHandleFriendInviteUrl();
        renderAuthState(action === "auth-register" ? "онлайн • бесплатный скин выдан" : "онлайн");
        showOnlyMenu("mainMenu");
        startAutoCloudSyncLoop();
        maybeShowOnboarding();
    } catch (error) {
        if (error && error.code === "user_banned") {
            applyBanState(error.reason || error.detail || "");
            return;
        }
        const detail = error && error.detail ? String(error.detail) : "";
        renderAuthState(detail ? `ошибка: ${detail}` : "ошибка авторизации");
        console.error(error);
    }
}

function grantRegistrationFoodSkin() {
    const rewardSkinId = "food-plasma";
    if (!Array.isArray(cosmetics.unlocked)) {
        cosmetics.unlocked = ["classic"];
    }
    if (!cosmetics.unlocked.includes(rewardSkinId)) {
        cosmetics.unlocked.push(rewardSkinId);
    }
    if (cosmetics.foodType === "solar") {
        cosmetics.foodType = "plasma";
    }
    saveCosmetics();
    applyCosmetics();
    syncSkinInputs();
}

async function updateNickname() {
    if (!accountUser) return;
    const nickname = document.getElementById("authNicknameEdit").value.trim();
    if (nickname.length < 3) {
        renderAuthState("ник минимум 3 символа");
        return;
    }
    try {
        renderAuthState("обновление ника...");
        const data = await apiRequest("auth-update-nickname", {
            method: "POST",
            body: { nickname }
        });
        accountUser = data.user || accountUser;
        renderAuthState("ник обновлён");
    } catch (error) {
        const detail = error && error.detail ? String(error.detail) : "";
        renderAuthState(detail ? `ошибка: ${detail}` : "ошибка обновления ника");
        console.error(error);
    }
}


async function bootstrapAccount() {
    if (isBannedUser) return;
    if (!accountToken) {
        if (AUTH_REQUIRED_FOR_PLAY) {
            openAccountGate("войдите в аккаунт, чтобы начать игру");
        } else {
            renderAuthState();
        }
        refreshRoomUI();
        return;
    }
    try {
        const me = await apiRequest("auth-me");
        accountUser = me.user || null;
        renderAuthState("онлайн");
        showOnlyMenu("mainMenu");
        await restoreCurrentRoomState(false);
        await refreshPublicRoomsList();
        await refreshFriendsState();
        await refreshClanState();
        await loadCloudProgress();
        await refreshSeasonHub(true);
        await tryHandleFriendInviteUrl();
        startAutoCloudSyncLoop();
        maybeShowOnboarding();
    } catch (error) {
        if (error && error.code === "user_banned") {
            applyBanState(error.reason || error.detail || "");
            return;
        }
        console.error(error);
        logoutAccount(false);
        refreshRoomUI();
    }
}

function setRoomStatus(text) {
    const el = document.getElementById("roomStatusText");
    if (el) el.innerText = text || "";
}

async function startSpectatingRoom(roomCodeRaw) {
    const roomCode = String(roomCodeRaw || "").trim().toUpperCase();
    if (!roomCode) {
        setRoomStatus("Введите код комнаты для наблюдения.");
        return;
    }
    if (!accountUser || !accountToken) {
        setRoomStatus("Сначала войдите в аккаунт.");
        return;
    }
    try {
        const data = await apiRequest("room-spectate", {
            method: "POST",
            body: { roomCode }
        });
        applyRoomState(data.room || null, { spectator: true, suppressEvents: true });
        roomLastStartedChallengeId = roomState ? Number(roomState.challengeId || 0) : 0;
        startRoomPolling();
        setRoomStatus(`Режим наблюдения: ${roomCode}`);
    } catch (error) {
        const msg = error && error.code ? error.code : "ошибка наблюдения";
        setRoomStatus(`Ошибка: ${msg}`);
        console.error(error);
    }
}

function renderPublicRoomsList() {
    const listEl = document.getElementById("roomPublicList");
    if (!listEl) return;
    if (!accountUser || !accountToken) {
        listEl.innerHTML = '<div class="roomPublicItem">Нужен вход в аккаунт.</div>';
        return;
    }
    if (!publicRooms.length) {
        listEl.innerHTML = '<div class="roomPublicItem">Публичных комнат нет.</div>';
        return;
    }

    listEl.innerHTML = "";
    for (const room of publicRooms) {
        const div = document.createElement("div");
        div.className = "roomPublicItem";
        const info = document.createElement("div");
        const status = String(room.status || "waiting");
        info.innerText = `Код: ${room.roomCode}\nЛидер: ${room.leaderName}\nИгроки: ${room.playersCount}/${room.maxPlayers}\nЦель: ${room.targetScore} • Скорость: ${room.snakeSpeed}\nСтатус: ${status}`;
        info.style.whiteSpace = "pre-line";
        div.appendChild(info);

        const actions = document.createElement("div");
        actions.className = "roomPublicActions";

        const joinBtn = document.createElement("button");
        joinBtn.innerText = "Войти";
        joinBtn.disabled = status !== "waiting" || room.playersCount >= room.maxPlayers;
        joinBtn.addEventListener("click", async () => {
            try {
                const data = await apiRequest("room-join", {
                    method: "POST",
                    body: { roomCode: room.roomCode }
                });
                applyRoomState(data.room || null, { spectator: false });
                roomLastStartedChallengeId = roomState ? Number(roomState.challengeId || 0) : 0;
                startRoomPolling();
                setRoomStatus("Вы вошли в публичную комнату.");
            } catch (error) {
                const msg = error && error.code ? error.code : "ошибка входа";
                setRoomStatus(`Ошибка: ${msg}`);
                console.error(error);
            }
        });
        actions.appendChild(joinBtn);

        const spectateBtn = document.createElement("button");
        spectateBtn.innerText = "Наблюдать";
        spectateBtn.disabled = status === "waiting";
        spectateBtn.addEventListener("click", async () => {
            await startSpectatingRoom(room.roomCode);
        });
        actions.appendChild(spectateBtn);
        div.appendChild(actions);
        listEl.appendChild(div);
    }
}

async function refreshPublicRoomsList() {
    if (!accountUser || !accountToken) {
        publicRooms = [];
        renderPublicRoomsList();
        return;
    }
    try {
        const data = await apiRequest("room-public-list", { method: "GET" });
        publicRooms = Array.isArray(data?.rooms) ? data.rooms : [];
    } catch (error) {
        console.error(error);
        publicRooms = [];
    }
    renderPublicRoomsList();
}

function showRoomEventToast(text) {
    const el = document.getElementById("roomEventToast");
    if (!el) return;
    if (roomToastTimer) {
        clearTimeout(roomToastTimer);
        roomToastTimer = 0;
    }
    el.innerText = text;
    el.classList.add("show");
    roomToastTimer = setTimeout(() => {
        el.classList.remove("show");
        roomToastTimer = 0;
    }, 2200);
}

function inRoomChallengeSession() {
    return !!roomSession.active && !!roomSession.roomCode;
}

function getRoomConfiguredSpeed() {
    return getRoomConfiguredSpeedFromState(roomState, 320);
}

function stopRoomPolling() {
    if (roomPollTimer) {
        clearInterval(roomPollTimer);
        roomPollTimer = 0;
    }
}

function resetRoomSessionFlags() {
    roomScorePostTimer = 0;
    roomLastPostedScore = -1;
}

function refreshRoomUI() {
    const infoWrap = document.getElementById("roomInfoWrap");
    const playersEl = document.getElementById("roomPlayers");
    const leaderControls = document.getElementById("roomLeaderControls");
    const leaveMenuBtn = document.getElementById("roomLeaveMenuBtn");
    const targetInput = document.getElementById("roomTargetInput");
    const speedInput = document.getElementById("roomSpeedInput");
    const maxPlayersInput = document.getElementById("roomMaxPlayersInput");
    const publicInput = document.getElementById("roomPublicInput");
    const roomCodeInput = document.getElementById("roomCodeInput");
    const roomStartBtn = document.getElementById("roomStartBtn");
    const roomRematchBtn = document.getElementById("roomRematchMenuBtn");

    if (!accountUser || !accountToken) {
        if (infoWrap) infoWrap.classList.add("hidden");
        if (leaderControls) leaderControls.classList.add("hidden");
        if (playersEl) playersEl.innerHTML = "";
        setRoomStatus("Войдите в аккаунт, чтобы играть онлайн.");
        renderPublicRoomsList();
        return;
    }

    if (!roomState) {
        if (infoWrap) infoWrap.classList.add("hidden");
        if (leaderControls) leaderControls.classList.add("hidden");
        if (playersEl) playersEl.innerHTML = "";
        setRoomStatus("Создайте комнату или войдите по коду.");
        renderPublicRoomsList();
        return;
    }

    const players = Array.isArray(roomState.players) ? roomState.players : [];
    const me = players.find((p) => Number(p.userId) === Number(accountUser.id)) || null;
    const isMember = !!me;
    const isSpectator = !!roomSpectatorMode && !isMember;
    const occupancy = `${players.length}/${Math.max(2, Number(roomState.maxPlayers || 2))}`;
    const leader = players.find((p) => Number(p.userId) === Number(roomState.leaderUserId)) || null;
    const winner = players.find((p) => Number(p.userId) === Number(roomState.winnerUserId)) || null;
    const isLeader = !!me && !isSpectator && Number(roomState.leaderUserId) === Number(accountUser.id);

    if (infoWrap) infoWrap.classList.remove("hidden");
    if (leaderControls) leaderControls.classList.toggle("hidden", !isLeader);
    const activeEl = document.activeElement;
    if (targetInput && Number.isFinite(Number(roomState.targetScore)) && activeEl !== targetInput) {
        targetInput.value = String(roomState.targetScore);
    }
    if (speedInput && Number.isFinite(Number(roomState.snakeSpeed)) && activeEl !== speedInput) {
        speedInput.value = String(roomState.snakeSpeed);
    }
    if (maxPlayersInput && Number.isFinite(Number(roomState.maxPlayers)) && activeEl !== maxPlayersInput) {
        maxPlayersInput.value = String(roomState.maxPlayers);
    }
    if (publicInput && activeEl !== publicInput) {
        publicInput.checked = !!roomState.isPublic;
    }
    if (roomCodeInput && roomState.roomCode) {
        roomCodeInput.value = roomState.roomCode;
    }
    if (leaveMenuBtn) {
        leaveMenuBtn.innerText = isSpectator ? "Выйти из наблюдения" : "Выйти из комнаты";
    }

    if (playersEl) {
        playersEl.innerHTML = "";
        const header = document.createElement("div");
        header.className = "roomPlayerMeta";
        const modeLabel = isSpectator ? "наблюдение" : (isMember ? "участник" : "гость");
        header.innerText = `Комната: ${roomState.roomCode} • Участники: ${occupancy} • Цель: ${roomState.targetScore} • Скорость: ${roomState.snakeSpeed} • Тип: ${roomState.isPublic ? "публичная" : "приватная"} • Статус: ${roomState.status} • Режим: ${modeLabel}`;
        playersEl.appendChild(header);

        for (const p of players) {
            const row = document.createElement("div");
            row.className = "roomPlayer";
            const role = Number(p.userId) === Number(roomState.leaderUserId) ? " [Лидер]" : "";
            const finishMark = p.runFinished ? " (финиш)" : "";
            const left = document.createElement("button");
            left.type = "button";
            left.style.background = "transparent";
            left.style.border = "none";
            left.style.color = "#fff";
            left.style.textAlign = "left";
            left.style.padding = "0";
            left.style.cursor = "pointer";
            left.innerText = `${p.slot}. ${getPlayerDisplayName(p)} — ${p.score}${finishMark}${role}`;
            row.appendChild(left);

            if (Number(p.userId) !== Number(accountUser.id)) {
                const btn = document.createElement("button");
                btn.innerText = "Добавить в друзья";
                btn.style.flex = "0 0 auto";
                btn.classList.add("hidden");
                left.addEventListener("click", () => {
                    btn.classList.toggle("hidden");
                });
                btn.addEventListener("click", async () => {
                    await sendFriendRequest(p.userId);
                });
                row.appendChild(btn);
            }
            playersEl.appendChild(row);
        }
    }

    if (roomStartBtn) {
        roomStartBtn.disabled = !isLeader || players.length !== Number(roomState.maxPlayers || 2) || roomState.status === "active";
    }
    if (roomRematchBtn) {
        roomRematchBtn.disabled = !isLeader || roomState.status === "active";
    }

    if (roomState.status === "finished") {
        if (winner) {
            setRoomStatus(`${isSpectator ? "Наблюдение: " : ""}Челлендж завершен. Победил: ${getPlayerDisplayName(winner)}.`);
        } else {
            setRoomStatus(`${isSpectator ? "Наблюдение: " : ""}Челлендж завершен без победителя. Запустите новый.`);
        }
    } else if (roomState.status === "active") {
        if (isSpectator) {
            setRoomStatus(`Вы наблюдаете матч в комнате ${roomState.roomCode}. Цель: ${roomState.targetScore}.`);
        } else {
            setRoomStatus(`Челлендж идет. Цель: ${roomState.targetScore}.`);
        }
    } else {
        if (isSpectator) {
            setRoomStatus(`Режим наблюдения. Лобби комнаты ${roomState.roomCode}.`);
        } else {
            setRoomStatus(`Лидер: ${getPlayerDisplayName(leader)}. Ожидание старта.`);
        }
    }
    renderPublicRoomsList();
}

function applyRoomState(nextRoom, options = {}) {
    const suppressEvents = !!options.suppressEvents;
    const hasSpectatorOverride = Object.prototype.hasOwnProperty.call(options, "spectator");
    const prevRoom = roomState;
    roomState = nextRoom && typeof nextRoom === "object" ? nextRoom : null;
    if (hasSpectatorOverride) {
        roomSpectatorMode = !!options.spectator;
    }
    if (!roomState) {
        roomSpectatorMode = false;
        roomSession = { active: false, roomCode: "", challengeId: 0 };
        stopRoomPolling();
        roomPullInFlight = false;
        roomLastStartedChallengeId = 0;
        roomLastPostedScore = -1;
        roomLastDeathSeenAtMs = 0;
    } else if (accountUser && accountToken) {
        if (roomSpectatorMode) {
            roomSession = { active: false, roomCode: "", challengeId: 0 };
            resetRoomSessionFlags();
            const players = Array.isArray(roomState.players) ? roomState.players : [];
            const me = players.find((p) => Number(p.userId) === Number(accountUser.id)) || null;
            if (me) roomSpectatorMode = false;
        }
        startRoomPolling();
        const deathMs = parseIsoMs(roomState.lastDeathAt);
        if (!suppressEvents && deathMs > roomLastDeathSeenAtMs) {
            const players = Array.isArray(roomState.players) ? roomState.players : [];
            const dead = players.find((p) => Number(p.userId) === Number(roomState.lastDeathUserId)) || null;
            if (dead) {
                showRoomEventToast(`Выбыл: ${getPlayerDisplayName(dead)}`);
            }
        }
        roomLastDeathSeenAtMs = Math.max(roomLastDeathSeenAtMs, deathMs);
        if (!suppressEvents && prevRoom && prevRoom.status !== "finished" && roomState.status === "finished") {
            const text = getRoomWinnerText(roomState);
            if (text) showRoomEventToast(text);
        }
    }
    refreshRoomUI();
}

async function restoreCurrentRoomState(showStatus = false) {
    if (!accountUser || !accountToken) {
        applyRoomState(null);
        return null;
    }
    try {
        const data = await apiRequest("room-current", { method: "GET" });
        const nextRoom = data && data.room ? data.room : null;
        applyRoomState(nextRoom, { suppressEvents: true, spectator: false });
        if (showStatus) {
            if (nextRoom) {
                setRoomStatus(`Комната восстановлена: ${nextRoom.roomCode}`);
            } else {
                setRoomStatus("Вы не состоите в активной комнате.");
            }
        }
        return nextRoom;
    } catch (error) {
        console.error(error);
        if (showStatus) {
            setRoomStatus("Не удалось восстановить комнату.");
        }
        return null;
    }
}

function getRoomWinnerText(room) {
    return getRoomWinnerTextByState(room, accountUser ? accountUser.id : null);
}

async function sendRoomScore(scoreValue, isFinal = false) {
    if (!inRoomChallengeSession() || !roomState || !accountUser) return;
    const now = performance.now();
    if (!isFinal && roomScorePostTimer && now - roomScorePostTimer < 260) return;
    if (!isFinal && scoreValue <= roomLastPostedScore) return;

    roomScorePostTimer = now;
    roomLastPostedScore = Math.max(roomLastPostedScore, scoreValue);
    try {
        const data = await apiRequest("room-score", {
            method: "POST",
            body: {
                roomCode: roomSession.roomCode,
                score: scoreValue,
                isFinal
            }
        });
        if (data && data.room) {
            applyRoomState(data.room, { spectator: false });
            if (running && roomState && roomState.status === "finished") {
                gameOver();
            }
        }
    } catch (error) {
        console.error(error);
    }
}

async function pullRoomState(force = false) {
    if (!accountUser || !accountToken || !roomState || !roomState.roomCode) return;
    if (roomPullInFlight) return;
    roomPullInFlight = true;
    try {
        const spectatePart = roomSpectatorMode ? "&spectate=1" : "";
        const data = await apiRequest(`room-state?code=${encodeURIComponent(roomState.roomCode)}${spectatePart}`, {
            method: "GET"
        });
        if (!data || !data.room) return;

        const prevChallenge = roomState.challengeId || 0;
        const nextSpectator = !!data.spectator;
        applyRoomState(data.room, { spectator: nextSpectator });

        if (!roomSpectatorMode && !running && !isReplaying && roomState.status === "active") {
            if (force || roomState.challengeId !== roomLastStartedChallengeId || roomState.challengeId !== prevChallenge) {
                roomLastStartedChallengeId = roomState.challengeId;
                roomSession = {
                    active: true,
                    roomCode: roomState.roomCode,
                    challengeId: roomState.challengeId
                };
                resetRoomSessionFlags();
                document.getElementById("roomMenu").classList.add("hidden");
                startGame(false, true);
            }
        }

        if (roomState.status === "finished" && inRoomChallengeSession()) {
            const roomText = getRoomWinnerText(roomState);
            const roomResultEl = document.getElementById("roomResultText");
            if (roomResultEl) roomResultEl.innerText = roomText;
            if (running) {
                gameOver();
            }
        }
    } catch (error) {
        if (error && (error.code === "room_not_found" || error.code === "not_room_member" || error.code === "http_401")) {
            reportSuspiciousAction("room_state_poll", String(error.code || "room_error"), "medium", {
                roomCode: roomState && roomState.roomCode ? String(roomState.roomCode) : ""
            }, 30000);
            applyRoomState(null);
            if (error.code === "room_not_found") {
                setRoomStatus("Комната не найдена. Создайте новую или введите другой код.");
            } else if (error.code === "not_room_member") {
                setRoomStatus("Вы больше не участник комнаты.");
            } else {
                setRoomStatus("Сессия комнаты истекла. Войдите снова.");
            }
            return;
        }
        console.error(error);
    } finally {
        roomPullInFlight = false;
    }
}

function startRoomPolling() {
    if (!roomState || !roomState.roomCode || !accountUser || roomPollTimer) return;
    roomPollTimer = setInterval(() => {
        pullRoomState(false).catch(() => {});
    }, 1000);
}

function updateGameOverRoomControls() {
    const roomResultEl = document.getElementById("roomResultText");
    const restartBtn = document.getElementById("restartBtn");
    const roomRematchBtn = document.getElementById("roomRematchBtn");
    const roomLeaveBtn = document.getElementById("roomLeaveBtn");
    const menuBtn = document.getElementById("menuBtn");
    if (!restartBtn || !roomRematchBtn || !roomLeaveBtn || !menuBtn) return;

    if (!inRoomChallengeSession()) {
        if (roomResultEl) roomResultEl.innerText = "";
        restartBtn.classList.remove("hidden");
        restartBtn.innerText = "Рестарт";
        roomRematchBtn.classList.add("hidden");
        roomLeaveBtn.classList.add("hidden");
        menuBtn.innerText = "Главное меню";
        return;
    }

    const isFinished = !!roomState && roomState.status === "finished";
    const isLeader = !!accountUser && Number(roomState?.leaderUserId) === Number(accountUser.id);
    restartBtn.classList.toggle("hidden", isFinished);
    restartBtn.innerText = "Ещё попытка";
    roomRematchBtn.classList.toggle("hidden", !isFinished || !isLeader);
    roomLeaveBtn.classList.remove("hidden");
    menuBtn.innerText = "В комнату";
    if (roomResultEl) {
        if (isFinished) {
            roomResultEl.innerText = getRoomWinnerText(roomState) || "Матч комнаты завершён.";
        } else {
            const target = roomState && Number.isFinite(Number(roomState.targetScore))
                ? Number(roomState.targetScore)
                : 20;
            roomResultEl.innerText = `Челлендж продолжается. Цель: ${target}.`;
        }
    }
}

function stopTrophyAnimation() {
    if (trophyAnimationStartTimeout) {
        clearTimeout(trophyAnimationStartTimeout);
        trophyAnimationStartTimeout = 0;
    }
    if (trophyAnimationFrame) {
        cancelAnimationFrame(trophyAnimationFrame);
        trophyAnimationFrame = 0;
    }
    setTrophyPopState(true, false);
    setTrophyPopState(false, false);
}

function setHudTrophiesValue(value) {
    const el = document.getElementById("trophyCount");
    if (el) el.innerText = String(value);
}

function setHudCoinsValue(value) {
    const el = document.getElementById("coinCount");
    if (el) el.innerText = String(value);
}

function setTrophyPopState(isMobile, active){
    const targetId = isMobile ? "gameOverTrophiesValue" : "trophyCount";
    const el = document.getElementById(targetId);
    if (!el) return;
    el.classList.toggle("trophy-pop", !!active);
}

function setGameOverTrophiesValue(value, delta) {
    const valueEl = document.getElementById("gameOverTrophiesValue");
    const deltaEl = document.getElementById("gameOverTrophiesDelta");
    if (valueEl) valueEl.innerText = String(value);
    if (!deltaEl) return;

    const signed = Number.isFinite(delta) ? Math.trunc(delta) : 0;
    if (signed > 0) {
        deltaEl.innerText = `(+${signed})`;
        deltaEl.classList.add("pos");
        deltaEl.classList.remove("neg");
        return;
    }
    if (signed < 0) {
        deltaEl.innerText = `(${signed})`;
        deltaEl.classList.add("neg");
        deltaEl.classList.remove("pos");
        return;
    }
    deltaEl.innerText = "(0)";
    deltaEl.classList.remove("pos", "neg");
}

function animateTrophiesAfterGame(beforeValue, deltaValue) {
    stopTrophyAnimation();

    const from = Math.max(0, Math.floor(beforeValue));
    const to = Math.max(0, Math.floor(beforeValue + deltaValue));
    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    const deltaAbs = Math.abs(to - from);
    let duration;
    if (to > from && deltaAbs > 20) {
        // Большой прирост трофеев анимируем заметно медленнее.
        duration = 1200 + Math.min(3800, (deltaAbs - 20) * 55);
    } else {
        duration = 650 + Math.min(1100, deltaAbs * 30);
    }
    setGameOverTrophiesValue(from, deltaValue);
    if (!isMobile) {
        setHudTrophiesValue(from);
    }

    trophyAnimationStartTimeout = setTimeout(() => {
        trophyAnimationStartTimeout = 0;
        setTrophyPopState(isMobile, true);
        const animStart = performance.now();

        const step = (ts) => {
            const t = Math.min(1, (ts - animStart) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            const raw = from + (to - from) * eased;
            const shown = to >= from ? Math.floor(raw) : Math.ceil(raw);

            setGameOverTrophiesValue(shown, deltaValue);
            if (!isMobile) {
                setHudTrophiesValue(shown);
            }

            if (t < 1) {
                trophyAnimationFrame = requestAnimationFrame(step);
                return;
            }

            setGameOverTrophiesValue(to, deltaValue);
            setHudTrophiesValue(to);
            setTrophyPopState(isMobile, false);
            trophyAnimationFrame = 0;
        };

        trophyAnimationFrame = requestAnimationFrame(step);
    }, 2000);
}

function isRankedSession() {
    return !aiMode && !isReplaying && !sessionUsedAI && !sessionNoRewards;
}

function isRecordEligibleSession() {
    return !aiMode && !isReplaying && !sessionNoRewards;
}

function mutationRemainingMs(now = performance.now()) {
    if (!activeMutation) return 0;
    return Math.max(0, activeMutation.until - now);
}

function isMutationActive(id, now = performance.now()) {
    return !!activeMutation && activeMutation.id === id && mutationRemainingMs(now) > 0;
}

function clearMutation() {
    activeMutation = null;
    const el = document.getElementById("mutationDisplay");
    if (el) el.innerText = "-";
}

function updateMutationUI(now = performance.now()) {
    const el = document.getElementById("mutationDisplay");
    if (!el) return;
    if (!activeMutation) {
        el.innerText = "-";
        return;
    }
    const leftSec = Math.ceil(mutationRemainingMs(now) / 1000);
    if (leftSec <= 0) {
        clearMutation();
        return;
    }
    el.innerText = `${activeMutation.name} ${leftSec}s`;
}

function activateMutation(mutationId, durationMsOverride = null) {
    const base = MUTATIONS.find((m) => m.id === mutationId);
    if (!base) return;
    const durationMs = Number.isFinite(durationMsOverride) ? durationMsOverride : base.durationMs;
    activeMutation = {
        id: base.id,
        name: base.name,
        until: performance.now() + durationMs
    };
    updateMutationUI();
}

function maybeTriggerMutation() {
    if (!isRankedSession()) return;
    if (Math.random() > 0.22) return;

    const next = MUTATIONS[Math.floor(Math.random() * MUTATIONS.length)];
    activateMutation(next.id, next.durationMs);
}

function syncMenuOverlayState() {
    const visible = computeIsAnyMenuVisible((id) => document.getElementById(id));
    document.body.classList.toggle("menu-active", visible);
}

function setMainMenuGroup(mode){
    const _ = mode;
    return _;
}

function closeMainMenuGroups(){
    return;
}

function showOnlyMenu(menuId) {
    showOnlyMenuDom(menuId, {
        overlayMenuIds: OVERLAY_MENU_IDS,
        getElementById: (id) => document.getElementById(id),
        onMenuShown: (shownMenuId, getElementById) => {
            const clanMembersPanel = getElementById("clanMembersPanel");
            if (clanMembersPanel && shownMenuId !== "clanMenu") {
                clanMembersPanel.classList.add("hidden");
                clanMembersPanelOpen = false;
            }
            if (shownMenuId === "mainMenu") {
                closeMainMenuGroups();
            }
            if (shownMenuId !== "moderationMenu") {
                stopModerationPolling();
            }
            syncMenuOverlayState();
        }
    });
}

function applyMobilePerformanceProfile() {
    const profile = buildPerformanceProfile({
        mobile: detectMobileViewport(),
        reducedMotion: detectPrefersReducedMotion(),
        cores: Number(navigator.hardwareConcurrency || 8),
        memoryGb: Number(navigator.deviceMemory || 8),
        saveData: !!navigator.connection?.saveData
    });
    mobileOptimized = profile.mobileOptimized;
    lowPowerMobile = profile.lowPowerMobile;
    reducedFxMode = profile.reducedFxMode;
    FIXED_STEP = profile.fixedStep;
    ctx.imageSmoothingEnabled = profile.imageSmoothingEnabled;
    document.body.classList.toggle("mobile-optimized", mobileOptimized);
}

function perfShadow(value) {
    return calcPerfShadow(value, mobileOptimized, lowPowerMobile);
}

function perfParticleCount(baseCount) {
    return calcPerfParticleCount(baseCount, mobileOptimized, lowPowerMobile);
}

function trailDrawStride() {
    return calcTrailDrawStride(snake?.length || 0, mobileOptimized, lowPowerMobile);
}

function updateResponsiveScale() {
    const scale = computeResponsiveScale(
        window.innerWidth || document.documentElement.clientWidth || 0,
        window.innerHeight || document.documentElement.clientHeight || 0
    );
    document.documentElement.style.setProperty("--ui-scale", scale.uiScale.toFixed(3));
    document.body.classList.toggle("extreme-compact", scale.extremeCompact);
    applyMobilePerformanceProfile();
}

function saveCosmetics() {
    localStorage.setItem("cosmetics", JSON.stringify(cosmetics));
}

function saveSnakeProgress() {
    localStorage.setItem("snakeProgress", JSON.stringify(snakeProgress));
}

function buildDailyChallenges() {
    const storageKey = "dailyChallenges";
    const key = todayKey();
    const raw = localStorage.getItem(storageKey);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed.dateKey === key && Array.isArray(parsed.tasks) && parsed.tasks.length) {
                return parsed;
            }
        } catch (e) {
            // generate new below
        }
    }
    const generated = generateDailyChallenges(key);

    localStorage.setItem(storageKey, JSON.stringify(generated));
    return generated;
}

function saveDailyChallenges() {
    localStorage.setItem("dailyChallenges", JSON.stringify(dailyChallenges));
}

function refreshChallengeUI() {
    const taskA = dailyChallenges.tasks[0];
    const taskB = dailyChallenges.tasks[1];
    const a = document.getElementById("dailyChallengeA");
    const b = document.getElementById("dailyChallengeB");
    if (a && taskA) {
        a.innerText = `${formatDailyChallengeLine(taskA)}${taskA.done ? " [DONE]" : ""}`;
    }
    if (b && taskB) {
        b.innerText = `${formatDailyChallengeLine(taskB)}${taskB.done ? " [DONE]" : ""}`;
    }
    refreshWeeklyChallengeUI();
    refreshFriendMissionUI();
    refreshQuestHub();
    refreshReleaseSummaryUI();
    updateQualityStatusUI();
}

function formatQuestCountdown(ms) {
    const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (d > 0) return `${d}д ${h}ч`;
    if (h > 0) return `${h}ч ${m}м`;
    return `${m}м`;
}

function nowToTomorrowMs() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    return next.getTime() - now.getTime();
}

function megaQuestProgress() {
    ensureWeeklyChallenge();
    if (!weeklyChallenge) {
        return {
            title: "Мега-квест",
            progress: 0,
            target: 1,
            rewardText: "1500 XP + 60",
            done: false,
            passOnly: false,
            meta: "Недоступно"
        };
    }
    const multiplier = 5;
    const progress = Math.max(0, Number(weeklyChallenge.progress || 0));
    const target = Math.max(1, Number(weeklyChallenge.target || 1) * multiplier);
    const rewardCoins = Math.max(60, Number(weeklyChallenge.reward || 0) * 3);
    return {
        title: weeklyChallenge.title || "Мега-квест",
        progress,
        target,
        rewardText: `XP 1500 + ${rewardCoins} монет`,
        done: progress >= target,
        passOnly: !featureFlags.seasonPass,
        meta: weeklyChallenge.type === "survive" ? "Тип: выживание" : "Тип: прогресс"
    };
}

function renderQuestCard(targetEl, data, options = {}) {
    if (!targetEl || !data) return;
    const progressValue = Math.max(0, Number(data.progress || 0));
    const targetValue = Math.max(1, Number(data.target || 1));
    const pct = Math.min(100, Math.round((progressValue / targetValue) * 100));
    const done = !!data.done || progressValue >= targetValue;
    const cardClass = `questCard${data.passOnly ? " passOnly" : ""}`;
    const tag = options.tag ? `<div class="questTag">${escapeHtml(options.tag)}</div>` : "";
    targetEl.innerHTML = `<div class="${cardClass}">
<div>
<div class="questTop">${tag}<div class="questReward">${escapeHtml(String(data.rewardText || ""))}</div></div>
<div class="questTitle">${escapeHtml(String(data.title || "Квест"))}</div>
<div class="questMeta">${escapeHtml(String(data.meta || ""))}</div>
</div>
<div>
<div class="questProgressTrack"><div class="questProgressFill" style="width:${pct}%;"></div></div>
<div class="questProgressText">${Math.floor(progressValue)}/${Math.floor(targetValue)}</div>
${done ? '<div class="questDone">ГОТОВО</div>' : ""}
</div>
</div>`;
}

function renderQuestCardsList(listEl, items, tagPrefix = "") {
    if (!listEl) return;
    if (!Array.isArray(items) || !items.length) {
        listEl.innerHTML = '<div class="questCard"><div class="questTitle">Нет доступных квестов</div></div>';
        return;
    }
    listEl.innerHTML = "";
    for (const item of items) {
        const wrap = document.createElement("div");
        const tag = tagPrefix ? `${tagPrefix}` : (item.tag || "");
        renderQuestCard(wrap, item, { tag });
        const cardEl = wrap.firstElementChild;
        if (cardEl) listEl.appendChild(cardEl);
    }
}

function refreshQuestHub() {
    const megaWrap = document.getElementById("questsMegaCard");
    const dailyList = document.getElementById("questsDailyList");
    const seasonList = document.getElementById("questsSeasonList");
    const megaDeadlineEl = document.getElementById("questsMegaDeadline");
    const dailyResetEl = document.getElementById("questsDailyReset");
    if (!megaWrap || !dailyList || !seasonList || !megaDeadlineEl || !dailyResetEl) return;

    const mega = megaQuestProgress();
    renderQuestCard(megaWrap, mega, { tag: mega.passOnly ? "Только с season pass" : "Мегаквест" });

    const dailyItems = Array.isArray(dailyChallenges?.tasks)
        ? dailyChallenges.tasks.map((task, index) => ({
            title: task.title || `Квест дня ${index + 1}`,
            progress: Number(task.progress || 0),
            target: Number(task.target || 1),
            rewardText: `XP ${Math.max(50, Number(task.reward || 0) * 2)}`,
            done: !!task.done,
            passOnly: false,
            meta: `Награда: +${Number(task.reward || 0)} монет`,
            tag: "Квест дня"
        }))
        : [];
    renderQuestCardsList(dailyList, dailyItems);

    ensureWeeklyChallenge();
    ensureFriendMission();
    ensureSeasonPassState();
    const seasonItems = [];
    if (weeklyChallenge) {
        seasonItems.push({
            title: weeklyChallenge.title || "Недельный прогресс",
            progress: Number(weeklyChallenge.progress || 0),
            target: Number(weeklyChallenge.target || 1),
            rewardText: `XP ${Math.max(120, Number(weeklyChallenge.reward || 0) * 2)}`,
            done: !!weeklyChallenge.done,
            passOnly: false,
            meta: `+${Number(weeklyChallenge.reward || 0)} монет`,
            tag: "Неделя"
        });
    }
    if (friendMissionState) {
        seasonItems.push({
            title: "Играй с друзьями",
            progress: Number(friendMissionState.progress || 0),
            target: Number(friendMissionState.target || 1),
            rewardText: `XP ${Math.max(90, Number(friendMissionState.reward || 0) * 2)}`,
            done: !!friendMissionState.claimed,
            passOnly: !featureFlags.socialMissions,
            meta: `+${Number(friendMissionState.reward || 0)} монет`,
            tag: "Соц. миссия"
        });
    }
    const passTarget = 900;
    seasonItems.push({
        title: "Путь сезона",
        progress: Number(trophies || 0),
        target: passTarget,
        rewardText: "Косметика + монеты",
        done: Number(trophies || 0) >= passTarget,
        passOnly: !featureFlags.seasonPass,
        meta: `Трофеи сезона: ${Number(trophies || 0)}/${passTarget}`,
        tag: "Сезон"
    });
    renderQuestCardsList(seasonList, seasonItems);

    seasonState = getSeasonState();
    const now = Date.now();
    const megaLeft = Math.max(0, Number(seasonState.endMs || now) - now);
    megaDeadlineEl.innerText = `Окончание мега-квестов: ${formatQuestCountdown(megaLeft)}`;
    dailyResetEl.innerText = `До обновления дневных: ${formatQuestCountdown(nowToTomorrowMs())}`;
}

function saveFeatureFlags() {
    localStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify(featureFlags));
}

function saveUiLocale() {
    localStorage.setItem(UI_LOCALE_KEY, uiLocale);
}

function saveQualityLogs() {
    localStorage.setItem(QUALITY_LOG_KEY, JSON.stringify(qualityLogs.slice(-30)));
}

function logQualityIssue(source, message) {
    if (!featureFlags.qualityWatch) return;
    const sourceText = String(source || "app");
    const text = String(message || "").trim();
    if (!text) return;
    qualityLogs.push({
        time: new Date().toISOString(),
        source: sourceText,
        message: text.slice(0, 180)
    });
    if (qualityLogs.length > 30) {
        qualityLogs = qualityLogs.slice(-30);
    }
    saveQualityLogs();
    updateQualityStatusUI();
    if (sourceText === "integrity" || sourceText === "window.error" || sourceText === "promise.reject" || sourceText === "friend_invite") {
        const severity = sourceText === "integrity" || sourceText === "window.error"
            ? "high"
            : (sourceText === "promise.reject" ? "medium" : "low");
        reportSuspiciousAction("client_quality", sourceText, severity, {
            message: text.slice(0, 180)
        }, 45000);
    }
}

function updateQualityStatusUI() {
    const el = document.getElementById("qualityStatus");
    if (!el) return;
    const total = qualityLogs.length;
    if (!featureFlags.qualityWatch) {
        el.innerText = "Стабильность: мониторинг выключен.";
        return;
    }
    if (!total) {
        el.innerText = "Стабильность: без новых ошибок.";
        return;
    }
    const last = qualityLogs[qualityLogs.length - 1];
    const source = String(last?.source || "app");
    el.innerText = `Стабильность: ${total} записей, последняя (${source}).`;
}

function saveWeeklyChallenge() {
    localStorage.setItem(WEEKLY_CHALLENGE_KEY, JSON.stringify(weeklyChallenge));
}

function ensureWeeklyChallenge() {
    const next = ensureWeeklyChallengeState(weeklyChallenge, new Date());
    weeklyChallenge = next.state;
    if (next.changed) {
        saveWeeklyChallenge();
    }
}

function refreshWeeklyChallengeUI() {
    ensureWeeklyChallenge();
    const el = document.getElementById("weeklyChallengeA");
    if (!el || !weeklyChallenge) return;
    el.innerText = formatWeeklyChallengeText(weeklyChallenge);
}

function updateWeeklyChallengeProgress(type, amountOrValue) {
    ensureWeeklyChallenge();
    const updated = updateWeeklyChallengeState(weeklyChallenge, type, amountOrValue);
    if (!updated.changed || !updated.state) return;
    weeklyChallenge = updated.state;
    if (updated.rewardCoins > 0) {
        coins += updated.rewardCoins;
        setHudCoinsValue(coins);
        localStorage.setItem("coins", String(coins));
        updateMenuTrophies();
        showRoomEventToast(`Недельный челлендж выполнен: +${updated.rewardCoins} монет`);
    }
    saveWeeklyChallenge();
}

function ensureFriendMission() {
    const next = ensureFriendMissionState(friendMissionState, todayKey());
    friendMissionState = next.state;
    if (next.changed) {
        localStorage.setItem(FRIEND_MISSION_KEY, JSON.stringify(friendMissionState));
    }
}

function refreshFriendMissionUI() {
    ensureFriendMission();
    const el = document.getElementById("socialMissionLine");
    if (!el || !friendMissionState) return;
    el.innerText = formatFriendMissionText(friendMissionState, uiLocale);
}

function bumpFriendMissionProgress() {
    ensureFriendMission();
    const updated = advanceFriendMissionState(friendMissionState, {
        enabled: !!featureFlags.socialMissions,
        friendsCount: Array.isArray(friendsState?.friends) ? friendsState.friends.length : 0,
        increment: 1
    });
    if (!updated.changed || !updated.state) return;
    friendMissionState = updated.state;
    if (updated.rewardCoins > 0) {
        coins += updated.rewardCoins;
        localStorage.setItem("coins", String(coins));
        setHudCoinsValue(coins);
        updateMenuTrophies();
        showRoomEventToast(`Миссия друзей: +${updated.rewardCoins} монет`);
    }
    localStorage.setItem(FRIEND_MISSION_KEY, JSON.stringify(friendMissionState));
    refreshFriendMissionUI();
}

function maybeClaimDailyLoginReward() {
    const line = document.getElementById("dailyRewardLine");
    const today = todayKey();
    if (AUTH_REQUIRED_FOR_PLAY && !accountToken) {
        if (line) line.innerText = "Ежедневная награда: войдите в аккаунт.";
        return;
    }
    if (!featureFlags.dailyRewards) {
        if (line) line.innerText = "Ежедневная награда: выключено feature-flag.";
        return;
    }
    const prev = String(dailyLoginState.lastClaimKey || "");
    if (prev === today) {
        if (line) line.innerText = `Ежедневная награда: уже получена, серия ${dailyLoginState.streak || 1}.`;
        return;
    }
    const streak = Number(dailyLoginState.streak || 0) + 1;
    const reward = Math.min(60, 8 + streak * 2);
    dailyLoginState = {
        lastClaimKey: today,
        streak,
        reward
    };
    localStorage.setItem(DAILY_LOGIN_KEY, JSON.stringify(dailyLoginState));
    coins += reward;
    localStorage.setItem("coins", String(coins));
    setHudCoinsValue(coins);
    updateMenuTrophies();
    if (line) line.innerText = `Ежедневная награда: +${reward} монет (серия ${streak}).`;
}

function refreshReleaseSummaryUI() {
    seasonState = getSeasonState();
    ensureGlobalEventState();
    const lang = I18N[uiLocale] || I18N.ru;
    const seasonEl = document.getElementById("seasonLine");
    const globalEventEl = document.getElementById("globalEventLine");
    const dailyEl = document.getElementById("dailyRewardLine");
    const abEl = document.getElementById("abVariantLine");
    if (seasonEl) {
        const seasonFromApi = seasonHubState?.season;
        const hasApiSeason = seasonFromApi && seasonFromApi.key === seasonState.id;
        const seasonTitle = hasApiSeason
            ? `${seasonFromApi.title || seasonState.id} (${seasonState.id})`
            : seasonState.id;
        seasonEl.innerText = `${lang.seasonPrefix}: ${seasonTitle}, осталось ${seasonState.leftDays} дн.`;
    }
    if (globalEventEl) {
        const globalEvent = currentGlobalEventMeta();
        globalEventEl.innerText = `${lang.globalEventPrefix}: ${globalEvent.title} — ${globalEvent.description}`;
    }
    if (dailyEl && dailyLoginState) {
        if (AUTH_REQUIRED_FOR_PLAY && !accountToken) {
            dailyEl.innerText = `${lang.dailyPrefix}: войдите в аккаунт.`;
        } else {
            const streak = Number(dailyLoginState.streak || 0);
            const today = todayKey();
            const claimed = String(dailyLoginState.lastClaimKey || "") === today;
            dailyEl.innerText = claimed
                ? `${lang.dailyPrefix}: серия ${streak}, уже получена.`
                : `${lang.dailyPrefix}: серия ${streak}. Зайдите сегодня за бонусом.`;
        }
    }
    if (abEl) {
        abEl.innerText = `${lang.experimentPrefix}: ${abVariant.toUpperCase()}.`;
    }
    renderCareerUI();
}

function ensureSeasonPassState() {
    seasonState = getSeasonState();
    seasonPassState = normalizeSeasonPassState();
    if (seasonPassState.seasonId !== seasonState.id) {
        seasonPassState = {
            seasonId: seasonState.id,
            claimedFree: [],
            claimedPremium: [],
            premiumUnlocked: false,
            passXp: 0,
            claimedTiers: []
        };
        saveSeasonPassState();
        return;
    }
    saveSeasonPassState();
}

function applySeasonPassRewards() {
    ensureSeasonPassState();
    computeSeasonPassProgress();
}

function applyLocalization() {
    const lang = I18N[uiLocale] || I18N.ru;
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    };
    setText("title", lang.title);
    setText("settingsGroupBtn", lang.settings);
    setText("socialGroupBtn", lang.social);
    setText("questsBtn", uiLocale === "en" ? "Quests" : "Квесты");
    setText("trophyRoadBtn", uiLocale === "en" ? "Trophy Road" : "Путь трофеев");
    setText("seasonBtn", lang.season);
    setText("moderationBtn", lang.moderation);
    setText("skinEditorBtn", lang.effects);
    setText("shopBtn", lang.shop);
    setText("playGroupBtn", lang.play);
    setText("socialInviteBtn", uiLocale === "en" ? "Invite Link" : "Инвайт другу");
    const socialMenuTitle = document.querySelector("#socialMenu h2");
    const settingsMenuTitle = document.querySelector("#settingsMenu h2");
    if (socialMenuTitle) socialMenuTitle.innerText = lang.socialTitle;
    if (settingsMenuTitle) settingsMenuTitle.innerText = lang.settingsTitle;
    const openTutorialBtn = document.getElementById("openTutorialBtn");
    if (openTutorialBtn) openTutorialBtn.innerText = lang.quickTutorial;
    renderCareerUI();
}

function syncFeatureFlagsUI() {
    const localeSelect = document.getElementById("languageSelect");
    if (localeSelect) localeSelect.value = uiLocale;
    const bind = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.checked = !!value;
    };
    bind("flagOnboarding", featureFlags.onboarding);
    bind("flagDailyRewards", featureFlags.dailyRewards);
    bind("flagFoodTiers", featureFlags.foodTiers);
    bind("flagMapEvents", featureFlags.mapEvents);
    bind("flagSocialMissions", featureFlags.socialMissions);
    bind("flagSeasonPass", featureFlags.seasonPass);
    bind("flagQualityWatch", featureFlags.qualityWatch);
    bind("flagExperiments", featureFlags.experiments);
}

function renderTutorialStep() {
    const step = TUTORIAL_STEPS[Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, tutorialStepIndex))];
    const titleEl = document.getElementById("tutorialStepTitle");
    const textEl = document.getElementById("tutorialStepText");
    const prevBtn = document.getElementById("tutorialPrevBtn");
    const nextBtn = document.getElementById("tutorialNextBtn");
    if (titleEl) titleEl.innerText = `Шаг ${tutorialStepIndex + 1}. ${step.title}`;
    if (textEl) textEl.innerText = step.text;
    if (prevBtn) prevBtn.disabled = tutorialStepIndex <= 0;
    if (nextBtn) nextBtn.innerText = tutorialStepIndex >= TUTORIAL_STEPS.length - 1 ? "Готово" : "Далее";
}

function openTutorial(stepIndex = 0) {
    tutorialStepIndex = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, stepIndex));
    renderTutorialStep();
    showOnlyMenu("tutorialMenu");
}

function completeTutorial() {
    onboardingDone = true;
    localStorage.setItem(ONBOARDING_DONE_KEY, "1");
    showOnlyMenu("mainMenu");
}

function maybeShowOnboarding() {
    if (!featureFlags.onboarding) return;
    if (onboardingDone) return;
    openTutorial(0);
}

function resolveFoodTierMeta(foodItem) {
    if (!featureFlags.foodTiers) return FOOD_TIER_META.common;
    const key = String(foodItem?.tier || "common").toLowerCase();
    return FOOD_TIER_META[key] || FOOD_TIER_META.common;
}

function getSeasonEventModifiers() {
    const themeId = String(seasonHubState?.season?.themeId || "").toLowerCase();
    if (themeId === "solar_frontier") {
        return { rareChanceBonus: 0.03, epicChanceBonus: 0.01, coinMultiplier: 1.1 };
    }
    if (themeId === "neon_nights") {
        return { rareChanceBonus: 0.02, epicChanceBonus: 0.015, coinMultiplier: 1.18 };
    }
    if (themeId === "arctic_core") {
        return { rareChanceBonus: 0.04, epicChanceBonus: 0.0, coinMultiplier: 1.08 };
    }
    if (themeId === "toxic_reactor") {
        return { rareChanceBonus: 0.01, epicChanceBonus: 0.025, coinMultiplier: 1.25 };
    }
    return { rareChanceBonus: 0, epicChanceBonus: 0, coinMultiplier: 1 };
}

function rollFoodTier() {
    if (!featureFlags.foodTiers) return "common";
    const r = seededRandom();
    const seasonMods = getSeasonEventModifiers();
    const epicBase = abVariant === "beta" && featureFlags.experiments ? 0.06 : FOOD_TIER_META.epic.chance;
    const rareBase = abVariant === "beta" && featureFlags.experiments ? 0.2 : FOOD_TIER_META.rare.chance;
    const epicChance = Math.min(0.35, Math.max(0, epicBase + Number(seasonMods.epicChanceBonus || 0)));
    const rareChance = Math.min(0.6, Math.max(0, rareBase + Number(seasonMods.rareChanceBonus || 0)));
    if (r < epicChance) return "epic";
    if (r < epicChance + rareChance) return "rare";
    return "common";
}

function getHazardZone(now = performance.now()) {
    return getHazardZoneBySize(now, size);
}

function drawFoodTierHint(foodItem) {
    const meta = resolveFoodTierMeta(foodItem);
    if (!meta || meta.key === "common") return;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = meta.glow;
    ctx.shadowColor = meta.glow;
    ctx.shadowBlur = perfShadow(16);
    ctx.lineWidth = 2.2;
    const pulse = 15 + Math.sin(performance.now() * 0.01) * 3;
    ctx.beginPath();
    ctx.arc(foodItem.x, foodItem.y, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function updateChallengeProgress(type, amountOrValue) {
    const dailyUpdate = updateDailyChallengesState(dailyChallenges, type, amountOrValue);
    dailyChallenges = dailyUpdate.state || dailyChallenges;
    if (dailyUpdate.rewardCoins > 0) {
        coins += dailyUpdate.rewardCoins;
        setHudCoinsValue(coins);
        localStorage.setItem("coins", String(coins));
        updateMenuTrophies();
    }
    updateWeeklyChallengeProgress(type, amountOrValue);
    if (dailyUpdate.changed) {
        saveDailyChallenges();
    }
    refreshChallengeUI();
}

function gainSnakeXp(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    snakeProgress.xp += amount;
    while (snakeProgress.xp >= snakeProgress.xpNeed) {
        snakeProgress.xp -= snakeProgress.xpNeed;
        snakeProgress.level += 1;
        snakeProgress.xpNeed = Math.round(snakeProgress.xpNeed * 1.25 + 3);
    }
    saveSnakeProgress();
    renderSnakeProgress();
}

function snakeLevelSpeedBonus() {
    return Math.min(140, (snakeProgress.level - 1) * 4);
}

function renderSnakeProgress() {
    const level = snakeProgress.level;
    const xp = Math.floor(snakeProgress.xp);
    const xpNeed = snakeProgress.xpNeed;
    document.getElementById("snakeLevelDisplay").innerText = `lvl ${level}`;
    document.getElementById("menuSnakeLevel").innerText = String(level);
    document.getElementById("menuSnakeXp").innerText = String(xp);
    document.getElementById("menuSnakeXpNeed").innerText = String(xpNeed);
}

function formatModeTimer(ms) {
    const safe = Math.max(0, Math.floor(ms || 0));
    const totalSec = Math.ceil(safe / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function updateModeDisplay() {
    const modeEl = document.getElementById("modeDisplay");
    const timerEl = document.getElementById("modeTimerDisplay");
    const timerBox = document.getElementById("timerHudBox");
    const modeMeta = GAME_MODES[currentGameMode] || GAME_MODES.classic;
    if (modeEl) modeEl.innerText = modeMeta.label;
    if (timerEl) {
        timerEl.innerText = modeMeta.timed ? formatModeTimer(modeTimeLeftMs) : "--:--";
    }
    if (timerBox) {
        timerBox.classList.toggle("hidden", !modeMeta.timed);
    }
}

function popTicker(el) {
    if (!el) return;
    el.classList.remove("ticker-pop");
    void el.offsetWidth;
    el.classList.add("ticker-pop");
}

function updateScoreDisplay() {
    const main = document.getElementById("liveScore");
    if (main) {
        main.innerText = score;
        popTicker(main);
    }
    const top = document.getElementById("topScore");
    if (top) {
        top.innerText = String(score);
        popTicker(top);
    }
}

function updateSpeedDisplay() {
    const el = document.getElementById("speedDisplay");
    if (el) {
        el.innerText = String(Math.round(speed));
        popTicker(el);
    }
    const top = document.getElementById("topSpeed");
    if (top) {
        top.innerText = String(Math.round(speed));
        popTicker(top);
    }
}

function getAudioContext() {
    if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

function playTone(freq = 440, durationMs = 80, type = "sine", volume = 0.06) {
    const ctxA = getAudioContext();
    if (!ctxA) return;
    const osc = ctxA.createOscillator();
    const gain = ctxA.createGain();
    const now = ctxA.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctxA.destination);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
}

function isOwned(item) {
    return cosmetics.unlocked.includes(item.id);
}

function getSnakeSkinById(id) {
    return SNAKE_SKINS.find((skin) => skin.id === String(id || "")) || SNAKE_SKINS[0];
}

function isSnakeSkinOwned(id) {
    const skinId = String(id || "");
    return Array.isArray(cosmetics.snakeSkinsUnlocked) && cosmetics.snakeSkinsUnlocked.includes(skinId);
}

function getActiveSnakeSkin() {
    const previewId = String(snakeSkinPreviewId || "").trim();
    if (previewId) return getSnakeSkinById(previewId);
    return getSnakeSkinById(cosmetics.snakeSkin);
}

function ensureSnakeSkinState() {
    if (!Array.isArray(cosmetics.snakeSkinsUnlocked)) cosmetics.snakeSkinsUnlocked = ["neon-classic"];
    if (!cosmetics.snakeSkinsUnlocked.includes("neon-classic")) cosmetics.snakeSkinsUnlocked.push("neon-classic");
    const equipped = String(cosmetics.snakeSkin || "neon-classic");
    if (!SNAKE_SKINS.some((skin) => skin.id === equipped)) cosmetics.snakeSkin = "neon-classic";
    if (!isSnakeSkinOwned(cosmetics.snakeSkin)) cosmetics.snakeSkin = "neon-classic";
}

function updateSnakePreviewVariables() {
    const menu = document.getElementById("skinMenu");
    if (!menu) return;
    const skin = getActiveSnakeSkin();
    menu.style.setProperty("--snake-preview-primary", skin.primary || "#ff7a00");
    menu.style.setProperty("--snake-preview-secondary", skin.secondary || "#ff4a4a");
    menu.style.setProperty("--snake-preview-shadow", skin.shadow || "rgba(255,122,0,0.68)");
}

function renderSnakeSkinMenu() {
    ensureSnakeSkinState();
    const cardsEl = document.getElementById("snakeSkinCards");
    const statusEl = document.getElementById("snakeSkinStatus");
    const stageNameEl = document.getElementById("snakeSkinStageName");
    const previewNameEl = document.getElementById("snakeSkinPreviewName");
    const previewBadgeEl = document.getElementById("snakeSkinPreviewBadge");
    const previewSubtitleEl = document.getElementById("snakeSkinPreviewSubtitle");
    const randomBtn = document.getElementById("snakeSkinRandomToggleBtn");
    const randomStateEl = document.getElementById("snakeSkinRandomState");
    if (!cardsEl) return;

    const activeSkin = getActiveSnakeSkin();
    if (statusEl) statusEl.innerText = `Монеты: ${coins} • Куплено скинов: ${cosmetics.snakeSkinsUnlocked.length}/${SNAKE_SKINS.length}`;
    if (stageNameEl) stageNameEl.innerText = snakeSkinPreviewId ? "Предпросмотр скина" : "Лобби скинов";
    if (previewNameEl) previewNameEl.innerText = activeSkin.title;
    if (previewBadgeEl) previewBadgeEl.innerText = activeSkin.badge || "S";
    if (previewSubtitleEl) previewSubtitleEl.innerText = activeSkin.subtitle || "Стиль змейки";
    if (randomBtn) {
        const enabled = !!cosmetics.randomSnakeSkin;
        randomBtn.innerText = enabled ? "ВКЛ." : "ВЫКЛ.";
        randomBtn.classList.toggle("on", enabled);
    }
    if (randomStateEl) {
        randomStateEl.innerText = cosmetics.randomSnakeSkin
            ? "В каждой новой игре автоматически выбирается случайный купленный скин."
            : "Используется выбранный вручную скин.";
    }
    updateSnakePreviewVariables();

    cardsEl.innerHTML = "";
    for (const skin of SNAKE_SKINS) {
        const owned = isSnakeSkinOwned(skin.id);
        const selected = String(cosmetics.snakeSkin || "") === skin.id;
        const previewed = String(snakeSkinPreviewId || "") === skin.id;
        const card = document.createElement("div");
        card.className = `snakeSkinCard${owned ? "" : " locked"}${selected ? " selected" : ""}`;
        const priceText = skin.price > 0 ? `${skin.price} монет` : "Бесплатно";
        card.innerHTML = `<div class="snakeSkinSwatch" style="background:linear-gradient(140deg, ${escapeHtml(skin.primary)}, ${escapeHtml(skin.secondary)});"></div>
<div class="snakeSkinName">${escapeHtml(skin.title)}</div>
<div class="snakeSkinPrice">${owned ? "Куплено" : `Цена: ${priceText}`}</div>`;

        const actionBtn = document.createElement("button");
        actionBtn.className = "snakeSkinActionBtn";
        actionBtn.dataset.skinAction = "buy-equip";
        actionBtn.dataset.skinId = skin.id;
        if (!owned) {
            actionBtn.classList.add("buy");
            actionBtn.innerText = `Купить`;
            actionBtn.disabled = coins < skin.price;
        } else if (selected && !previewed) {
            actionBtn.classList.add("selected");
            actionBtn.innerText = "Выбрано";
            actionBtn.disabled = true;
        } else {
            actionBtn.classList.add("select");
            actionBtn.innerText = selected && previewed ? "Вернуть" : "Выбрать";
            actionBtn.disabled = false;
        }
        const previewBtn = document.createElement("button");
        previewBtn.className = "snakeSkinActionBtn select";
        previewBtn.dataset.skinAction = "preview";
        previewBtn.dataset.skinId = skin.id;
        previewBtn.innerText = previewed ? "Скрыть превью" : "Превью";

        card.appendChild(actionBtn);
        card.appendChild(previewBtn);
        cardsEl.appendChild(card);
    }
}

function setSnakeSkinPreview(skinId) {
    const safeId = String(skinId || "").trim();
    if (!safeId || !SNAKE_SKINS.some((skin) => skin.id === safeId)) return;
    snakeSkinPreviewId = snakeSkinPreviewId === safeId ? "" : safeId;
    renderSnakeSkinMenu();
}

function buyOrEquipSnakeSkin(skinId) {
    const skin = getSnakeSkinById(skinId);
    const owned = isSnakeSkinOwned(skin.id);
    if (!owned) {
        if (coins < skin.price) {
            showRoomEventToast("Недостаточно монет для этого скина.");
            return;
        }
        coins -= skin.price;
        localStorage.setItem("coins", String(coins));
        setHudCoinsValue(coins);
        updateMenuTrophies();
        cosmetics.snakeSkinsUnlocked.push(skin.id);
    }
    if (String(cosmetics.snakeSkin) === skin.id && snakeSkinPreviewId === skin.id) {
        snakeSkinPreviewId = "";
    } else {
        cosmetics.snakeSkin = skin.id;
        snakeSkinPreviewId = "";
    }
    saveCosmetics();
    applyCosmetics();
    renderSnakeSkinMenu();
}

function rollRandomSnakeSkin() {
    ensureSnakeSkinState();
    const pool = SNAKE_SKINS.filter((skin) => isSnakeSkinOwned(skin.id));
    if (!pool.length) return;
    const picked = pool[randomInt(0, pool.length - 1)];
    cosmetics.snakeSkin = picked.id;
}

function unlockItem(item) {
    if (!cosmetics.unlocked.includes(item.id)) {
        cosmetics.unlocked.push(item.id);
        saveCosmetics();
    }
}

function getShopPreviewItem() {
    if (!shopPreviewItemId) return null;
    return SHOP_ITEMS.find((x) => x.id === shopPreviewItemId) || null;
}

function getActiveCosmetics() {
    const previewItem = getShopPreviewItem();
    if (!previewItem) return cosmetics;
    return {
        ...cosmetics,
        [previewItem.type]: previewItem.value
    };
}

function toggleShopPreview(item) {
    if (!item) return;
    shopPreviewItemId = shopPreviewItemId === item.id ? null : item.id;
    applyCosmetics();
}

function equipItem(type, value) {
    shopPreviewItemId = null;
    if (type === "eatEffect") cosmetics.eatEffect = value;
    if (type === "foodType") cosmetics.foodType = value;
    if (type === "foodGlow") cosmetics.foodGlow = value;
    if (type === "trailEffect") cosmetics.trailEffect = value;
    if (type === "deathAnimation") cosmetics.deathAnimation = value;
    if (type === "foodShape") cosmetics.foodShape = value;
    saveCosmetics();
    applyCosmetics();
}

function applyNeonPack(pack) {
    if (!pack) return;
    cosmetics.foodColor = pack.foodColor;
    cosmetics.foodGlow = pack.foodGlow;
    cosmetics.particleColor = pack.particleColor;
    cosmetics.neonBoost = pack.neonBoost;
    saveCosmetics();
    applyCosmetics();
    syncSkinInputs();
}

function boxOddsLines(type) {
    const list = Array.isArray(BOX_ODDS[type]) ? BOX_ODDS[type] : [];
    return list.map((it) => `${rarityLabel(it.rarity)} — ${Number(it.chance || 0)}%`);
}

function grantUnlockById(itemId) {
    const item = SHOP_ITEMS.find((x) => x.id === itemId);
    if (!item) return { ok: false, msg: "Неизвестный предмет." };
    if (!Array.isArray(cosmetics.unlocked)) cosmetics.unlocked = ["classic"];
    if (cosmetics.unlocked.includes(itemId)) {
        return { ok: false, msg: "Дубликат" };
    }
    cosmetics.unlocked.push(itemId);
    equipItem(item.type, item.value);
    saveCosmetics();
    syncSkinInputs();
    return { ok: true, msg: item.title };
}

function grantRarityReward(rarity) {
    const r = String(rarity || "").toLowerCase();
    if (r === "common") {
        const amount = randomInt(40, 120);
        coins += amount;
        return { text: `🟢 Обычный: +${amount} монет` };
    }
    if (r === "rare") {
        const pick = BOX_REWARD_POOLS.skin[randomInt(0, BOX_REWARD_POOLS.skin.length - 1)];
        const res = grantUnlockById(pick);
        if (res.ok) return { text: `🔵 Редкий: ${res.msg}` };
        const amount = randomInt(60, 140);
        coins += amount;
        return { text: `🔵 Редкий дубликат: +${amount} монет` };
    }
    if (r === "epic") {
        const pick = BOX_REWARD_POOLS.trail[randomInt(0, BOX_REWARD_POOLS.trail.length - 1)];
        const res = grantUnlockById(pick);
        if (res.ok) return { text: `🟣 Эпический: ${res.msg}` };
        const amount = randomInt(120, 220);
        coins += amount;
        return { text: `🟣 Эпический дубликат: +${amount} монет` };
    }
    if (r === "legendary") {
        const pick = BOX_REWARD_POOLS.animation[randomInt(0, BOX_REWARD_POOLS.animation.length - 1)];
        const res = grantUnlockById(pick);
        if (res.ok) return { text: `🟡 Легендарный: ${res.msg}` };
        const amount = randomInt(220, 340);
        coins += amount;
        return { text: `🟡 Легендарный дубликат: +${amount} монет` };
    }
    const pick = BOX_REWARD_POOLS.mythicSkin[randomInt(0, BOX_REWARD_POOLS.mythicSkin.length - 1)];
    const res = grantUnlockById(pick);
    if (res.ok) return { text: `🔴 Мифический: ${res.msg}` };
    const amount = randomInt(400, 700);
    coins += amount;
    return { text: `🔴 Мифический дубликат: +${amount} монет` };
}

function openLootBox(type) {
    const boxType = String(type || "");
    if (!boxInventory[boxType] || boxInventory[boxType] <= 0) {
        alert("Нет такого ящика.");
        return;
    }
    const table = BOX_ODDS[boxType];
    const picked = weightedPick(table);
    if (!picked) return;
    boxInventory[boxType] -= 1;
    const reward = grantRarityReward(picked.rarity);
    localStorage.setItem("coins", String(coins));
    setHudCoinsValue(coins);
    updateMenuTrophies();
    saveBoxInventory();
    renderShop();
    scheduleCloudSync(0);
    alert(`Открыт ${boxType} ящик.\n${reward.text}`);
}

function buyLootBox(type) {
    const boxType = String(type || "");
    const prices = { common: 100, rare: 300 };
    if (!(boxType in prices)) return;
    const price = prices[boxType];
    if (coins < price) {
        alert("Недостаточно монет.");
        return;
    }
    coins -= price;
    boxInventory[boxType] = (boxInventory[boxType] || 0) + 1;
    localStorage.setItem("coins", String(coins));
    setHudCoinsValue(coins);
    updateMenuTrophies();
    saveBoxInventory();
    renderShop();
}

function applyCosmetics() {
    const activeCosmetics = getActiveCosmetics();
    setFoodRenderConfig({
        foodType: activeCosmetics.foodType,
        foodColor: activeCosmetics.foodColor,
        foodGlow: activeCosmetics.foodGlow,
        particleColor: activeCosmetics.particleColor,
        neonBoost: activeCosmetics.neonBoost,
        foodShape: activeCosmetics.foodShape || "orb"
    });
    updateSnakePreviewVariables();
    renderShop();
}

function syncSkinInputs() {
    const foodInput = document.getElementById("foodColorInput");
    const foodTypeSelect = document.getElementById("foodTypeSelect");
    const eatEffectSelect = document.getElementById("eatEffectSelect");
    const trailEffectSelect = document.getElementById("trailEffectSelect");
    const deathAnimSelect = document.getElementById("deathAnimSelect");
    const foodShapeSelect = document.getElementById("foodShapeSelect");
    if (foodInput) foodInput.value = cosmetics.foodColor;
    if (foodTypeSelect) foodTypeSelect.value = cosmetics.foodType;
    if (eatEffectSelect) eatEffectSelect.value = cosmetics.eatEffect;
    if (trailEffectSelect) trailEffectSelect.value = cosmetics.trailEffect || "classic";
    if (deathAnimSelect) deathAnimSelect.value = cosmetics.deathAnimation || "flash";
    if (foodShapeSelect) foodShapeSelect.value = cosmetics.foodShape || "orb";
}

function renderShop() {
    const list = document.getElementById("shopList");
    const boxesWrap = document.getElementById("shopBoxesWrap");
    if (!list) return;
    const previewItem = getShopPreviewItem();
    const previewItemId = previewItem ? previewItem.id : null;

    if (boxesWrap) {
        const commonOddsHtml = boxOddsLines("common").map((line) => `<div class="shopDetailsLine">${line}</div>`).join("");
        const rareOddsHtml = boxOddsLines("rare").map((line) => `<div class="shopDetailsLine">${line}</div>`).join("");
        const superOddsHtml = boxOddsLines("super").map((line) => `<div class="shopDetailsLine">${line}</div>`).join("");
        boxesWrap.innerHTML = `
            <div class="shopRow">
                <div>
                    <div>Обычный ящик</div>
                    <div class="shopOwned">Инвентарь: ${boxInventory.common || 0}</div>
                    <div id="commonBoxOdds" class="shopDetails hidden">${commonOddsHtml}</div>
                </div>
                <div>
                    <button id="buyCommonBoxBtn">Купить 100</button>
                    <button id="openCommonBoxBtn">Открыть</button>
                    <button id="commonBoxOddsBtn">Шансы</button>
                </div>
            </div>
            <div class="shopRow">
                <div>
                    <div>Редкий ящик</div>
                    <div class="shopOwned">Инвентарь: ${boxInventory.rare || 0}</div>
                    <div id="rareBoxOdds" class="shopDetails hidden">${rareOddsHtml}</div>
                </div>
                <div>
                    <button id="buyRareBoxBtn">Купить 300</button>
                    <button id="openRareBoxBtn">Открыть</button>
                    <button id="rareBoxOddsBtn">Шансы</button>
                </div>
            </div>
            <div class="shopRow">
                <div>
                    <div>Супер ящик</div>
                    <div class="shopOwned">Только из мегакопилки • Инвентарь: ${boxInventory.super || 0}</div>
                    <div id="superBoxOdds" class="shopDetails hidden">${superOddsHtml}</div>
                </div>
                <div>
                    <button id="openSuperBoxBtn">Открыть</button>
                    <button id="superBoxOddsBtn">Шансы</button>
                </div>
            </div>
        `;

        const buyCommon = document.getElementById("buyCommonBoxBtn");
        const openCommon = document.getElementById("openCommonBoxBtn");
        const buyRare = document.getElementById("buyRareBoxBtn");
        const openRare = document.getElementById("openRareBoxBtn");
        const openSuper = document.getElementById("openSuperBoxBtn");
        const commonOddsBtn = document.getElementById("commonBoxOddsBtn");
        const rareOddsBtn = document.getElementById("rareBoxOddsBtn");
        const superOddsBtn = document.getElementById("superBoxOddsBtn");
        const commonOdds = document.getElementById("commonBoxOdds");
        const rareOdds = document.getElementById("rareBoxOdds");
        const superOdds = document.getElementById("superBoxOdds");

        function toggleDetails(el) {
            if (!el) return;
            el.classList.toggle("hidden");
        }

        if (buyCommon) {
            buyCommon.disabled = coins < 100;
            buyCommon.addEventListener("click", () => buyLootBox("common"));
        }
        if (openCommon) {
            openCommon.disabled = (boxInventory.common || 0) <= 0;
            openCommon.addEventListener("click", () => openLootBox("common"));
        }
        if (buyRare) {
            buyRare.disabled = coins < 300;
            buyRare.addEventListener("click", () => buyLootBox("rare"));
        }
        if (openRare) {
            openRare.disabled = (boxInventory.rare || 0) <= 0;
            openRare.addEventListener("click", () => openLootBox("rare"));
        }
        if (openSuper) {
            openSuper.disabled = (boxInventory.super || 0) <= 0;
            openSuper.addEventListener("click", () => openLootBox("super"));
        }
        if (commonOddsBtn) commonOddsBtn.addEventListener("click", () => toggleDetails(commonOdds));
        if (rareOddsBtn) rareOddsBtn.addEventListener("click", () => toggleDetails(rareOdds));
        if (superOddsBtn) superOddsBtn.addEventListener("click", () => toggleDetails(superOdds));
    }

    list.innerHTML = "";
    for (const item of SHOP_ITEMS) {
        const row = document.createElement("div");
        const previewed = previewItemId === item.id;
        row.className = "shopRow";
        const owned = isOwned(item);
        const equipped = cosmetics[item.type] === item.value;
        const priceOrOwned = owned ? "Куплено" : `Цена: ${item.price} монет`;
        row.innerHTML = `
            <div>
                <div>${item.title}</div>
                <div class="shopOwned">${priceOrOwned}${previewed ? " • Предпросмотр активен" : ""}</div>
            </div>
        `;
        const button = document.createElement("button");
        if (!owned) {
            button.innerText = "Купить";
            button.disabled = coins < item.price;
            button.addEventListener("click", () => {
                if (coins < item.price) return;
                coins -= item.price;
                localStorage.setItem("coins", coins);
                setHudCoinsValue(coins);
                updateMenuTrophies();
                unlockItem(item);
                renderShop();
            });
        } else {
            button.innerText = equipped ? "Экипировано" : "Экипировать";
            button.disabled = equipped;
            button.addEventListener("click", () => {
                if (shopPreviewItemId === item.id) shopPreviewItemId = null;
                equipItem(item.type, item.value);
                renderShop();
            });
        }

        const previewBtn = document.createElement("button");
        previewBtn.innerText = previewed ? "Убрать превью" : "Предпросмотр";
        previewBtn.addEventListener("click", () => {
            toggleShopPreview(item);
        });

        row.appendChild(button);
        row.appendChild(previewBtn);
        list.appendChild(row);
    }
}

if (!cosmetics.unlocked.includes("food-plasma") && cosmetics.foodType === "plasma") cosmetics.foodType = "solar";
if (!cosmetics.unlocked.includes("food-void") && cosmetics.foodType === "void") cosmetics.foodType = "solar";
if (!cosmetics.unlocked.includes("food-toxic") && cosmetics.foodType === "toxic") cosmetics.foodType = "solar";
if (!cosmetics.unlocked.includes("eat-burst") && cosmetics.eatEffect === "burst") cosmetics.eatEffect = "spark";
if (!cosmetics.unlocked.includes("eat-ring") && cosmetics.eatEffect === "ring") cosmetics.eatEffect = "spark";
if (!cosmetics.unlocked.includes("trail-pulse") && cosmetics.trailEffect === "pulse") cosmetics.trailEffect = "classic";
if (!cosmetics.unlocked.includes("trail-dash") && cosmetics.trailEffect === "dash") cosmetics.trailEffect = "classic";
if (!cosmetics.unlocked.includes("death-ring") && cosmetics.deathAnimation === "ring") cosmetics.deathAnimation = "flash";
if (!cosmetics.unlocked.includes("death-shatter") && cosmetics.deathAnimation === "shatter") cosmetics.deathAnimation = "flash";
if (!cosmetics.unlocked.includes("shape-diamond") && cosmetics.foodShape === "diamond") cosmetics.foodShape = "orb";
if (!cosmetics.unlocked.includes("shape-star") && cosmetics.foodShape === "star") cosmetics.foodShape = "orb";
if (!cosmetics.unlocked.includes("shape-cube") && cosmetics.foodShape === "cube") cosmetics.foodShape = "orb";
if (!cosmetics.unlocked.includes("glow-arctic") && cosmetics.foodGlow === "#37d5ff") cosmetics.foodGlow = "#ff7a00";
if (!cosmetics.unlocked.includes("glow-toxic") && cosmetics.foodGlow === "#78ff00") cosmetics.foodGlow = "#ff7a00";
ensureSnakeSkinState();
saveCosmetics();
applyCosmetics();
syncSkinInputs();
renderSnakeSkinMenu();
ensureWeeklyChallenge();
ensureFriendMission();
ensureSeasonPassState();
renderSeasonHub();
syncFeatureFlagsUI();
applyLocalization();
maybeClaimDailyLoginReward();
renderSnakeProgress();
refreshChallengeUI();
refreshSeasonHub(false).catch(() => {});
const modeSelectEl = document.getElementById("gameModeSelect");
if (modeSelectEl) {
    modeSelectEl.value = selectedGameMode;
}
for (const btn of document.querySelectorAll("#modeSwitchTabs .modeTabBtn")) {
    btn.addEventListener("click", () => {
        const tab = String(btn.dataset.modeTab || "special");
        selectedModeTab = MODE_SWITCH_TABS[tab] ? tab : "special";
        localStorage.setItem(MODE_SWITCH_TAB_KEY, selectedModeTab);
        renderModeSwitchUI();
    });
}
renderModeSwitchUI();
currentGameMode = selectedGameMode;
updateModeDisplay();
updateResponsiveScale();
document.body.classList.add("hide-level-progression");
syncMenuOverlayState();
renderAuthState();
renderClanUI();
if (AUTH_REQUIRED_FOR_PLAY && !accountToken) {
    showOnlyMenu("accountMenu");
}
bootstrapAccount();
window.addEventListener("resize", updateResponsiveScale, { passive: true });
window.addEventListener("orientationchange", updateResponsiveScale, { passive: true });
if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateResponsiveScale, { passive: true });
}
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
        scheduleCloudSync(0);
        return;
    }
    if (accountToken && accountUser) {
        pullCloudIfRemoteIsNewer().catch((error) => console.error(error));
        if (roomState && roomState.roomCode) {
            pullRoomState(true).catch((error) => console.error(error));
        } else {
            restoreCurrentRoomState(false).catch((error) => console.error(error));
        }
    }
});

function normalizeAxisValue(value){
    if (!Number.isFinite(value)) return null;
    if (value > 0.5) return 1;
    if (value < -0.5) return -1;
    return 0;
}

function sanitizeReplayInputs(inputs){
    if(!Array.isArray(inputs)) return [];

    const sanitized = [];

    for (let i = 0; i < inputs.length; i++) {
        const ev = inputs[i];
        if(!ev || typeof ev !== "object") continue;

        const frame = Number.isFinite(ev.frame) ? Math.max(0, Math.floor(ev.frame)) : null;
        if (frame === null) continue;

        if (ev.eat === true) {
            const eatEvent = { frame, eat: true, _i: i };
            if (Number.isFinite(ev.scoreAfter)) eatEvent.scoreAfter = Math.max(0, Math.floor(ev.scoreAfter));
            if (Number.isFinite(ev.levelAfter)) eatEvent.levelAfter = Math.max(1, Math.floor(ev.levelAfter));
            if (Number.isFinite(ev.speedAfter)) eatEvent.speedAfter = Math.max(1, Number(ev.speedAfter));
            if (Number.isFinite(ev.targetLengthAfter)) eatEvent.targetLengthAfter = Math.max(40, Number(ev.targetLengthAfter));
            if (typeof ev.foodTier === "string" && ev.foodTier.trim()) {
                eatEvent.foodTier = ev.foodTier.trim().toLowerCase().slice(0, 24);
            }
            sanitized.push(eatEvent);
            continue;
        }

        const x = normalizeAxisValue(ev.x);
        const y = normalizeAxisValue(ev.y);
        if (x === null || y === null) continue;
        if (Math.abs(x) + Math.abs(y) !== 1) continue;

        sanitized.push({ frame, x, y, _i: i });
    }

    sanitized.sort((a, b) => {
        if (a.frame !== b.frame) return a.frame - b.frame;
        return a._i - b._i;
    });

    let lastDirectionKey = null;
    const deduped = [];
    for (const ev of sanitized) {
        if (ev.eat) {
            const eatEvent = { frame: ev.frame, eat: true };
            if (Number.isFinite(ev.scoreAfter)) eatEvent.scoreAfter = ev.scoreAfter;
            if (Number.isFinite(ev.levelAfter)) eatEvent.levelAfter = ev.levelAfter;
            if (Number.isFinite(ev.speedAfter)) eatEvent.speedAfter = ev.speedAfter;
            if (Number.isFinite(ev.targetLengthAfter)) eatEvent.targetLengthAfter = ev.targetLengthAfter;
            if (typeof ev.foodTier === "string" && ev.foodTier) eatEvent.foodTier = ev.foodTier;
            deduped.push(eatEvent);
            lastDirectionKey = null;
            continue;
        }

        const key = `${ev.frame}:${ev.x}:${ev.y}`;
        if (key === lastDirectionKey) continue;
        lastDirectionKey = key;
        deduped.push({ frame: ev.frame, x: ev.x, y: ev.y });
    }

    return deduped;
}

function sanitizeFoodHistory(foods){
    if(!Array.isArray(foods)) return [];

    const max = GRID * CELL;
    const result = [];
    for (const item of foods) {
        if (!item || typeof item !== "object") continue;
        if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;

        const x = Math.min(Math.max(item.x, CELL / 2), max - CELL / 2);
        const y = Math.min(Math.max(item.y, CELL / 2), max - CELL / 2);
        const tier = String(item.tier || "common").toLowerCase();
        result.push({ x, y, eaten: false, tier: FOOD_TIER_META[tier] ? tier : "common" });
    }

    return result;
}

function sanitizeStateFrames(frames){
    if (!Array.isArray(frames)) return [];
    const maxFrames = 6000;
    const result = [];

    for (let i = 0; i < frames.length && result.length < maxFrames; i++) {
        const frame = frames[i];
        if (!frame || typeof frame !== "object") continue;
        if (!Array.isArray(frame.snake) || !frame.snake.length) continue;
        if (!frame.food || !Number.isFinite(frame.food.x) || !Number.isFinite(frame.food.y)) continue;

        const snakeSafe = frame.snake
            .filter((s) => s && Number.isFinite(s.x) && Number.isFinite(s.y))
            .map((s) => ({
                x: Math.round(s.x * 100) / 100,
                y: Math.round(s.y * 100) / 100
            }));
        if (!snakeSafe.length) continue;

        result.push({
            snake: snakeSafe,
            food: {
                x: Math.round(frame.food.x * 100) / 100,
                y: Math.round(frame.food.y * 100) / 100
            },
            score: Number.isFinite(frame.score) ? Math.max(0, Math.floor(frame.score)) : 0,
            level: Number.isFinite(frame.level) ? Math.max(1, Math.floor(frame.level)) : 1,
            speed: Number.isFinite(frame.speed) ? Math.max(1, frame.speed) : baseSpeed,
            targetLength: Number.isFinite(frame.targetLength) ? Math.max(40, frame.targetLength) : 120
        });
    }

    return result;
}

function pushDirectionEvent(x, y){
    if (isReplaying || !running) return;

    const frame = gameFrame;
    const nx = normalizeAxisValue(x);
    const ny = normalizeAxisValue(y);
    if (nx === null || ny === null) return;
    if (Math.abs(nx) + Math.abs(ny) !== 1) return;

    const last = currentReplay.length ? currentReplay[currentReplay.length - 1] : null;
    if (last && !last.eat && last.frame === frame && last.x === nx && last.y === ny) {
        return;
    }

    currentReplay.push({
        frame,
        x: nx,
        y: ny
    });
}

function pushEatEvent(meta = null){
    if (isReplaying || !running) return;

    const frame = gameFrame;
    const last = currentReplay.length ? currentReplay[currentReplay.length - 1] : null;
    if (last && last.eat === true && last.frame === frame) {
        return;
    }

    const event = {
        eat: true,
        frame
    };
    if (meta && typeof meta === "object") {
        if (Number.isFinite(meta.scoreAfter)) event.scoreAfter = Math.max(0, Math.floor(meta.scoreAfter));
        if (Number.isFinite(meta.levelAfter)) event.levelAfter = Math.max(1, Math.floor(meta.levelAfter));
        if (Number.isFinite(meta.speedAfter)) event.speedAfter = Math.max(1, Number(meta.speedAfter));
        if (Number.isFinite(meta.targetLengthAfter)) event.targetLengthAfter = Math.max(40, Number(meta.targetLengthAfter));
        if (typeof meta.foodTier === "string" && meta.foodTier.trim()) {
            event.foodTier = meta.foodTier.trim().toLowerCase().slice(0, 24);
        }
    }
    currentReplay.push(event);
}

function getFallbackFoodPoint(){
    return {
        x: Math.floor(GRID / 2) * CELL + CELL / 2,
        y: Math.floor(GRID / 2) * CELL + CELL / 2
    };
}

function normalizeHistoryRecord(raw, forceImported = false){
    if(!raw || typeof raw !== "object") return null;

    const fallbackFood = getFallbackFoodPoint();
    const safeInputs = sanitizeReplayInputs(raw.inputs);
    const sanitizedFoods = sanitizeFoodHistory(raw.foodHistory);
    const safeStateFrames = sanitizeStateFrames(raw.stateFrames);
    const safeFoods = sanitizedFoods.length
        ? sanitizedFoods
        : [fallbackFood];
    const isImported = forceImported || !!raw.imported || !!raw.external;

    const normalized = {
        date: typeof raw.date === "string" ? raw.date : new Date().toLocaleDateString(),
        time: typeof raw.time === "string" ? raw.time : new Date().toLocaleTimeString(),
        score: Number.isFinite(raw.score) ? raw.score : 0,
        trophies: Number.isFinite(raw.trophies) ? raw.trophies : null,
        isAI: !!raw.isAI,
        noRewards: !!raw.noRewards,
        imported: isImported,
        gameMode: GAME_MODES[String(raw.gameMode || "").trim()] ? String(raw.gameMode).trim() : "classic",
        seed: Number.isFinite(raw.seed) ? raw.seed : Math.floor(Date.now() % 1000000000),
        inputs: safeInputs,
        foodHistory: safeFoods,
        stateFrames: safeStateFrames,
        finalFrame: Number.isFinite(raw.finalFrame) ? raw.finalFrame : null,
        duration: Number.isFinite(raw.duration) ? raw.duration : 0,
        initialSpeed: Number.isFinite(raw.initialSpeed) ? raw.initialSpeed : null,
        initialTargetLength: Number.isFinite(raw.initialTargetLength) ? raw.initialTargetLength : 120,
        initialDir: (() => {
            if (!(raw.initialDir && Number.isFinite(raw.initialDir.x) && Number.isFinite(raw.initialDir.y))) {
                return { x: 1, y: 0 };
            }

            const x = normalizeAxisValue(raw.initialDir.x);
            const y = normalizeAxisValue(raw.initialDir.y);
            if (x === null || y === null) return { x: 1, y: 0 };
            if (Math.abs(x) + Math.abs(y) !== 1) return { x: 1, y: 0 };
            return { x, y };
        })()
    };

    if (normalized.imported) {
        normalized.trophies = null;
    }

    if (!Number.isFinite(normalized.finalFrame)) {
        if (safeStateFrames.length) {
            normalized.finalFrame = safeStateFrames.length - 1;
        } else {
            const maxFrame = safeInputs.reduce((max, ev) => {
                const frame = Number.isFinite(ev?.frame) ? ev.frame : 0;
                return Math.max(max, frame);
            }, 0);
            normalized.finalFrame = maxFrame + Math.max(120, safeFoods.length * 25);
        }
    }

    return normalized;
}

function normalizeHighlightClip(raw) {
    if (!raw || typeof raw !== "object") return null;
    const replayRaw = raw.replay && typeof raw.replay === "object" ? raw.replay : raw;
    const replay = normalizeHistoryRecord(replayRaw, true);
    if (!replay) return null;
    const titleRaw = typeof raw.title === "string" ? raw.title.trim() : "";
    const clipIdRaw = typeof raw.id === "string" ? raw.id.trim() : "";
    const clipId = clipIdRaw || `clip-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    return {
        id: clipId.slice(0, 80),
        title: (titleRaw || `Highlight ${replay.date} ${replay.time}`).slice(0, 80),
        createdAt: typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : new Date().toISOString(),
        sourceScore: Number.isFinite(Number(raw.sourceScore)) ? Math.max(0, Math.floor(Number(raw.sourceScore))) : Math.max(0, Math.floor(Number(replay.score || 0))),
        sourceMode: typeof raw.sourceMode === "string" ? raw.sourceMode : (replay.gameMode || "classic"),
        replay
    };
}

function persistHighlights() {
    try {
        localStorage.setItem(HIGHLIGHT_CLIPS_KEY, JSON.stringify(highlightClips));
    } catch (e) {
        console.warn("Не удалось сохранить highlight-клипы:", e);
    }
}

function selectClipFrameWindow(game) {
    const states = Array.isArray(game?.stateFrames) ? game.stateFrames : [];
    if (states.length > 1) {
        let peakIndex = 0;
        let peakScore = Number(states[0]?.score || 0);
        for (let i = 1; i < states.length; i += 1) {
            const nextScore = Number(states[i]?.score || 0);
            if (nextScore >= peakScore) {
                peakScore = nextScore;
                peakIndex = i;
            }
        }
        const start = Math.max(0, peakIndex - 480);
        const end = Math.min(states.length - 1, start + 1200);
        return { start, end };
    }

    const inputs = sanitizeReplayInputs(game?.inputs);
    const lastEatFrame = inputs.reduce((max, event) => {
        if (!event || !event.eat) return max;
        const frame = Number.isFinite(Number(event.frame)) ? Math.floor(Number(event.frame)) : 0;
        return Math.max(max, frame);
    }, 0);
    const finalFrame = Number.isFinite(Number(game?.finalFrame))
        ? Math.max(0, Math.floor(Number(game.finalFrame)))
        : Math.max(0, lastEatFrame + 180);
    const peak = Math.max(lastEatFrame, finalFrame);
    const start = Math.max(0, peak - 480);
    const end = Math.max(start + 120, Math.min(finalFrame, start + 1200));
    return { start, end };
}

function deriveInitialDirFromState(frame) {
    if (!frame || !Array.isArray(frame.snake) || frame.snake.length < 2) return null;
    const head = frame.snake[0];
    const neck = frame.snake[1];
    if (!head || !neck) return null;
    const dx = Number(head.x) - Number(neck.x);
    const dy = Number(head.y) - Number(neck.y);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
    if (Math.abs(dx) >= Math.abs(dy)) return { x: dx >= 0 ? 1 : -1, y: 0 };
    return { x: 0, y: dy >= 0 ? 1 : -1 };
}

function buildHighlightFromGame(game, gameIndex) {
    const normalized = normalizeHistoryRecord(game, true);
    if (!normalized) return null;

    const range = selectClipFrameWindow(normalized);
    const startFrame = Math.max(0, Number(range.start || 0));
    const endFrame = Math.max(startFrame, Number(range.end || startFrame + 120));
    const clippedInputs = sanitizeReplayInputs(normalized.inputs)
        .filter((event) => Number(event.frame) >= startFrame && Number(event.frame) <= endFrame)
        .map((event) => ({ ...event, frame: Math.max(0, Number(event.frame) - startFrame) }));

    const states = Array.isArray(normalized.stateFrames) ? normalized.stateFrames : [];
    let clippedStates = [];
    if (states.length > 1) {
        clippedStates = states.slice(startFrame, endFrame + 1);
    }

    const replay = {
        ...normalized,
        imported: true,
        inputs: clippedInputs,
        finalFrame: Math.max(0, endFrame - startFrame)
    };

    if (clippedStates.length > 1) {
        replay.stateFrames = clippedStates;
        replay.finalFrame = clippedStates.length - 1;
        replay.foodHistory = [{
            x: clippedStates[0].food.x,
            y: clippedStates[0].food.y,
            eaten: false,
            tier: "common"
        }];
        replay.initialSpeed = Number(clippedStates[0].speed || replay.initialSpeed || baseSpeed);
        replay.initialTargetLength = Number(clippedStates[0].targetLength || replay.initialTargetLength || 120);
        const dirFromState = deriveInitialDirFromState(clippedStates[0]);
        if (dirFromState) replay.initialDir = dirFromState;
        replay.score = Number(clippedStates[clippedStates.length - 1].score || replay.score || 0);
    } else {
        replay.stateFrames = [];
    }

    const modeKey = GAME_MODES[String(normalized.gameMode || "").trim()] ? String(normalized.gameMode).trim() : "classic";
    const modeLabel = GAME_MODES[modeKey]?.label || modeKey.toUpperCase();
    const clipSeconds = Math.max(1, Math.round((replay.finalFrame || 0) / 120));
    return normalizeHighlightClip({
        id: `clip-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        title: `HL #${gameIndex + 1} • ${modeLabel} • ${clipSeconds}s`,
        createdAt: new Date().toISOString(),
        sourceScore: Number(normalized.score || 0),
        sourceMode: modeKey,
        replay
    });
}

function persistHistory(){
    try {
        localStorage.setItem("gameHistory", JSON.stringify(gameHistory));
    } catch (e) {
        console.warn("История переполнена. Очищаем историю.");
        localStorage.removeItem("gameHistory");
        gameHistory = [];
        localStorage.setItem("gameHistory", JSON.stringify(gameHistory));
    }
}

function calculateTrophies(score){
    const current = Math.max(0, Math.floor(trophies));
    const league = Math.min(39, Math.floor(current / 50)); // 0..39 => до 2000
    const targetScore = 10 + Math.floor(league * 0.82);
    const scoreDiff = Math.floor(score) - targetScore;

    const maxWin = Math.max(2, 8 - Math.floor(league / 6));
    const medWin = Math.max(1, maxWin - 2);
    const minWin = Math.max(1, medWin - 1);
    const minLoss = -(1 + Math.floor(league / 7));
    const medLoss = -(2 + Math.floor(league / 5));
    const maxLoss = -(3 + Math.floor(league / 4));

    let delta = 0;
    if (scoreDiff >= 8) delta = maxWin;
    else if (scoreDiff >= 4) delta = medWin;
    else if (scoreDiff >= 1) delta = minWin;
    else if (scoreDiff <= -7) delta = maxLoss;
    else if (scoreDiff <= -3) delta = medLoss;
    else delta = minLoss;

    if (current >= 2000) {
        delta = Math.min(delta, 2);
        delta = Math.max(delta, -10);
    }

    let oldTrophies = trophies;

trophies += delta;

if(trophies < 0) trophies = 0;

localStorage.setItem("trophies", trophies);

updateRank();

return trophies - oldTrophies;
}



function updateSpeedByTrophies(){
    let speedByTrophies;
    if(trophies < 50){
        speedByTrophies = 320;
    }
    else if(trophies < 100){
        speedByTrophies = 350;
    }
    else if(trophies < 150){
        speedByTrophies = 400;
    }
    else{
        speedByTrophies = 450;
    }
    baseSpeed = speedByTrophies + snakeLevelSpeedBonus();
    speed = baseSpeed;
    updateSpeedDisplay();
}

function randomFood(){
    const arena = getArenaBounds();
    const minCell = Math.min(arena.maxCell, arena.minCell + 1);
    const maxCell = Math.max(arena.minCell, arena.maxCell - 1);

    const insideMin = minCell <= maxCell;
    const low = insideMin ? minCell : 0;
    const high = insideMin ? maxCell : GRID - 1;

    function isCellFree(cellX, cellY) {
        if (!snake || !snake.length) return true;
        for (const segment of snake) {
            const sx = Math.floor(segment.x / CELL);
            const sy = Math.floor(segment.y / CELL);
            if (sx === cellX && sy === cellY) return false;
        }
        return true;
    }

    for (let i = 0; i < 220; i++) {
        const cellX = low + Math.floor(seededRandom() * (high - low + 1));
        const cellY = low + Math.floor(seededRandom() * (high - low + 1));
        if (!isCellFree(cellX, cellY)) continue;
        return {
            x: cellX * CELL + CELL/2,
            y: cellY * CELL + CELL/2,
            eaten: false,
            tier: rollFoodTier()
        };
    }

    for (let y = low; y <= high; y++) {
        for (let x = low; x <= high; x++) {
            if (!isCellFree(x, y)) continue;
            return {
                x: x * CELL + CELL / 2,
                y: y * CELL + CELL / 2,
                eaten: false,
                tier: rollFoodTier()
            };
        }
    }

    return {
        x: Math.floor(GRID / 2) * CELL + CELL/2,
        y: Math.floor(GRID / 2) * CELL + CELL/2,
        eaten: false,
        tier: rollFoodTier()
    };
}
function update(delta){
    const now = performance.now();
    ensureGlobalEventState();
    updateMutationUI(now);
    if (!isReplaying && running) {
        maybeRunChaosHourTick(now);
    }
    if (!isReplaying && running && GAME_MODES[currentGameMode]?.timed) {
        modeTimeLeftMs = Math.max(0, modeTimeLeftMs - delta);
        updateModeDisplay();
        if (modeTimeLeftMs <= 0) {
            deathReason = "Время вышло.";
            gameOver();
            return;
        }
    }

    if(isRankedSession() && running){
        survivalMsCurrentRun += delta;
        updateChallengeProgress("survive", survivalMsCurrentRun);
    }

if(aiMode){
    sessionUsedAI = true;
    aiTimer += delta;

    if(aiTimer >= aiInterval){
        aiTimer = 0;

        const newDir = runAI(snake, food, dir);
        if(newDir){
            const changed = newDir.x !== dir.x || newDir.y !== dir.y;
            dir = newDir;

            if(changed && !isReplaying){
                pushDirectionEvent(dir.x, dir.y);
            }
        }
    }
}
    if(!aiMode && !isReplaying && pendingPlayerDir){
        const nx = pendingPlayerDir.x;
        const ny = pendingPlayerDir.y;
        const changed = nx !== dir.x || ny !== dir.y;
        dir = { x: nx, y: ny };
        pendingPlayerDir = null;
        if(changed){
            pushDirectionEvent(dir.x, dir.y);
        }
    }

    const speedMultiplier = isMutationActive("overdrive", now) ? 1.28 : 1;
    const modeSpeedMultiplier = currentGameMode === "slow" ? 0.68 : 1;
    let move = speed * speedMultiplier * modeSpeedMultiplier * (FIXED_STEP/1000);

    const head = {
        x: snake[0].x + dir.x * move,
        y: snake[0].y + dir.y * move
    };

    snake.unshift(head);
    if (!Number.isFinite(head.x) || !Number.isFinite(head.y)) {
        logQualityIssue("integrity", "invalid head coordinates");
        deathReason = "Ошибка симуляции.";
        gameOver();
        return;
    }
    if (!isReplaying && !aiMode && speed > 880) {
        logQualityIssue("integrity", `speed clamp triggered (${Math.round(speed)})`);
        speed = 880;
    }

    // корректируем длину
    let length = 0;
    for(let i=1;i<snake.length;i++){
        const dx = snake[i].x - snake[i-1].x;
        const dy = snake[i].y - snake[i-1].y;
        length += Math.sqrt(dx*dx + dy*dy);
    }

    while(length > targetLength){
        snake.pop();

        length = 0;
        for(let i=1;i<snake.length;i++){
            const dx = snake[i].x - snake[i-1].x;
            const dy = snake[i].y - snake[i-1].y;
            length += Math.sqrt(dx*dx + dy*dy);
        }
    }
    if(checkCollision()) return;

if (!isReplaying && featureFlags.mapEvents && currentGameMode === "survival_plus") {
    activeHazardZone = getHazardZone(now);
    const hx = snake[0].x;
    const hy = snake[0].y;
    const zx = activeHazardZone.x;
    const zy = activeHazardZone.y;
    const inside = ((hx - zx) * (hx - zx) + (hy - zy) * (hy - zy)) <= activeHazardZone.r * activeHazardZone.r;
    if (inside) {
        hazardInsideMs += delta;
        if (hazardInsideMs >= 850) {
            deathReason = "Штормовая зона перегрузки.";
            gameOver();
            return;
        }
    } else {
        hazardInsideMs = Math.max(0, hazardInsideMs - delta * 0.5);
    }
} else {
    activeHazardZone = null;
    hazardInsideMs = 0;
}

if (!isReplaying && currentGameMode === "king") {
    const cx = size / 2;
    const cy = size / 2;
    const radius = 110;
    const hx = snake[0].x;
    const hy = snake[0].y;
    const inside = ((hx - cx) * (hx - cx) + (hy - cy) * (hy - cy)) <= radius * radius;
    if (inside) {
        kingTickAccumMs += delta;
        while (kingTickAccumMs >= 1000) {
            kingTickAccumMs -= 1000;
            score += 1;
            updateScoreDisplay();
            playTone(510, 45, "triangle", 0.035);
            if (inRoomChallengeSession()) {
                sendRoomScore(score, false);
            }
        }
    } else {
        kingTickAccumMs = 0;
    }
}

if(!isReplaying){
    checkFood();
}
    stateFrames.push({
        snake: snake.map(segment => ({
            x: Math.round(segment.x * 100) / 100,
            y: Math.round(segment.y * 100) / 100
        })),
        food: {
            x: Math.round(food.x * 100) / 100,
            y: Math.round(food.y * 100) / 100
        },
        score: score,
        level: level,
        speed: speed,
        targetLength: targetLength
    });
    gameFrame++;
    }


function checkCollision(){
    const head = snake[0];
    const phaseActive = isMutationActive("phase");
    const arena = getArenaBounds();
    const collidedWithWall = arena.miniActive
        ? (head.x < arena.minCoord || head.y < arena.minCoord || head.x > arena.maxCoord || head.y > arena.maxCoord)
        : (head.x < 0 || head.y < 0 || head.x >= size || head.y >= size);
    if(collidedWithWall){
        deathReason = "Вы врезались в стену.";
        if(isReplaying){
            running = false;
        } else {
            spawnDeathEffect(head.x, head.y);
            gameOver();
        }
        return true;
    }

    for(let i = 15; i < snake.length; i++){
        const dx = head.x - snake[i].x;
        const dy = head.y - snake[i].y;

        if((dx*dx + dy*dy) < 225){
            if (phaseActive) {
                continue;
            }
            deathReason = "Вы врезались в своё тело.";
            if(isReplaying){
                running = false;
            } else {
                spawnDeathEffect(head.x, head.y);
                gameOver();
            }
            return true;
        }
    }

    return false;
}


function checkFood(){
    const head = snake[0];
    const dx = head.x - food.x;
    const dy = head.y - food.y;
    const captureRadius = isMutationActive("magnet") ? 30 : 20;

    if(Math.sqrt(dx*dx + dy*dy) < captureRadius && !food.eaten){
        const foodTierMeta = resolveFoodTierMeta(food);
        const foodRewardMultiplier = getFoodRewardMultiplier(performance.now());
        spawnEatEffect(food.x, food.y);
        playTone(720, 55, "square", 0.05);

        const gainedScore = Math.max(1, Math.floor(Number(foodTierMeta.score || 1) * foodRewardMultiplier));
        score += gainedScore;
        food.eaten = true;
        updateScoreDisplay();
        if (inRoomChallengeSession()) {
            sendRoomScore(score, false);
        }
        let newLevel = Math.floor(score / 5) + 1;

if(newLevel !== level){
    level = newLevel;
    document.getElementById("levelDisplay").innerText = level;
        playTone(840, 110, "triangle", 0.065);
        if (inRoomChallengeSession()) {
            speed = getRoomConfiguredSpeed();
        } else {
            speed += aiMode ? 22 : 30;
            if (aiMode) {
                speed = Math.min(speed, 620);
            }
        }
        updateSpeedDisplay();

}
        if(isRankedSession()){
            updateChallengeProgress("eat", 1);
            updateChallengeProgress("score", score);
            gainSnakeXp(2);
            maybeTriggerMutation();
            if (Number(foodTierMeta.coinBonus || 0) > 0) {
                const seasonCoinMultiplier = Number(getSeasonEventModifiers().coinMultiplier || 1);
                const globalCoinMultiplier = getFoodRewardMultiplier(performance.now());
                const scaledBonus = Math.max(
                    1,
                    Math.floor(Number(foodTierMeta.coinBonus || 0) * Math.max(1, seasonCoinMultiplier) * Math.max(1, globalCoinMultiplier))
                );
                coins += scaledBonus;
                localStorage.setItem("coins", String(coins));
                setHudCoinsValue(coins);
                updateMenuTrophies();
            }
            if (foodTierMeta.key !== "common") {
                showRoomEventToast(`Бонус-еда: ${foodTierMeta.key.toUpperCase()} (+${gainedScore} к счёту)`);
            }
        }
        targetLength += Math.max(40, Math.floor(Number(foodTierMeta.growth || 40) * foodRewardMultiplier));
        if (!isReplaying) {
            pushEatEvent({
                scoreAfter: score,
                levelAfter: level,
                speedAfter: speed,
                targetLengthAfter: targetLength,
                foodTier: foodTierMeta.key || "common"
            });
        }
        if(isReplaying){
    return;
}

food = randomFood();

foodHistory.push({
    x: food.x,
    y: food.y,
    eaten: false,
    tier: food.tier || "common"
});
}}
function buildHamiltonianPath(){

    let path = [];

    for(let y = 0; y < GRID; y++){

        if(y % 2 === 0){
            for(let x = 0; x < GRID; x++){
                path.push({x, y});
            }
        } else {
            for(let x = GRID - 1; x >= 0; x--){
                path.push({x, y});
            }
        }

    }

    return path;
}

function spawnEatEffect(x, y){
    const activeCosmetics = getActiveCosmetics();
    eatFx.push({
        x,
        y,
        started: performance.now(),
        mode: activeCosmetics.eatEffect || "spark"
    });
    const maxFx = lowPowerMobile ? 8 : (mobileOptimized ? 12 : 20);
    if (eatFx.length > maxFx) {
        eatFx.splice(0, eatFx.length - maxFx);
    }
}

function drawEatEffects(){
    if(!eatFx.length) return;
    const activeCosmetics = getActiveCosmetics();
    const now = performance.now();
    eatFx = eatFx.filter((fx) => now - fx.started < 480);
    for (const fx of eatFx) {
        const age = (now - fx.started) / 480;
        const t = Math.max(0, 1 - age);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = hexToRgba(activeCosmetics.foodGlow, 0.85 * t);
        ctx.fillStyle = hexToRgba(activeCosmetics.particleColor, 0.65 * t);
        ctx.shadowColor = activeCosmetics.foodGlow;
        ctx.shadowBlur = perfShadow(18 * t * (activeCosmetics.neonBoost || 1));

        if (fx.mode === "burst") {
            const burstCount = perfParticleCount(10);
            for (let i = 0; i < burstCount; i++) {
                const a = i * ((Math.PI * 2) / burstCount);
                const dist = 8 + age * 40;
                const px = fx.x + Math.cos(a) * dist;
                const py = fx.y + Math.sin(a) * dist;
                ctx.beginPath();
                ctx.arc(px, py, 2.2 * t, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (fx.mode === "ring") {
            ctx.lineWidth = 4 * t;
            ctx.beginPath();
            ctx.arc(fx.x, fx.y, 14 + age * 42, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            const sparkCount = perfParticleCount(7);
            for (let i = 0; i < sparkCount; i++) {
                const a = age * 8 + i * ((Math.PI * 2) / sparkCount);
                const dist = 8 + Math.sin(age * 10 + i) * 8 + age * 22;
                const px = fx.x + Math.cos(a) * dist;
                const py = fx.y + Math.sin(a) * dist;
                ctx.beginPath();
                ctx.arc(px, py, 1.8 + t * 1.6, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }
}

function drawModeOverlay() {
    const t = performance.now() * 0.003;
    const arena = getArenaBounds();
    if (arena.miniActive) {
        ctx.save();
        ctx.fillStyle = "rgba(255,40,40,0.16)";
        ctx.fillRect(0, 0, size, arena.innerMinPx);
        ctx.fillRect(0, arena.innerMaxPx, size, size - arena.innerMaxPx);
        ctx.fillRect(0, arena.innerMinPx, arena.innerMinPx, arena.innerMaxPx - arena.innerMinPx);
        ctx.fillRect(arena.innerMaxPx, arena.innerMinPx, size - arena.innerMaxPx, arena.innerMaxPx - arena.innerMinPx);
        ctx.strokeStyle = "rgba(255,98,98,0.92)";
        ctx.lineWidth = 4;
        ctx.shadowColor = "rgba(255,88,88,0.9)";
        ctx.shadowBlur = perfShadow(14);
        ctx.strokeRect(arena.innerMinPx, arena.innerMinPx, arena.innerMaxPx - arena.innerMinPx, arena.innerMaxPx - arena.innerMinPx);
        ctx.restore();
    }
    if (currentGameMode === "king") {
        const cx = size / 2;
        const cy = size / 2;
        const r = 110;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.strokeStyle = `rgba(255,180,92,${0.34 + Math.sin(t) * 0.1})`;
        ctx.lineWidth = 5;
        ctx.shadowColor = "rgba(255,160,62,0.9)";
        ctx.shadowBlur = perfShadow(18);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
    if (currentGameMode === "survival_plus" && featureFlags.mapEvents) {
        const zone = activeHazardZone || getHazardZone(performance.now());
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const intensity = Math.min(1, 0.3 + (hazardInsideMs / 850) * 0.7);
        ctx.strokeStyle = `rgba(255,70,120,${0.35 + intensity * 0.45})`;
        ctx.fillStyle = `rgba(255,40,90,${0.08 + intensity * 0.12})`;
        ctx.shadowColor = "rgba(255,70,120,0.9)";
        ctx.shadowBlur = perfShadow(14 + intensity * 12);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}

function spawnDeathEffect(x, y) {
    const activeCosmetics = getActiveCosmetics();
    deathFx = {
        x,
        y,
        startedAt: performance.now(),
        mode: activeCosmetics.deathAnimation || "flash"
    };
}

function drawDeathEffect() {
    if (!deathFx) return;
    const activeCosmetics = getActiveCosmetics();
    const elapsed = performance.now() - deathFx.startedAt;
    if (elapsed > 850) {
        deathFx = null;
        return;
    }
    const p = elapsed / 850;
    const t = 1 - p;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = hexToRgba(activeCosmetics.foodGlow, 0.8 * t);
    ctx.fillStyle = hexToRgba(activeCosmetics.foodGlow, 0.42 * t);
    ctx.shadowColor = activeCosmetics.foodGlow;
    ctx.shadowBlur = perfShadow(22 * t);
    if (deathFx.mode === "ring") {
        ctx.lineWidth = 8 * t;
        ctx.beginPath();
        ctx.arc(deathFx.x, deathFx.y, 18 + p * 120, 0, Math.PI * 2);
        ctx.stroke();
    } else if (deathFx.mode === "shatter") {
        const shardCount = perfParticleCount(18);
        for (let i = 0; i < shardCount; i++) {
            const a = i * (Math.PI * 2 / shardCount);
            const r = 12 + p * 130;
            const px = deathFx.x + Math.cos(a) * r;
            const py = deathFx.y + Math.sin(a) * r;
            ctx.beginPath();
            ctx.arc(px, py, 1.3 + 2.6 * t, 0, Math.PI * 2);
            ctx.fill();
        }
    } else {
        ctx.beginPath();
        ctx.arc(deathFx.x, deathFx.y, 12 + p * 45, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function draw(){
renderBackground();
if (!snake || !snake.length || !food) {
    return;
}
const activeCosmetics = getActiveCosmetics();
const activeSnakeSkin = getActiveSnakeSkin();
const phaseActive = isMutationActive("phase");
const overdriveActive = isMutationActive("overdrive");
drawModeOverlay();

ctx.beginPath();
ctx.lineCap="round";
ctx.lineJoin="round";
ctx.lineWidth=20;
ctx.shadowColor=phaseActive
    ? "#35d9ff"
    : (overdriveActive ? "#ffd24a" : (activeSnakeSkin.glow || activeSnakeSkin.shadow || "#ff7a00"));
ctx.strokeStyle=phaseActive
    ? "#63f1ff"
    : (overdriveActive ? "#ffd45f" : (activeSnakeSkin.stroke || activeSnakeSkin.primary || "#ff7a00"));
ctx.shadowBlur=perfShadow(overdriveActive ? 34 : 26);
if (activeCosmetics.trailEffect === "dash" && !lowPowerMobile) {
ctx.setLineDash([16, 10]);
} else {
ctx.setLineDash([]);
}
if (activeCosmetics.trailEffect === "pulse" && !reducedFxMode) {
ctx.lineWidth = 18 + Math.sin(performance.now() * 0.01) * 2.4;
}
const stride = trailDrawStride();
ctx.moveTo(snake[0].x,snake[0].y);
for(let i=1;i<snake.length;i+=stride){
ctx.lineTo(snake[i].x,snake[i].y);
}
if (stride > 1 && snake.length > 1) {
    const tail = snake[snake.length - 1];
    ctx.lineTo(tail.x, tail.y);
}
ctx.stroke();
ctx.setLineDash([]);

renderFood(food);
drawFoodTierHint(food);
drawEatEffects();
drawDeathEffect();
}

function loop(timestamp){
if(!running) {
    draw();
    return;
}
const delta=timestamp-lastTime;
lastTime=timestamp;
accumulator += delta;
const maxCatchupSteps = lowPowerMobile ? 3 : (mobileOptimized ? 4 : 7);
const maxAccumulator = FIXED_STEP * maxCatchupSteps;
if (accumulator > maxAccumulator) {
    accumulator = maxAccumulator;
}

while(accumulator >= FIXED_STEP){
    update(FIXED_STEP);
    accumulator -= FIXED_STEP;
}

draw();
requestAnimationFrame(loop);
}

function startGame(ai=false, noRewards=false){
if (isBannedUser) return;
if (!requireAuthorizedAccount("войдите в аккаунт перед стартом игры")) return;
if (roomSpectatorMode) {
    applyRoomState(null, { suppressEvents: true });
}
if (typeof replayManager !== "undefined" && replayManager?.isReplayActive?.()) {
    replayManager.stopReplay(true);
}
stopTrophyAnimation();
document.body.classList.remove("gameover-active");
dailyChallenges = buildDailyChallenges();
refreshChallengeUI();
const globalEvent = ensureGlobalEventState({ forceReset: true });
if (globalEvent && globalEvent.eventId) {
    const title = uiLocale === "en" ? globalEvent.titleEn : globalEvent.titleRu;
    showRoomEventToast(`Глобальное событие: ${title}`);
}
isReplaying = false
gameFrame = 0;
stateFrames = [];
replaySeed = Math.floor(Date.now() % 1000000000);
foodHistory = [];
gameStartTime = performance.now();
aiMode=ai;
sessionUsedAI = !!ai;
sessionNoRewards = !!noRewards;
sessionStartTrophies = trophies;
pendingPlayerDir = null;
clearMutation();
ensureSnakeSkinState();
if (cosmetics.randomSnakeSkin) {
    rollRandomSnakeSkin();
    saveCosmetics();
}
deathReason = "";
deathFx = null;
document.body.classList.add("in-arena");
document.getElementById("mainMenu").classList.add("hidden");
document.getElementById("playMenu").classList.add("hidden");
document.getElementById("socialMenu").classList.add("hidden");
document.getElementById("moderationMenu").classList.add("hidden");
document.getElementById("settingsMenu").classList.add("hidden");
document.getElementById("tutorialMenu").classList.add("hidden");
document.getElementById("gameOverMenu").classList.add("hidden");
document.getElementById("historyMenu").classList.add("hidden");
document.getElementById("accountMenu").classList.add("hidden");
document.getElementById("friendsMenu").classList.add("hidden");
document.getElementById("trophyRoadMenu").classList.add("hidden");
document.getElementById("clanMenu").classList.add("hidden");
document.getElementById("leaderboardMenu").classList.add("hidden");
document.getElementById("seasonMenu").classList.add("hidden");
document.getElementById("questsMenu").classList.add("hidden");
document.getElementById("roomMenu").classList.add("hidden");
document.getElementById("skinMenu").classList.add("hidden");
document.getElementById("shopMenu").classList.add("hidden");
document.getElementById("exitBtn").classList.remove("hidden");
document.getElementById("roomResultText").innerText = "";
stopModerationPolling();
init();
currentGameMode = GAME_MODES[selectedGameMode] ? selectedGameMode : "classic";
if (inRoomChallengeSession()) {
    currentGameMode = "classic";
}
const modeMeta = GAME_MODES[currentGameMode] || GAME_MODES.classic;
modeTimeLeftMs = modeMeta.timed ? modeMeta.durationMs : 0;
updateModeDisplay();
if (aiMode) {
    speed = Math.max(280, speed - 30);
}
if (inRoomChallengeSession()) {
    const roomSpeed = getRoomConfiguredSpeed();
    baseSpeed = roomSpeed;
    speed = roomSpeed;
}
updateSpeedDisplay();
resetAI(snake);
sessionStartSpeed = speed;
sessionStartTargetLength = targetLength;
sessionStartDir = {x: dir.x, y: dir.y};
stateFrames.push({
    snake: JSON.parse(JSON.stringify(snake)),
    food: { x: food.x, y: food.y },
    score: score,
    level: level,
    speed: speed,
    targetLength: targetLength
});
foodHistory.push({
    x: food.x,
    y: food.y,
    eaten: false,
    tier: food.tier || "common"
});
running=true;
currentReplay = [];
lastTime=performance.now();
if (inRoomChallengeSession()) {
    resetRoomSessionFlags();
    roomLastPostedScore = 0;
}
syncMenuOverlayState();
requestAnimationFrame(loop);
}

function gameOver(){
    if(!running) return;   // 🔥 защита от повторного вызова
    running = false;
    const wasAI = aiMode || sessionUsedAI;
    let trophyChange = null;
    isReplaying = false

    if(isRankedSession()){
        trophyChange = calculateTrophies(score);
        gainSnakeXp(Math.max(1, Math.floor(score / 2)));
        if (accountUser && accountToken && Number(trophyChange || 0) > 0) {
            apiRequest("clan-record-win", {
                method: "POST",
                body: { score, trophyDelta: trophyChange }
            }).then((res) => {
                if (res && clanState.clan && Number.isFinite(Number(res.wins))) {
                    clanState.clan.wins = Number(res.wins || clanState.clan.wins || 0);
                    clanState.clan.coins = Number(res.clanCoins || clanState.clan.coins || 0);
                    clanState.clan.claimed = !!res.claimed;
                    clanState.clan.canClaim = !!res.canClaim;
                    clanState.monthKey = res.monthKey || clanState.monthKey;
                    clanState.targetWins = Number(res.targetWins || clanState.targetWins || 300);
                    if (res.activeWar) clanWarState.activeWar = res.activeWar;
                    renderClanUI();
                }
            }).catch((error) => console.error(error));
        }
        bumpFriendMissionProgress();
    }

    saveGameToHistory(score, trophyChange, wasAI);

    updateSpeedByTrophies();
    updateMenuTrophies();

    const finalScoreEl = document.getElementById("finalScore");
    finalScoreEl.innerText = score;
    popTicker(finalScoreEl);
    const modeMeta = GAME_MODES[currentGameMode] || GAME_MODES.classic;
    document.getElementById("finalModeLine").innerText = `Режим: ${modeMeta.label}`;
    const reasonEl = document.getElementById("deathReasonLine");
    if (!deathReason && inRoomChallengeSession() && roomState && roomState.winnerUserId) {
        const players = Array.isArray(roomState.players) ? roomState.players : [];
        const winner = players.find((p) => Number(p.userId) === Number(roomState.winnerUserId));
        if (winner && accountUser && Number(winner.userId) !== Number(accountUser.id)) {
            deathReason = `Вас обыграл: ${getPlayerDisplayName(winner)}.`;
        }
    }
    if (reasonEl) {
        reasonEl.innerText = deathReason || "Причина: ошибка управления.";
    }
    playTone(130, 260, "sawtooth", 0.09);
    if (inRoomChallengeSession()) {
        sendRoomScore(score, true);
    }
    updateGameOverRoomControls();
    document.getElementById("gameOverMenu").classList.remove("hidden");
    document.getElementById("exitBtn").classList.add("hidden");
    document.body.classList.add("gameover-active");
    syncMenuOverlayState();
    const totalRunDelta = trophies - sessionStartTrophies;
    animateTrophiesAfterGame(sessionStartTrophies, totalRunDelta);
    scheduleCloudSync(500);

    if(isRecordEligibleSession() && score > best){
        best = score;
        localStorage.setItem("best", best);
        updateBestDisplay();
    }

}

async function tryJoinClanFromInviteUrl() {
    if (!accountUser || !accountToken || clanState.clan) return;
    const params = new URLSearchParams(window.location.search || "");
    const inviteCode = String(params.get("clanInvite") || "").trim().toUpperCase();
    if (!inviteCode) return;
    try {
        await apiRequest("clan-invite-join", {
            method: "POST",
            body: { inviteCode }
        });
        params.delete("clanInvite");
        const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
        window.history.replaceState({}, "", next);
        await refreshClanState();
        setClanStatus("Вы вошли в клан по ссылке.");
    } catch (error) {
        const msg = error && error.code ? error.code : "ошибка инвайта";
        setClanStatus(`Ошибка: ${msg}`);
    }
}

async function tryHandleFriendInviteUrl() {
    const params = new URLSearchParams(window.location.search || "");
    const raw = String(params.get("friendInvite") || "").trim();
    const friendId = Number.parseInt(raw, 10);
    if (!Number.isFinite(friendId) || friendId <= 0) return;
    if (!accountUser || !accountToken) {
        setFriendsSearchResult(`Найден инвайт друга #${friendId}. Войдите в аккаунт и откройте раздел друзей.`);
        return;
    }
    if (Number(accountUser.id) === friendId) {
        params.delete("friendInvite");
        const nextSelf = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
        window.history.replaceState({}, "", nextSelf);
        return;
    }
    try {
        await apiRequest("friends-request", {
            method: "POST",
            body: { toUserId: friendId }
        });
        setFriendsSearchResult(`Заявка в друзья отправлена игроку #${friendId}.`);
        await refreshFriendsState();
        params.delete("friendInvite");
        const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
        window.history.replaceState({}, "", next);
    } catch (error) {
        const code = String(error?.code || "");
        if (code === "already_friends") {
            setFriendsSearchResult(`Игрок #${friendId} уже у вас в друзьях.`);
            params.delete("friendInvite");
            const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
            window.history.replaceState({}, "", next);
            return;
        }
        logQualityIssue("friend_invite", code || "friend invite failed");
    }
}


document.getElementById("roomCodeInput").addEventListener("input", (event) => {
    const next = String(event.target.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    event.target.value = next;
});

const snakeSkinCardsEl = document.getElementById("snakeSkinCards");
if (snakeSkinCardsEl) {
    snakeSkinCardsEl.addEventListener("click", (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target) return;
        const button = target.closest("button[data-skin-action]");
        if (!button) return;
        const action = String(button.dataset.skinAction || "");
        const skinId = String(button.dataset.skinId || "");
        if (!skinId) return;
        if (action === "preview") {
            setSnakeSkinPreview(skinId);
            return;
        }
        if (action === "buy-equip") {
            buyOrEquipSnakeSkin(skinId);
        }
    });
}

const snakeSkinRandomToggleBtn = document.getElementById("snakeSkinRandomToggleBtn");
if (snakeSkinRandomToggleBtn) {
    snakeSkinRandomToggleBtn.addEventListener("click", () => {
        cosmetics.randomSnakeSkin = !cosmetics.randomSnakeSkin;
        saveCosmetics();
        renderSnakeSkinMenu();
    });
}

const skinEditorToggleBtn = document.getElementById("skinEditorToggleBtn");
if (skinEditorToggleBtn) {
    skinEditorToggleBtn.addEventListener("click", () => {
        const advanced = document.getElementById("skinEditorAdvanced");
        if (!advanced) return;
        const hidden = advanced.classList.toggle("hidden");
        skinEditorToggleBtn.innerText = hidden ? "Расширенные эффекты" : "Скрыть эффекты";
    });
}


document.getElementById("foodColorInput").addEventListener("input", (event) => {
    cosmetics.foodColor = event.target.value;
    saveCosmetics();
    applyCosmetics();
});

document.getElementById("foodTypeSelect").addEventListener("change", (event) => {
    const value = event.target.value;
    if (value === "solar") {
        cosmetics.foodType = value;
    } else {
        const requiredId = `food-${value}`;
        if (!cosmetics.unlocked.includes(requiredId)) {
            event.target.value = cosmetics.foodType;
            alert("Этот тип еды нужно купить за трофеи.");
            return;
        }
        cosmetics.foodType = value;
    }
    saveCosmetics();
    applyCosmetics();
});

document.getElementById("eatEffectSelect").addEventListener("change", (event) => {
    const value = event.target.value;
    if (value === "spark") {
        cosmetics.eatEffect = value;
    } else {
        const requiredId = `eat-${value}`;
        if (!cosmetics.unlocked.includes(requiredId)) {
            event.target.value = cosmetics.eatEffect;
            alert("Этот эффект поедания нужно купить.");
            return;
        }
        cosmetics.eatEffect = value;
    }
    saveCosmetics();
    applyCosmetics();
});

document.getElementById("gameModeSelect").addEventListener("change", (event) => {
    const value = String(event.target.value || "classic");
    setSelectedGameMode(value);
    renderModeSwitchUI();
});

document.getElementById("trailEffectSelect").addEventListener("change", (event) => {
    const value = event.target.value;
    if (value !== "classic") {
        const requiredId = `trail-${value}`;
        if (!cosmetics.unlocked.includes(requiredId)) {
            event.target.value = cosmetics.trailEffect || "classic";
            alert("Этот эффект следа нужно купить.");
            return;
        }
    }
    cosmetics.trailEffect = value;
    saveCosmetics();
    applyCosmetics();
});

document.getElementById("deathAnimSelect").addEventListener("change", (event) => {
    const value = event.target.value;
    if (value !== "flash") {
        const requiredId = `death-${value}`;
        if (!cosmetics.unlocked.includes(requiredId)) {
            event.target.value = cosmetics.deathAnimation || "flash";
            alert("Эту анимацию смерти нужно купить.");
            return;
        }
    }
    cosmetics.deathAnimation = value;
    saveCosmetics();
    applyCosmetics();
});

document.getElementById("foodShapeSelect").addEventListener("change", (event) => {
    const value = event.target.value;
    if (value !== "orb") {
        const requiredId = `shape-${value}`;
        if (!cosmetics.unlocked.includes(requiredId)) {
            event.target.value = cosmetics.foodShape || "orb";
            alert("Эту форму еды нужно купить.");
            return;
        }
    }
    cosmetics.foodShape = value;
    saveCosmetics();
    applyCosmetics();
});


const buttonBindingState = {
    get roomSpectatorMode() { return roomSpectatorMode; },
    set roomSpectatorMode(value) { roomSpectatorMode = !!value; },
    get roomState() { return roomState; },
    set roomState(value) { roomState = value; },
    get roomLastStartedChallengeId() { return roomLastStartedChallengeId; },
    set roomLastStartedChallengeId(value) { roomLastStartedChallengeId = Number(value || 0); },
    get accountUser() { return accountUser; },
    set accountUser(value) { accountUser = value; },
    get accountToken() { return accountToken; },
    set accountToken(value) { accountToken = value; },
    get moderationOnlyCritical() { return moderationOnlyCritical; },
    set moderationOnlyCritical(value) { moderationOnlyCritical = !!value; },
    get leaderboardState() { return leaderboardState; },
    set leaderboardState(value) { leaderboardState = value; },
    get clanMembersPanelOpen() { return clanMembersPanelOpen; },
    set clanMembersPanelOpen(value) { clanMembersPanelOpen = !!value; },
    get boxInventory() { return boxInventory; },
    set boxInventory(value) { boxInventory = value; },
    get tutorialStepIndex() { return tutorialStepIndex; },
    set tutorialStepIndex(value) { tutorialStepIndex = Number(value || 0); },
    get onboardingDone() { return onboardingDone; },
    set onboardingDone(value) { onboardingDone = !!value; },
    get featureFlags() { return featureFlags; },
    set featureFlags(value) { featureFlags = value; },
    get uiLocale() { return uiLocale; },
    set uiLocale(value) { uiLocale = String(value || "ru"); },
    get abVariant() { return abVariant; },
    set abVariant(value) { abVariant = String(value || "alpha"); },
    get qualityLogs() { return qualityLogs; },
    set qualityLogs(value) { qualityLogs = value; },
    get currentGameMode() { return currentGameMode; },
    set currentGameMode(value) { currentGameMode = value; },
    get running() { return running; },
    set running(value) { running = !!value; },
    get shopPreviewItemId() { return shopPreviewItemId; },
    set shopPreviewItemId(value) { shopPreviewItemId = value; },
    get aiMode() { return aiMode; },
    set aiMode(value) { aiMode = !!value; },
    get sessionNoRewards() { return sessionNoRewards; },
    set sessionNoRewards(value) { sessionNoRewards = !!value; },
    get roomSession() { return roomSession; },
    set roomSession(value) { roomSession = value; },
    get isReplaying() { return isReplaying; },
    set isReplaying(value) { isReplaying = !!value; },
    get replayManager() { return replayManager; },
    get gameHistory() { return gameHistory; },
    set gameHistory(value) { gameHistory = value; },
    get highlightClips() { return highlightClips; },
    set highlightClips(value) { highlightClips = value; }
};

initMainButtons({
    state: buttonBindingState,
    requireAuthorizedAccount,
    startGame,
    showOnlyMenu,
    refreshPublicRoomsList,
    startRoomPolling,
    pullRoomState,
    restoreCurrentRoomState,
    refreshRoomUI,
    setRoomStatus,
    apiRequest,
    applyRoomState,
    startSpectatingRoom,
    loginOrRegister,
    updateNickname,
    logoutAccount,
    renderAuthState,
    syncCloudProgressNow,
    tryHandleFriendInviteUrl,
    refreshFriendsState,
    renderTrophyRoad,
    renderSnakeSkinMenu,
    setFriendsSearchResult,
    setFriendsTab,
    refreshClanState,
    tryJoinClanFromInviteUrl,
    refreshClanList,
    refreshQuestHub,
    refreshLeaderboard,
    refreshSeasonHub,
    buySeasonPass,
    hasModerationAccess,
    setModerationStatus,
    refreshModerationPanel,
    startModerationPolling,
    hasAuthorizedAccount,
    stopClanUiPolling,
    renderModerationConsole,
    refreshAdminChatMessages,
    refreshModerationConsole,
    claimSeasonReward,
    refreshClanRecommendations,
    setClanStatus,
    syncClanMembersPanel,
    refreshClanWarState,
    refreshClanWeeklyTop,
    refreshClanChat,
    refreshClanLogs,
    renderFriendsSearchUser,
    refreshSocialNotices,
    publishSocialNotice,
    closeMainMenuGroups,
    showRoomEventToast,
    openTutorial,
    renderTutorialStep,
    completeTutorial,
    saveFeatureFlags,
    saveUiLocale,
    assignAbVariant,
    applyLocalization,
    renderModeSwitchUI,
    refreshChallengeUI,
    applyCosmetics,
    syncSkinInputs,
    updateMenuTrophies,
    renderShop,
    applyNeonPack,
    inRoomChallengeSession,
    stopTrophyAnimation,
    stopModerationPolling,
    syncMenuOverlayState,
    renderHistory,
    exportGamesPayload,
    normalizeHighlightClip,
    exportFullProgressPayload,
    saveBoxInventory,
    AUTH_REQUIRED_FOR_PLAY,
    TUTORIAL_STEPS,
    ONBOARDING_DONE_KEY,
    I18N,
    NEON_PACKS
});

function queuePlayerDirection(x, y){
    if (isBannedUser) return;
    if(aiMode || isReplaying || !running) return;
    const nx = normalizeAxisValue(x);
    const ny = normalizeAxisValue(y);
    if(nx === null || ny === null) return;
    if(Math.abs(nx) + Math.abs(ny) !== 1) return;
    if(nx === -dir.x && ny === -dir.y) return;
    pendingPlayerDir = { x: nx, y: ny };
}

document.addEventListener("keydown", e => {
    const keyValue = typeof e?.key === "string" ? e.key : "";
    const k = String(keyValue || "").toLowerCase();
    if(!k) return;
    if(isReplaying){
        if(k === " "){
            e.preventDefault();
            replayManager.togglePaused();
            return;
        }
        if(k === "." || k === "ю"){
            e.preventDefault();
            replayManager.stepFrame();
            return;
        }
        if(k === "1"){
            replayManager.setPlaybackRate(1);
            return;
        }
        if(k === "2"){
            replayManager.setPlaybackRate(2);
            return;
        }
        if(k === "4"){
            replayManager.setPlaybackRate(4);
            return;
        }
        return;
    }
    if(aiMode) return;

    if(k==="arrowup"||k==="w"||k==="ц"){
        document.getElementById("keyUp").classList.add("active");
        queuePlayerDirection(0, -1);
    }
    if(k==="arrowdown"||k==="s"||k==="ы"){
        document.getElementById("keyDown").classList.add("active");
        queuePlayerDirection(0, 1);
    }
    if(k==="arrowleft"||k==="a"||k==="ф"){
        document.getElementById("keyLeft").classList.add("active");
        queuePlayerDirection(-1, 0);
    }
    if(k==="arrowright"||k==="d"||k==="в"){
        document.getElementById("keyRight").classList.add("active");
        queuePlayerDirection(1, 0);
    }
});

document.addEventListener("keyup", e => {
    const keyValue = typeof e?.key === "string" ? e.key : "";
    const k = String(keyValue || "").toLowerCase();
    if(!k) return;

    if(k==="arrowup"||k==="w"||k==="ц")
        document.getElementById("keyUp").classList.remove("active");

    if(k==="arrowdown"||k==="s"||k==="ы")
        document.getElementById("keyDown").classList.remove("active");

    if(k==="arrowleft"||k==="a"||k==="ф")
        document.getElementById("keyLeft").classList.remove("active");

    if(k==="arrowright"||k==="d"||k==="в")
        document.getElementById("keyRight").classList.remove("active");
});

function setDirection(x, y){
    queuePlayerDirection(x, y);
}

function pulseHaptic(){
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
}

function bindTouchDirection(id, x, y){
    const key = document.getElementById(id);
    if(!key) return;

    key.addEventListener("pointerdown", (e)=>{
        e.preventDefault();
        setDirection(x, y);
        pulseHaptic();
    }, { passive: false });
}

bindTouchDirection("keyUp", 0, -1);
bindTouchDirection("keyDown", 0, 1);
bindTouchDirection("keyLeft", -1, 0);
bindTouchDirection("keyRight", 1, 0);
document.addEventListener("pointerdown", () => {
    getAudioContext();
}, { once: true, passive: true });
document.addEventListener("click", (event) => {
    const el = event.target;
    if (el && el.tagName === "BUTTON") {
        playTone(430, 30, "triangle", 0.025);
    }
});
window.addEventListener("error", (event) => {
    const msg = String(event?.message || "runtime_error");
    logQualityIssue("window.error", msg);
});
window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    const msg = typeof reason === "string"
        ? reason
        : String(reason?.message || "unhandled_rejection");
    logQualityIssue("promise.reject", msg);
});
document.querySelectorAll(".key").forEach(key=>{
    key.addEventListener("pointerdown", ()=>{
        key.classList.add("active");
    });

    key.addEventListener("pointerup", ()=>{
        key.classList.remove("active");
    });

    key.addEventListener("pointerleave", ()=>{
        key.classList.remove("active");
    });
});
updateRank();

// 🔥 Сброс прогресса через консоль
window.resetProgress = function(){

    localStorage.removeItem("trophies");
    localStorage.removeItem("coins");
    localStorage.removeItem("rankRewardClaimedRank");
    localStorage.removeItem("best");
    localStorage.removeItem("snakeProgress");
    localStorage.removeItem("cosmetics");
    localStorage.removeItem("boxInventory");
    localStorage.removeItem("dailyChallenges");
    localStorage.removeItem(DAILY_LOGIN_KEY);
    localStorage.removeItem(WEEKLY_CHALLENGE_KEY);
    localStorage.removeItem(FRIEND_MISSION_KEY);
    localStorage.removeItem(SEASON_PASS_KEY);
    localStorage.removeItem(TROPHY_ROAD_KEY);
    localStorage.removeItem(CAREER_PROGRESS_KEY);
    localStorage.removeItem(ONBOARDING_DONE_KEY);
    localStorage.removeItem(HIGHLIGHT_CLIPS_KEY);

    trophies = 0;
    coins = 0;
    rankRewardClaimedRank = 0;
    best = 0;
    snakeProgress = { ...defaultSnakeProgress };
    cosmetics = { ...defaultCosmetics };
    boxInventory = { ...defaultBoxInventory };
    dailyChallenges = buildDailyChallenges();
    highlightClips = [];
    dailyLoginState = { lastClaimKey: "", streak: 0 };
    weeklyChallenge = createWeeklyChallenge();
    friendMissionState = createFriendMission();
    seasonPassState = {
        seasonId: getSeasonState().id,
        claimedFree: [],
        claimedPremium: [],
        premiumUnlocked: false,
        passXp: 0,
        claimedTiers: []
    };
    trophyRoadState = { claimed: [] };
    careerProgress = { highestTrophies: 0, maxStageIndex: 0 };
    careerPromotionBootstrapped = false;
    onboardingDone = false;

    setHudTrophiesValue(trophies);
    setHudCoinsValue(coins);
    updateBestDisplay();
    updateMenuTrophies();
    updateRank();
    renderSnakeProgress();
    applyCosmetics();
    syncSkinInputs();
    renderShop();
    refreshChallengeUI();
    syncFeatureFlagsUI();
    applyLocalization();
    renderHistory();
    updateQualityStatusUI();

    console.log("Прогресс обнулён");
    scheduleCloudSync(0);
};

function exportGamesPayload(games, suffix = "history"){
    const payload = {
        type: "snake-neon-history",
        version: 1,
        exportedAt: new Date().toISOString(),
        games: Array.isArray(games) ? games : []
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `snake-${suffix}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function exportFullProgressPayload(){
    const payload = {
        type: "snake-neon-progress",
        version: 1,
        exportedAt: new Date().toISOString(),
        progress: {
            trophies,
            coins,
            rankRewardClaimedRank,
            best,
            snakeProgress,
            cosmetics,
            featureFlags,
            uiLocale,
            dailyLoginState,
            weeklyChallenge,
            friendMissionState,
            seasonPassState,
            trophyRoadState,
            careerProgress,
            dailyChallenges,
            gameHistory,
            highlightClips
        }
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `snake-progress-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function applyImportedProgress(progressRaw){
    if(!progressRaw || typeof progressRaw !== "object"){
        throw new Error("invalid progress payload");
    }

    const nextTrophies = Number.isFinite(progressRaw.trophies)
        ? Math.max(0, Math.floor(progressRaw.trophies))
        : 0;
    const nextCoins = Number.isFinite(progressRaw.coins)
        ? Math.max(0, Math.floor(progressRaw.coins))
        : 0;
    const fallbackClaimedByTrophies = Math.min(50, Math.floor(getRankNumberFromTrophies(nextTrophies) / 5) * 5);
    const nextRankRewardClaimedRank = Number.isFinite(progressRaw.rankRewardClaimedRank)
        ? Math.max(0, Math.min(50, Math.floor(progressRaw.rankRewardClaimedRank)))
        : fallbackClaimedByTrophies;
    const nextBest = Number.isFinite(progressRaw.best)
        ? Math.max(0, Math.floor(progressRaw.best))
        : 0;

    const nextSnakeProgress = {
        level: Number.isFinite(progressRaw.snakeProgress?.level) ? Math.max(1, Math.floor(progressRaw.snakeProgress.level)) : 1,
        xp: Number.isFinite(progressRaw.snakeProgress?.xp) ? Math.max(0, progressRaw.snakeProgress.xp) : 0,
        xpNeed: Number.isFinite(progressRaw.snakeProgress?.xpNeed) ? Math.max(5, Math.floor(progressRaw.snakeProgress.xpNeed)) : 10
    };

    const parsedCosmetics = (progressRaw.cosmetics && typeof progressRaw.cosmetics === "object") ? progressRaw.cosmetics : {};
    const unlocked = Array.isArray(parsedCosmetics.unlocked) ? parsedCosmetics.unlocked : [];
    const nextCosmetics = {
        ...defaultCosmetics,
        ...parsedCosmetics,
        unlocked: Array.from(new Set(["classic", ...unlocked]))
    };

    const nextHistory = Array.isArray(progressRaw.gameHistory)
        ? progressRaw.gameHistory.map((item) => normalizeHistoryRecord(item, !!item?.imported)).filter(Boolean).slice(0, 50)
        : [];
    const nextHighlights = Array.isArray(progressRaw.highlightClips)
        ? progressRaw.highlightClips.map((item) => normalizeHighlightClip(item)).filter(Boolean).slice(0, 20)
        : highlightClips;
    const parsedBoxes = (progressRaw.boxInventory && typeof progressRaw.boxInventory === "object")
        ? progressRaw.boxInventory
        : {};
    const nextBoxInventory = {
        common: Math.max(0, Math.floor(Number(parsedBoxes.common || 0))),
        rare: Math.max(0, Math.floor(Number(parsedBoxes.rare || 0))),
        super: Math.max(0, Math.floor(Number(parsedBoxes.super || 0)))
    };

    let nextDaily = null;
    if (progressRaw.dailyChallenges && typeof progressRaw.dailyChallenges === "object" && Array.isArray(progressRaw.dailyChallenges.tasks)) {
        nextDaily = progressRaw.dailyChallenges;
    } else {
        nextDaily = buildDailyChallenges();
    }
    const nextFlags = (progressRaw.featureFlags && typeof progressRaw.featureFlags === "object")
        ? progressRaw.featureFlags
        : featureFlags;
    const nextLocale = (typeof progressRaw.uiLocale === "string" && progressRaw.uiLocale in I18N)
        ? progressRaw.uiLocale
        : uiLocale;
    const nextDailyLoginState = (progressRaw.dailyLoginState && typeof progressRaw.dailyLoginState === "object")
        ? progressRaw.dailyLoginState
        : dailyLoginState;
    const nextWeeklyChallenge = (progressRaw.weeklyChallenge && typeof progressRaw.weeklyChallenge === "object")
        ? progressRaw.weeklyChallenge
        : weeklyChallenge;
    const nextFriendMissionState = (progressRaw.friendMissionState && typeof progressRaw.friendMissionState === "object")
        ? progressRaw.friendMissionState
        : friendMissionState;
    const nextSeasonPassState = (progressRaw.seasonPassState && typeof progressRaw.seasonPassState === "object")
        ? progressRaw.seasonPassState
        : seasonPassState;
    const nextTrophyRoadState = (progressRaw.trophyRoadState && typeof progressRaw.trophyRoadState === "object")
        ? progressRaw.trophyRoadState
        : trophyRoadState;
    const nextCareerProgress = normalizeCareerProgressState(
        (progressRaw.careerProgress && typeof progressRaw.careerProgress === "object") ? progressRaw.careerProgress : null,
        nextTrophies
    );

    trophies = nextTrophies;
    coins = nextCoins;
    rankRewardClaimedRank = nextRankRewardClaimedRank;
    best = nextBest;
    snakeProgress = nextSnakeProgress;
    cosmetics = nextCosmetics;
    boxInventory = nextBoxInventory;
    gameHistory = nextHistory;
    highlightClips = nextHighlights;
    dailyChallenges = nextDaily;
    featureFlags = { ...DEFAULT_FEATURE_FLAGS, ...nextFlags };
    uiLocale = nextLocale;
    dailyLoginState = nextDailyLoginState;
    weeklyChallenge = nextWeeklyChallenge;
    friendMissionState = nextFriendMissionState;
    seasonPassState = nextSeasonPassState;
    trophyRoadState = nextTrophyRoadState;
    trophyRoadState = normalizeTrophyRoadState();
    careerProgress = nextCareerProgress;
    careerPromotionBootstrapped = false;

    localStorage.setItem("trophies", String(trophies));
    localStorage.setItem("coins", String(coins));
    localStorage.setItem("rankRewardClaimedRank", String(rankRewardClaimedRank));
    localStorage.setItem("best", String(best));
    localStorage.setItem("snakeProgress", JSON.stringify(snakeProgress));
    localStorage.setItem("cosmetics", JSON.stringify(cosmetics));
    localStorage.setItem(BOX_INVENTORY_KEY, JSON.stringify(boxInventory));
    localStorage.setItem("dailyChallenges", JSON.stringify(dailyChallenges));
    localStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify(featureFlags));
    localStorage.setItem(UI_LOCALE_KEY, uiLocale);
    localStorage.setItem(DAILY_LOGIN_KEY, JSON.stringify(dailyLoginState));
    localStorage.setItem(WEEKLY_CHALLENGE_KEY, JSON.stringify(weeklyChallenge));
    localStorage.setItem(FRIEND_MISSION_KEY, JSON.stringify(friendMissionState));
    localStorage.setItem(SEASON_PASS_KEY, JSON.stringify(seasonPassState));
    localStorage.setItem(TROPHY_ROAD_KEY, JSON.stringify(trophyRoadState));
    localStorage.setItem(CAREER_PROGRESS_KEY, JSON.stringify(careerProgress));
    persistHistory();
    persistHighlights();

    setHudTrophiesValue(trophies);
    setHudCoinsValue(coins);
    updateBestDisplay();
    updateMenuTrophies();
    updateRank();
    renderSnakeProgress();
    applyCosmetics();
    syncSkinInputs();
    renderShop();
    refreshChallengeUI();
    syncFeatureFlagsUI();
    applyLocalization();
    renderHistory();
    scheduleCloudSync(0);
}


document.getElementById("importHistoryInput").addEventListener("change", async (event) => {
    const input = event.target;
    const file = input.files && input.files[0];
    if(!file) return;

    try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const rawGames = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed.games) ? parsed.games : []);

        const importedGames = rawGames
            .map((game) => normalizeHistoryRecord(game, true))
            .filter(Boolean);

        if(!importedGames.length){
            alert("В файле нет валидных игр для импорта.");
            return;
        }

        gameHistory = [...importedGames, ...gameHistory].slice(0, 50);
        persistHistory();
        renderHistory();
        scheduleCloudSync(0);
        alert(`Импортировано игр: ${importedGames.length}`);
    } catch (e) {
        console.error(e);
        alert("Не удалось импортировать файл истории.");
    } finally {
        input.value = "";
    }
});

document.getElementById("importProgressInput").addEventListener("change", async (event) => {
    const input = event.target;
    const file = input.files && input.files[0];
    if(!file) return;

    try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        const progressPayload = (parsed && typeof parsed === "object" && parsed.progress && typeof parsed.progress === "object")
            ? parsed.progress
            : parsed;

        applyImportedProgress(progressPayload);
        alert("Прогресс успешно импортирован.");
    } catch (e) {
        console.error(e);
        alert("Не удалось импортировать прогресс.");
    } finally {
        input.value = "";
    }
});
function saveGameToHistory(score, trophyChange, wasAI){

    const now = new Date();

    const record = normalizeHistoryRecord({
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString(),
        score: score,
        trophies: trophyChange,
        isAI: !!wasAI,
        noRewards: !!sessionNoRewards,
        imported: false,
        gameMode: currentGameMode,
        seed: replaySeed,
        inputs: Array.isArray(currentReplay) ? [...currentReplay] : [],
        foodHistory: Array.isArray(foodHistory) ? [...foodHistory] : [],
        stateFrames: Array.isArray(stateFrames) ? stateFrames.slice(0, 6000) : [],
        finalFrame: gameFrame,
        duration: performance.now() - gameStartTime,
        initialSpeed: sessionStartSpeed,
        initialTargetLength: sessionStartTargetLength,
        initialDir: sessionStartDir
    }, false);

    if(!record) return;

    gameHistory.unshift(record); // добавляем в начало

    if(gameHistory.length > 50){
        gameHistory.pop(); // максимум 50 игр
    }

    persistHistory();
}

function updateReplayControlsUI(state){
    const controls = document.getElementById("replayControls");
    const pauseBtn = document.getElementById("replayPauseBtn");
    const stepBtn = document.getElementById("replayStepBtn");
    const speedBtns = Array.from(document.querySelectorAll(".replaySpeedBtn"));
    if (!controls || !pauseBtn || !stepBtn) return;

    const active = !!state?.active;
    const paused = !!state?.paused;
    const rate = Number(state?.playbackRate || 1);

    controls.classList.toggle("hidden", !active);
    pauseBtn.innerText = paused ? "Продолжить" : "Пауза";
    stepBtn.disabled = !active;
    pauseBtn.disabled = !active;

    for (const btn of speedBtns) {
        const value = Number(btn.dataset.speed || "1");
        btn.classList.toggle("active", active && Math.abs(value - rate) < 0.001);
        btn.disabled = !active;
    }
}

const replayManager = createReplayManager({
    getGameHistory: () => gameHistory,
    setCurrentReplayData: (data) => { currentReplayData = data; },
    clearMutation,
    sanitizeReplayInputs,
    sanitizeFoodHistory,
    randomFood,
    resolveModeKey: (key) => (GAME_MODES[key] ? key : "classic"),
    setCurrentGameMode: (key) => { currentGameMode = key; },
    setModeTimeLeftMs: (value) => { modeTimeLeftMs = value; },
    updateModeDisplay,
    setIsReplaying: (value) => { isReplaying = !!value; },
    setRunning: (value) => { running = !!value; },
    getRunning: () => running,
    setAiMode: (value) => { aiMode = !!value; },
    setPendingPlayerDir: (value) => { pendingPlayerDir = value; },
    enterReplayUi: () => {
        document.body.classList.add("in-arena");
        document.getElementById("historyMenu").classList.add("hidden");
        document.getElementById("mainMenu").classList.add("hidden");
        document.getElementById("playMenu").classList.add("hidden");
        document.getElementById("socialMenu").classList.add("hidden");
        document.getElementById("moderationMenu").classList.add("hidden");
        document.getElementById("settingsMenu").classList.add("hidden");
        document.getElementById("tutorialMenu").classList.add("hidden");
        document.getElementById("accountMenu").classList.add("hidden");
        document.getElementById("friendsMenu").classList.add("hidden");
        document.getElementById("trophyRoadMenu").classList.add("hidden");
        document.getElementById("clanMenu").classList.add("hidden");
        document.getElementById("leaderboardMenu").classList.add("hidden");
        document.getElementById("seasonMenu").classList.add("hidden");
        document.getElementById("questsMenu").classList.add("hidden");
        document.getElementById("roomMenu").classList.add("hidden");
        document.getElementById("skinMenu").classList.add("hidden");
        document.getElementById("shopMenu").classList.add("hidden");
        document.getElementById("gameOverMenu").classList.add("hidden");
        document.getElementById("exitBtn").classList.remove("hidden");
        stopModerationPolling();
        updateReplayControlsUI({ active: true, paused: false, playbackRate: 1 });
    },
    leaveReplayUi: () => {
        document.body.classList.remove("in-arena");
        document.getElementById("exitBtn").classList.add("hidden");
        updateReplayControlsUI({ active: false, paused: false, playbackRate: 1 });
        showOnlyMenu("mainMenu");
    },
    syncMenuOverlayState,
    onReplayStateChange: updateReplayControlsUI,
    setReplaySeed: (value) => { replaySeed = value; },
    setGameFrame: (value) => { gameFrame = value; },
    setReplayFoodIndex: (value) => { replayFoodIndex = value; },
    setAccumulator: (value) => { accumulator = value; },
    init,
    setScore: (value) => { score = value; },
    incrementScore: () => { score += 1; },
    getScore: () => score,
    setLevel: (value) => { level = value; },
    getLevel: () => level,
    setTargetLength: (value) => { targetLength = value; },
    getTargetLength: () => targetLength,
    setSpeed: (value) => { speed = value; },
    getSpeed: () => speed,
    getBaseSpeed: () => baseSpeed,
    setDir: (value) => { dir = value; },
    getDir: () => dir,
    updateSpeedDisplay,
    updateScoreDisplay,
    setLevelDisplay: (value) => {
        const el = document.getElementById("levelDisplay");
        if (el) el.innerText = String(value);
    },
    setFood: (value) => { food = value; },
    setSnake: (value) => { snake = value; },
    getFixedStep: () => FIXED_STEP,
    normalizeAxisValue,
    getSnake: () => snake,
    checkCollision,
    draw
});
updateReplayControlsUI(replayManager.getReplayState());

function renderHistory(){

    const container = document.getElementById("historyList");
    container.innerHTML = "";

    if(gameHistory.length === 0){
        container.innerHTML = "<p>Пока нет сыгранных игр</p>";
    } else {
        gameHistory.forEach((game, index) => {

            const div = document.createElement("div");

            div.style.padding = "10px";
            div.style.marginBottom = "8px";
            div.style.borderBottom = "1px solid #00ffff33";

            const isAIGame = !!game.isAI;
            const isTraining = !!game.noRewards;
            const isImported = !!game.imported;
            const modeKey = GAME_MODES[game.gameMode] ? game.gameMode : "classic";
            const gameModeLabel = GAME_MODES[modeKey].label;
            const normalizedTrophy = Number.isFinite(game.trophies) ? game.trophies : 0;
            const trophyText = (isAIGame || isImported || isTraining)
                ? "-"
                : (normalizedTrophy >= 0 ? "+" + normalizedTrophy : String(normalizedTrophy));
            const modeText = isImported
                ? (isAIGame ? "Импорт AI" : (isTraining ? "Импорт Тренировка" : "Импорт"))
                : (isAIGame ? "AI" : (isTraining ? "Тренировка" : "Игрок"));

            div.innerHTML = `
    <strong>${escapeHtml(game.date)} ${escapeHtml(game.time)}</strong><br>
    Режим: ${escapeHtml(modeText)} • ${escapeHtml(gameModeLabel)}<br>
    Счёт: ${game.score}<br>
    Трофеи: ${trophyText}<br><br>
    <button class="replayBtn">Смотреть повтор</button>
    <button class="highlightBtn">Сделать highlight</button>
    <button class="exportGameBtn">Экспорт игры</button>
`;

            const replayBtn = div.querySelector(".replayBtn");
            if (replayBtn) {
                replayBtn.addEventListener("click", () => watchReplay(index));
            }

            const highlightBtn = div.querySelector(".highlightBtn");
            if (highlightBtn) {
                highlightBtn.addEventListener("click", () => {
                    createHighlightFromGame(index);
                });
            }

            const exportGameBtn = div.querySelector(".exportGameBtn");
            if (exportGameBtn) {
                exportGameBtn.addEventListener("click", () => {
                    exportGamesPayload([game], `game-${index + 1}`);
                });
            }

            container.appendChild(div);
        });
    }
    renderHighlights();
}

function createHighlightFromGame(gameIndex) {
    const game = gameHistory[gameIndex];
    if (!game) return;
    const clip = buildHighlightFromGame(game, gameIndex);
    if (!clip) {
        alert("Не удалось создать highlight для этой игры.");
        return;
    }
    highlightClips.unshift(clip);
    if (highlightClips.length > 20) highlightClips = highlightClips.slice(0, 20);
    persistHighlights();
    renderHighlights();
    scheduleCloudSync(0);
    showRoomEventToast("Highlight клип сохранён.");
}

function deleteHighlightClipById(clipId) {
    const next = highlightClips.filter((clip) => String(clip.id) !== String(clipId));
    if (next.length === highlightClips.length) return;
    highlightClips = next;
    persistHighlights();
    renderHighlights();
    scheduleCloudSync(0);
}

function renderHighlights() {
    const container = document.getElementById("highlightsList");
    if (!container) return;
    container.innerHTML = "";
    if (!highlightClips.length) {
        container.innerHTML = '<div class="friendsItem">Клипов пока нет. Нажмите "Сделать highlight" у любой игры.</div>';
        return;
    }

    for (const clip of highlightClips) {
        const item = normalizeHighlightClip(clip);
        if (!item) continue;
        const div = document.createElement("div");
        div.className = "friendsItem";
        const modeKey = GAME_MODES[item.sourceMode] ? item.sourceMode : "classic";
        const modeLabel = GAME_MODES[modeKey]?.label || modeKey.toUpperCase();
        const frames = Number(item.replay?.finalFrame || 0);
        const seconds = Math.max(1, Math.round(frames / 120));
        div.innerHTML = `
<div class="clanEntryTitle">${escapeHtml(item.title)}</div>
<div class="clanEntryMeta">Режим: ${escapeHtml(modeLabel)} • Счёт: ${Number(item.sourceScore || 0)} • Длина: ~${seconds}s</div>
<div class="authRow" style="margin-top:8px;">
    <button class="watchClipBtn">Смотреть</button>
    <button class="exportClipBtn">Экспорт</button>
    <button class="deleteClipBtn">Удалить</button>
</div>`;
        const watchBtn = div.querySelector(".watchClipBtn");
        const exportBtn = div.querySelector(".exportClipBtn");
        const deleteBtn = div.querySelector(".deleteClipBtn");
        if (watchBtn) {
            watchBtn.addEventListener("click", () => {
                watchReplayData(item.replay);
            });
        }
        if (exportBtn) {
            exportBtn.addEventListener("click", () => {
                exportGamesPayload([item.replay], `highlight-${String(item.id).slice(0, 12)}`);
            });
        }
        if (deleteBtn) {
            deleteBtn.addEventListener("click", () => {
                deleteHighlightClipById(item.id);
            });
        }
        container.appendChild(div);
    }
}
function watchReplay(index){
    replayManager.watchReplay(index);
}
function watchReplayData(replayData){
    replayManager.watchReplayData(replayData);
}

window.render_game_to_text = function renderGameToText() {
    const globalEvent = currentGlobalEventMeta();
    const arena = getArenaBounds();
    const career = getCareerData();
    const payload = {
        coordinateSystem: "origin top-left, +x right, +y down",
        running,
        replay: isReplaying,
        room: {
            code: roomState?.roomCode || "",
            status: roomState?.status || "none",
            spectator: !!roomSpectatorMode
        },
        mode: aiMode ? "ai" : "player",
        gameMode: currentGameMode,
        globalEvent: {
            id: globalEvent.id,
            title: globalEvent.title,
            description: globalEvent.description
        },
        arena: {
            mini: !!arena.miniActive,
            minCell: arena.minCell,
            maxCell: arena.maxCell
        },
        performance: {
            mobileOptimized: !!mobileOptimized,
            lowPowerMobile: !!lowPowerMobile,
            fixedStepMs: Math.round(FIXED_STEP * 1000) / 1000
        },
        modeTimeLeftMs: Math.max(0, Math.round(modeTimeLeftMs)),
        score,
        level,
        coins,
        mutation: activeMutation
            ? { id: activeMutation.id, leftMs: Math.max(0, Math.round(mutationRemainingMs())) }
            : null,
        snakeLevel: snakeProgress.level,
        trophies,
        career: {
            title: career.title,
            highestTrophies: career.highestTrophies,
            nextTitle: career.nextStage ? career.nextStage.title : "MAX",
            remainingToNext: career.remainingToNext
        },
        history: {
            games: Array.isArray(gameHistory) ? gameHistory.length : 0,
            highlights: Array.isArray(highlightClips) ? highlightClips.length : 0
        },
        survivalMsCurrentRun: Math.round(survivalMsCurrentRun),
        locale: uiLocale,
        abVariant,
        weeklyChallenge: weeklyChallenge
            ? {
                type: weeklyChallenge.type,
                progress: weeklyChallenge.progress,
                target: weeklyChallenge.target,
                done: weeklyChallenge.done
            }
            : null,
        friendMission: friendMissionState
            ? {
                progress: friendMissionState.progress,
                target: friendMissionState.target,
                claimed: friendMissionState.claimed
            }
            : null,
        head: snake && snake[0] ? { x: Math.round(snake[0].x), y: Math.round(snake[0].y) } : null,
        food: food ? { x: Math.round(food.x), y: Math.round(food.y) } : null,
        dailyChallenges: Array.isArray(dailyChallenges?.tasks)
            ? dailyChallenges.tasks.map((task) => ({
                type: task.type,
                progress: task.progress,
                target: task.target,
                done: task.done
            }))
            : []
    };
    return JSON.stringify(payload);
};

window.advanceTime = function advanceTime(ms) {
    if (!running || !Number.isFinite(ms) || ms <= 0) {
        draw();
        return;
    }
    const steps = Math.max(1, Math.round(ms / FIXED_STEP));
    for (let i = 0; i < steps; i++) {
        update(FIXED_STEP);
        if (!running) break;
    }
    draw();
};
