Original prompt: исправить ошибки в консоли фронтенда (toLowerCase of undefined, prevRoom is not defined, бесконечные room-state ошибки 401/400/not_room_member/room_not_found).

- Использован навык develop-web-game.
- Найдены проблемные точки в /Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/index.html:
  - `applyRoomState`: использовался `prevRoom`, но переменная не была объявлена.
  - `keydown`/`keyup`: прямой вызов `e.key.toLowerCase()` без проверки.
  - `loginOrRegister`: приведение идентификатора к lower-case без защитного приведения типа.
  - `pullRoomState`: при `room_not_found`/`not_room_member`/`401` происходил бесконечный polling и спам ошибок.
  - отсутствовал favicon link (404 `/favicon.ico`).

Сделанные изменения:
- Добавлен `const prevRoom = roomState;` перед заменой state в `applyRoomState`.
- Добавлены защиты `e?.key` в обработчиках `keydown` и `keyup`.
- В `loginOrRegister` заменено на `const email = String(identifier || "").toLowerCase();`.
- В `pullRoomState` добавлена обработка кодов `room_not_found`, `not_room_member`, `http_401`:
  - сброс состояния через `applyRoomState(null)`;
  - остановка polling (через текущую логику `applyRoomState(null)`);
  - показ понятного статуса вместо бесконечных ошибок в консоли.
- Добавлен `<link rel="icon" href="data:,">` в `<head>`.

Проверка:
- Локально подтверждено наличие изменений через `rg`/`nl`.
- Автотест Playwright из навыка не запущен: в окружении отсутствуют `node`, `npm`, `npx`.

TODO для следующего шага:
- Запустить приложение в браузере и проверить, что:
  - больше нет `prevRoom is not defined`;
  - больше нет `Cannot read properties of undefined (reading 'toLowerCase')`;
  - polling комнаты прекращается после потери доступа/комнаты.

Update (clans/mega piggy bank):
- Fixed megaclaim state drift in backend:
  - `netlify/functions/clan-mega-claim.js`: now also persists rewarded boxes directly into `user_progress.progress_json.boxInventory` on server.
- Fixed claim availability logic:
  - `netlify/functions/clan-record-win.js`: now returns `claimed` and computes `canClaim = wins >= target && !claimed`.
  - Includes the same logic in cooldown response branch.
- Synced frontend with new payload:
  - `index.html`: after `clan-record-win`, now updates `clanState.clan.claimed` too.
  - `index.html`: fixed edge case where `wins=0` skipped UI refresh due to truthy check.

Testing note:
- Automated runtime tests still not executed in this environment due to missing Node/npm.

Update (runtime hardening for room + input errors):
- `index.html`:
  - added `roomPullInFlight` guard to prevent parallel `pullRoomState()` requests and repeated room-state spam.
  - `pullRoomState()` now resets in-flight flag in `finally`.
  - on room reset (`applyRoomState(null)`) now also resets room challenge tracking and posted score cache.
  - polling callback now safely calls `pullRoomState(false).catch(() => {})` to avoid unhandled promise noise.
  - extra-safe keyboard normalization for `keydown/keyup`: `String(keyValue || "").toLowerCase()` + early return.
- Goal: eliminate repeated 401/400 room polling cascades and any residual key-event `toLowerCase` crashes.

Update (Yandex ad moderation safety):
- `index.html` ad render changed from immediate call to guarded init:
  - ad now renders only when `#mainMenu` is visible.
  - delayed first attempt on `load` and retries on user clicks.
  - added try/catch around `Ya.Context.AdvManager.render` to avoid ad SDK runtime crash bubbling.

Update (global release batch: 1/2/3/5/6/7/8 + remove ads):
- Removed all Yandex ad snippets from `index.html` (`head` loader + `floorAd` block).
- Added onboarding and retention:
  - new `tutorialMenu` with 3-step quick onboarding.
  - onboarding completion persisted via `ONBOARDING_DONE_KEY`.
  - daily login reward streak with reward line in main menu.
  - weekly challenge card (`weeklyChallengeA`) with progress + reward logic.
- Added core gameplay extensions:
  - new mode in selector and `GAME_MODES`: `survival_plus` (`SURV+`).
  - food tiers (`common/rare/epic`) via deterministic roll (`rollFoodTier`) with score/growth/coin bonuses.
  - visual tier hint ring around rare/epic food.
  - map event for `survival_plus`: moving hazard zone with death threshold.
- Added social interaction upgrades:
  - social menu button `socialInviteBtn` copies friend invite URL (`?friendInvite=<id>`).
  - URL invite auto-handled on login (`tryHandleFriendInviteUrl`) to send friend request.
  - daily friend mission progress/reward tracked in `socialMissionLine`.
