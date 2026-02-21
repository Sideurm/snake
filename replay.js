export function createReplayManager(ctx) {
  function watchReplay(index) {
    const data = ctx.getGameHistory()?.[index];
    if (!data) return;

    ctx.setCurrentReplayData(data);
    ctx.clearMutation();

    const replayInputs = ctx.sanitizeReplayInputs(data.inputs);
    const replayFoodsSafe = ctx.sanitizeFoodHistory(data.foodHistory);
    const replayFoods = replayFoodsSafe.length ? replayFoodsSafe : [ctx.randomFood()];

    const fallbackEndFrame = replayInputs.reduce((max, ev) => {
      const frame = Number.isFinite(ev.frame) ? ev.frame : 0;
      return Math.max(max, frame);
    }, 0) + Math.max(120, replayFoods.length * 25);

    const replayFinalFrame = Number.isFinite(data.finalFrame) ? data.finalFrame : fallbackEndFrame;
    const replayWasAI = !!data.isAI;
    const modeKey = ctx.resolveModeKey(data.gameMode);
    ctx.setCurrentGameMode(modeKey);
    ctx.setModeTimeLeftMs(0);
    ctx.updateModeDisplay();

    ctx.setIsReplaying(true);
    ctx.setRunning(true);
    ctx.setAiMode(false);
    ctx.setPendingPlayerDir(null);
    ctx.enterReplayUi();
    ctx.syncMenuOverlayState();

    ctx.setReplaySeed(Number.isFinite(data.seed) ? data.seed : Math.floor(Date.now() % 1000000000));
    ctx.setGameFrame(0);
    ctx.setReplayFoodIndex(0);
    ctx.setAccumulator(0);

    ctx.init();

    ctx.setScore(0);
    ctx.setLevel(1);
    ctx.setTargetLength(Number.isFinite(data.initialTargetLength) ? data.initialTargetLength : 120);
    ctx.setSpeed(Number.isFinite(data.initialSpeed) ? data.initialSpeed : ctx.getBaseSpeed());
    ctx.updateSpeedDisplay();
    if (data.initialDir && Number.isFinite(data.initialDir.x) && Number.isFinite(data.initialDir.y)) {
      ctx.setDir({ x: data.initialDir.x, y: data.initialDir.y });
    }
    ctx.updateScoreDisplay();
    ctx.setLevelDisplay(1);
    ctx.setFood({ x: replayFoods[0].x, y: replayFoods[0].y, eaten: false });

    let replayFrame = 0;
    let inputIndex = 0;
    let replayFoodIndex = 0;
    let accumulator = 0;
    let lastTime = performance.now();
    const fixedStep = ctx.getFixedStep();

    function applyReplayDirection(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const nx = ctx.normalizeAxisValue(x);
      const ny = ctx.normalizeAxisValue(y);
      if (nx === null || ny === null) return;
      if (Math.abs(nx) + Math.abs(ny) !== 1) return;

      const dir = ctx.getDir();
      if (dir && nx === -dir.x && ny === -dir.y) return;
      ctx.setDir({ x: nx, y: ny });
    }

    function finishReplay() {
      ctx.setRunning(false);
      ctx.setIsReplaying(false);
      ctx.leaveReplayUi();
      ctx.syncMenuOverlayState();
    }

    function replayLoop(timestamp) {
      if (!ctx.getRunning()) {
        finishReplay();
        return;
      }

      const delta = timestamp - lastTime;
      lastTime = timestamp;
      accumulator += delta;

      while (accumulator >= fixedStep) {
        while (inputIndex < replayInputs.length) {
          const event = replayInputs[inputIndex];
          if (event.frame < replayFrame) {
            inputIndex += 1;
            continue;
          }
          if (event.frame > replayFrame) break;
          if (event.x !== undefined) {
            applyReplayDirection(event.x, event.y);
            inputIndex += 1;
            continue;
          }
          break;
        }

        const snake = ctx.getSnake();
        const dir = ctx.getDir();
        const speed = ctx.getSpeed();
        const move = speed * (fixedStep / 1000);
        const head = { x: snake[0].x + dir.x * move, y: snake[0].y + dir.y * move };
        snake.unshift(head);

        let length = 0;
        for (let i = 1; i < snake.length; i += 1) {
          const dx = snake[i].x - snake[i - 1].x;
          const dy = snake[i].y - snake[i - 1].y;
          length += Math.sqrt(dx * dx + dy * dy);
        }
        while (length > ctx.getTargetLength()) {
          snake.pop();
          length = 0;
          for (let i = 1; i < snake.length; i += 1) {
            const dx = snake[i].x - snake[i - 1].x;
            const dy = snake[i].y - snake[i - 1].y;
            length += Math.sqrt(dx * dx + dy * dy);
          }
        }

        if (ctx.checkCollision()) {
          ctx.setRunning(false);
          break;
        }

        while (inputIndex < replayInputs.length) {
          const event = replayInputs[inputIndex];
          if (event.frame < replayFrame) {
            inputIndex += 1;
            continue;
          }
          if (event.frame > replayFrame) break;
          if (event.eat) {
            ctx.incrementScore();
            ctx.updateScoreDisplay();

            const score = ctx.getScore();
            const level = ctx.getLevel();
            const newLevel = Math.floor(score / 5) + 1;
            if (newLevel !== level) {
              ctx.setLevel(newLevel);
              let nextSpeed = ctx.getSpeed() + (replayWasAI ? 22 : 30);
              if (replayWasAI) nextSpeed = Math.min(nextSpeed, 620);
              ctx.setSpeed(nextSpeed);
              ctx.setLevelDisplay(newLevel);
              ctx.updateSpeedDisplay();
            }

            ctx.setTargetLength(ctx.getTargetLength() + 40);
            replayFoodIndex += 1;
            ctx.setReplayFoodIndex(replayFoodIndex);
            if (replayFoodIndex < replayFoods.length) {
              ctx.setFood({ x: replayFoods[replayFoodIndex].x, y: replayFoods[replayFoodIndex].y, eaten: false });
            }

            inputIndex += 1;
            continue;
          }
          inputIndex += 1;
        }

        replayFrame += 1;
        ctx.setGameFrame(replayFrame);
        accumulator -= fixedStep;

        if (replayFrame >= replayFinalFrame) {
          ctx.setRunning(false);
          break;
        }
      }

      ctx.draw();
      if (!ctx.getRunning()) {
        finishReplay();
        return;
      }
      requestAnimationFrame(replayLoop);
    }

    requestAnimationFrame(replayLoop);
  }

  return { watchReplay };
}
