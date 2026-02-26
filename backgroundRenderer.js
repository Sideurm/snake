let ctx = null;
let canvasSize = 720;
let backgroundTheme = "neon";

export function initBackgroundRenderer(canvasContext, size = 720) {
    ctx = canvasContext;
    canvasSize = size;
}

export function setBackgroundTheme(theme = "neon") {
    backgroundTheme = String(theme || "neon").toLowerCase();
}

function drawVignette(alpha = 0.42) {
    const v = ctx.createRadialGradient(
        canvasSize * 0.5,
        canvasSize * 0.5,
        canvasSize * 0.34,
        canvasSize * 0.5,
        canvasSize * 0.5,
        canvasSize * 0.74
    );
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(0,0,0,${alpha})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, canvasSize, canvasSize);
}

function drawGrid(t, options = {}) {
    const spacing = Number(options.spacing || 36);
    const drift = ((t * Number(options.speed || 8)) % spacing);
    ctx.lineWidth = Number(options.lineWidth || 1);
    ctx.strokeStyle = options.color || "rgba(255, 122, 0, 0.08)";

    for (let x = -spacing; x <= canvasSize + spacing; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x + drift, 0);
        ctx.lineTo(x + drift, canvasSize);
        ctx.stroke();
    }

    for (let y = -spacing; y <= canvasSize + spacing; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y + drift);
        ctx.lineTo(canvasSize, y + drift);
        ctx.stroke();
    }
}

function drawPulseRings(t, options = {}) {
    const centerX = canvasSize * 0.5;
    const centerY = canvasSize * 0.5;
    const color = options.color || "rgba(255, 122, 0, 0.22)";
    const glow = options.glow || "rgba(255, 122, 0, 0.65)";
    const count = Number(options.count || 4);

    for (let i = 0; i < count; i += 1) {
        const phase = (t * Number(options.speed || 0.22) + i * 0.26) % 1;
        const radius = Number(options.baseRadius || 90) + phase * canvasSize * Number(options.spread || 0.55);
        const alpha = (1 - phase) * Number(options.alpha || 0.2);

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = color.replace(/0\.\d+\)/, `${alpha})`);
        ctx.lineWidth = 2 + (1 - phase) * 3;
        ctx.shadowColor = glow;
        ctx.shadowBlur = 16;
        ctx.stroke();
    }
    ctx.shadowBlur = 0;
}

function drawNeon(t) {
    const pulse = 0.5 + Math.sin(t * 0.35) * 0.08;
    const g = ctx.createRadialGradient(
        canvasSize * 0.5,
        canvasSize * 0.5,
        canvasSize * 0.08,
        canvasSize * 0.5,
        canvasSize * 0.5,
        canvasSize * 0.72
    );
    g.addColorStop(0, `rgba(46, 20, 3, ${0.96 + pulse * 0.02})`);
    g.addColorStop(0.56, "rgba(16, 8, 2, 0.98)");
    g.addColorStop(1, "rgba(4, 2, 0, 1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    const x = canvasSize * (0.2 + (Math.sin(t * 0.6) + 1) * 0.3);
    const y = canvasSize * (0.2 + (Math.cos(t * 0.45) + 1) * 0.3);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, canvasSize * 0.32);
    glow.addColorStop(0, "rgba(255, 128, 24, 0.16)");
    glow.addColorStop(0.42, "rgba(255, 106, 0, 0.08)");
    glow.addColorStop(1, "rgba(255, 90, 0, 0)");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    ctx.globalCompositeOperation = "source-over";

    drawPulseRings(t, { color: "rgba(255, 122, 0, 0.2)", glow: "rgba(255,122,0,0.8)" });
    drawGrid(t, { color: "rgba(255, 122, 0, 0.08)", spacing: 36, speed: 8 });
    drawVignette(0.44);
}

function drawFrost(t) {
    const g = ctx.createLinearGradient(0, 0, canvasSize, canvasSize);
    g.addColorStop(0, "rgba(7, 27, 45, 1)");
    g.addColorStop(0.6, "rgba(10, 40, 66, 1)");
    g.addColorStop(1, "rgba(4, 14, 28, 1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    const fog = ctx.createRadialGradient(
        canvasSize * 0.5,
        canvasSize * 0.42,
        20,
        canvasSize * 0.5,
        canvasSize * 0.42,
        canvasSize * 0.6
    );
    fog.addColorStop(0, "rgba(165, 239, 255, 0.16)");
    fog.addColorStop(1, "rgba(165, 239, 255, 0)");
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    drawGrid(t, { color: "rgba(145, 225, 255, 0.1)", spacing: 42, speed: 4 });
    ctx.strokeStyle = "rgba(176, 236, 255, 0.14)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 9; i += 1) {
        const y = 100 + i * 78;
        ctx.beginPath();
        ctx.moveTo(80 + Math.sin(t * 0.6 + i) * 10, y);
        ctx.lineTo(canvasSize - 80 + Math.cos(t * 0.5 + i) * 8, y + 28);
        ctx.stroke();
    }
    drawVignette(0.34);
}