- Added content/meta systems:
  - season summary block (`seasonLine`) and active season countdown.
  - seasonal pass reward tiers (coins by trophy milestones) with season persistence.
- Added quality/release infra:
  - feature flags panel in settings (toggleable modules).
  - locale selector (RU/EN) + lightweight UI localization.
  - AB variant assignment/persistence (`alpha/beta`) and display.
  - crash/quality watcher (`window.error` + `unhandledrejection`) with debug status line and copyable support dump.
  - simple integrity hardening in update loop (invalid coords + speed clamp logging).
- UI/UX hardening:
  - `tutorialMenu` added into central overlay routing arrays.
  - floating clan participants panel auto-closes when switching away from clan menu to avoid overlap.

Update (remove minimap + hardening):
- Removed minimap rendering from gameplay:
  - deleted `drawMiniMap()` function from `index.html`.
  - removed `drawMiniMap()` call from `draw()`.
- Added defensive guard in `updateGameOverRoomControls()` to avoid runtime crash if menu buttons are absent.
- Improved mega piggy claim consistency:
  - `clan-mega-claim` now returns authoritative server `boxInventory` after DB update (`returning progress_json`).
  - frontend claim handler now prefers server `boxInventory` over local increments.

Update (requested clan features 1/2/4/5/6/10):
- Implemented roles + permissions:
  - added `officer` role support in schema/logic.
  - new endpoints: `clan-role-set`, `clan-kick`.
  - frontend member actions for owner/officer with permission checks.
- Implemented clan invite code/link:
  - schema: `clans.invite_code` + unique index.
  - endpoints: `clan-invite-create`, `clan-invite-join`.
  - frontend: join by code input + auto-join from `?clanInvite=CODE`.
- Implemented clan chat:
  - schema: `clan_chat_messages`.
  - endpoint: `clan-chat` (GET/POST).
  - frontend chat list + send + refresh + polling.
- Implemented clan shop:
  - schema: `clans.coins`, `clan_shop_unlocks`.
  - helper: `_clan_shop.js` (offers catalog).
  - endpoints: `clan-shop`, `clan-shop-buy`.
  - `clan-record-win` now adds +1 clan coin per valid win.
  - frontend shop section with unlock flow.
- Implemented clan wars:
  - schema: `clan_wars`.
  - endpoints: `clan-war-start`, `clan-war-state`.
  - `clan-record-win` now progresses active clan war by +1 on valid win.
  - frontend war section (start + state view).
- Implemented activity logs:
  - schema: `clan_activity_logs`.
  - endpoint: `clan-logs`.
  - integrated logging for key actions (create/join/leave/invite/shop/mega/chat/war events).
- Updated schema file `neon-schema.sql` to include all new clan structures.

Notes:
- This is a broad feature set; runtime verification in this environment is limited (no Node/npm available for automated local run).

Update (AI modularization):
- Refactored AI into dedicated folder `ai/`:
  - `ai/state.js`: runtime AI state + `initAI/resetAI` lifecycle.
  - `ai/ui.js`: UI key highlight logic.
  - `ai/strategy.js`: decision engine (`runAI`) and tactical logic.
  - `ai/index.js`: public facade exports.
- Added compatibility shim `ai.js` that re-exports from `ai/index.js`.
- Updated game import in `index.html` to `./ai/index.js`.
- AI improvements:
  - adaptive profile in `currentProfileConfig()` based on snake length.
  - stronger anti-loop thresholds in late game.
  - persisted `lastSnakeLength` in shared state.

Validation note:
- Static checks performed (references/imports updated).
- Runtime Playwright/Node checks could not be executed in this environment due to missing Node/npm.

Update (AI deep improvements):
- Added `ai/config.js` with adaptive AI profile builder (`buildAiConfig`) instead of fixed constants.
- Added `ai/lookahead-cache.js` with bounded LRU-style cache for recursive lookahead scoring.
- Updated `ai/strategy.js`:
  - integrated adaptive config by board pressure (free-space ratio), snake length, and stuck-loop signal.
  - added move trap-risk classification (`trapRisk`) from next mobility.
  - strengthened move scoring with mobility bonus + dead-end/corridor penalties.
  - integrated lookahead cache in recursive planner (`lookaheadScore`).
  - added critical-pressure branch that prioritizes escape behavior before greedy food chasing.
- `index.html` already imports AI via `./ai/index.js`; compatibility re-export remains in `ai.js`.

Runtime test note: no Node/npm in this environment, so only static integration checks were performed.

