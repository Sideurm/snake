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
