let ctx = null;
let canvasSize = 720;

export function initBackgroundRenderer(canvasContext, size = 720) {
    ctx = canvasContext;
    canvasSize = size;
}

function drawBaseGradient(t) {
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
}

function drawPulseRings(t) {
    const centerX = canvasSize * 0.5;
    const centerY = canvasSize * 0.5;

    for (let i = 0; i < 4; i++) {
        const phase = (t * 0.22 + i * 0.26) % 1;
        const radius = 90 + phase * canvasSize * 0.55;
        const alpha = (1 - phase) * 0.2;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 122, 0, ${alpha})`;
        ctx.lineWidth = 2 + (1 - phase) * 3;
        ctx.shadowColor = "rgba(255, 122, 0, 0.65)";
        ctx.shadowBlur = 16;
        ctx.stroke();
    }
    ctx.shadowBlur = 0;
}

function drawMovingGlow(t) {
    const x = canvasSize * (0.2 + (Math.sin(t * 0.6) + 1) * 0.3);
    const y = canvasSize * (0.2 + (Math.cos(t * 0.45) + 1) * 0.3);
    const r = canvasSize * 0.32;

    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, "rgba(255, 128, 24, 0.16)");
    glow.addColorStop(0.42, "rgba(255, 106, 0, 0.08)");
    glow.addColorStop(1, "rgba(255, 90, 0, 0)");

    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    ctx.globalCompositeOperation = "source-over";
}

function drawGrid(t) {
    const spacing = 36;
    const drift = (t * 8) % spacing;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 122, 0, 0.07)";

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

function drawVignette() {
    const v = ctx.createRadialGradient(
        canvasSize * 0.5,
        canvasSize * 0.5,
        canvasSize * 0.35,
        canvasSize * 0.5,
        canvasSize * 0.5,
        canvasSize * 0.7
    );
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, canvasSize, canvasSize);
}

export function renderBackground() {
    if (!ctx) return;
    const t = performance.now() * 0.001;

    drawBaseGradient(t);
    drawMovingGlow(t);
    drawPulseRings(t);
    drawGrid(t);
    drawVignette();
}