Update (shop preview + full menu UI refresh for global release):
- Implemented full preview coverage for effect shop items (all `SHOP_ITEMS`), excluding loot boxes:
  - removed box preview blocks/buttons from `renderShop()`.
  - retained box odds (`Шансы`) and buy/open actions.
  - added preview toggle button per every effect item (`Предпросмотр` / `Убрать превью`).
- Added live preview state:
  - new state: `shopPreviewItemId`.
  - new helpers: `getShopPreviewItem()`, `getActiveCosmetics()`, `toggleShopPreview(item)`.
  - `applyCosmetics()` now uses active cosmetics (equipped + optional preview override).
  - preview resets automatically on real equip (`equipItem`) to avoid stale overrides.
- Extended preview impact to gameplay visual systems so preview works beyond static food color:
  - `spawnEatEffect` / `drawEatEffects` now read active cosmetics.
  - `spawnDeathEffect` / `drawDeathEffect` now read active cosmetics.
  - snake trail rendering in `draw()` now uses active trail effect.
- Reworked shop layout:
  - card-based sections (`Ящики` and `Эффекты`), badges, action rows.
  - added explanatory line in shop menu that preview is for effects and odds are for boxes.
- Per user request for a more substantial (not just recolor) interface update, introduced a broad arcade-style UI pass across menus:
  - upgraded menu shells, typography, button geometry/shadows, cards, tabs, input styling.
  - unified visual treatment for clan/friends/room/shop/leaderboard panels.
  - improved mobile behavior for new shop action layout.

Validation:
- Static checks done with `rg`/`sed` and diff review.
- Automated Playwright run required by skill could not be executed in this environment because `node`/`npx` are unavailable (`command -v node` and `command -v npx` both missing).

Update (interface rollback + logical button placement):
- Rolled back prior broad visual redesign pass (removed large arcade/Brawl-like CSS override block).
- Removed extra shop UI helper strip (`shopSubLine`) and reverted shop layout markup to the simpler baseline structure.
- Kept functional preview behavior changes for effects (preview on all effect items, no preview on loot boxes).
- Reworked only main menu structure to place actions in logical groups instead of one long list:
  - game block (Play + mode panel),
  - social block (friends/clans/leaderboard/room),
  - effects block (editor/shop),
  - profile/data block (settings + history/account/export/import).
- Added lightweight CSS for grouped layout and responsive collapse to single-column on small screens.
- Updated main menu layout per user positioning request:
  - `Neon Snake` pinned at very top center.
  - trophies (top-left) with coins directly below.
  - settings button moved to top-right.
  - play button moved to bottom-right.
  - social actions now open via small right-side `Социальное` button (separate collapsible panel), similar small-entry behavior to shop/effects buttons.
- Expanded `setMainMenuGroup` to support `social` panel state and toggle active buttons.

Update (full clan systems expansion requested by user):
- Backend groundwork finished for extended clan progression and governance:
  - `_clans.js` now includes:
    - weekly task template bootstrap (`wins_25`, `chat_40`, `contrib_500`),
    - reputation helper (`adjustClanReputation`),
    - season snapshot writer,
    - achievement unlock helper,
    - role permission map for `owner/officer/recruiter/treasurer/member`.
- Extended clan API payload (`clan-info`):
  - returns clan level/perks/xp progress,
  - weekly tasks, achievements,
  - contribution totals/logs,
  - member reputation table,
  - season history points,
  - active clan events,
  - expanded permission matrix.
- Added/updated endpoints for requested systems:
  - NEW: `clan-contribute` (personal coins -> clan fund + logs + reputation + weekly task progress).
  - NEW: `clan-weekly-task-claim` (claim weekly task rewards to clan coins/xp).
  - NEW: `clan-settings` (wall/rules/banner/slogan/style/emblem/color/min trophies update).
  - NEW: `clan-recommend` (auto clan recommendations by style + user trophies fit).
  - NEW: `clan-event-create` (happy-hours style clan event with bonus % and duration).
  - Updated `clan-join` and `clan-invite-join` with trophy gate (`min_trophies`).
  - Updated `clan-role-set` for roles: `officer/recruiter/treasurer/member`.
  - Updated `clan-chat` to progress weekly chat task + reputation activity.
  - Updated `clan-record-win` to add clan trophies/xp/perks influence, event bonus handling, weekly task progress, season snapshots, and achievement unlock checks.
  - Updated `clan-shop-buy` to use economy permissions and add reputation gain.
  - Updated `clan-list` with richer search/filter payload and sorting fit.
  - Updated `leaderboard-clans` to use persistent `clans.trophies`.
