import { state } from "./state.js";
import { highlight } from "./ui.js";
import { buildAiConfig } from "./config.js";
import { createLookaheadCache } from "./lookahead-cache.js";

const DIRECTIONS = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
];

function currentProfileConfig(context) {
    return buildAiConfig(context);
}

function toCell(point) {
    return {
        x: Math.floor(point.x / state.CELL),
        y: Math.floor(point.y / state.CELL)
    };
}

function toSnakeCells(snake) {
    return snake.map(toCell);
}

function cellKey(cell) {
    return `${cell.x},${cell.y}`;
}

function isInside(cell) {
    return cell.x >= 0 && cell.y >= 0 && cell.x < state.GRID && cell.y < state.GRID;
}

function equalCells(a, b) {
    return a.x === b.x && a.y === b.y;
}

function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function cloneDirection(dir) {
    return dir ? { x: dir.x, y: dir.y } : null;
}

function equalDirection(a, b) {
    if (!a || !b) return false;
    return a.x === b.x && a.y === b.y;
}

function buildDecisionStateKey(cells, foodCell) {
    const head = cells[0];
    const tail = cells[cells.length - 1];
    const foodKey = foodCell ? `${foodCell.x},${foodCell.y}` : "none";
    return `${head.x},${head.y}|${tail.x},${tail.y}|${foodKey}|${cells.length}`;
}

function buildLookaheadKey(cells, foodCell, depth) {
    const head = cells[0];
    const tail = cells[cells.length - 1];
    const sample = [];
    const step = Math.max(1, Math.floor(cells.length / 6));
    for (let i = 0; i < cells.length; i += step) {
        sample.push(cellKey(cells[i]));
        if (sample.length >= 6) break;
    }
    const foodKey = foodCell ? cellKey(foodCell) : "none";
    return `${depth}|${cellKey(head)}|${cellKey(tail)}|${foodKey}|${cells.length}|${sample.join(";")}`;
}

function neighbors(cell) {
    const result = [];

    for (const dir of DIRECTIONS) {
        const next = { x: cell.x + dir.x, y: cell.y + dir.y };
        if (isInside(next)) {
            result.push(next);
        }
    }

    return result;
}

function reconstructPath(parent, endKey) {
    const path = [];
    let cursor = endKey;

    while (cursor !== null) {
        const [x, y] = cursor.split(",").map(Number);
        path.push({ x, y });
        cursor = parent.get(cursor);
    }

    path.reverse();
    return path;
}

function bfs(start, target, blocked) {
    if (!isInside(start) || !isInside(target)) return null;

    const startKey = cellKey(start);
    const targetKey = cellKey(target);

    if (startKey === targetKey) {
        return [start];
    }

    const queue = [start];
    let head = 0;
    const parent = new Map();
    parent.set(startKey, null);

    while (head < queue.length) {
        const current = queue[head++];

        for (const next of neighbors(current)) {
            const nextKey = cellKey(next);

            if (parent.has(nextKey)) continue;
            if (blocked.has(nextKey) && nextKey !== targetKey) continue;

            parent.set(nextKey, cellKey(current));
            if (nextKey === targetKey) {
                return reconstructPath(parent, targetKey);
            }

            queue.push(next);
        }
    }

    return null;
}

function floodFillCount(start, blocked, limit) {
    if (!isInside(start)) return 0;
    if (blocked.has(cellKey(start))) return 0;

    const queue = [start];
    let head = 0;
    const seen = new Set([cellKey(start)]);

    while (head < queue.length && seen.size < limit) {
        const current = queue[head++];

        for (const next of neighbors(current)) {
            const nextKey = cellKey(next);
            if (seen.has(nextKey)) continue;
            if (blocked.has(nextKey)) continue;

            seen.add(nextKey);
            queue.push(next);
        }
    }

    return seen.size;
}

function buildBlocked(cells, headIndex = 0, tailIndex = cells.length - 1) {
    const blocked = new Set();
    for (let i = 0; i < cells.length; i++) {
        if (i === headIndex || i === tailIndex) continue;
        blocked.add(cellKey(cells[i]));
    }
    return blocked;
}

