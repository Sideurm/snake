export function initMainButtons(deps) {
    const state = deps.state;
    const bind = (id, handler) => {
        const el = document.getElementById(id);
        if (!el || typeof handler !== "function") return;
        el.addEventListener("click", handler);
    };

    bind("playBtn", () => {
        if (!deps.requireAuthorizedAccount("войдите в аккаунт для обычной игры")) return;
        deps.startGame(false, false);
    });

    bind("trainBtn", () => {
        if (!deps.requireAuthorizedAccount("войдите в аккаунт для тренировки")) return;
        deps.startGame(false, true);
    });

    bind("aiBtn", () => {
        if (!deps.requireAuthorizedAccount("войдите в аккаунт для режима AI")) return;
        deps.startGame(true, false);
    });

    bind("roomBtn", () => {
        if (!deps.requireAuthorizedAccount("войдите в аккаунт для онлайн-комнат")) return;
        deps.showOnlyMenu("roomMenu");
        if (state.roomSpectatorMode && state.roomState && state.roomState.roomCode) {
            deps.refreshPublicRoomsList();
            deps.startRoomPolling();
            deps.pullRoomState(true);
            return;
        }
        deps.restoreCurrentRoomState(true).then((room) => {
            deps.refreshPublicRoomsList();
            if (room) {
                deps.startRoomPolling();
                deps.pullRoomState(true);
            } else {
                deps.refreshRoomUI();
            }
        });
    });

    bind("roomCreateBtn", async () => {
        if (!state.accountUser || !state.accountToken) {
            deps.setRoomStatus("Сначала войдите в аккаунт.");
            return;
        }
        try {
            const target = Number.parseInt(document.getElementById("roomTargetInput").value || "20", 10);
            const snakeSpeed = Number.parseInt(document.getElementById("roomSpeedInput").value || "320", 10);
            const maxPlayers = Number.parseInt(document.getElementById("roomMaxPlayersInput").value || "2", 10);
            const isPublic = !!document.getElementById("roomPublicInput").checked;
            const data = await deps.apiRequest("room-create", {
                method: "POST",
                body: { targetScore: target, snakeSpeed, maxPlayers, isPublic }
            });
            deps.applyRoomState(data.room || null, { spectator: false });
            state.roomLastStartedChallengeId = state.roomState ? Number(state.roomState.challengeId || 0) : 0;
            deps.startRoomPolling();
            deps.setRoomStatus("Комната создана. Поделитесь кодом с другом.");
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка создания комнаты";
            deps.setRoomStatus(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("roomJoinBtn", async () => {
        if (!state.accountUser || !state.accountToken) {
            deps.setRoomStatus("Сначала войдите в аккаунт.");
            return;
        }
        try {
            const roomCode = document.getElementById("roomCodeInput").value.trim().toUpperCase();
            const data = await deps.apiRequest("room-join", {
                method: "POST",
                body: { roomCode }
            });
            deps.applyRoomState(data.room || null, { spectator: false });
            state.roomLastStartedChallengeId = state.roomState ? Number(state.roomState.challengeId || 0) : 0;
            deps.startRoomPolling();
            deps.setRoomStatus("Вы вошли в комнату.");
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка входа";
            if (msg === "already_in_room") {
                await deps.restoreCurrentRoomState(true);
                return;
            }
            deps.setRoomStatus(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("roomSpectateBtn", async () => {
        const roomCode = document.getElementById("roomCodeInput").value.trim().toUpperCase();
        await deps.startSpectatingRoom(roomCode);
    });

    bind("roomRefreshBtn", async () => {
        await deps.refreshPublicRoomsList();
        if (state.roomSpectatorMode && state.roomState && state.roomState.roomCode) {
            await deps.pullRoomState(true);
            return;
        }
        const restored = await deps.restoreCurrentRoomState(false);
        if (!restored) {
            deps.refreshRoomUI();
            return;
        }
        await deps.pullRoomState(true);
    });

    bind("roomPublicRefreshBtn", async () => {
        await deps.refreshPublicRoomsList();
    });

    bind("roomSetTargetBtn", async () => {
        if (!state.roomState) return;
        try {
            const target = Number.parseInt(document.getElementById("roomTargetInput").value || "20", 10);
            const snakeSpeed = Number.parseInt(document.getElementById("roomSpeedInput").value || "320", 10);
            const maxPlayers = Number.parseInt(document.getElementById("roomMaxPlayersInput").value || "2", 10);
            const isPublic = !!document.getElementById("roomPublicInput").checked;
            const data = await deps.apiRequest("room-set-target", {
                method: "POST",
                body: {
                    roomCode: state.roomState.roomCode,
                    targetScore: target,
                    snakeSpeed,
                    maxPlayers,
                    isPublic
                }
            });
            deps.applyRoomState(data.room || null, { spectator: false });
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка цели";
            if (msg === "max_players_too_low") {
                deps.setRoomStatus("Нельзя поставить лимит игроков меньше текущего количества в комнате.");
                return;
            }
            deps.setRoomStatus(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("roomStartBtn", async () => {
        if (!state.roomState) return;
        try {
            const data = await deps.apiRequest("room-start", {
                method: "POST",
                body: { roomCode: state.roomState.roomCode }
            });
            deps.applyRoomState(data.room || null, { spectator: false });
            deps.startRoomPolling();
            await deps.pullRoomState(true);
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка старта";
            if (msg === "room_not_full") {
                deps.setRoomStatus("Комната не заполнена до установленного лимита игроков.");
                return;
            }
            deps.setRoomStatus(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("roomRematchMenuBtn", async () => {
        if (!state.roomState) return;
        try {
            const data = await deps.apiRequest("room-rematch", {
                method: "POST",
                body: { roomCode: state.roomState.roomCode }
            });
            deps.applyRoomState(data.room || null, { spectator: false });
            deps.setRoomStatus("Челлендж сброшен. Лидер может запустить новый старт.");
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка реванша";
            deps.setRoomStatus(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("roomLeaveMenuBtn", async () => {
        if (!state.roomState) return;
        if (state.roomSpectatorMode) {
            deps.applyRoomState(null);
            deps.setRoomStatus("Вы вышли из режима наблюдения.");
            return;
        }
        try {
            await deps.apiRequest("room-leave", {
                method: "POST",
                body: { roomCode: state.roomState.roomCode }
            });
            deps.applyRoomState(null);
            deps.setRoomStatus("Вы вышли из комнаты.");
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка выхода";
            deps.setRoomStatus(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("closeRoomMenuBtn", () => {
        deps.showOnlyMenu("mainMenu");
    });

    bind("authLoginBtn", async () => {
        await deps.loginOrRegister("auth-login");
        deps.refreshRoomUI();
    });

    bind("authRegisterBtn", async () => {
        await deps.loginOrRegister("auth-register");
        deps.refreshRoomUI();
    });

    bind("authUpdateNicknameBtn", async () => {
        await deps.updateNickname();
    });

    bind("authLogoutBtn", () => {
        deps.logoutAccount(true);
    });

    bind("authSyncBtn", async () => {
        deps.renderAuthState("синхронизация...");
        await deps.syncCloudProgressNow();
    });

    bind("accountBtn", () => {
        deps.showOnlyMenu("accountMenu");
    });

    bind("friendsBtn", async () => {
        deps.showOnlyMenu("friendsMenu");
        deps.setFriendsTab("friends");
        await deps.tryHandleFriendInviteUrl();
        await deps.refreshFriendsState();
        deps.setFriendsSearchResult(state.accountUser ? "Введите ID игрока для поиска." : "Войдите в аккаунт для управления друзьями.");
    });

    bind("trophyRoadBtn", () => {
        deps.showOnlyMenu("trophyRoadMenu");
        if (typeof deps.renderTrophyRoad === "function") deps.renderTrophyRoad();
    });

    bind("friendsTabFriendsBtn", () => deps.setFriendsTab("friends"));
    bind("friendsTabPossibleBtn", () => deps.setFriendsTab("possible"));
    bind("friendsTabRequestsBtn", () => deps.setFriendsTab("requests"));

    bind("friendsInviteBtn", async () => {
        if (!state.accountUser || !state.accountToken) {
            deps.setFriendsSearchResult("Сначала войдите в аккаунт.");
            return;
        }
        const url = new URL(window.location.href);
        url.searchParams.set("friendInvite", String(state.accountUser.id));
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url.toString());
                deps.setFriendsSearchResult("Ссылка-приглашение скопирована.");
            } else {
                prompt("Скопируйте ссылку приглашения", url.toString());
            }
        } catch (_) {
            prompt("Скопируйте ссылку приглашения", url.toString());
        }
    });

    bind("friendsCopyIdBtn", async () => {
        if (!state.accountUser || !state.accountToken) {
            deps.setFriendsSearchResult("Сначала войдите в аккаунт.");
            return;
        }
        const value = String(state.accountUser.id || "");
        if (!value) {
            deps.setFriendsSearchResult("ID не найден.");
            return;
        }
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
                deps.setFriendsSearchResult(`ID ${value} скопирован.`);
            } else {
                prompt("Скопируйте ID", value);
            }
        } catch (_) {
            prompt("Скопируйте ID", value);
        }
    });

    bind("clanBtn", async () => {
        deps.showOnlyMenu("clanMenu");
        await deps.refreshClanState();
        await deps.tryJoinClanFromInviteUrl();
        await deps.refreshClanList();
    });

    bind("questsBtn", () => {
        deps.showOnlyMenu("questsMenu");
        deps.refreshQuestHub();
    });

    bind("leaderboardBtn", async () => {
        deps.showOnlyMenu("leaderboardMenu");
        await deps.refreshLeaderboard(false);
    });

    bind("seasonBtn", async () => {
        deps.showOnlyMenu("seasonMenu");
        await deps.refreshSeasonHub(false);
    });

    bind("moderationBtn", async () => {
        if (!deps.hasModerationAccess()) {
            deps.setModerationStatus("Недостаточно прав для модерации.");
            return;
        }
        deps.showOnlyMenu("moderationMenu");
        await deps.refreshModerationPanel();
        deps.startModerationPolling();
    });

    bind("closeAccountMenuBtn", () => {
        if (!deps.hasAuthorizedAccount() && deps.AUTH_REQUIRED_FOR_PLAY) {
            deps.renderAuthState("сначала выполните вход");
            return;
        }
        deps.showOnlyMenu("mainMenu");
    });

    bind("closeFriendsMenuBtn", () => {
        deps.showOnlyMenu("mainMenu");
    });

    bind("closeClanMenuBtn", () => {
        deps.stopClanUiPolling();
        deps.showOnlyMenu("mainMenu");
    });

    bind("closeLeaderboardMenuBtn", () => {
        deps.showOnlyMenu("mainMenu");
    });

    bind("closeSeasonMenuBtn", () => {
        deps.showOnlyMenu("socialMenu");
    });

    bind("closeModerationMenuBtn", () => {
        deps.showOnlyMenu("socialMenu");
    });

    bind("moderationRefreshBtn", async () => {
        await deps.refreshModerationPanel();
    });

    bind("moderationCriticalFilterBtn", () => {
        state.moderationOnlyCritical = !state.moderationOnlyCritical;
        deps.renderModerationConsole();
    });

    bind("adminChatRefreshBtn", async () => {
        await deps.refreshAdminChatMessages();
    });

    bind("adminChatSendBtn", async () => {
        if (!deps.hasModerationAccess()) {
            deps.setModerationStatus("Недостаточно прав для отправки сообщений.");
            return;
        }
        const input = document.getElementById("adminChatInput");
        const kindInput = document.getElementById("adminChatKindInput");
        const message = input ? String(input.value || "").trim() : "";
        const kind = kindInput ? String(kindInput.value || "note") : "note";
        if (!message) {
            deps.setModerationStatus("Введите сообщение для чата.");
            return;
        }
        try {
            await deps.apiRequest("admin-chat", {
                method: "POST",
                body: { kind, message }
            });
            if (input) input.value = "";
            await deps.refreshAdminChatMessages();
            await deps.refreshModerationConsole();
            deps.setModerationStatus(kind === "bug" ? "Баг-репорт отправлен в чат админов." : "Сообщение отправлено.");
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка отправки";
            deps.setModerationStatus(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("leaderboardPlayersTabBtn", async () => {
        state.leaderboardState.activeTab = "players";
        await deps.refreshLeaderboard(false);
    });

    bind("leaderboardWeeklyTabBtn", async () => {
        state.leaderboardState.activeTab = "weekly";
        await deps.refreshLeaderboard(false);
    });

    bind("leaderboardClansTabBtn", async () => {
        state.leaderboardState.activeTab = "clans";
        await deps.refreshLeaderboard(false);
    });

    bind("leaderboardRefreshBtn", async () => {
        await deps.refreshLeaderboard(true);
    });

    bind("seasonRefreshBtn", async () => {
        await deps.refreshSeasonHub(true);
    });

    bind("seasonClaimBtn", async () => {
        await deps.claimSeasonReward();
    });

    bind("seasonPassBuyBtn", () => {
        if (typeof deps.buySeasonPass === "function") deps.buySeasonPass();
    });

    bind("clanSearchBtn", async () => {
        await deps.refreshClanList();
    });

    bind("clanRecommendBtn", async () => {
        await deps.refreshClanRecommendations();
    });

    bind("clanCreateBtn", async () => {
        const name = document.getElementById("clanCreateNameInput").value.trim();
        if (!name) {
            deps.setClanStatus("Введите название клана.");
            return;
        }
        try {
            await deps.apiRequest("clan-create", { method: "POST", body: { name } });
            document.getElementById("clanCreateNameInput").value = "";
            await deps.refreshClanState();
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка создания";
            deps.setClanStatus(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("clanJoinBtn", async () => {
        const clanId = Number.parseInt(document.getElementById("clanJoinIdInput").value || "", 10);
        if (!Number.isFinite(clanId) || clanId <= 0) {
            deps.setClanStatus("Введите корректный ID клана.");
            return;
        }
        try {
            await deps.apiRequest("clan-join", { method: "POST", body: { clanId } });
            document.getElementById("clanJoinIdInput").value = "";
            await deps.refreshClanState();
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка вступления";
            deps.setClanStatus(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("clanMembersToggleBtn", () => {
        state.clanMembersPanelOpen = !state.clanMembersPanelOpen;
        deps.syncClanMembersPanel();
    });

    bind("clanLeaveBtn", async () => {
        try {
            await deps.apiRequest("clan-leave", { method: "POST" });
            await deps.refreshClanState();
            await deps.refreshClanList();
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка выхода";
            deps.setClanStatus(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("clanSettingsSaveBtn", async () => {
        try {
            await deps.apiRequest("clan-settings", {
                method: "POST",
                body: {
                    slogan: document.getElementById("clanSloganInput")?.value || "",
                    bannerText: document.getElementById("clanBannerInput")?.value || "",
                    styleTag: document.getElementById("clanStyleInput")?.value || "any",
                    minTrophies: Number.parseInt(document.getElementById("clanMinTrophiesInput")?.value || "0", 10) || 0,
                    emblem: document.getElementById("clanEmblemInput")?.value || "",
                    color: document.getElementById("clanColorInput")?.value || "",
                    wallMessage: document.getElementById("clanWallInput")?.value || "",
                    rulesText: document.getElementById("clanRulesInput")?.value || ""
                }
            });
            await deps.refreshClanState();
            deps.setClanStatus("Настройки клана сохранены.");
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка настроек";
            deps.setClanStatus(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("clanContributeBtn", async () => {
        const amount = Number.parseInt(document.getElementById("clanContributionAmountInput")?.value || "0", 10);
        if (!Number.isFinite(amount) || amount <= 0) {
            deps.setClanStatus("Введите корректную сумму вклада.");
            return;
        }
        try {
            await deps.apiRequest("clan-contribute", {
                method: "POST",
                body: { amount }
            });
            document.getElementById("clanContributionAmountInput").value = "";
            await deps.refreshClanState();
            deps.setClanStatus("Вклад успешно внесён в клан.");
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка вклада";
            deps.setClanStatus(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("clanClaimMegaBtn", async () => {
        try {
            const data = await deps.apiRequest("clan-mega-claim", { method: "POST" });
            const rewards = data?.rewards || {};
            const serverBoxInventory = data?.boxInventory;
            if (serverBoxInventory && typeof serverBoxInventory === "object") {
                state.boxInventory.common = Math.max(0, Math.floor(Number(serverBoxInventory.common || 0)));
                state.boxInventory.rare = Math.max(0, Math.floor(Number(serverBoxInventory.rare || 0)));
                state.boxInventory.super = Math.max(0, Math.floor(Number(serverBoxInventory.super || 0)));
            } else {
                state.boxInventory.common += Math.max(0, Number(rewards.commonBoxes || 0));
                state.boxInventory.rare += Math.max(0, Number(rewards.rareBoxes || 0));
                state.boxInventory.super += Math.max(0, Number(rewards.superBoxes || 0));
            }
            deps.saveBoxInventory();
            deps.renderShop();
            await deps.refreshClanState();
            alert(`Мегакопилка получена: +${rewards.commonBoxes || 0} обычных, +${rewards.rareBoxes || 0} редких, +${rewards.superBoxes || 0} супер.`);
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка выдачи";
            deps.setClanStatus(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("clanInviteJoinBtn", async () => {
        const inviteCode = (document.getElementById("clanInviteCodeInput").value || "").trim().toUpperCase();
        if (!inviteCode) {
            deps.setClanStatus("Введите код инвайта.");
            return;
        }
        try {
            await deps.apiRequest("clan-invite-join", {
                method: "POST",
                body: { inviteCode }
            });
            document.getElementById("clanInviteCodeInput").value = "";
            await deps.refreshClanState();
            deps.setClanStatus("Вход в клан выполнен.");
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка инвайта";
            deps.setClanStatus(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("clanRotateInviteBtn", async () => {
        try {
            await deps.apiRequest("clan-invite-create", { method: "POST" });
            await deps.refreshClanState();
            deps.setClanStatus("Инвайт обновлён.");
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка инвайта";
            deps.setClanStatus(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("clanWarStartBtn", async () => {
        const opponentClanId = Number.parseInt(document.getElementById("clanWarOpponentIdInput").value || "", 10);
        if (!Number.isFinite(opponentClanId) || opponentClanId <= 0) {
            deps.setClanStatus("Введите ID клана-соперника.");
            return;
        }
        try {
            await deps.apiRequest("clan-war-start", {
                method: "POST",
                body: { opponentClanId }
            });
            await deps.refreshClanWarState();
            deps.setClanStatus("Клановая война запущена.");
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка запуска войны";
            deps.setClanStatus(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("clanWarRefreshBtn", async () => {
        await deps.refreshClanWarState();
    });

    bind("clanWeeklyTopRefreshBtn", async () => {
        await deps.refreshClanWeeklyTop();
    });

    bind("clanEventCreateBtn", async () => {
        try {
            const bonusPct = Number.parseInt(document.getElementById("clanEventBonusInput")?.value || "0", 10) || 0;
            const durationHours = Number.parseInt(document.getElementById("clanEventDurationInput")?.value || "2", 10) || 2;
            const title = document.getElementById("clanEventTitleInput")?.value || "Счастливые часы";
            await deps.apiRequest("clan-event-create", {
                method: "POST",
                body: { eventType: "happy_hour", title, bonusPct, durationHours }
            });
            await deps.refreshClanState();
            deps.setClanStatus("Клановое событие запущено.");
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка события";
            deps.setClanStatus(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("clanChatSendBtn", async () => {
        const input = document.getElementById("clanChatInput");
        const message = String(input?.value || "").trim();
        if (!message) return;
        try {
            await deps.apiRequest("clan-chat", {
                method: "POST",
                body: { message }
            });
            if (input) input.value = "";
            await deps.refreshClanChat();
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка чата";
            deps.setClanStatus(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("clanChatRefreshBtn", async () => {
        await deps.refreshClanChat();
    });

    bind("clanLogsRefreshBtn", async () => {
        await deps.refreshClanLogs();
    });

    bind("friendsSearchBtn", async () => {
        if (!state.accountUser || !state.accountToken) {
            deps.setFriendsSearchResult("Сначала войдите в аккаунт.");
            return;
        }
        const raw = document.getElementById("friendsSearchIdInput").value.trim();
        const userId = Number.parseInt(raw, 10);
        if (!Number.isFinite(userId) || userId <= 0) {
            deps.setFriendsSearchResult("Введите корректный ID.");
            return;
        }
        try {
            const data = await deps.apiRequest(`friends-search?id=${encodeURIComponent(String(userId))}`, { method: "GET" });
            const relation = data?.relation?.state || "none";
            const user = data?.user || null;
            deps.renderFriendsSearchUser(user, relation, data?.relation?.requestId || null);
            await deps.refreshFriendsState();
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка поиска";
            deps.setFriendsSearchResult(`Ошибка: ${msg}`);
            console.error(error);
        }
    });

    bind("playGroupBtn", () => {
        deps.showOnlyMenu("playMenu");
        if (typeof deps.renderModeSwitchUI === "function") deps.renderModeSwitchUI();
    });
    bind("settingsGroupBtn", () => deps.showOnlyMenu("settingsMenu"));
    bind("socialGroupBtn", async () => {
        deps.showOnlyMenu("socialMenu");
        await deps.refreshSocialNotices();
    });
    bind("mainMenuBackBtn", () => deps.closeMainMenuGroups());
    bind("closePlayMenuBtn", () => deps.showOnlyMenu("mainMenu"));
    bind("closeSocialMenuBtn", () => deps.showOnlyMenu("mainMenu"));
    bind("closeTrophyRoadMenuBtn", () => deps.showOnlyMenu("socialMenu"));
    bind("trophyRoadRefreshBtn", () => {
        if (typeof deps.renderTrophyRoad === "function") deps.renderTrophyRoad();
    });
    bind("closeQuestsMenuBtn", () => deps.showOnlyMenu("socialMenu"));
    bind("questsRefreshBtn", () => deps.refreshQuestHub());
    bind("closeSettingsMenuBtn", () => deps.showOnlyMenu("mainMenu"));

    bind("socialInviteBtn", async () => {
        if (!state.accountUser || !state.accountToken) {
            alert("Сначала войдите в аккаунт.");
            return;
        }
        const url = new URL(window.location.href);
        url.searchParams.set("friendInvite", String(state.accountUser.id));
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url.toString());
                deps.showRoomEventToast("Ссылка на профиль для друзей скопирована.");
            } else {
                prompt("Скопируйте ссылку приглашения", url.toString());
            }
        } catch (_) {
            prompt("Скопируйте ссылку приглашения", url.toString());
        }
    });

    bind("socialNoticeRefreshBtn", async () => {
        await deps.refreshSocialNotices();
    });

    bind("socialNoticePublishBtn", async () => {
        await deps.publishSocialNotice();
    });

    bind("openTutorialBtn", () => deps.openTutorial(0));

    bind("tutorialPrevBtn", () => {
        state.tutorialStepIndex = Math.max(0, state.tutorialStepIndex - 1);
        deps.renderTutorialStep();
    });

    bind("tutorialNextBtn", () => {
        if (state.tutorialStepIndex >= deps.TUTORIAL_STEPS.length - 1) {
            deps.completeTutorial();
            return;
        }
        state.tutorialStepIndex += 1;
        deps.renderTutorialStep();
    });

    bind("tutorialCloseBtn", () => deps.completeTutorial());

    bind("resetOnboardingBtn", () => {
        state.onboardingDone = false;
        localStorage.removeItem(deps.ONBOARDING_DONE_KEY);
        alert("Онбординг сброшен. Откройте туториал снова.");
    });

    bind("applyFeatureFlagsBtn", () => {
        const read = (id) => !!document.getElementById(id)?.checked;
        state.featureFlags = {
            onboarding: read("flagOnboarding"),
            dailyRewards: read("flagDailyRewards"),
            foodTiers: read("flagFoodTiers"),
            mapEvents: read("flagMapEvents"),
            socialMissions: read("flagSocialMissions"),
            seasonPass: read("flagSeasonPass"),
            qualityWatch: read("flagQualityWatch"),
            experiments: read("flagExperiments")
        };
        deps.saveFeatureFlags();
        state.uiLocale = String(document.getElementById("languageSelect")?.value || "ru").toLowerCase();
        if (!(state.uiLocale in deps.I18N)) state.uiLocale = "ru";
        deps.saveUiLocale();
        if (state.featureFlags.experiments) {
            state.abVariant = deps.assignAbVariant();
        }
        deps.applyLocalization();
        deps.refreshChallengeUI();
        alert("Feature flags и язык сохранены.");
    });

    bind("copySupportDumpBtn", async () => {
        const dump = {
            time: new Date().toISOString(),
            app: "snake-neon-field",
            locale: state.uiLocale,
            flags: state.featureFlags,
            abVariant: state.abVariant,
            lastLogs: state.qualityLogs.slice(-5),
            mode: state.currentGameMode,
            running: state.running
        };
        const text = JSON.stringify(dump, null, 2);
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                deps.showRoomEventToast("Debug-отчёт скопирован.");
            } else {
                prompt("Скопируйте debug-отчёт", text);
            }
        } catch (_) {
            prompt("Скопируйте debug-отчёт", text);
        }
    });

    bind("skinEditorBtn", () => {
        deps.closeMainMenuGroups();
        if (state.shopPreviewItemId) {
            state.shopPreviewItemId = null;
            deps.applyCosmetics();
        }
        deps.showOnlyMenu("skinMenu");
        deps.syncSkinInputs();
        if (typeof deps.renderSnakeSkinMenu === "function") deps.renderSnakeSkinMenu();
    });

    bind("shopBtn", () => {
        deps.showOnlyMenu("shopMenu");
        deps.updateMenuTrophies();
        deps.renderShop();
    });

    bind("closeSkinMenuBtn", () => deps.showOnlyMenu("mainMenu"));
    bind("closeShopBtn", () => deps.showOnlyMenu("mainMenu"));

    for (const btn of document.querySelectorAll("[data-neon-pack]")) {
        btn.addEventListener("click", () => {
            const key = btn.getAttribute("data-neon-pack");
            deps.applyNeonPack(deps.NEON_PACKS[key]);
        });
    }

    bind("restartBtn", () => {
        if (deps.inRoomChallengeSession()) {
            if (state.roomState && state.roomState.status === "active") {
                deps.startGame(false, true);
            }
            return;
        }
        deps.startGame(state.aiMode, state.sessionNoRewards);
    });

    bind("roomRematchBtn", async () => {
        if (!state.roomState) return;
        try {
            const resetData = await deps.apiRequest("room-rematch", {
                method: "POST",
                body: { roomCode: state.roomState.roomCode }
            });
            deps.applyRoomState(resetData.room || null);

            const startData = await deps.apiRequest("room-start", {
                method: "POST",
                body: { roomCode: state.roomState.roomCode }
            });
            deps.applyRoomState(startData.room || null);
            state.roomLastStartedChallengeId = 0;
            await deps.pullRoomState(true);
        } catch (error) {
            const msg = error && error.code ? error.code : "ошибка реванша";
            const roomResultEl = document.getElementById("roomResultText");
            if (roomResultEl) roomResultEl.innerText = `Ошибка: ${msg}`;
            console.error(error);
        }
    });

    bind("roomLeaveBtn", async () => {
        if (!state.roomState) return;
        try {
            await deps.apiRequest("room-leave", {
                method: "POST",
                body: { roomCode: state.roomState.roomCode }
            });
        } catch (error) {
            console.error(error);
        }
        deps.applyRoomState(null);
        state.roomSession = { active: false, roomCode: "", challengeId: 0 };
        document.getElementById("gameOverMenu").classList.add("hidden");
        document.getElementById("mainMenu").classList.remove("hidden");
        deps.closeMainMenuGroups();
        deps.syncMenuOverlayState();
    });

    bind("exitBtn", () => {
        if (typeof state.replayManager !== "undefined" && state.replayManager?.isReplayActive?.()) {
            state.replayManager.stopReplay(true);
        }
        deps.stopTrophyAnimation();
        document.body.classList.remove("gameover-active");
        document.body.classList.remove("in-arena");

        state.running = false;
        state.isReplaying = false;

        document.getElementById("exitBtn").classList.add("hidden");
        document.getElementById("gameOverMenu").classList.add("hidden");
        document.getElementById("playMenu").classList.add("hidden");
        document.getElementById("socialMenu").classList.add("hidden");
        document.getElementById("moderationMenu").classList.add("hidden");
        document.getElementById("settingsMenu").classList.add("hidden");
        document.getElementById("tutorialMenu").classList.add("hidden");
        document.getElementById("historyMenu").classList.add("hidden");
        document.getElementById("accountMenu").classList.add("hidden");
        document.getElementById("friendsMenu").classList.add("hidden");
        document.getElementById("clanMenu").classList.add("hidden");
        document.getElementById("leaderboardMenu").classList.add("hidden");
        document.getElementById("seasonMenu").classList.add("hidden");
        document.getElementById("roomMenu").classList.add("hidden");
        document.getElementById("skinMenu").classList.add("hidden");
        document.getElementById("shopMenu").classList.add("hidden");

        if (deps.inRoomChallengeSession() && state.roomState) {
            document.getElementById("roomMenu").classList.remove("hidden");
            deps.startRoomPolling();
            deps.pullRoomState(true);
        } else {
            document.getElementById("mainMenu").classList.remove("hidden");
        }
        deps.stopModerationPolling();
        deps.closeMainMenuGroups();
        deps.syncMenuOverlayState();
    });

    bind("menuBtn", () => {
        if (typeof state.replayManager !== "undefined" && state.replayManager?.isReplayActive?.()) {
            state.replayManager.stopReplay(true);
        }
        deps.stopTrophyAnimation();
        document.body.classList.remove("gameover-active");
        document.body.classList.remove("in-arena");
        state.running = false;

        document.getElementById("gameOverMenu").classList.add("hidden");
        document.getElementById("playMenu").classList.add("hidden");
        document.getElementById("socialMenu").classList.add("hidden");
        document.getElementById("moderationMenu").classList.add("hidden");
        document.getElementById("settingsMenu").classList.add("hidden");
        document.getElementById("tutorialMenu").classList.add("hidden");
        document.getElementById("accountMenu").classList.add("hidden");
        document.getElementById("friendsMenu").classList.add("hidden");
        document.getElementById("clanMenu").classList.add("hidden");
        document.getElementById("leaderboardMenu").classList.add("hidden");
        document.getElementById("seasonMenu").classList.add("hidden");
        document.getElementById("roomMenu").classList.add("hidden");
        document.getElementById("skinMenu").classList.add("hidden");
        document.getElementById("shopMenu").classList.add("hidden");
        deps.updateMenuTrophies();
        if (deps.inRoomChallengeSession() && state.roomState) {
            document.getElementById("roomMenu").classList.remove("hidden");
            deps.startRoomPolling();
            deps.pullRoomState(true);
        } else {
            document.getElementById("mainMenu").classList.remove("hidden");
        }
        deps.stopModerationPolling();
        deps.closeMainMenuGroups();
        deps.syncMenuOverlayState();
    });

    bind("historyBtn", () => {
        deps.showOnlyMenu("historyMenu");
        deps.renderHistory();
    });

    bind("closeHistoryBtn", () => {
        deps.showOnlyMenu("mainMenu");
    });

    bind("exportHistoryBtn", () => {
        if (!state.gameHistory.length) {
            alert("История пуста, экспортировать нечего.");
            return;
        }
        deps.exportGamesPayload(state.gameHistory, "history");
    });

    bind("exportHighlightsBtn", () => {
        if (!state.highlightClips.length) {
            alert("Клипов пока нет.");
            return;
        }
        const clipsPayload = state.highlightClips
            .map((clip) => deps.normalizeHighlightClip(clip))
            .filter(Boolean)
            .map((clip) => clip.replay);
        if (!clipsPayload.length) {
            alert("Клипы повреждены и не могут быть экспортированы.");
            return;
        }
        deps.exportGamesPayload(clipsPayload, "highlights");
    });

    bind("importHistoryBtn", () => {
        document.getElementById("importHistoryInput").click();
    });

    bind("mainExportProgressBtn", () => {
        deps.exportFullProgressPayload();
    });

    bind("mainImportProgressBtn", () => {
        document.getElementById("importProgressInput").click();
    });

    bind("replayPauseBtn", () => {
        state.replayManager?.togglePaused?.();
    });

    bind("replayStepBtn", () => {
        state.replayManager?.stepFrame?.();
    });

    for (const btn of document.querySelectorAll(".replaySpeedBtn")) {
        btn.addEventListener("click", () => {
            const value = Number(btn.dataset.speed || "1");
            state.replayManager?.setPlaybackRate?.(value);
        });
    }
}
