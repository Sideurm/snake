export const BASE_AI_CONFIG = {
    depthBoost: 1,
    minSpaceFloor: 12,
    spaceBuffer: 1,
    stateTailReachBonus: 1800,
    stateTailBlockedPenalty: -900,
    stateSpaceWeight: 8,
    stateFoodDistanceWeight: 18,
    moveSafeBonus: 650,
    moveUnsafePenalty: -650,
    moveTailReachBonus: 150,
    moveTailBlockedPenalty: -120,
    moveSpaceWeight: 5,
    moveFoodDistanceWeight: 24,
    moveEdgeDistanceWeight: 7,
    keepDirectionBonus: 70,
    directionChangePenalty: 45,
    zigzagPenalty: 90,
    switchThreshold: 40,
    moveGrowBonus: 1100,
    recurseDiscount: 0.82,
    rootDiscount: 0.88,
    strictSafeFilter: true,
    preferSafeMoves: true,
    requireFutureMobility: true,
    minFutureMovesAfterEat: 2,
    maxLookaheadNodes: 560,
    deadEndPenalty: 1600,
    corridorPenalty: 220,
    mobilityBonus: 110
};

export function buildAiConfig({ snakeLen = 0, freeSpace = 0, boardArea = 1, stuckLoop = false } = {}) {
    const longGame = snakeLen >= 36;
    const endgame = snakeLen >= 56;
    const pressureRatio = boardArea > 0 ? freeSpace / boardArea : 1;
    const highPressure = pressureRatio < 0.28 || snakeLen >= boardArea * 0.62;

    const cfg = {
        ...BASE_AI_CONFIG,
        depthBoost: endgame ? 2 : (longGame ? 1 : BASE_AI_CONFIG.depthBoost),
        maxLookaheadNodes: endgame ? 980 : (longGame ? 760 : BASE_AI_CONFIG.maxLookaheadNodes),
        minSpaceFloor: endgame ? 16 : BASE_AI_CONFIG.minSpaceFloor,
        switchThreshold: endgame ? 55 : BASE_AI_CONFIG.switchThreshold
    };

    if (highPressure) {
        cfg.stateTailReachBonus += 420;
        cfg.stateTailBlockedPenalty -= 300;
        cfg.stateSpaceWeight += 4;
        cfg.moveFoodDistanceWeight = Math.max(8, cfg.moveFoodDistanceWeight - 8);
        cfg.moveSpaceWeight += 3;
        cfg.mobilityBonus += 90;
        cfg.deadEndPenalty += 600;
        cfg.corridorPenalty += 100;
        cfg.minFutureMovesAfterEat = 3;
    }

    if (stuckLoop) {
        cfg.moveFoodDistanceWeight += 8;
        cfg.rootDiscount = Math.min(0.93, cfg.rootDiscount + 0.03);
    }

    return cfg;
}
