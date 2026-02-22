function getPlayerDisplayName(player) {
    if (!player) return "Игрок";
    return player.nickname || player.email || `Игрок ${player.userId || ""}`.trim();
}

export function parseIsoMs(value) {
    if (!value) return 0;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
}

export function getRoomConfiguredSpeedFromState(roomState, fallback = 320) {
    if (!roomState) return fallback;
    const parsed = Number.parseInt(roomState.snakeSpeed, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(170, Math.min(700, parsed));
}

export function getRoomWinnerText(room, accountUserId = null) {
    if (!room || room.status !== "finished") return "";
    const players = Array.isArray(room.players) ? room.players : [];
    const winner = players.find((p) => Number(p.userId) === Number(room.winnerUserId)) || null;
    if (!winner) return "Челлендж завершён без победителя.";
    const winnerName = getPlayerDisplayName(winner);
    if (accountUserId !== null && Number(winner.userId) === Number(accountUserId)) {
        return `Победил: ${winnerName} (это вы).`;
    }
    return `Победил: ${winnerName}.`;
}

export { getPlayerDisplayName };