function canMoveTo(cells, next, willGrow) {
    if (!isInside(next)) return false;

    const checkUntil = willGrow ? cells.length - 1 : cells.length - 2;
    for (let i = 0; i <= checkUntil; i++) {
        if (equalCells(cells[i], next)) return false;
    }

    return true;
}

function simulateMove(cells, next, willGrow) {
    const trimmed = willGrow ? cells : cells.slice(0, -1);
    return [next, ...trimmed];
}

function evaluateState(cells) {
    const head = cells[0];
    const tail = cells[cells.length - 1];
    const blockedForPath = buildBlocked(cells);
    const tailPath = bfs(head, tail, blockedForPath);

    const blockedForSpace = new Set();
    for (let i = 1; i < cells.length; i++) {
        blockedForSpace.add(cellKey(cells[i]));
    }

    const freeSpace = floodFillCount(head, blockedForSpace, state.GRID * state.GRID);

    return {
        tailReachable: !!tailPath,
        freeSpace,
        snakeLength: cells.length
    };
}

function evaluateMove(cells, next, foodCell, cfg) {
    const willGrow = !!foodCell && equalCells(next, foodCell);

    if (!canMoveTo(cells, next, willGrow)) return null;

    const nextCells = simulateMove(cells, next, willGrow);
    const state = evaluateState(nextCells);

    const safeBySpace = state.freeSpace >= Math.max(state.snakeLength + cfg.spaceBuffer, cfg.minSpaceFloor);
    const safe = state.tailReachable || safeBySpace;
    const nextFood = willGrow ? null : foodCell;
    const nextMobility = countLegalMoves(nextCells, nextFood, cfg);
    const trapRisk = nextMobility <= 1 ? 2 : (nextMobility === 2 ? 1 : 0);

    return {
        next,
        willGrow,
        safe,
        tailReachable: state.tailReachable,
        freeSpace: state.freeSpace,
        nextMobility,
        trapRisk,
        nextCells
    };
}

function getHamiltonianNextCell(current) {
    if (!state.hamiltonianPath.length) return null;

    const currentIndex = state.hamiltonianPath.findIndex(
        (cell) => cell.x === current.x && cell.y === current.y
    );

    if (currentIndex !== -1) {
        state.aiStepIndex = (currentIndex + 1) % state.hamiltonianPath.length;
    }

    const candidate = state.hamiltonianPath[state.aiStepIndex];
    if (!candidate) return null;

    return { x: candidate.x, y: candidate.y };
}

function directionFromTo(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    if (dx === 1 && dy === 0) return { x: 1, y: 0 };
    if (dx === -1 && dy === 0) return { x: -1, y: 0 };
    if (dx === 0 && dy === 1) return { x: 0, y: 1 };
    if (dx === 0 && dy === -1) return { x: 0, y: -1 };

    return null;
}

function isOppositeDirection(a, b) {
    if (!a || !b) return false;
    return a.x === -b.x && a.y === -b.y;
}

function estimateStepPixels(snake) {
    if (!snake || snake.length < 2) {
        return Math.max(2, state.CELL * 0.15);
    }

    const dx = snake[0].x - snake[1].x;
    const dy = snake[0].y - snake[1].y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (!Number.isFinite(distance) || distance < 0.5) {
        return Math.max(2, state.CELL * 0.15);
    }

    return Math.min(Math.max(distance, 2), state.CELL * 0.5);
}

function isDirectionLikelyCollision(snake, direction) {
    if (!snake || !snake.length) return false;

    const boardMax = state.GRID * state.CELL;
    const head = snake[0];
    const step = estimateStepPixels(snake);
    const horizon = 12;
    const collisionDistSq = 15 * 15;

    for (let n = 1; n <= horizon; n++) {
        const x = head.x + direction.x * step * n;
        const y = head.y + direction.y * step * n;

        if (x < 0 || y < 0 || x >= boardMax || y >= boardMax) {
            return true;
        }

        for (let i = 8; i < snake.length; i++) {
            const dx = x - snake[i].x;
            const dy = y - snake[i].y;
            if (dx * dx + dy * dy < collisionDistSq) {
                return true;
            }
        }
    }

    return false;
}

