export const state = {
    hamiltonianPath: [],
    aiStepIndex: 0,
    CELL: 20,
    GRID: 0,
    lastDecisionStateKey: "",
    lastDecisionDir: null,
    lookaheadBudget: 0,
    lastSnakeLength: 0,
    recentStateQueue: [],
    recentStateCounts: new Map()
};

function inferGridSize(path) {
    if (!path.length) return 0;

    let maxCoord = 0;
    for (const cell of path) {
        if (cell.x > maxCoord) maxCoord = cell.x;
        if (cell.y > maxCoord) maxCoord = cell.y;
    }

    return maxCoord + 1;
}

function toCell(point, cellSize) {
    return {
        x: Math.floor(point.x / cellSize),
        y: Math.floor(point.y / cellSize)
    };
}

export function initAI(path, cellSize) {
    state.hamiltonianPath = Array.isArray(path) ? path : [];
    state.CELL = cellSize;
    state.aiStepIndex = 0;
    state.GRID = inferGridSize(state.hamiltonianPath);
    state.lastDecisionStateKey = "";
    state.lastDecisionDir = null;
    state.lookaheadBudget = 0;
    state.lastSnakeLength = 0;
    state.recentStateQueue = [];
    state.recentStateCounts = new Map();
}

export function resetAI(snake) {
    if (!snake || !snake.length || !state.hamiltonianPath.length) {
        state.aiStepIndex = 0;
        return;
    }

    const headCell = toCell(snake[0], state.CELL);
    const index = state.hamiltonianPath.findIndex(
        (cell) => cell.x === headCell.x && cell.y === headCell.y
    );

    if (index !== -1) {
        state.aiStepIndex = (index + 1) % state.hamiltonianPath.length;
    } else {
        state.aiStepIndex = 0;
    }

    state.lastDecisionStateKey = "";
    state.lastDecisionDir = null;
    state.lookaheadBudget = 0;
    state.lastSnakeLength = snake.length;
    state.recentStateQueue = [];
    state.recentStateCounts = new Map();
}
