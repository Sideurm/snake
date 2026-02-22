export const BOX_ODDS = {
    common: [
        { rarity: "common", chance: 60 },
        { rarity: "rare", chance: 25 },
        { rarity: "epic", chance: 10 },
        { rarity: "legendary", chance: 4 },
        { rarity: "mythic", chance: 1 }
    ],
    rare: [
        { rarity: "rare", chance: 50 },
        { rarity: "epic", chance: 30 },
        { rarity: "legendary", chance: 15 },
        { rarity: "mythic", chance: 5 }
    ],
    super: [
        { rarity: "epic", chance: 50 },
        { rarity: "legendary", chance: 35 },
        { rarity: "mythic", chance: 15 }
    ]
};

export const BOX_REWARD_POOLS = {
    skin: ["food-plasma", "food-toxic", "food-void", "shape-diamond", "shape-star", "shape-cube", "glow-arctic", "glow-toxic"],
    trail: ["trail-pulse", "trail-dash"],
    animation: ["death-ring", "death-shatter"],
    mythicSkin: ["food-void", "shape-cube", "glow-toxic"]
};

export function randomInt(min, max) {
    const a = Math.floor(Math.min(min, max));
    const b = Math.floor(Math.max(min, max));
    return a + Math.floor(Math.random() * (b - a + 1));
}

export function weightedPick(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const total = list.reduce((sum, it) => sum + Math.max(0, Number(it.chance || 0)), 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const it of list) {
        const w = Math.max(0, Number(it.chance || 0));
        if (r <= w) return it;
        r -= w;
    }
    return list[list.length - 1] || null;
}

export function rarityLabel(rarity) {
    const r = String(rarity || "").toLowerCase();
    if (r === "common") return "🟢 Обычный";
    if (r === "rare") return "🔵 Редкий";
    if (r === "epic") return "🟣 Эпический";
    if (r === "legendary") return "🟡 Легендарный";
    if (r === "mythic") return "🔴 Мифический";
    return r || "-";
}
