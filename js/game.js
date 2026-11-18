/* Sky Rush: 60-Second Reflex Range
   A 60-second target-tapping mini game built for an event booth:
   big targets, big type, one short round, instant restart.

   Architecture: a tiny explicit state machine
     ATTRACT -> PLAYING -> PAUSED -> PLAYING -> ENDED -> ATTRACT/PLAYING
   driven by one requestAnimationFrame loop. All art is drawn on canvas;
   all sound is synthesized in audio.js. No assets, no network. */
(function () {
  "use strict";

  /* ---------------- Constants & difficulty curve ---------------- */

  var ROUND_MS = 60 * 1000;

  var State = {
    ATTRACT: "attract",
    PLAYING: "playing",
    PAUSED: "paused",
    ENDED: "ended"
  };

  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* Everything gets faster as the round progresses. t is 0..1 elapsed. */
  function spawnIntervalMs(t) { return lerp(880, 360, t); }
  function targetLifeMs(t) { return lerp(1500, 850, t); }
  function maxConcurrent(t) { return Math.round(lerp(3, 6, t)); }
  function decoyChance(t) { return lerp(0.14, 0.20, t); }
  var GOLDEN_CHANCE = 0.12;

  function comboMultiplier(streak) {
    return Math.min(1 + Math.floor(streak / 5), 5);
  }

  /* ---------------- DOM handles ---------------- */

  function $(id) { return document.getElementById(id); }
  var canvas = $("game-canvas");
  var ctx = canvas.getContext("2d");
  var hudScore = $("hud-score");
  var hudTime = $("hud-time");
  var hudCombo = $("hud-combo");
  var hudTimeCell = hudTime.closest(".hud-cell");
  var screens = {
    attract: $("screen-attract"),
    pause: $("screen-pause"),
    end: $("screen-end")
  };

  /* ---------------- Game state ---------------- */

  var game = {
    state: State.ATTRACT,
    targets: [],        /* live targets (also used for attract-mode demos) */
    effects: [],        /* rings, bursts, floating score text */
    clouds: [],
    score: 0,
    hits: 0,
    shots: 0,
    streak: 0,
    bestStreak: 0,
    timeLeftMs: ROUND_MS,
    spawnTimerMs: 0,
    shakeMs: 0,
    lastTickSecond: -1,
    savedThisRound: false
  };

  var view = { w: 0, h: 0, dpr: 1 };

  /* ---------------- Canvas sizing ---------------- */

  function resize() {
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    if (!w || !h) { return; }
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = w;
    view.h = h;
    canvas.width = Math.round(w * view.dpr);
    canvas.height = Math.round(h * view.dpr);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  }
  window.addEventListener("resize", resize);

  /* ---------------- Targets ---------------- */

  var nextTargetId = 1;

  function pickType(t) {
    var roll = Math.random();
    if (roll < decoyChance(t)) { return "decoy"; }
    if (roll < decoyChance(t) + GOLDEN_CHANCE) { return "golden"; }
    return "normal";
  }

  function spawnTarget(demo) {
    var t = 1 - game.timeLeftMs / ROUND_MS;
    var r = rand(30, 44) * clamp(view.w / 800, 0.75, 1.15);
    var margin = r + 12;
    var x = view.w / 2, y = view.h / 2, ok = false, attempt;
    for (attempt = 0; attempt < 8 && !ok; attempt++) {
      x = rand(margin, Math.max(margin + 1, view.w - margin));
      y = rand(margin, Math.max(margin + 1, view.h - margin));
      ok = true;
      for (var i = 0; i < game.targets.length; i++) {
        var o = game.targets[i];
        var dx = o.x - x, dy = o.y - y;
        if (Math.sqrt(dx * dx + dy * dy) < (o.r + r) * 1.15) { ok = false; break; }
      }
    }
    game.targets.push({
      id: nextTargetId++,
      x: x, y: y, r: r,
      vx: demo ? rand(-14, 14) : 0,
      vy: demo ? rand(-9, 9) : 0,
      type: demo ? (Math.random() < 0.18 ? "golden" : "normal") : pickType(t),
      ageMs: 0,
      lifeMs: demo ? 5000 : targetLifeMs(t) * rand(0.9, 1.1),
      demo: !!demo
    });
  }

  function addEffect(effect) { game.effects.push(effect); }

  function burst(x, y, color) {
    addEffect({ kind: "ring", x: x, y: y, ageMs: 0, lifeMs: 260, color: color, r0: 8, r1: 58 });
  }

  function floatText(x, y, text, color) {
    addEffect({ kind: "text", x: x, y: y, ageMs: 0, lifeMs: 750, color: color, text: text });
  }

  /* ---------------- State transitions ---------------- */

  function setState(next) {
    game.state = next;
    screens.attract.classList.toggle("hidden", next !== State.ATTRACT);
    screens.pause.classList.toggle("hidden", next !== State.PAUSED);
    screens.end.classList.toggle("hidden", next !== State.ENDED);
  }

  function resetRound() {
    game.targets = [];
    game.effects = [];
    game.score = 0;
    game.hits = 0;
    game.shots = 0;
    game.streak = 0;
    game.bestStreak = 0;
    game.timeLeftMs = ROUND_MS;
    game.spawnTimerMs = 500; /* small grace beat before the first target */
    game.shakeMs = 0;
    game.lastTickSecond = -1;
    game.savedThisRound = false;
    updateHud();
  }

  function startRound() {
    window.SkyAudio.unlock();
    resetRound();
    setState(State.PLAYING);
    window.SkyAudio.start();
  }

  function pauseGame() {
    if (game.state !== State.PLAYING) { return; }
    setState(State.PAUSED);
  }

  function resumeGame() {
    if (game.state !== State.PAUSED) { return; }
    window.SkyAudio.unlock();
    setState(State.PLAYING);
  }

  function accuracy() {
    return game.shots > 0 ? (game.hits / game.shots) * 100 : 0;
  }

  function endRound() {
    setState(State.ENDED);
    game.targets = [];
    window.SkyAudio.end();

    $("final-score").textContent = game.score.toLocaleString("en-US");
    $("final-hits").textContent = game.hits;
    $("final-accuracy").textContent = Math.round(accuracy()) + "%";
    $("final-combo").textContent = "x" + comboMultiplier(game.bestStreak);

    var form = $("initials-form");
    var note = $("saved-note");
    if (window.SkyBoard.qualifies(game.score)) {
      form.classList.remove("hidden");
      note.classList.add("hidden");
      var input = $("initials-input");
      input.value = "";
      setTimeout(function () { input.focus(); }, 60);
    } else {
      form.classList.add("hidden");
      note.classList.add("hidden");
    }
    renderBoard($("end-leaderboard"), $("end-board-empty"), -1);
  }

  /* ---------------- Input ---------------- */

  function canvasPos(evt) {
    var rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function onPointerDown(evt) {
    window.SkyAudio.unlock();
    if (game.state !== State.PLAYING) { return; }
    evt.preventDefault();
    var p = canvasPos(evt);
    game.shots++;

    /* Topmost target = last drawn = last in the array. */
    for (var i = game.targets.length - 1; i >= 0; i--) {
      var tg = game.targets[i];
      var dx = p.x - tg.x, dy = p.y - tg.y;
      if (dx * dx + dy * dy <= tg.r * tg.r) {
        game.targets.splice(i, 1);
        resolveHit(tg);
        updateHud();
        return;
      }
    }
    /* A clean miss: accuracy drops and the streak resets. */
    game.streak = 0;
    burst(p.x, p.y, "rgba(230,57,70,0.55)");
    window.SkyAudio.miss();
    updateHud();
  }

  function resolveHit(tg) {
    var mult = comboMultiplier(game.streak);
    if (tg.type === "decoy") {
      game.score = Math.max(0, game.score - 150);
      game.timeLeftMs = Math.max(0, game.timeLeftMs - 1000);
      game.streak = 0;
      game.shakeMs = 220;
      burst(tg.x, tg.y, "rgba(230,57,70,0.8)");
      floatText(tg.x, tg.y - tg.r, "-150", "#e63946");
      window.SkyAudio.decoy();
      return;
    }
    game.hits++;
    game.streak++;
    game.bestStreak = Math.max(game.bestStreak, game.streak);
    var remaining = clamp(1 - tg.ageMs / tg.lifeMs, 0, 1);
    var pts;
    if (tg.type === "golden") {
      pts = Math.round(300 * mult);
      burst(tg.x, tg.y, "rgba(255,183,3,0.9)");
      window.SkyAudio.golden();
    } else {
      pts = Math.round((60 + 60 * remaining) * mult);
      burst(tg.x, tg.y, "rgba(0,174,239,0.8)");
      window.SkyAudio.hit(comboMultiplier(game.streak));
    }
    game.score += pts;
    floatText(tg.x, tg.y - tg.r, "+" + pts, tg.type === "golden" ? "#d97706" : "#0077b6");
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  /* Booth safety net: if the tab/window loses visibility mid-round
     (screensaver, staff switching apps), freeze the clock. */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { pauseGame(); }
  });

  /* ---------------- Update ---------------- */

  function update(dtMs) {
    updateClouds(dtMs);
    updateEffects(dtMs);

    if (game.shakeMs > 0) { game.shakeMs -= dtMs; }

    if (game.state === State.ATTRACT || game.state === State.ENDED) {
      /* Ambient demo targets drifting behind the overlay screens. */
      game.spawnTimerMs -= dtMs;
      if (game.spawnTimerMs <= 0 && game.targets.length < 4) {
        spawnTarget(true);
        game.spawnTimerMs = 900;
      }
      stepTargets(dtMs, true);
      return;
    }

    if (game.state !== State.PLAYING) { return; }

    game.timeLeftMs -= dtMs;
    var secondsLeft = Math.ceil(game.timeLeftMs / 1000);
    if (secondsLeft <= 3 && secondsLeft > 0 && secondsLeft !== game.lastTickSecond) {
      game.lastTickSecond = secondsLeft;
      window.SkyAudio.tick();
    }
    if (game.timeLeftMs <= 0) {
      game.timeLeftMs = 0;
      updateHud();
      endRound();
      return;
    }

    var t = 1 - game.timeLeftMs / ROUND_MS;
    game.spawnTimerMs -= dtMs;
    if (game.spawnTimerMs <= 0 && game.targets.length < maxConcurrent(t)) {
      spawnTarget(false);
      game.spawnTimerMs = spawnIntervalMs(t) * rand(0.75, 1.25);
    }
    stepTargets(dtMs, false);
    updateHud();
  }

  function stepTargets(dtMs, demoMode) {
    for (var i = game.targets.length - 1; i >= 0; i--) {
      var tg = game.targets[i];
      tg.ageMs += dtMs;
      if (demoMode) {
        tg.x += tg.vx * dtMs / 1000;
        tg.y += tg.vy * dtMs / 1000;
        if (tg.x < tg.r || tg.x > view.w - tg.r) { tg.vx *= -1; }
        if (tg.y < tg.r || tg.y > view.h - tg.r) { tg.vy *= -1; }
        tg.x = clamp(tg.x, tg.r, Math.max(tg.r, view.w - tg.r));
        tg.y = clamp(tg.y, tg.r, Math.max(tg.r, view.h - tg.r));
      }
      if (tg.ageMs >= tg.lifeMs) {
        game.targets.splice(i, 1);
        if (!demoMode && tg.type !== "decoy") {
          burst(tg.x, tg.y, "rgba(120,160,190,0.5)");
        }
      }
    }
  }

  function updateEffects(dtMs) {
    for (var i = game.effects.length - 1; i >= 0; i--) {
      game.effects[i].ageMs += dtMs;
      if (game.effects[i].ageMs >= game.effects[i].lifeMs) {
        game.effects.splice(i, 1);
      }
    }
  }

  /* ---------------- Clouds (pure decoration) ---------------- */

  function initClouds() {
    game.clouds = [];
    for (var i = 0; i < 6; i++) {
      game.clouds.push({
        x: rand(0, 1200), y: rand(0, 500),
        s: rand(0.6, 1.5), v: rand(4, 11)
      });
    }
  }

  function updateClouds(dtMs) {
    for (var i = 0; i < game.clouds.length; i++) {
      var c = game.clouds[i];
      c.x += c.v * dtMs / 1000;
      if (c.x - 130 * c.s > view.w) { c.x = -130 * c.s; c.y = rand(0, view.h * 0.7); }
    }
  }

  /* ---------------- Rendering ---------------- */

  function drawCloud(c) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#ffffff";
    var s = c.s;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 62 * s, 20 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x - 34 * s, c.y + 5 * s, 36 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + 36 * s, c.y + 5 * s, 40 * s, 15 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawStar(cx, cy, spikes, outer, inner) {
    var rot = -Math.PI / 2;
    var step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
    for (var i = 0; i < spikes; i++) {
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
    }
    ctx.closePath();
  }

  function drawTarget(tg) {
    var spawnScale = clamp(tg.ageMs / 130, 0, 1);
    var ease = 1 - Math.pow(1 - spawnScale, 3);
    var fade = tg.ageMs > tg.lifeMs - 220 ? clamp((tg.lifeMs - tg.ageMs) / 220, 0, 1) : 1;
    var pulse = tg.type === "golden" ? 1 + 0.07 * Math.sin(tg.ageMs / 90) : 1;
    var r = tg.r * ease * pulse;

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(tg.x, tg.y);

    if (tg.type === "decoy") {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = "#e63946";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#9d1620";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      var x = r * 0.36;
      ctx.lineWidth = Math.max(5, r * 0.16);
      ctx.strokeStyle = "#e63946";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-x, -x); ctx.lineTo(x, x);
      ctx.moveTo(x, -x); ctx.lineTo(-x, x);
      ctx.stroke();
    } else if (tg.type === "golden") {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = "#ffb703";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#d97706";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = "#ffd60a";
      ctx.fill();
      drawStar(0, 0, 5, r * 0.44, r * 0.19);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = "#00aeef";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#0077b6";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = "#7dd7ff";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = "#023e8a";
      ctx.fill();
    }

    /* Lifetime ring: drains as the target ages (not for ambient demos). */
    if (!tg.demo) {
      var remain = clamp(1 - tg.ageMs / tg.lifeMs, 0, 1);
      ctx.beginPath();
      ctx.arc(0, 0, r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remain);
      ctx.lineWidth = 5;
      ctx.strokeStyle = tg.type === "decoy" ? "rgba(157,22,32,0.75)"
        : tg.type === "golden" ? "rgba(217,119,6,0.85)" : "rgba(2,62,138,0.65)";
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEffects() {
    for (var i = 0; i < game.effects.length; i++) {
      var e = game.effects[i];
      var k = e.ageMs / e.lifeMs;
      ctx.save();
      if (e.kind === "ring") {
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.arc(e.x, e.y, lerp(e.r0, e.r1, k), 0, Math.PI * 2);
        ctx.lineWidth = 5 * (1 - k) + 1;
        ctx.strokeStyle = e.color;
        ctx.stroke();
      } else if (e.kind === "text") {
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        ctx.font = "800 30px 'Segoe UI', Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.lineWidth = 5;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        var y = e.y - k * 44;
        ctx.strokeText(e.text, e.x, y);
        ctx.fillStyle = e.color;
        ctx.fillText(e.text, e.x, y);
      }
      ctx.restore();
    }
  }

  function render() {
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.save();
    if (game.shakeMs > 0) {
      var mag = (game.shakeMs / 220) * 7;
      ctx.translate(rand(-mag, mag), rand(-mag, mag));
    }
    var i;
    for (i = 0; i < game.clouds.length; i++) { drawCloud(game.clouds[i]); }
    for (i = 0; i < game.targets.length; i++) { drawTarget(game.targets[i]); }
    drawEffects();
    ctx.restore();
  }

  /* ---------------- HUD & leaderboards ---------------- */

  function updateHud() {
    hudScore.textContent = game.score.toLocaleString("en-US");
    var secs = Math.ceil(game.timeLeftMs / 1000);
    hudTime.textContent = secs;
    hudTimeCell.classList.toggle("low-time", game.state === State.PLAYING && secs <= 10);
    hudCombo.textContent = "x" + comboMultiplier(game.streak);
  }

  function renderBoard(listEl, emptyEl, highlightIndex) {
    var entries = window.SkyBoard.load();
    listEl.innerHTML = "";
    emptyEl.classList.toggle("hidden", entries.length > 0);
    entries.forEach(function (entry, idx) {
      var li = document.createElement("li");
      if (idx === highlightIndex) { li.className = "lb-new"; }
      var name = document.createElement("span");
      name.className = "lb-name";
      name.textContent = (idx + 1) + ". " + entry.name;
      var score = document.createElement("span");
      score.textContent = entry.score.toLocaleString("en-US");
      li.appendChild(name);
      li.appendChild(score);
      listEl.appendChild(li);
    });
  }

  /* ---------------- Controls wiring ---------------- */

  $("btn-start").addEventListener("click", startRound);
  $("btn-again").addEventListener("click", startRound);
  $("btn-resume").addEventListener("click", resumeGame);
  $("btn-quit").addEventListener("click", function () {
    if (game.state === State.PAUSED) { endRound(); }
  });
  $("btn-pause").addEventListener("click", function () {
    if (game.state === State.PLAYING) { pauseGame(); }
    else if (game.state === State.PAUSED) { resumeGame(); }
  });

  var muteBtn = $("btn-mute");
  function refreshMuteIcon() {
    muteBtn.innerHTML = window.SkyAudio.isMuted() ? "&#128263;" : "&#128266;";
  }
  muteBtn.addEventListener("click", function () {
    window.SkyAudio.unlock();
    window.SkyAudio.toggleMute();
    refreshMuteIcon();
  });

  $("initials-form").addEventListener("submit", function (evt) {
    evt.preventDefault();
    if (game.savedThisRound) { return; }
    var raw = $("initials-input").value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
    var entries = window.SkyBoard.add(raw || "ACE", game.score, accuracy());
    game.savedThisRound = true;
    $("initials-form").classList.add("hidden");
    $("saved-note").classList.remove("hidden");
    var hl = -1;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].score === Math.round(game.score) && entries[i].name === (raw || "ACE")) { hl = i; break; }
    }
    renderBoard($("end-leaderboard"), $("end-board-empty"), hl);
  });

  document.addEventListener("keydown", function (evt) {
    if (evt.key === "p" || evt.key === "P" || evt.key === "Escape") {
      if (game.state === State.PLAYING) { pauseGame(); }
      else if (game.state === State.PAUSED) { resumeGame(); }
    } else if (evt.key === "m" || evt.key === "M") {
      window.SkyAudio.toggleMute();
      refreshMuteIcon();
    } else if (evt.key === " " || evt.key === "Enter") {
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      if (tag === "INPUT" || tag === "BUTTON") { return; }
      if (game.state === State.ATTRACT || game.state === State.ENDED) {
        evt.preventDefault();
        startRound();
      }
    }
  });

  /* ---------------- Main loop & boot ---------------- */

  var lastTs = 0;
  function frame(ts) {
    if (!lastTs) { lastTs = ts; }
    var dt = Math.min(ts - lastTs, 50); /* clamp: tab-switch gaps never fast-forward */
    lastTs = ts;
    if (game.state !== State.PAUSED) { update(dt); }
    render();
    window.requestAnimationFrame(frame);
  }

  function boot() {
    resize();
    /* Arena size depends on layout; re-measure once fonts/layout settle. */
    setTimeout(resize, 60);
    initClouds();
    renderBoard($("attract-leaderboard"), $("attract-board-empty"), -1);
    setState(State.ATTRACT);
    updateHud();
    window.requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