- Frontend clan UI (`index.html`) expanded:
  - No-clan panel: style + min trophies search filters and “Автоподбор клана”.
  - In-clan panel: level/perks line, wall/settings editor, weekly tasks list with reward claim button, contributions block + input, reputation list, achievements + season history lists, events list + event creation controls.
  - Member role controls now support assigning `офицер/рекрутер/казначей/участник`.
  - Clan settings save and contribution submit wired to new APIs.
  - Clan polling now refreshes full clan state to keep new blocks in sync.

Validation note:
- Static diff check passed (`git diff --check`).
- Automated Playwright/Node runtime verification still blocked in this environment (Node/npm unavailable).

TODO for next agent:
- Execute runtime smoke tests for all new clan actions in browser (create clan, settings save, contribution, weekly task claim, event create, recommendation, joins with/without trophy gate).
- Confirm database has `user_progress` rows for all users before contribution flow; if not, ensure upsert path in contribution endpoint.
- Optional: add dedicated localized labels for weekly task IDs (`wins_25/chat_40/contrib_500`) in UI instead of raw IDs.

Update (friends interaction upgrade):
- Reworked friends list from passive text to actionable rows.
- Backend `friends-list` now returns:
  - friend trophies from `user_progress.progress_json.trophies`,
  - active room info (room code/status/public flag/current occupancy/max players) via join with `room_players` + `game_rooms`.
- Frontend `index.html` updates:
  - each friend row now shows: name/id, trophies, and current room status,
  - added actions per friend:
    - `Войти в комнату` (joins friend room by code),
    - `Копировать код` (copies friend room code),
    - `Открыть профиль` (loads friend profile into existing friends-search area),
    - `Удалить` (existing).
  - buttons are disabled when friend has no active room.

Validation note:
- Static checks passed (`git diff --check`).
- Runtime browser validation not executed in this environment (Node/npm unavailable).

Update (menu overlap fix):
- Fixed main-menu submenu overlap:
  - set `#mainMenu .menuGroup` default to `display:none`,
  - only active submenu (`play/settings/social`) is explicitly shown.
- Added centralized menu switcher `showOnlyMenu(menuId)` to guarantee one overlay menu visible at a time.
- Rewired open/close handlers for room/account/friends/clan/leaderboard/skin/shop/history menus to use `showOnlyMenu`, preventing stacked menu layers.

Update (main menu popups for Play/Social/Settings):
- Reworked main menu flow so `Играть`, `Социальное`, `Настройки` open as separate top-level modal menus (same behavior style as other menus), not embedded overlays.
- Added new menus in `index.html`:
  - `#playMenu`
  - `#socialMenu`
  - `#settingsMenu`
  with dedicated back buttons.
- Rewired button handlers:
  - `playGroupBtn/settingsGroupBtn/socialGroupBtn` now open corresponding menu via `showOnlyMenu(...)`.
  - close buttons return to `mainMenu`.
- Extended global menu visibility control (`syncMenuOverlayState`, `OVERLAY_MENU_IDS`) to include new menus.
- Added defensive hides for new menus when entering arena/replay and when exiting from game-over to avoid stale overlays.

Update (replay modularization):
- Extracted replay runtime/loop logic into new module file `/replay.js`.
- Added `createReplayManager(ctx)` in `replay.js` and moved playback flow there (frame stepping, direction/eat event playback, growth/level/speed updates, finish behavior).
- `index.html` now imports replay module and creates `replayManager` with explicit context callbacks/state bridges.
- `watchReplay(index)` in `index.html` is now a thin delegator: `replayManager.watchReplay(index)`.

Update (replay stability hardening):
- Improved `replay.js` to be session-safe:
  - added replay session manager (`activeSessionId`) to prevent overlapping/ghost replay loops,
  - added `stopReplay(silent)` and `isReplayActive()` APIs,
  - each animation frame verifies active session before applying replay state.
- Added frame-step robustness:
  - delta clamp to avoid huge catch-up spikes after tab switches,
  - safety guard for invalid/empty snake state.
- Integrated replay cancellation into game transitions in `index.html`:
  - before `startGame(...)`,
  - on `exitBtn` and `menuBtn` handlers.
- Result: no cross-talk between replay loop and normal game loop during rapid menu/start/exit actions.

Update (replay to near-ideal control quality):
- Added dedicated replay control HUD in arena:
  - `Пауза/Продолжить`, `Шаг`, speed buttons `1x/2x/4x`.
- Added replay keyboard controls:
  - `Space` pause/resume,
  - `.` (and `ю`) single-frame step,
  - `1/2/4` playback speed.
- Replay engine (`replay.js`) upgraded with playback state:
  - `paused`, `playbackRate`, `stepRequested`,
  - `onReplayStateChange` callback for UI sync.