function evaluateStateScore(cells, foodCell, cfg) {
    const state = evaluateState(cells);
    let score = 0;

    score += state.tailReachable ? cfg.stateTailReachBonus : cfg.stateTailBlockedPenalty;
    score += state.freeSpace * cfg.stateSpaceWeight;

    if (foodCell) {
        score -= manhattan(cells[0], foodCell) * cfg.stateFoodDistanceWeight;
    }

    return score;
}

function immediateMoveScore(move, foodCell, cfg) {
    let score = 0;

    score += move.safe ? cfg.moveSafeBonus : cfg.moveUnsafePenalty;
    score += move.tailReachable ? cfg.moveTailReachBonus : cfg.moveTailBlockedPenalty;
    score += move.freeSpace * cfg.moveSpaceWeight;
    score += move.nextMobility * (cfg.mobilityBonus || 0);
    if (move.trapRisk === 2) score -= (cfg.deadEndPenalty || 0);
    if (move.trapRisk === 1) score -= (cfg.corridorPenalty || 0);

    if (foodCell) {
        score -= manhattan(move.next, foodCell) * cfg.moveFoodDistanceWeight;
        if (move.willGrow) {
            score += cfg.moveGrowBonus;
        }
    }

    const edgeDist = Math.min(
        move.next.x,
        move.next.y,
        state.GRID - 1 - move.next.x,
        state.GRID - 1 - move.next.y
    );
    score += edgeDist * cfg.moveEdgeDistanceWeight;

    return score;
}

function computeLookaheadDepth(snakeLength, cfg) {
    let depth;

    if (snakeLength < 10) depth = 4;
    else if (snakeLength < 26) depth = 3;
    else depth = 2;

    return Math.max(1, depth + cfg.depthBoost);
}

function listMoves(cells, foodCell, cfg) {
    const head = cells[0];
    const result = [];

    for (const next of neighbors(head)) {
        const move = evaluateMove(cells, next, foodCell, cfg);
        if (move) {
            result.push(move);
        }
    }

    return result;
}

function chooseCandidateMoves(moves, cfg) {
    if (!moves.length) return moves;

    let candidates = moves;

    if ((cfg.preferSafeMoves || cfg.strictSafeFilter) && candidates.some((m) => m.safe)) {
        candidates = candidates.filter((m) => m.safe);
    }

    if (cfg.requireFutureMobility && candidates.some((m) => m.nextMobility > 0)) {
        candidates = candidates.filter((m) => m.nextMobility > 0);
    }

    return candidates;
}

function hasAnyLegalMove(cells, foodCell, cfg) {
    return listMoves(cells, foodCell, cfg).length > 0;
}

function countLegalMoves(cells, foodCell, cfg) {
    const head = cells[0];
    if (!head) return 0;

    let count = 0;
    for (const next of neighbors(head)) {
        const willGrow = !!foodCell && equalCells(next, foodCell);
        if (canMoveTo(cells, next, willGrow)) {
            count++;
        }
    }

    return count;
}

function pickSafeFoodPathMove(cells, foodCell, cfg) {
    if (!foodCell) return null;

    const head = cells[0];
    if (manhattan(head, foodCell) === 1) {
        const immediate = evaluateMove(cells, foodCell, foodCell, cfg);
        if (immediate) {
            const stillPlayable = immediate.safe || immediate.nextMobility > cfg.minFutureMovesAfterEat;
            if (stillPlayable) {
                return immediate;
            }
        }
    }

    const blocked = buildBlocked(cells);
    const pathToFood = bfs(cells[0], foodCell, blocked);
    if (!pathToFood || pathToFood.length < 2) return null;

    let simCells = cells;
    let simFood = foodCell;
    let firstMove = null;

    for (let i = 1; i < pathToFood.length; i++) {
        const step = pathToFood[i];
        const move = evaluateMove(simCells, step, simFood, cfg);
        if (!move) return null;

        if (i === 1) {
            firstMove = move;
        }

        simCells = move.nextCells;
        if (move.willGrow) {
            simFood = null;
        }
    }

    const endState = evaluateState(simCells);
    const safeEnd = endState.tailReachable
        || endState.freeSpace >= Math.max(endState.snakeLength + cfg.spaceBuffer + 2, cfg.minSpaceFloor + 2);

    return safeEnd ? firstMove : null;
}

