export function formatFriendName(user) {
    if (!user) return "Игрок";
    return user.nickname || user.email || `ID ${user.id || user.userId || ""}`.trim();
}

export function relationToLabel(relationState) {
    if (relationState === "self") return "Это ваш аккаунт.";
    if (relationState === "friends") return "Уже в друзьях.";
    if (relationState === "pending_sent") return "Заявка уже отправлена.";
    if (relationState === "pending_received") return "Есть входящая заявка от этого игрока.";
    return "Можно отправить заявку в друзья.";
}

export function setFriendsSearchResultByDom(text, getElementById) {
    if (typeof getElementById !== "function") return;
    const el = getElementById("friendsSearchResult");
    if (el) el.innerText = text || "";
}

export function renderFriendsUserActionRow(container, actions) {
    if (!container || !Array.isArray(actions) || !actions.length) return;
    const row = document.createElement("div");
    row.className = "authRow";
    for (const action of actions) {
        const btn = document.createElement("button");
        btn.innerText = action.label;
        if (action.disabled) btn.disabled = true;
        btn.addEventListener("click", action.onClick);
        row.appendChild(btn);
    }
    container.appendChild(row);
}

export function friendRoomMeta(item) {
    if (!item || !item.roomCode) return "Сейчас не в комнате";
    const status = item.roomStatus === "active" ? "в игре" : "ожидание";
    const occupancy = (item.roomPlayersCount != null && item.roomMaxPlayers != null)
        ? `${item.roomPlayersCount}/${item.roomMaxPlayers}`
        : "--/--";
    return `Комната ${item.roomCode} • ${status} • ${occupancy}`;
}