- Session safety retained and integrated with controls:
  - replay loop ignores stale sessions,
  - safe stop/reset of state and controls.

Update (replay visibility + exactness fix):
- Fixed replay controls visibility bug:
  - added `#replayControls.hidden { display:none !important; }` because `#replayControls { display:flex; }` had higher specificity than `.hidden`.
- Implemented exact replay mode by state frames:
  - added `sanitizeStateFrames(...)` and persisted `stateFrames` into history records (capped to 6000 frames),
  - `normalizeHistoryRecord(...)` now validates and keeps `stateFrames`,
  - replay engine prefers `stateFrames` playback when available (frame-by-frame state apply), with fallback to old input/food simulation for legacy records.
- Added `setSnake` bridge in replay context so replay can apply full captured snake state every frame.
- Expected outcome:
  - replay controls are visible only during replay,
  - newly recorded runs replay with exact score/path/death timing (no early death drift like 24->20).

Update (moderation system + admin chat):
- Added backend moderation core: `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/netlify/functions/_moderation.js`
  - lazy schema migration `ensureModerationSchema()` for:
    - `users.staff_role` (`player|moderator|admin`),
    - `admin_chat_messages` (staff-only chat),
    - `security_events` (suspicious actions log).
  - helpers: auth/role checks, IP extraction, severity normalization, security event writer.
- Added new Netlify functions:
  - `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/netlify/functions/admin-chat.js` (GET/POST, only `moderator/admin`, bug+alert kinds).
  - `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/netlify/functions/moderation-console.js` (GET summary + recent security events + bug reports, only staff).
  - `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/netlify/functions/moderation-security-log.js` (POST suspicious event from client, auth required, anti-spam throttle).
- Auth updated to propagate moderation role to frontend:
  - `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/netlify/functions/auth-login.js`
  - `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/netlify/functions/auth-me.js`
  - `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/netlify/functions/auth-register.js`
  - `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/netlify/functions/auth-update-nickname.js`
  - response now includes `user.staffRole`.
- SQL schema file updated:
  - `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/neon-schema.sql` now includes moderation role + admin chat + security events tables/indexes.
- Frontend moderation console integrated into `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/index.html`:
  - social menu now has hidden-by-default `Модерация` button (visible only for staff roles).
  - new `#moderationMenu` with:
    - suspicious actions feed,
    - severity filter (`high/critical`),
    - admin/staff chat with bug-report sending.
  - polling/refresh lifecycle + access guard wired.
  - moderation menu added to overlay routing (`showOnlyMenu`, `syncMenuOverlayState`) and hidden in gameplay/replay transitions.
- Suspicious action tracking wired from client:
  - quality/integrity/error sources now post to `/api/moderation-security-log` via throttled `reportSuspiciousAction()`.
  - room polling auth/membership failures are also reported once per cooldown window.

Verification note:
- Static verification done via `rg`/`sed` and file diff review.
- Runtime automated Playwright loop from the skill could not be executed here because `node/npx` are unavailable in this environment.

Update (bug-fix pass: replay accuracy + overlay safety + XSS hardening):
- Fixed replay truncation handling in `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/replay.js`:
  - detects when `stateFrames` are truncated (`finalFrame` or final score mismatch),
  - automatically falls back to input-driven replay when safe.
- Improved replay event fidelity for modern food mechanics:
  - `pushEatEvent(...)` now stores `scoreAfter`, `levelAfter`, `speedAfter`, `targetLengthAfter`, `foodTier`.
  - `sanitizeReplayInputs(...)` preserves these fields.
  - replay fallback now consumes these fields to avoid score/pace drift.
- Reduced menu-overlap regressions:
  - switched login/bootstrap/auth-gate transitions to `showOnlyMenu(...)` (single-source overlay visibility) in `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/index.html`.
- Hardening against UI breakage/XSS from user/imported text:
  - added `escapeHtml(...)` helper,
  - sanitized leaderboard/clan/history dynamic templates,
  - replaced several friend/public-room renders with safe `innerText`/DOM nodes.

Verification note:
- Runtime browser tests still blocked in this environment (`node/npx` absent), so verification was static (targeted diff + call-path checks).

Update (season system: skins + events + top-100 + rewards):
- Added backend season module:
  - NEW `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/netlify/functions/_season.js`
    - season schema bootstrap (`season_player_stats`, `season_reward_claims`),
    - current/previous season key helpers,
    - rotating season themes/events and seasonal skin pools,
    - top-100 seasonal leaderboard queries,
    - previous season top-100 reward claim logic with idempotency.