function pickTailChaseMove(cells, foodCell, cfg) {
    const tail = cells[cells.length - 1];
    const blocked = buildBlocked(cells);
    const pathToTail = bfs(cells[0], tail, blocked);

    if (!pathToTail || pathToTail.length < 2) return null;

    const step = pathToTail[1];
    return evaluateMove(cells, step, foodCell, cfg);
}

function hasTwoStepEscape(move, foodCell, cfg) {
    if (!move) return false;

    const nextFood = move.willGrow ? null : foodCell;
    const secondMoves = listMoves(move.nextCells, nextFood, cfg);
    if (!secondMoves.length) return false;

    const candidates = chooseCandidateMoves(secondMoves, cfg);
    const inspected = candidates.length ? candidates : secondMoves;

    for (const step2 of inspected) {
        const state = evaluateState(step2.nextCells);
        const spacious = state.freeSpace >= Math.max(state.snakeLength + cfg.spaceBuffer + 1, cfg.minSpaceFloor + 1);
        if (state.tailReachable || spacious) {
            return true;
        }
    }

    return false;
}

function listTrapSafeMoves(cells, snake, foodCell, cfg) {
    const head = cells[0];
    const all = listMoves(cells, foodCell, cfg);
    if (!all.length) return [];

    const candidates = chooseCandidateMoves(all, cfg);
    const inspected = candidates.length ? candidates : all;
    const result = [];

    for (const move of inspected) {
        const dir = directionFromTo(head, move.next);
        if (!dir) continue;
        if (isDirectionLikelyCollision(snake, dir)) continue;
        if (!hasTwoStepEscape(move, foodCell, cfg)) continue;

        const state = evaluateState(move.nextCells);
        const spacious = state.freeSpace >= Math.max(state.snakeLength + cfg.spaceBuffer + 2, cfg.minSpaceFloor + 2);
        if (!state.tailReachable && !spacious) continue;

        result.push(move);
    }

    return result;
}

function pickBestEscapeMove(cells, snake, foodCell, cfg) {
    const moves = listMoves(cells, foodCell, cfg);
    if (!moves.length) return null;

    const candidates = chooseCandidateMoves(moves, cfg);
    const ranked = candidates.length ? candidates : moves;
    const head = cells[0];

    let best = null;
    let bestScore = -Infinity;

    for (const move of ranked) {
        const dir = directionFromTo(head, move.next);
        if (!dir) continue;
        if (isDirectionLikelyCollision(snake, dir)) continue;
        if (!hasTwoStepEscape(move, foodCell, cfg)) continue;

        let score = 0;
        score += move.safe ? 2000 : -1200;
        score += move.tailReachable ? 400 : -150;
        score += move.freeSpace * 12;
        score += move.nextMobility * 320;
        if (foodCell) {
            score -= manhattan(move.next, foodCell) * 10;
        }
        if (move.willGrow) score += 1200;

        if (score > bestScore) {
            bestScore = score;
            best = move;
        }
    }

    return best;
}

function lookaheadScore(cells, foodCell, depth, cfg, cache) {
    if (depth <= 0 || state.lookaheadBudget <= 0) {
        return evaluateStateScore(cells, foodCell, cfg);
    }

    const cacheKey = buildLookaheadKey(cells, foodCell, depth);
    const cached = cache ? cache.get(cacheKey) : null;
    if (cached !== null) {
        return cached;
    }

    state.lookaheadBudget--;

    const moves = listMoves(cells, foodCell, cfg);
    if (!moves.length) {
        return -1000000;
    }

    const candidateMoves = chooseCandidateMoves(moves, cfg);

    let best = -Infinity;

    for (const move of candidateMoves) {
        const nextFood = move.willGrow ? null : foodCell;
        const score = immediateMoveScore(move, foodCell, cfg)
            + cfg.recurseDiscount * lookaheadScore(move.nextCells, nextFood, depth - 1, cfg, cache);

        if (score > best) {
            best = score;
        }
    }

    if (cache) cache.set(cacheKey, best);
    return best;
}

