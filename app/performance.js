function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function detectMobileViewport() {
    return window.matchMedia("(max-width: 900px)").matches;
}

export function detectPrefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function buildPerformanceProfile(options = {}) {
    const mobile = !!options.mobile;
    const reducedMotion = !!options.reducedMotion;
    const cores = Number(options.cores || 8);
    const memoryGb = Number(options.memoryGb || 8);
    const saveData = !!options.saveData;
    const lowPower = mobile && (saveData || cores <= 4 || memoryGb <= 4);
    return {
        mobileOptimized: mobile,
        lowPowerMobile: lowPower,
        reducedFxMode: reducedMotion || lowPower,
        fixedStep: lowPower ? (1000 / 60) : (mobile ? (1000 / 90) : (1000 / 120)),
        imageSmoothingEnabled: !lowPower
    };
}

export function calcPerfShadow(value, mobileOptimized, lowPowerMobile) {
    const safeValue = Number(value || 0);
    if (safeValue <= 0) return 0;
    if (lowPowerMobile) return safeValue * 0.42;
    if (mobileOptimized) return safeValue * 0.68;
    return safeValue;
}

export function calcPerfParticleCount(baseCount, mobileOptimized, lowPowerMobile) {
    const base = Math.max(1, Math.floor(Number(baseCount || 1)));
    if (lowPowerMobile) return Math.max(3, Math.floor(base * 0.5));
    if (mobileOptimized) return Math.max(4, Math.floor(base * 0.7));
    return base;
}

export function calcTrailDrawStride(length, mobileOptimized, lowPowerMobile) {
    const snakeLength = Number(length || 0);
    if (lowPowerMobile && snakeLength > 90) return 3;
    if (mobileOptimized && snakeLength > 130) return 2;
    return 1;
}

export function computeResponsiveScale(vw, vh) {
    const safeVw = Math.max(280, Number(vw || 0));
    const safeVh = Math.max(280, Number(vh || 0));
    const widthScale = safeVw / 430;
    const heightScale = safeVh / 920;
    const uiScale = clamp(Math.min(1, widthScale, heightScale), 0.56, 1);
    const extremeCompact = safeVw <= 390 || safeVh <= 690;
    return {
        uiScale,
        extremeCompact
    };
}