- Added season API endpoints:
  - NEW `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/netlify/functions/season-state.js`
    - returns season info, themed event info, seasonal skins, top players, reward tiers, personal rank, and previous-season reward status.
  - NEW `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/netlify/functions/season-claim-reward.js`
    - auth-only reward claim for previous season top-100.
- Wired season stat updates into cloud save:
  - `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/netlify/functions/progress-save.js` now syncs user season trophies (safe try/catch).
- SQL schema updated:
  - `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/neon-schema.sql` includes season tables + indexes.
- Frontend season UX in `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/index.html`:
  - social menu now has `Сезон` button and new `#seasonMenu`,
  - season menu shows:
    - current season + themed event,
    - seasonal skins list,
    - top-100 player leaderboard,
    - reward tiers for top-100,
    - claim action for previous season reward.
  - added handlers for season open/refresh/claim.
  - integrated season summary into main release line (`seasonLine` now uses backend season title when loaded).
- Added light seasonal gameplay event modifiers:
  - food tier roll (`rollFoodTier`) now applies season theme bonuses to rare/epic chances,
  - coin bonus from tiered food scales by seasonal event multiplier.
- Overlay routing updated:
  - `seasonMenu` added into global menu routing/hide paths to avoid menu stacking in game/replay transitions.

Validation note:
- `git diff --check` passed.
- Runtime Playwright/Node checks still unavailable in this environment (`node/npx` missing).

Update (global daily world events 24h rotation):
- Implemented rotating global event system in `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/index.html`:
  - `GLOBAL_DAILY_EVENTS` with 3 events:
    - `Red Day` (x2 food rewards),
    - `Chaos Hour` (periodic random effects),
    - `Mini Arena` (smaller playable map).
  - deterministic daily selection by UTC day key (`utcDayKey`) + hash-based rotation,
  - runtime state via `ensureGlobalEventState(...)`.
- Gameplay integration:
  - food gain multiplier now applies global event modifier (`getFoodRewardMultiplier`),
  - `Chaos Hour` tick engine (`maybeRunChaosHourTick`) triggers random effects:
    - random mutation burst,
    - food teleport,
    - temporary x2-food window.
  - `Mini Arena` limits:
    - food spawn area (`randomFood`) restricted to inner arena,
    - wall collision respects mini bounds in `checkCollision`,
    - visual overlay/border drawn in `drawModeOverlay`.
- UI integration:
  - added line in release summary: `#globalEventLine`,
  - `refreshReleaseSummaryUI()` now shows active global event name + description.
- Observability:
  - `window.render_game_to_text` now includes `globalEvent` and `arena` info.

Validation note:
- Static checks passed (`git diff --check`).
- Runtime browser automation remains unavailable in this environment (`node`/`npx` missing), so behavior verification is by code-path review.

Update (esports batch: spectator + highlights + weekly top):
- Added spectator mode for rooms:
  - New endpoint `netlify/functions/room-spectate.js`.
  - `room-state` now supports `?spectate=1` for non-members in public rooms and returns `spectator` flag.
  - `room-public-list` now includes waiting/active/finished public rooms.
  - Frontend room UI updates in `index.html`:
    - added `Наблюдать` button by code (`roomSpectateBtn`),
    - public room cards now have separate `Войти` and `Наблюдать` actions,
    - spectator-aware statuses and leave behavior (`Выйти из наблюдения`),
    - spectator polling no longer auto-starts the local run.

- Added highlight clips system on top of replay:
  - New local store key: `highlightClipsV1`.
  - Added clip normalization/persistence helpers (`normalizeHighlightClip`, `persistHighlights`).
  - Added auto clip builder from a match (`buildHighlightFromGame`) using best-score window.
  - History UI now supports:
    - `Сделать highlight` for each match,
    - dedicated `Highlight клипы` list with `Смотреть / Экспорт / Удалить`.
  - Replay engine extended:
    - `replay.js` now exposes `watchReplayData(...)` to play clips directly.

- Added weekly players leaderboard:
  - New schema/table: `player_weekly_stats` (+ indexes) in `neon-schema.sql`.
  - New helper module: `netlify/functions/_weekly_leaderboard.js`.
  - `progress-save` now syncs weekly stats (`syncUserWeeklyStats`) alongside season sync.
  - New endpoint: `netlify/functions/leaderboard-players-weekly.js`.
  - Frontend leaderboard has 3 tabs now: `Игроки / Неделя / Кланы`.

- Cloud/import/export integration:
  - `highlightClips` added into full progress snapshot, cloud sync payload, and progress export/import.

Validation notes:
- Static checks: `git diff --check` passed (no whitespace/patch format issues).
- Runtime Playwright loop from skill could not be executed in this environment because `node` and `npx` are not installed (`node:not_found`, `npx:not_found`).