function pickLookaheadMove(cells, foodCell, cfg) {
    const moves = listMoves(cells, foodCell, cfg);
    if (!moves.length) return null;

    const candidateMoves = chooseCandidateMoves(moves, cfg);
    const depth = computeLookaheadDepth(cells.length, cfg);
    const cache = createLookaheadCache(Math.max(220, Math.floor((cfg.maxLookaheadNodes || 560) * 1.8)));

    let bestMove = null;
    let bestScore = -Infinity;

    for (const move of candidateMoves) {
        const nextFood = move.willGrow ? null : foodCell;
        const score = immediateMoveScore(move, foodCell, cfg)
            + cfg.rootDiscount * lookaheadScore(move.nextCells, nextFood, depth - 1, cfg, cache);

        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    }

    return bestMove;
}

function pickBestMove(moves, foodCell, cfg) {
    if (!moves.length) return null;

    const candidates = chooseCandidateMoves(moves, cfg);

    candidates.sort((a, b) => {
        if (a.willGrow !== b.willGrow) {
            return a.willGrow ? -1 : 1;
        }

        if (foodCell) {
            const da = manhattan(a.next, foodCell);
            const db = manhattan(b.next, foodCell);
            if (da !== db) return da - db;
        }

        if (a.tailReachable !== b.tailReachable) {
            return a.tailReachable ? -1 : 1;
        }

        return b.freeSpace - a.freeSpace;
    });

    return candidates[0];
}

function buildGeometrySafeMove(cells, snake, foodCell, cfg) {
    const candidates = listMoves(cells, foodCell, cfg);
    if (!candidates.length) return null;

    const ranked = [...chooseCandidateMoves(candidates, cfg)];
    ranked.sort((a, b) => {
        if (a.safe !== b.safe) return a.safe ? -1 : 1;
        if (a.nextMobility !== b.nextMobility) return b.nextMobility - a.nextMobility;
        if (a.tailReachable !== b.tailReachable) return a.tailReachable ? -1 : 1;
        return b.freeSpace - a.freeSpace;
    });

    const head = cells[0];
    for (const move of ranked) {
        const dir = directionFromTo(head, move.next);
        if (!dir) continue;
        if (!isDirectionLikelyCollision(snake, dir)) {
            return move;
        }
    }

    return null;
}

function hamiltonianIndex(cell) {
    if (!cell || !state.hamiltonianPath.length) return -1;
    return state.hamiltonianPath.findIndex((p) => p.x === cell.x && p.y === cell.y);
}

function cycleDistance(fromIndex, toIndex) {
    if (fromIndex < 0 || toIndex < 0 || !state.hamiltonianPath.length) return Number.MAX_SAFE_INTEGER;
    const n = state.hamiltonianPath.length;
    return (toIndex - fromIndex + n) % n;
}

function updateLoopTracker(head, foodCell) {
    const headKey = cellKey(head);
    const foodKey = foodCell ? cellKey(foodCell) : "none";
    const key = `${headKey}|${foodKey}`;
    state.recentStateQueue.push(key);
    state.recentStateCounts.set(key, (state.recentStateCounts.get(key) || 0) + 1);

    const historyCap = state.lastSnakeLength >= 40 ? 54 : 40;
    if (state.recentStateQueue.length > historyCap) {
        const old = state.recentStateQueue.shift();
        if (old) {
            const nextCount = (state.recentStateCounts.get(old) || 1) - 1;
            if (nextCount <= 0) state.recentStateCounts.delete(old);
            else state.recentStateCounts.set(old, nextCount);
        }
    }

    const currentCount = state.recentStateCounts.get(key) || 0;
    const uniqueStates = state.recentStateCounts.size;
    const loopDensity = state.recentStateQueue.length > 0
        ? uniqueStates / state.recentStateQueue.length
        : 1;

    // Loop only when the exact same head+food state repeats many times
    // and the explored state variety is low.
    const repeatThreshold = state.lastSnakeLength >= 40 ? 4 : 5;
    const densityThreshold = state.lastSnakeLength >= 40 ? 0.52 : 0.45;
    return currentCount >= repeatThreshold && loopDensity < densityThreshold;
}

