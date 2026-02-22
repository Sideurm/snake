export function hexToRgba(hex, alpha) {
    if (typeof hex !== "string") return `rgba(255,122,0,${alpha})`;
    const clean = hex.replace("#", "").trim();
    const value = clean.length === 3
        ? clean.split("").map((c) => c + c).join("")
        : clean.padEnd(6, "0").slice(0, 6);
    const num = Number.parseInt(value, 16);
    if (!Number.isFinite(num)) return `rgba(255,122,0,${alpha})`;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r},${g},${b},${alpha})`;
}