Update (meta progression: Career path):
- Implemented new persistent meta progression "Career" in `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/index.html`:
  - stages: `Rookie` → `Predator` → `Arena Lord` → `Neon God`.
  - progression tied to trophies; uses `highestTrophies` so career does not downgrade on trophy losses.
  - local persistence key: `careerProgressV1` (`highestTrophies`, `maxStageIndex`).
- UI integration:
  - added career badge near rank in HUD (`#careerBadge`),
  - added mobile top-bar career badge (`#topCareerBadge`),
  - added release summary line (`#careerLine`) with remaining trophies to next stage.
- Logic integration:
  - rank update flow now calls `updateCareerProgressByTrophies(trophies)`,
  - stage-up toast + sound on real promotion during gameplay session.
- Sync/import/export integration:
  - included `careerProgress` in `getProgressSnapshot()` and full progress export payload,
  - import now normalizes and restores `careerProgress`,
  - reset flow clears career key and resets career runtime state.
- Debug/automation output:
  - `window.render_game_to_text` now includes `career` block.

Validation notes:
- Static check: `git diff --check` passed.
- Runtime Playwright loop from skill still blocked in this environment (`node`/`npx` missing).

Update (mobile optimization pass):
- Added adaptive mobile performance profile in `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/index.html`:
  - dynamic simulation step:
    - desktop: `120Hz` (`FIXED_STEP = 1000/120`)
    - mobile: `90Hz`
    - low-power mobile (save-data / low cores / low memory): `60Hz`
  - auto detection via viewport + device hints (`hardwareConcurrency`, `deviceMemory`, `navigator.connection.saveData`).
- Render cost reductions on mobile/low-power:
  - reduced shadows through `perfShadow(...)`,
  - reduced particle counts through `perfParticleCount(...)`,
  - capped eat effect queue size,
  - adaptive snake trail stride for long snakes (`trailDrawStride`),
  - disabled expensive dash trail on low-power, reduced pulse trail when reduced motion is preferred.
- Game-loop stabilization for dropped frames:
  - added accumulator clamp and max catch-up steps in `loop(...)` to avoid spiral-of-death stutter on weaker devices.
- UI polish:
  - lighter menu blur in mobile-optimized mode (`body.mobile-optimized.menu-active canvas`).
- Observability:
  - `window.render_game_to_text` now includes performance state:
    - `mobileOptimized`,
    - `lowPowerMobile`,
    - `fixedStepMs`.

Validation notes:
- Static checks passed (`git diff --check`).
- Runtime Playwright verification still unavailable in this environment (`node`/`npx` missing).

Update (index.html decomposition into separate files):
- Refactored `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/index.html` by extracting:
  - inline CSS into `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/main.css`,
  - inline module JS into `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/main.js`.
- Updated HTML includes:
  - `<link rel="stylesheet" href="./main.css">`
  - `<script type="module" src="./main.js"></script>`
- File size impact:
  - `index.html` reduced to ~640 lines,
  - logic moved to `main.js` (~7939 lines),
  - styles moved to `main.css` (~1468 lines).
- Kept JS imports valid (same relative root as before: `./foodRenderer.js`, `./ai/index.js`, etc.).

Validation notes:
- Static checks passed (`git diff --check`).
- Runtime Playwright loop from skill could not run because environment lacks `node`/`npx`.

Update (continued split of main.js):
- Further modularized `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/main.js` by extracting reusable logic into new modules under `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/app/`:
  - `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/app/config.js`
    - storage keys, feature flags, i18n, tutorial steps, global daily events, food tier meta, mutations.
  - `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/app/utils.js`
    - `safeParseJson`, `getWeekKey`, `clamp`, `hashString`, `mulberry32`, `todayKey`.
  - `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/app/rank-career.js`
    - rank/career constants and pure progression helpers.
  - `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/app/loot.js`
    - loot box odds/pools and rarity helpers.
  - `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/app/color.js`
    - `hexToRgba`.
- `main.js` now imports these modules and no longer duplicates those declarations/functions.
- `main.js` size reduced from ~7939 to ~7677 lines (additional logic moved out while preserving behavior).

Validation notes:
- Static check: `git diff --check` passed.
- Runtime Playwright verification still blocked (`node`/`npx` missing in this environment).

