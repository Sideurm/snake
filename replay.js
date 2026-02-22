export function createReplayManager(ctx) {
  let activeSessionId = 0;
  let active = false;
  let paused = false;
  let playbackRate = 1;
  let stepRequested = false;

  function emitState() {
    if (typeof ctx.onReplayStateChange === "function") {
      ctx.onReplayStateChange({
        active,
        paused,
        playbackRate
      });
    }
  }

  function stopReplay(silent = true) {
    if (!active) return;
    activeSessionId += 1;
    active = false;
    paused = false;
    playbackRate = 1;
    stepRequested = false;
    ctx.setIsReplaying(false);
    emitState();
    if (!silent) {
      ctx.leaveReplayUi();
      ctx.syncMenuOverlayState();
    }
  }

  function setPlaybackRate(rate) {
    const next = Number(rate);
    if (!Number.isFinite(next)) return;
    playbackRate = Math.max(0.25, Math.min(4, next));
    emitState();
  }

  function togglePaused(forceValue = null) {
    if (!active) return;
    if (typeof forceValue === "boolean") paused = forceValue;
    else paused = !paused;
    emitState();
  }

  function stepFrame() {
    if (!active) return;
    if (!paused) paused = true;
    stepRequested = true;
    emitState();
  }

  function watchReplayData(rawData) {
    stopReplay(true);
    const sessionId = activeSessionId + 1;
    activeSessionId = sessionId;
    active = true;
    paused = false;
    playbackRate = 1;
    stepRequested = false;
    emitState();

    const data = rawData && typeof rawData === "object" ? rawData : null;
    if (!data) {
      active = false;
      emitState();
      return;
    }

    ctx.setCurrentReplayData(data);
    ctx.clearMutation();

    const replayInputs = ctx.sanitizeReplayInputs(data.inputs);
    const replayFoodsSafe = ctx.sanitizeFoodHistory(data.foodHistory);
    const replayFoods = replayFoodsSafe.length ? replayFoodsSafe : [ctx.randomFood()];
    const replayStates = Array.isArray(data.stateFrames) ? data.stateFrames : [];
    const hasStateFramesRaw = replayStates.length > 1;
    const lastStateScore = hasStateFramesRaw
      ? Number(replayStates[replayStates.length - 1]?.score || 0)
      : 0;
    const replayScore = Number.isFinite(Number(data.score)) ? Number(data.score) : lastStateScore;
    const replayFinalFrameInput = Number.isFinite(Number(data.finalFrame))
      ? Math.max(0, Math.floor(Number(data.finalFrame)))
      : null;
    const stateFramesLookTruncated = hasStateFramesRaw && (
      (replayFinalFrameInput != null && replayFinalFrameInput > replayStates.length + 5) ||
      replayScore > lastStateScore
    );
    const hasStateFrames = hasStateFramesRaw && !(stateFramesLookTruncated && replayInputs.length > 0);

    const fallbackEndFrame = replayInputs.reduce((max, ev) => {
      const frame = Number.isFinite(ev.frame) ? ev.frame : 0;
      return Math.max(max, frame);
    }, 0) + Math.max(120, replayFoods.length * 25);

    const replayFinalFrame = hasStateFrames
      ? replayStates.length - 1
      : (replayFinalFrameInput != null ? replayFinalFrameInput : fallbackEndFrame);
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
    if (hasStateFrames) {
      const frame0 = replayStates[0];
      ctx.setSnake(frame0.snake.map((s) => ({ x: s.x, y: s.y })));
      ctx.setFood({ x: frame0.food.x, y: frame0.food.y, eaten: false });
      ctx.setScore(frame0.score || 0);
      ctx.updateScoreDisplay();
      ctx.setLevel(frame0.level || 1);
      ctx.setLevelDisplay(frame0.level || 1);
      ctx.setSpeed(frame0.speed || ctx.getBaseSpeed());
      ctx.updateSpeedDisplay();
      ctx.setTargetLength(frame0.targetLength || 120);
    } else {
      ctx.setFood({ x: replayFoods[0].x, y: replayFoods[0].y, eaten: false });
    }

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
      if (!active || sessionId !== activeSessionId) return;
      active = false;
      paused = false;
      playbackRate = 1;
      stepRequested = false;
      ctx.setRunning(false);
      ctx.setIsReplaying(false);
      emitState();
      ctx.leaveReplayUi();
      ctx.syncMenuOverlayState();
    }

    function replayLoop(timestamp) {
      if (!active || sessionId !== activeSessionId) return;
      if (!ctx.getRunning()) {
        finishReplay();
        return;
      }

      const delta = Math.min(120, Math.max(0, timestamp - lastTime));
      lastTime = timestamp;
      if (!paused) {
        accumulator += delta * playbackRate;
      }
      if (stepRequested) {
        accumulator = Math.max(accumulator, fixedStep);
      }

      while (accumulator >= fixedStep) {
        if (hasStateFrames) {
          const nextFrameIndex = Math.min(replayFinalFrame, replayFrame + 1);
          const next = replayStates[nextFrameIndex];
          if (!next || !Array.isArray(next.snake) || !next.snake.length || !next.food) {
            ctx.setRunning(false);
            break;
          }
          ctx.setSnake(next.snake.map((s) => ({ x: s.x, y: s.y })));
          ctx.setFood({ x: next.food.x, y: next.food.y, eaten: false });
          ctx.setScore(next.score || 0);
          ctx.updateScoreDisplay();
          ctx.setLevel(next.level || 1);
          ctx.setLevelDisplay(next.level || 1);
          ctx.setSpeed(next.speed || ctx.getBaseSpeed());
          ctx.updateSpeedDisplay();
          ctx.setTargetLength(next.targetLength || 120);

          replayFrame = nextFrameIndex;
          ctx.setGameFrame(replayFrame);
          accumulator -= fixedStep;
          if (stepRequested) {
            stepRequested = false;
            break;
          }
          if (replayFrame >= replayFinalFrame) {
            ctx.setRunning(false);
            break;
          }
          continue;
        }

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
        if (!Array.isArray(snake) || !snake.length) {
          ctx.setRunning(false);
          break;
        }
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
            const scoreAfter = Number.isFinite(Number(event.scoreAfter))
              ? Math.max(0, Math.floor(Number(event.scoreAfter)))
              : null;
            if (scoreAfter == null) ctx.incrementScore();
            else ctx.setScore(scoreAfter);
            ctx.updateScoreDisplay();

            const previousLevel = ctx.getLevel();
            const levelAfter = Number.isFinite(Number(event.levelAfter))
              ? Math.max(1, Math.floor(Number(event.levelAfter)))
              : Math.floor(ctx.getScore() / 5) + 1;
            if (levelAfter !== previousLevel) {
              ctx.setLevel(levelAfter);
            }
            ctx.setLevelDisplay(levelAfter);

            if (Number.isFinite(Number(event.speedAfter))) {
              ctx.setSpeed(Math.max(1, Number(event.speedAfter)));
              ctx.updateSpeedDisplay();
            } else if (levelAfter !== previousLevel) {
              let nextSpeed = ctx.getSpeed() + (replayWasAI ? 22 : 30);
              if (replayWasAI) nextSpeed = Math.min(nextSpeed, 620);
              ctx.setSpeed(nextSpeed);
              ctx.updateSpeedDisplay();
            }

            if (Number.isFinite(Number(event.targetLengthAfter))) {
              ctx.setTargetLength(Math.max(40, Number(event.targetLengthAfter)));
            } else {
              ctx.setTargetLength(ctx.getTargetLength() + 40);
            }
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
        if (stepRequested) {
          stepRequested = false;
          break;
        }

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
      if (active && sessionId === activeSessionId) {
        requestAnimationFrame(replayLoop);
      }
    }

    if (active && sessionId === activeSessionId) {
      requestAnimationFrame(replayLoop);
    }
  }

  function watchReplay(index) {
    const data = ctx.getGameHistory()?.[index];
    watchReplayData(data || null);
  }

  return {
    watchReplay,
    watchReplayData,
    stopReplay,
    isReplayActive: () => active,
    setPlaybackRate,
    togglePaused,
    stepFrame,
    getReplayState: () => ({ active, paused, playbackRate })
  };
}