function pickCycleProgressMove(cells, snake, foodCell, cfg) {
    const moves = listMoves(cells, foodCell, cfg);
    if (!moves.length) return null;

    const head = cells[0];
    const headIndex = hamiltonianIndex(head);
    const foodIndex = foodCell ? hamiltonianIndex(foodCell) : -1;
    const candidates = chooseCandidateMoves(moves, cfg);

    let best = null;
    let bestScore = -Infinity;

    for (const move of candidates) {
        const dir = directionFromTo(head, move.next);
        if (!dir) continue;

        const collisionPenalty = isDirectionLikelyCollision(snake, dir) ? -20000 : 0;
        const nextIndex = hamiltonianIndex(move.next);
        const progress = cycleDistance(headIndex, nextIndex);
        const foodDist = foodIndex >= 0 ? cycleDistance(nextIndex, foodIndex) : 0;
        const edgeDist = Math.min(
            move.next.x,
            move.next.y,
            state.GRID - 1 - move.next.x,
            state.GRID - 1 - move.next.y
        );
        const score = collisionPenalty
            + (move.safe ? 2600 : -1700)
            + move.freeSpace * 12
            + move.nextMobility * 260
            + progress * 2
            - foodDist * 22
            + edgeDist * 80
            + (move.willGrow ? 5000 : 0);

        if (score > bestScore) {
            bestScore = score;
            best = move;
        }
    }

    return best;
}

function scoreMoveForStability(move, foodCell, cfg, currentDir, previousDir, snake, head) {
    if (!move) return -Infinity;

    const dir = directionFromTo(head, move.next);
    if (!dir) return -Infinity;

    let score = immediateMoveScore(move, foodCell, cfg);

    if (currentDir) {
        if (equalDirection(dir, currentDir)) score += cfg.keepDirectionBonus;
        else score -= cfg.directionChangePenalty;
    }

    if (previousDir && currentDir && !equalDirection(previousDir, currentDir) && equalDirection(dir, previousDir)) {
        score -= cfg.zigzagPenalty;
    }

    if (isDirectionLikelyCollision(snake, dir)) {
        score -= 25000;
    }

    return score;
}