Update (continued split of main.js - liveops module):
- Added `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/app/liveops.js` and moved pure gameplay/liveops helpers out of `main.js`:
  - season + global daily event helpers:
    - `getSeasonState`, `createInitialGlobalEventState`, `utcDayKey`, `resolveGlobalDailyEvent`, `ensureGlobalEventState`
  - arena/event math:
    - `getArenaBounds`, `getFoodRewardMultiplier`, `getHazardZone`
  - challenge generators/formatters:
    - `createChallengeByTemplate`, `generateDailyChallenges`, `challengeProgressText`, `createWeeklyChallenge`, `createFriendMission`
- Updated `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/main.js` to import these from `app/liveops.js` and removed duplicated local implementations.
- Kept behavior stable via thin wrappers in `main.js` where state mutation is required (`globalEventState` ownership remains in main).
- `buildDailyChallenges()` now delegates generation to `generateDailyChallenges(key)`.
- `main.js` reduced from ~7677 to ~7516 lines.

Validation notes:
- Static check passed: `git diff --check`.
- Spot checks done with `rg` for removed duplicates and new import wiring.
- Runtime Playwright loop still unavailable in this environment (`node`/`npx` missing).
- Additional split (performance helpers):
  - Added `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/app/performance.js` with:
    - `detectMobileViewport`, `detectPrefersReducedMotion`, `buildPerformanceProfile`,
    - `calcPerfShadow`, `calcPerfParticleCount`, `calcTrailDrawStride`, `computeResponsiveScale`.
  - `main.js` now uses these helpers inside `applyMobilePerformanceProfile`, `perfShadow`, `perfParticleCount`, `trailDrawStride`, and `updateResponsiveScale`.
  - Removed now-unused local utilities (`isMobileViewport`, `prefersReducedMotion`, local scale math, and `clamp` import from `main.js`).
  - `main.js` reduced further to ~7497 lines.
- Continued split of `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/main.js` (domain-focused):
  - Added `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/app/challenge-state.js` for challenge/friend mission state transitions and text formatters:
    - `ensureWeeklyChallengeState`, `formatWeeklyChallengeText`, `updateWeeklyChallengeState`
    - `ensureFriendMissionState`, `formatFriendMissionText`, `advanceFriendMissionState`
    - `updateDailyChallengesState`, `formatDailyChallengeLine`
  - Added `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/app/ui-menus.js` for menu routing helpers:
    - `OVERLAY_MENU_IDS`, `computeIsAnyMenuVisible`, `showOnlyMenuDom`
  - Added `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/app/room-helpers.js`:
    - `parseIsoMs`, `getPlayerDisplayName`, `getRoomConfiguredSpeedFromState`, `getRoomWinnerText`
  - Added `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/app/friends-ui.js`:
    - `formatFriendName`, `relationToLabel`, `setFriendsSearchResultByDom`, `renderFriendsUserActionRow`, `friendRoomMeta`
- Rewired `main.js` to import and use these modules while preserving behavior.
- `main.js` size reduced further: ~7497 -> ~7423 lines.

Validation notes:
- `git diff --check` passed after refactor.
- Runtime verification is still blocked in this environment (`node`/`npx` unavailable).

Update (main.js button extraction cleanup):
- Completed cleanup of legacy refactor artifacts after moving button bindings into `app/main-buttons.js`.
- Removed all remaining `if (false)` dead blocks with duplicated click handlers.
- Removed duplicated `tryHandleFriendInviteUrl` and duplicate `setMainMenuGroup/closeMainMenuGroups` definitions that remained after partial extraction.
- Kept one active `initMainButtons({...})` entrypoint in `main.js` and one shared state adapter (`buttonBindingState`).
- Verified no direct `document.getElementById("...").addEventListener("click", ...)` bindings remain in `main.js` for static menu buttons; they are now in `app/main-buttons.js`.
- Environment limitation: JS runtime check (`node --check`) and Playwright run could not be executed because `node/npm/npx` are not installed in this environment.

Update (social admin notes):
- Added public social notices feature (read for all players, publish for staff).
- Backend:
  - `netlify/functions/_moderation.js`: added `social_notices` table bootstrap in moderation schema init.
  - Added `netlify/functions/social-notices.js` (GET, public list).
  - Added `netlify/functions/social-notice-publish.js` (POST, staff only via `requireStaffUser`).
- Frontend:
  - `index.html` social menu now includes "Заметки от админов" card with list and staff publish panel.
  - `main.js`: added `socialNotices` state + `renderSocialNotices`, `refreshSocialNotices`, `publishSocialNotice`, `setSocialNoticeStatus`.
  - `app/main-buttons.js`: social menu open now refreshes notices; added buttons `socialNoticeRefreshBtn` and `socialNoticePublishBtn`.
- Access model:
  - Everyone can read `/api/social-notices`.
  - Only `moderator`/`admin` can post via `/api/social-notice-publish`.