function drawLava(t) {
    const g = ctx.createRadialGradient(
        canvasSize * 0.5,
        canvasSize * 0.6,
        canvasSize * 0.08,
        canvasSize * 0.5,
        canvasSize * 0.6,
        canvasSize * 0.9
    );
    g.addColorStop(0, "rgba(41, 10, 3, 1)");
    g.addColorStop(0.45, "rgba(22, 6, 2, 1)");
    g.addColorStop(1, "rgba(7, 4, 4, 1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    const flowCount = 7;
    for (let i = 0; i < flowCount; i += 1) {
        const y = (i + 1) * (canvasSize / (flowCount + 1));
        const phase = t * 0.6 + i * 0.7;
        ctx.strokeStyle = `rgba(255, ${90 + i * 12}, ${20 + i * 5}, 0.18)`;
        ctx.lineWidth = 16 - i;
        ctx.shadowColor = "rgba(255, 104, 30, 0.4)";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= canvasSize; x += 80) {
            ctx.lineTo(x, y + Math.sin(phase + x * 0.012) * (10 + i * 1.8));
        }
        ctx.stroke();
    }
    ctx.shadowBlur = 0;

    drawGrid(t, { color: "rgba(255, 120, 40, 0.06)", spacing: 48, speed: 3 });
    drawVignette(0.52);
}

function drawForest(t) {
    const g = ctx.createLinearGradient(0, 0, 0, canvasSize);
    g.addColorStop(0, "rgba(20, 58, 27, 1)");
    g.addColorStop(0.55, "rgba(16, 44, 21, 1)");
    g.addColorStop(1, "rgba(10, 28, 13, 1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    for (let i = 0; i < 18; i += 1) {
        const x = (i / 18) * canvasSize;
        const sway = Math.sin(t * 0.7 + i) * 8;
        ctx.strokeStyle = "rgba(130, 220, 120, 0.16)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, canvasSize);
        ctx.lineTo(x + sway, 0);
        ctx.stroke();
    }

    drawGrid(t, { color: "rgba(148, 228, 134, 0.08)", spacing: 40, speed: 2.6 });
    drawVignette(0.3);
}

function drawScifi(t) {
    const g = ctx.createLinearGradient(0, 0, canvasSize, canvasSize);
    g.addColorStop(0, "rgba(8, 12, 26, 1)");
    g.addColorStop(0.5, "rgba(9, 19, 38, 1)");
    g.addColorStop(1, "rgba(6, 10, 22, 1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    drawGrid(t, { color: "rgba(72, 230, 255, 0.14)", spacing: 34, speed: 14, lineWidth: 1.1 });

    ctx.fillStyle = "rgba(115, 244, 255, 0.08)";
    const scanOffset = (t * 120) % 10;
    for (let y = -10; y <= canvasSize + 10; y += 10) {
        ctx.fillRect(0, y + scanOffset, canvasSize, 1);
    }

    drawPulseRings(t, {
        color: "rgba(64, 234, 255, 0.22)",
        glow: "rgba(64, 234, 255, 0.74)",
        speed: 0.3,
        spread: 0.5
    });
    drawVignette(0.36);
}

function drawPixel(t) {
    const g = ctx.createLinearGradient(0, 0, 0, canvasSize);
    g.addColorStop(0, "rgba(18, 12, 26, 1)");
    g.addColorStop(1, "rgba(8, 6, 14, 1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    const tile = 20;
    for (let y = 0; y < canvasSize; y += tile) {
        for (let x = 0; x < canvasSize; x += tile) {
            const parity = ((x / tile) + (y / tile)) % 2;
            ctx.fillStyle = parity ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.05)";
            ctx.fillRect(x, y, tile, tile);
        }
    }

    ctx.fillStyle = "rgba(150, 255, 190, 0.05)";
    const scanOffset = (t * 45) % 6;
    for (let y = -6; y <= canvasSize + 6; y += 6) {
        ctx.fillRect(0, y + scanOffset, canvasSize, 1);
    }
    drawVignette(0.42);
}

function drawMinimal() {
    ctx.fillStyle = "rgba(7, 7, 9, 1)";
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    const tile = 60;
    for (let y = 0; y < canvasSize; y += tile) {
        for (let x = 0; x < canvasSize; x += tile) {
            const parity = ((x / tile) + (y / tile)) % 2;
            ctx.fillStyle = parity ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.03)";
            ctx.fillRect(x, y, tile, tile);
        }
    }
}

export function renderBackground() {
    if (!ctx) return;
    const t = performance.now() * 0.001;
    const inArena = typeof document !== "undefined" && document.body?.classList?.contains("in-arena");
    const mainMenuVisible = (() => {
        if (typeof document === "undefined") return false;
        const menu = document.getElementById("mainMenu");
        return !!(menu && !menu.classList.contains("hidden"));
    })();

    // Keep menu calmer: animated effects only during arena gameplay.
    const active = inArena && !mainMenuVisible;
    const theme = backgroundTheme || "neon";

    if (!active && theme !== "minimal") {
        drawMinimal();
        drawVignette(0.25);
        return;
    }

    if (theme === "frost") {
        drawFrost(t);
        return;
    }
    if (theme === "lava") {
        drawLava(t);
        return;
    }
    if (theme === "forest") {
        drawForest(t);
        return;
    }
    if (theme === "scifi") {
        drawScifi(t);
        return;
    }
    if (theme === "pixel") {
        drawPixel(t);
        return;
    }
    if (theme === "minimal") {
        drawMinimal();
        drawVignette(0.22);
        return;
    }
    drawNeon(t);
}
