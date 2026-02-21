let ctx = null;

export const FOOD_TYPES = {
    solar: {
        aura: "#ff7a00",
        coreA: "#fff8d2",
        coreB: "#ffd75a",
        coreC: "#ff8e1a",
        coreD: "#ff3f00",
        spark: "#ffd27a"
    },
    plasma: {
        aura: "#37d5ff",
        coreA: "#ebfbff",
        coreB: "#8ff0ff",
        coreC: "#37d5ff",
        coreD: "#0078ff",
        spark: "#b4f3ff"
    },
    toxic: {
        aura: "#78ff00",
        coreA: "#f3ffd5",
        coreB: "#c6ff66",
        coreC: "#78ff00",
        coreD: "#1fb500",
        spark: "#d4ff93"
    },
    void: {
        aura: "#ff00a8",
        coreA: "#ffe3f4",
        coreB: "#ff94d7",
        coreC: "#ff00a8",
        coreD: "#8a0060",
        spark: "#ffc0e9"
    }
};

const DEFAULT_CONFIG = {
    foodType: "solar",
    foodColor: "#ff8e1a",
    foodGlow: "#ff7a00",
    particleColor: "#ffd27a",
    neonBoost: 1,
    foodShape: "orb"
};

let renderConfig = { ...DEFAULT_CONFIG };

export function initFoodRenderer(canvasContext) {
    ctx = canvasContext;
}

export function setFoodRenderConfig(nextConfig = {}) {
    renderConfig = {
        ...renderConfig,
        ...nextConfig
    };
}

export function getFoodRenderConfig() {
    return { ...renderConfig };
}

function resolvePalette() {
    const typeKey = renderConfig.foodType in FOOD_TYPES ? renderConfig.foodType : "solar";
    const type = FOOD_TYPES[typeKey];

    return {
        aura: renderConfig.foodGlow || type.aura,
        coreA: type.coreA,
        coreB: type.coreB,
        coreC: renderConfig.foodColor || type.coreC,
        coreD: type.coreD,
        spark: renderConfig.particleColor || type.spark
    };
}

function rgbaFromHex(hex, alpha) {
    if (typeof hex !== "string") return `rgba(255, 122, 0, ${alpha})`;

    const clean = hex.replace("#", "").trim();
    const base = clean.length === 3
        ? clean.split("").map((c) => c + c).join("")
        : clean.padEnd(6, "0").slice(0, 6);

    const num = Number.parseInt(base, 16);
    if (!Number.isFinite(num)) return `rgba(255, 122, 0, ${alpha})`;

    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawOuterAura(x, y, t, palette) {
    const boost = Math.max(0.6, Number(renderConfig.neonBoost) || 1);
    const auraPulse = 1 + Math.sin(t * 2.4) * 0.12;
    const radius = 24 * auraPulse * boost;

    const aura = ctx.createRadialGradient(x, y, 2, x, y, radius);
    aura.addColorStop(0, rgbaFromHex(palette.spark, 0.48 * boost));
    aura.addColorStop(0.45, rgbaFromHex(palette.aura, 0.3 * boost));
    aura.addColorStop(1, rgbaFromHex(palette.aura, 0));

    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
}

function drawShapePath(x, y, r, shape) {
    const kind = String(shape || "orb").toLowerCase();
    if (kind === "diamond") {
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
        return;
    }
    if (kind === "cube") {
        const s = r * 1.45;
        ctx.beginPath();
        ctx.rect(x - s / 2, y - s / 2, s, s);
        return;
    }
    if (kind === "star") {
        const spikes = 5;
        const outer = r * 1.1;
        const inner = r * 0.52;
        let rot = -Math.PI / 2;
        const step = Math.PI / spikes;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
        for (let i = 0; i < spikes; i += 1) {
            rot += step;
            ctx.lineTo(x + Math.cos(rot) * inner, y + Math.sin(rot) * inner);
            rot += step;
            ctx.lineTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
        }
        ctx.closePath();
        return;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
}

function drawCore(x, y, t, palette) {
    const boost = Math.max(0.6, Number(renderConfig.neonBoost) || 1);
    const corePulse = 1 + Math.sin(t * 4.8 + 0.7) * 0.08;
    const r = 10.5 * corePulse;

    const core = ctx.createRadialGradient(
        x - 2,
        y - 3,
        1,
        x,
        y,
        r + 2
    );

    core.addColorStop(0, palette.coreA);
    core.addColorStop(0.22, palette.coreB);
    core.addColorStop(0.58, palette.coreC);
    core.addColorStop(1, palette.coreD);

    ctx.shadowColor = palette.aura;
    ctx.shadowBlur = 30 * boost;
    ctx.fillStyle = core;
    drawShapePath(x, y, r, renderConfig.foodShape);
    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = palette.coreA;
    ctx.beginPath();
    ctx.arc(x - r * 0.28, y - r * 0.34, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
}

function drawOrbitRing(x, y, t, palette) {
    const boost = Math.max(0.6, Number(renderConfig.neonBoost) || 1);
    const ringR = 14 + Math.sin(t * 3.1) * 1.2;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 1.2);

    ctx.strokeStyle = rgbaFromHex(palette.spark, 0.65);
    ctx.lineWidth = 1.8;
    ctx.shadowColor = rgbaFromHex(palette.aura, 0.92);
    ctx.shadowBlur = 14 * boost;
    ctx.beginPath();
    ctx.ellipse(0, 0, ringR, ringR * 0.72, Math.PI / 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

function drawSparks(x, y, t, palette) {
    const boost = Math.max(0.6, Number(renderConfig.neonBoost) || 1);
    const sparkCount = 6;

    for (let i = 0; i < sparkCount; i++) {
        const phase = t * 2.1 + i * ((Math.PI * 2) / sparkCount);
        const dist = 15 + Math.sin(t * 4 + i * 1.7) * 2.5;
        const sx = x + Math.cos(phase) * dist;
        const sy = y + Math.sin(phase) * dist;
        const sr = (1.2 + (Math.sin(t * 5 + i * 1.1) + 1) * 0.55) * boost;

        ctx.fillStyle = rgbaFromHex(palette.spark, 0.92);
        ctx.shadowColor = rgbaFromHex(palette.spark, 0.95);
        ctx.shadowBlur = 10 * boost;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.shadowBlur = 0;
}

export function renderFood(food) {
    if (!ctx || !food) return;

    const x = food.x;
    const y = food.y;
    const t = performance.now() * 0.001;
    const palette = resolvePalette();

    ctx.save();

    drawOuterAura(x, y, t, palette);
    drawOrbitRing(x, y, t, palette);
    drawCore(x, y, t, palette);
    drawSparks(x, y, t, palette);

    ctx.restore();
}
