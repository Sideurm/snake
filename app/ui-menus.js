export const OVERLAY_MENU_IDS = [
    "mainMenu",
    "playMenu",
    "socialMenu",
    "moderationMenu",
    "settingsMenu",
    "tutorialMenu",
    "historyMenu",
    "accountMenu",
    "friendsMenu",
    "clanMenu",
    "leaderboardMenu",
    "seasonMenu",
    "roomMenu",
    "skinMenu",
    "shopMenu"
];

const MENU_STATE_IDS = [
    "mainMenu",
    "playMenu",
    "socialMenu",
    "moderationMenu",
    "settingsMenu",
    "tutorialMenu",
    "gameOverMenu",
    "historyMenu",
    "accountMenu",
    "friendsMenu",
    "clanMenu",
    "leaderboardMenu",
    "seasonMenu",
    "roomMenu",
    "skinMenu",
    "shopMenu"
];

export function computeIsAnyMenuVisible(getElementById) {
    for (const id of MENU_STATE_IDS) {
        const el = getElementById(id);
        if (el && !el.classList.contains("hidden")) return true;
    }
    return false;
}

export function showOnlyMenuDom(menuId, options = {}) {
    const getElementById = options.getElementById;
    const overlayMenuIds = Array.isArray(options.overlayMenuIds) ? options.overlayMenuIds : OVERLAY_MENU_IDS;
    if (typeof getElementById !== "function") return;

    for (const id of overlayMenuIds) {
        const el = getElementById(id);
        if (!el) continue;
        el.classList.toggle("hidden", id !== menuId);
    }

    if (typeof options.onMenuShown === "function") {
        options.onMenuShown(menuId, getElementById);
    }
}