export function runAI(snake, food, currentDir = null) {
    if (!snake || !snake.length || state.GRID <= 0) {
        return null;
    }

    const cells = toSnakeCells(snake);
    state.lastSnakeLength = cells.length;
    const head = cells[0];
    if (!isInside(head)) return null;

    const foodRawCell = food ? toCell(food) : null;
    const foodCell = foodRawCell && isInside(foodRawCell) ? foodRawCell : null;
    const stateKey = buildDecisionStateKey(cells, foodCell);
    const stuckLoop = cells.length >= 24 && updateLoopTracker(head, foodCell);
    const currentState = evaluateState(cells);
    const cfg = currentProfileConfig({
        snakeLen: cells.length,
        freeSpace: currentState.freeSpace,
        boardArea: state.GRID * state.GRID,
        stuckLoop
    });

    if (!stuckLoop && stateKey === state.lastDecisionStateKey && state.lastDecisionDir) {
        highlight(state.lastDecisionDir);
        return cloneDirection(state.lastDecisionDir);
    }

    state.lookaheadBudget = Math.max(40, cfg.maxLookaheadNodes || 220);

    let chosen = null;
    const criticalPressure = currentState.freeSpace <= Math.max(8, Math.floor(cells.length * 0.42));

    if (criticalPressure) {
        chosen = pickBestEscapeMove(cells, snake, foodCell, cfg);
    }

    if (!chosen && stuckLoop) {
        chosen = pickCycleProgressMove(cells, snake, foodCell, cfg);
    }

    if (!chosen) {
        chosen = pickSafeFoodPathMove(cells, foodCell, cfg);
    }

    if (!chosen) {
        chosen = pickLookaheadMove(cells, foodCell, cfg);
    }

    if (!chosen) {
        chosen = pickTailChaseMove(cells, foodCell, cfg);
    }

    if (!chosen) {
        const fallbackMoves = listMoves(cells, foodCell, cfg);
        chosen = pickBestMove(fallbackMoves, foodCell, cfg);
    }

    if (!chosen) {
        const hamiltonianCell = getHamiltonianNextCell(head);
        if (hamiltonianCell && !equalCells(hamiltonianCell, head)) {
            const fallback = evaluateMove(cells, hamiltonianCell, foodCell, cfg);
            if (fallback) {
                chosen = fallback;
            }
        }
    }

    const trapSafeMoves = listTrapSafeMoves(cells, snake, foodCell, cfg);
    if (trapSafeMoves.length) {
        const chosenIsTrapSafe = !!chosen && trapSafeMoves.some((m) => equalCells(m.next, chosen.next));
        if (!chosenIsTrapSafe) {
            chosen = pickBestMove(trapSafeMoves, foodCell, cfg) || chosen;
        }
    } else if (chosen && !hasTwoStepEscape(chosen, foodCell, cfg)) {
        const rescue = pickBestEscapeMove(cells, snake, foodCell, cfg);
        if (rescue) {
            chosen = rescue;
        }
    }

    if (!chosen) {
        state.lastDecisionStateKey = stateKey;
        state.lastDecisionDir = null;
        return null;
    }

    let newDir = directionFromTo(head, chosen.next);
    if (!newDir) {
        state.lastDecisionStateKey = stateKey;
        state.lastDecisionDir = null;
        return null;
    }

    if (isDirectionLikelyCollision(snake, newDir)) {
        const saferMove = buildGeometrySafeMove(cells, snake, foodCell, cfg);
        if (saferMove) {
            const saferDir = directionFromTo(head, saferMove.next);
            if (saferDir) {
                chosen = saferMove;
                newDir = saferDir;
            }
        }
    }

    if (isOppositeDirection(newDir, currentDir)) {
        const alternatives = chooseCandidateMoves(listMoves(cells, foodCell, cfg), cfg);
        let replacement = null;
        for (const move of alternatives) {
            const dir = directionFromTo(head, move.next);
            if (!dir) continue;
            if (isOppositeDirection(dir, currentDir)) continue;
            if (isDirectionLikelyCollision(snake, dir)) continue;
            replacement = dir;
            break;
        }
        if (!replacement) {
            for (const move of alternatives) {
                const dir = directionFromTo(head, move.next);
                if (!dir) continue;
                if (isOppositeDirection(dir, currentDir)) continue;
                replacement = dir;
                break;
            }
        }
        if (replacement) {
            newDir = replacement;
        } else if (currentDir) {
            newDir = cloneDirection(currentDir);
        }
    }

    if (currentDir && !equalDirection(newDir, currentDir)) {
        const straightCell = { x: head.x + currentDir.x, y: head.y + currentDir.y };
        const straightMove = evaluateMove(cells, straightCell, foodCell, cfg);

        if (straightMove && !isDirectionLikelyCollision(snake, currentDir)) {
            const chosenScore = scoreMoveForStability(chosen, foodCell, cfg, currentDir, state.lastDecisionDir, snake, head);
            const straightScore = scoreMoveForStability(straightMove, foodCell, cfg, currentDir, state.lastDecisionDir, snake, head);
            const straightFoodDist = foodCell ? manhattan(straightMove.next, foodCell) : Number.MAX_SAFE_INTEGER;
            const chosenFoodDist = foodCell && chosen ? manhattan(chosen.next, foodCell) : Number.MAX_SAFE_INTEGER;
            const betterForFood = foodCell && chosen && (straightFoodDist - chosenFoodDist >= 2);
            const shouldKeepStraight = !chosen?.willGrow
                && !betterForFood
                && (straightScore + cfg.switchThreshold >= chosenScore);

            if (shouldKeepStraight) {
                chosen = straightMove;
                newDir = cloneDirection(currentDir);
            }
        }
    }

    state.lastDecisionStateKey = stateKey;
    state.lastDecisionDir = cloneDirection(newDir);
    highlight(newDir);
    return cloneDirection(newDir);
}
