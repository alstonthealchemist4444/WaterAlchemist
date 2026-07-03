/* =================================================================
   WATER ALCHEMIST  -  game logic
   var only, named functions, no arrow functions, + for strings

   CONTROLS
     Arrow keys or WASD ... move the alchemist
     Z .................... Purifying Hand  (cleans the water)
     X .................... Gathering Hand  (collects debris / pops pollutants)
     R .................... reset the round
   Both abilities act on whatever is right where the alchemist stands.
   Mouse still works too: click water to purify, click debris to collect.
   ================================================================= */

/* ---- Tunable settings (these change with difficulty) ---- */
var TOTAL_TIME         = 90;
var DEBRIS_COUNT       = 6;
var PURIFY_PER_TICK    = 7;     /* purity added each purify tick */
var POINTS_PER_PURIFY  = 2;
var POINTS_PER_DEBRIS  = 50;

var MOVE_SPEED         = 1.0;   /* percent of pond moved per frame */
var PURIFY_COOLDOWN    = 130;   /* ms between purify ticks while holding Z */
var COLLECT_COOLDOWN   = 220;   /* ms between gather actions while holding X */
var COLLECT_RADIUS     = 14;    /* how close (in %) the alchemist must be */

var POLLUTANT_INTERVAL = 6000;
var POLLUTANT_PENALTY  = 30;
var POLLUTANT_LIFETIME = 4000;
var POLLUTANT_SIZE     = 28;

/* ---- Difficulty presets ----
   Each mode changes the pace and goals: how long you have, how much
   debris, and how fast/aggressive the pollutants are. */
var currentDifficulty = "normal";

var DIFFICULTIES = {
  easy: {
    time: 120, debris: 4,
    pollutantInterval: 9000, pollutantLifetime: 6000, pollutantPenalty: 15,
    purifyPerTick: 9
  },
  normal: {
    time: 90, debris: 6,
    pollutantInterval: 6000, pollutantLifetime: 4000, pollutantPenalty: 30,
    purifyPerTick: 7
  },
  hard: {
    time: 60, debris: 9,
    pollutantInterval: 3500, pollutantLifetime: 3000, pollutantPenalty: 45,
    purifyPerTick: 6
  }
};

function applyDifficulty(name) {
  currentDifficulty = name;
  var d = DIFFICULTIES[name];
  TOTAL_TIME         = d.time;
  DEBRIS_COUNT       = d.debris;
  POLLUTANT_INTERVAL = d.pollutantInterval;
  POLLUTANT_LIFETIME = d.pollutantLifetime;
  POLLUTANT_PENALTY  = d.pollutantPenalty;
  PURIFY_PER_TICK    = d.purifyPerTick;
}

/* ---- Milestone messages (LevelUp) ----
   Shown once each, as the running score climbs past the threshold. */
var MILESTONES = [
  { score: 100, message: "A trickle becomes a stream!" },
  { score: 250, message: "Halfway to a clean spring!" },
  { score: 400, message: "The village takes heart!" },
  { score: 600, message: "A wellspring reborn!" }
];
var milestonesHit = [];   /* remembers which thresholds already fired */

/* ---- Game state ---- */
var purity          = 0;
var score           = 0;
var debrisRemaining = 0;
var debrisSpawned   = false;
var timeLeft        = TOTAL_TIME;
var timerId         = null;
var gameActive      = false;

/* Pollutant state */
var pollutantSpawnId = null;
var activePollutants = [];

/* Character + input state */
var charX = 72;
var charY = 72;
var charMoveId = null;
var keysDown = { up: false, down: false, left: false, right: false, z: false, x: false };
var lastPurifyTime  = 0;
var lastCollectTime = 0;

/* Confetti state */
var confettiPieces = [];
var confettiAnimId = null;

/* ---- DOM references ---- */
var startScreen  = document.getElementById("startScreen");
var gameScreen   = document.getElementById("gameScreen");
var resultScreen = document.getElementById("resultScreen");

var pond        = document.getElementById("pond");
var pondClean   = document.getElementById("pondClean");
var pointerGlow = document.getElementById("pointerGlow");
var character   = document.getElementById("character");

var scoreValue = document.getElementById("scoreValue");
var timeValue  = document.getElementById("timeValue");
var purityFill = document.getElementById("purityFill");
var taskHint   = document.getElementById("taskHint");

var purifyTool  = document.getElementById("purifyTool");
var collectTool = document.getElementById("collectTool");

var resultTitle    = document.getElementById("resultTitle");
var resultText     = document.getElementById("resultText");
var confettiCanvas = document.getElementById("confettiCanvas");
var toast          = document.getElementById("toast");

var milestoneBanner = document.getElementById("milestoneBanner");
var milestoneTimer  = null;

var diffEasy   = document.getElementById("diffEasy");
var diffNormal = document.getElementById("diffNormal");
var diffHard   = document.getElementById("diffHard");

/* =================================================================
   SOUND  (LevelUp: Sound Effects)
   Each name maps to an <audio> element. We clone the node before
   playing so the same sound can overlap with itself (e.g. collecting
   two pieces quickly) without cutting off.
   ================================================================= */
var soundOn = true;
function playSound(name) {
  if (soundOn === false) { return; }
  var el = document.getElementById(name);
  if (el === null) { return; }
  try {
    var clip = el.cloneNode(true);
    clip.volume = 0.5;
    clip.play();
  } catch (err) {
    /* Some browsers block audio until the first click — safe to ignore. */
  }
}

/* =================================================================
   SCREEN SWITCHING
   ================================================================= */
function showScreen(name) {
  startScreen.classList.add("hidden");
  gameScreen.classList.add("hidden");
  resultScreen.classList.add("hidden");
  if (name === "start")  { startScreen.classList.remove("hidden"); }
  if (name === "game")   { gameScreen.classList.remove("hidden"); }
  if (name === "result") { resultScreen.classList.remove("hidden"); }
}

/* =================================================================
   START / RESET
   ================================================================= */
function startGame() {
  purity          = 0;
  score           = 0;
  timeLeft        = TOTAL_TIME;
  debrisRemaining = 0;
  debrisSpawned   = false;
  milestonesHit   = [];
  hideMilestone();

  /* clear any held keys from a previous round */
  keysDown.up = false; keysDown.down = false;
  keysDown.left = false; keysDown.right = false;
  keysDown.z = false; keysDown.x = false;
  purifyTool.classList.remove("active");
  collectTool.classList.remove("active");

  charX = 72; charY = 72;
  placeCharacter();
  pointerGlow.style.opacity = 0;

  clearDebris();
  clearAllPollutants();
  stopConfetti();
  spawnDebris(DEBRIS_COUNT);

  updateScore();
  updateWater();
  updateTimeDisplay();
  updateTaskHint();

  showScreen("game");
  gameActive = true;
  startTimer();
  startCharacterLoop();
  startPollutantSpawner();
}

function resetGame() {
  gameActive = false;
  clearTimer();
  stopCharacterLoop();
  clearAllPollutants();
  startGame();
}

/* =================================================================
   TIMER
   ================================================================= */
function startTimer() {
  clearTimer();
  timerId = setInterval(tick, 1000);
}

function clearTimer() {
  if (timerId !== null) { clearInterval(timerId); timerId = null; }
}

function tick() {
  timeLeft = timeLeft - 1;
  updateTimeDisplay();
  if (timeLeft <= 0) { endGame(false); }
}

function formatTime(totalSeconds) {
  var minutes     = Math.floor(totalSeconds / 60);
  var seconds     = totalSeconds % 60;
  var secondsText = "" + seconds;
  if (seconds < 10) { secondsText = "0" + seconds; }
  return minutes + ":" + secondsText;
}

function updateTimeDisplay() {
  timeValue.textContent = formatTime(timeLeft);
}

/* =================================================================
   DEBRIS
   ================================================================= */
var debrisShapes = ["square", "rect", "circle", "oval", "diamondbit"];

function clearDebris() {
  var existing = pond.querySelectorAll(".debris");
  var i;
  for (i = 0; i < existing.length; i++) { existing[i].remove(); }
  debrisRemaining = 0;
  debrisSpawned   = false;
}

function spawnDebris(count) {
  var i;
  for (i = 0; i < count; i++) {
    var spot  = randomPointInCircle();
    var piece = document.createElement("div");
    var shape = debrisShapes[Math.floor(Math.random() * debrisShapes.length)];
    piece.className  = "debris " + shape;
    piece.style.left = spot.x + "%";
    piece.style.top  = spot.y + "%";
    piece.addEventListener("click", onDebrisClick);
    pond.appendChild(piece);
  }
  debrisRemaining = count;
  debrisSpawned   = true;
}

function randomPointInCircle() {
  var cx = 50; var cy = 50; var radius = 36;
  var x = 0; var y = 0; var tries = 0;
  while (tries < 200) {
    x = Math.random() * 100;
    y = Math.random() * 100;
    var dx = x - cx; var dy = y - cy;
    if (Math.sqrt(dx*dx + dy*dy) <= radius) { return { x: x, y: y }; }
    tries = tries + 1;
  }
  return { x: 30, y: 30 };
}

/* Mouse click on a debris piece collects it directly. */
function onDebrisClick(event) {
  if (gameActive === false) { return; }
  event.stopPropagation();
  collectDebrisPiece(event.currentTarget);
}

function collectDebrisPiece(piece) {
  if (piece.classList.contains("collected")) { return; }
  piece.classList.add("collected");
  piece.removeEventListener("click", onDebrisClick);
  debrisRemaining = debrisRemaining - 1;
  score = score + POINTS_PER_DEBRIS;
  updateScore();
  updateTaskHint();

  var xp = parseFloat(piece.style.left);
  var yp = parseFloat(piece.style.top);
  showScorePopPercent(xp, yp, "+" + POINTS_PER_DEBRIS, false);
  playSound("sndCollect");

  setTimeout(function () { piece.remove(); }, 220);
  checkWin();
}

/* =================================================================
   PURIFYING
   ================================================================= */
/* Mouse click on the bare water purifies at the click point. */
function onPondClick(event) {
  if (gameActive === false) { return; }
  if (event.target !== pond &&
      event.target !== pondClean &&
      event.target !== document.querySelector(".sigil-ring")) { return; }
  var spot = clientToPercent(event.clientX, event.clientY);
  purifyAtPercent(spot.x, spot.y);
}

function purifyAtPercent(xp, yp) {
  if (purity >= 100) { return; }
  purity = purity + PURIFY_PER_TICK;
  if (purity > 100) { purity = 100; }
  score = score + POINTS_PER_PURIFY;
  updateScore();
  updateWater();
  updateTaskHint();
  spawnRipplePercent(xp, yp);
  playSound("sndPurify");
  checkWin();
}

function updateWater() {
  pondClean.style.opacity = purity / 100;
  purityFill.style.width  = purity + "%";
}

/* =================================================================
   GATHERING (X)  —  acts on the nearest debris OR pollutant in reach
   ================================================================= */
function gatherNearCharacter() {
  var best     = null;
  var bestDist = COLLECT_RADIUS;
  var bestType = null;
  var i;

  /* check debris */
  var pieces = pond.querySelectorAll(".debris");
  for (i = 0; i < pieces.length; i++) {
    var p = pieces[i];
    if (p.classList.contains("collected")) { continue; }
    var dxp = parseFloat(p.style.left) - charX;
    var dyp = parseFloat(p.style.top)  - charY;
    var dp  = Math.sqrt(dxp*dxp + dyp*dyp);
    if (dp <= bestDist) { best = p; bestDist = dp; bestType = "debris"; }
  }

  /* check pollutants */
  for (i = 0; i < activePollutants.length; i++) {
    var el  = activePollutants[i].el;
    var dxq = parseFloat(el.style.left) - charX;
    var dyq = parseFloat(el.style.top)  - charY;
    var dq  = Math.sqrt(dxq*dxq + dyq*dyq);
    if (dq <= bestDist) { best = el; bestDist = dq; bestType = "pollutant"; }
  }

  if (best !== null) {
    if (bestType === "debris") {
      collectDebrisPiece(best);
    } else {
      popPollutant(best);
    }
  }
}

/* =================================================================
   POLLUTANT OBSTACLE  (LevelUp: Challenge)
   ================================================================= */
function startPollutantSpawner() {
  stopPollutantSpawner();
  pollutantSpawnId = setInterval(spawnPollutant, POLLUTANT_INTERVAL);
}

function stopPollutantSpawner() {
  if (pollutantSpawnId !== null) { clearInterval(pollutantSpawnId); pollutantSpawnId = null; }
}

function spawnPollutant() {
  if (gameActive === false) { return; }

  var spot = randomPointInCircle();
  var el   = document.createElement("div");
  el.className  = "pollutant";
  el.style.left = spot.x + "%";
  el.style.top  = spot.y + "%";
  el.style.width  = POLLUTANT_SIZE + "px";
  el.style.height = POLLUTANT_SIZE + "px";

  /* If ignored, it bursts: lose score and dirty the water. */
  var expiryId = setTimeout(function () {
    if (gameActive === false) { return; }
    purity = purity - 8;
    if (purity < 0) { purity = 0; }
    updateWater();
    updateTaskHint();
    score = score - POLLUTANT_PENALTY;
    if (score < 0) { score = 0; }
    updateScore();
    showScorePopPercent(parseFloat(el.style.left), parseFloat(el.style.top),
                        "-" + POLLUTANT_PENALTY, true);
    playSound("sndPenalty");
    removePollutantEl(el);
  }, POLLUTANT_LIFETIME);

  /* Mouse click pops it early for a bonus. */
  el.addEventListener("click", function (event) {
    event.stopPropagation();
    if (gameActive === false) { return; }
    popPollutant(el);
  });

  pond.appendChild(el);
  activePollutants.push({ el: el, expiryId: expiryId });
}

function popPollutant(el) {
  var i;
  for (i = 0; i < activePollutants.length; i++) {
    if (activePollutants[i].el === el) {
      clearTimeout(activePollutants[i].expiryId);
      break;
    }
  }
  score = score + 20;
  updateScore();
  showScorePopPercent(parseFloat(el.style.left), parseFloat(el.style.top), "+20", false);
  playSound("sndCollect");
  el.classList.add("popped");
  setTimeout(function () { removePollutantEl(el); }, 160);
}

function removePollutantEl(el) {
  if (el.parentNode) { el.parentNode.removeChild(el); }
  var i;
  for (i = 0; i < activePollutants.length; i++) {
    if (activePollutants[i].el === el) { activePollutants.splice(i, 1); break; }
  }
}

function clearAllPollutants() {
  stopPollutantSpawner();
  var i;
  for (i = 0; i < activePollutants.length; i++) {
    clearTimeout(activePollutants[i].expiryId);
    if (activePollutants[i].el.parentNode) {
      activePollutants[i].el.parentNode.removeChild(activePollutants[i].el);
    }
  }
  activePollutants = [];
}

/* =================================================================
   TASK HINT
   ================================================================= */
function updateTaskHint() {
  var waterDone  = (purity >= 100);
  var debrisDone = (debrisRemaining <= 0 && debrisSpawned === true);

  if (waterDone === false && debrisDone === false) {
    taskHint.textContent = "Purify the water (Z) and gather the debris (X) — pop the pollutants!";
  } else if (waterDone === false) {
    taskHint.textContent = "Now purify the water — hold Z!";
  } else if (debrisDone === false) {
    taskHint.textContent = "Now gather the remaining debris — press X near it!";
  } else {
    taskHint.textContent = "Complete!";
  }
}

/* =================================================================
   WIN / LOSE
   ================================================================= */
function checkWin() {
  if (debrisSpawned === false) { return; }
  if (purity >= 100 && debrisRemaining <= 0) { endGame(true); }
}

function endGame(won) {
  gameActive = false;
  clearTimer();
  stopCharacterLoop();
  clearAllPollutants();
  hideMilestone();

  var diffLabel = currentDifficulty.charAt(0).toUpperCase() + currentDifficulty.slice(1);

  if (won) {
    resultTitle.textContent = "The wellspring runs clear";
    resultText.textContent  = "The village drinks freely tonight. " + diffLabel + " mode, final score: " + score + ".";
  } else {
    resultTitle.textContent = "The waters clouded over";
    resultText.textContent  = "Time ran dry before the spring did. " + diffLabel + " mode, score: " + score + ".";
  }

  showScreen("result");
  if (won) { launchConfetti(); playSound("sndWin"); }
}

/* =================================================================
   SCORE DISPLAY
   ================================================================= */
function updateScore() {
  scoreValue.textContent = "" + score;
  checkMilestones();
}

/* =================================================================
   MILESTONES  (LevelUp)
   Walk the milestone list; the first threshold we've passed but not yet
   celebrated fires its banner and is remembered so it won't repeat.
   ================================================================= */
function checkMilestones() {
  var i;
  for (i = 0; i < MILESTONES.length; i++) {
    var m = MILESTONES[i];
    if (score >= m.score && milestonesHit.indexOf(m.score) === -1) {
      milestonesHit.push(m.score);
      showMilestone(m.message);
    }
  }
}

function showMilestone(message) {
  milestoneBanner.textContent = message;
  milestoneBanner.classList.add("show");
  playSound("sndMilestone");
  if (milestoneTimer !== null) { clearTimeout(milestoneTimer); }
  milestoneTimer = setTimeout(hideMilestone, 2200);
}

function hideMilestone() {
  milestoneBanner.classList.remove("show");
}

/* =================================================================
   CHARACTER MOVEMENT + ABILITY LOOP
   Runs ~60 times a second. Moves the alchemist by whatever movement
   keys are held, then fires whichever ability key is held (rate-limited
   by a cooldown so holding doesn't act every single frame).
   ================================================================= */
function placeCharacter() {
  character.style.left = charX + "%";
  character.style.top  = charY + "%";
}

function clampCharacterToPond() {
  var dx = charX - 50;
  var dy = charY - 50;
  var dist = Math.sqrt(dx*dx + dy*dy);
  if (dist > 38) {
    charX = 50 + (dx / dist) * 38;
    charY = 50 + (dy / dist) * 38;
  }
}

function startCharacterLoop() {
  stopCharacterLoop();
  charMoveId = requestAnimationFrame(characterStep);
}

function stopCharacterLoop() {
  if (charMoveId !== null) { cancelAnimationFrame(charMoveId); charMoveId = null; }
}

function characterStep() {
  var now = Date.now();

  /* --- movement --- */
  var mx = 0;
  var my = 0;
  if (keysDown.left)  { mx = mx - 1; }
  if (keysDown.right) { mx = mx + 1; }
  if (keysDown.up)    { my = my - 1; }
  if (keysDown.down)  { my = my + 1; }

  if (mx !== 0 || my !== 0) {
    /* Normalise diagonals so they aren't faster than straight lines. */
    if (mx !== 0 && my !== 0) {
      mx = mx * 0.7071;
      my = my * 0.7071;
    }
    charX = charX + mx * MOVE_SPEED;
    charY = charY + my * MOVE_SPEED;
    clampCharacterToPond();
    placeCharacter();
  }

  /* --- abilities --- */
  if (keysDown.z && now - lastPurifyTime > PURIFY_COOLDOWN) {
    lastPurifyTime = now;
    purifyAtPercent(charX, charY);
  }
  if (keysDown.x && now - lastCollectTime > COLLECT_COOLDOWN) {
    lastCollectTime = now;
    gatherNearCharacter();
  }

  /* --- glowing hand around the alchemist --- */
  if (keysDown.z) {
    pointerGlow.className = "pointer-glow purify";
    pointerGlow.style.opacity = 1;
  } else if (keysDown.x) {
    pointerGlow.className = "pointer-glow collect";
    pointerGlow.style.opacity = 1;
  } else {
    pointerGlow.style.opacity = 0;
  }
  pointerGlow.style.left = charX + "%";
  pointerGlow.style.top  = charY + "%";

  if (gameActive) { charMoveId = requestAnimationFrame(characterStep); }
}

/* =================================================================
   CONFETTI  (LevelUp: Celebrate Wins)
   ================================================================= */
var CONFETTI_COLORS = [
  "#b48a3c", "#d8b15e", "#4fb3cd", "#a7e4f1",
  "#9c3a2e", "#ece2c8", "#7fa86b", "#cf86a8"
];

function launchConfetti() {
  stopConfetti();
  confettiPieces = [];
  var stage = document.getElementById("stage");
  confettiCanvas.width  = stage.offsetWidth;
  confettiCanvas.height = stage.offsetHeight;

  var i;
  for (i = 0; i < 120; i++) {
    confettiPieces.push({
      x:      Math.random() * confettiCanvas.width,
      y:      Math.random() * -confettiCanvas.height,
      w:      6 + Math.random() * 8,
      h:      10 + Math.random() * 6,
      color:  CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      speedY: 2.5 + Math.random() * 3,
      speedX: (Math.random() - 0.5) * 2,
      angle:  Math.random() * 360,
      spin:   (Math.random() - 0.5) * 6
    });
  }
  confettiAnimId = requestAnimationFrame(confettiStep);
}

function confettiStep() {
  var ctx = confettiCanvas.getContext("2d");
  ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

  var allDone = true;
  var i;
  for (i = 0; i < confettiPieces.length; i++) {
    var p = confettiPieces[i];
    p.y     = p.y + p.speedY;
    p.x     = p.x + p.speedX;
    p.angle = p.angle + p.spin;
    if (p.y < confettiCanvas.height + 20) { allDone = false; }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle * Math.PI / 180);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }

  if (allDone === false) {
    confettiAnimId = requestAnimationFrame(confettiStep);
  } else {
    stopConfetti();
  }
}

function stopConfetti() {
  if (confettiAnimId !== null) { cancelAnimationFrame(confettiAnimId); confettiAnimId = null; }
  confettiPieces = [];
  if (confettiCanvas) {
    var ctx = confettiCanvas.getContext("2d");
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  }
}

/* =================================================================
   VISUAL EFFECTS (percent-based so mouse + keyboard share them)
   ================================================================= */
function clientToPercent(clientX, clientY) {
  var bounds = pond.getBoundingClientRect();
  var px = ((clientX - bounds.left) / bounds.width)  * 100;
  var py = ((clientY - bounds.top)  / bounds.height) * 100;
  return { x: px, y: py };
}

function spawnRipplePercent(xp, yp) {
  var ring = document.createElement("div");
  ring.className  = "ripple";
  ring.style.left = xp + "%";
  ring.style.top  = yp + "%";
  pond.appendChild(ring);
  setTimeout(function () { ring.remove(); }, 600);
}

function showScorePopPercent(xp, yp, text, isPenalty) {
  var pop = document.createElement("div");
  pop.className   = isPenalty ? "penalty-pop" : "score-pop";
  pop.textContent = text;
  pop.style.left  = xp + "%";
  pop.style.top   = yp + "%";
  pond.appendChild(pop);
  setTimeout(function () { pop.remove(); }, 800);
}

/* =================================================================
   TOAST
   ================================================================= */
var toastTimer = null;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  if (toastTimer !== null) { clearTimeout(toastTimer); }
  toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2600);
}

/* =================================================================
   KEYBOARD INPUT
   ================================================================= */
function onKeyDown(event) {
  var key = event.key.toLowerCase();

  /* movement */
  if (key === "arrowup"    || key === "w") { keysDown.up    = true; event.preventDefault(); }
  if (key === "arrowdown"  || key === "s") { keysDown.down  = true; event.preventDefault(); }
  if (key === "arrowleft"  || key === "a") { keysDown.left  = true; event.preventDefault(); }
  if (key === "arrowright" || key === "d") { keysDown.right = true; event.preventDefault(); }

  /* abilities */
  if (key === "z") { keysDown.z = true; purifyTool.classList.add("active"); }
  if (key === "x") { keysDown.x = true; collectTool.classList.add("active"); }

  /* reset */
  if (key === "r") { if (gameActive) { resetGame(); } }
}

function onKeyUp(event) {
  var key = event.key.toLowerCase();
  if (key === "arrowup"    || key === "w") { keysDown.up    = false; }
  if (key === "arrowdown"  || key === "s") { keysDown.down  = false; }
  if (key === "arrowleft"  || key === "a") { keysDown.left  = false; }
  if (key === "arrowright" || key === "d") { keysDown.right = false; }
  if (key === "z") { keysDown.z = false; purifyTool.classList.remove("active"); }
  if (key === "x") { keysDown.x = false; collectTool.classList.remove("active"); }
}

/* =================================================================
   EVENT WIRING
   ================================================================= */
function setDifficulty(name) {
  applyDifficulty(name);
  diffEasy.classList.remove("active");
  diffNormal.classList.remove("active");
  diffHard.classList.remove("active");
  if (name === "easy")   { diffEasy.classList.add("active"); }
  if (name === "normal") { diffNormal.classList.add("active"); }
  if (name === "hard")   { diffHard.classList.add("active"); }
  playSound("sndClick");
}

diffEasy.addEventListener("click",   function () { setDifficulty("easy"); });
diffNormal.addEventListener("click", function () { setDifficulty("normal"); });
diffHard.addEventListener("click",   function () { setDifficulty("hard"); });

document.getElementById("startBtn").addEventListener("click", function () { playSound("sndClick"); startGame(); });
document.getElementById("playAgainBtn").addEventListener("click", function () { playSound("sndClick"); startGame(); });
document.getElementById("resetBtn").addEventListener("click", function () { playSound("sndClick"); resetGame(); });

/* Clicking the ability buttons triggers the ability at the alchemist. */
purifyTool.addEventListener("click",  function () { if (gameActive) { purifyAtPercent(charX, charY); } });
collectTool.addEventListener("click", function () { if (gameActive) { gatherNearCharacter(); } });

pond.addEventListener("click", onPondClick);

document.addEventListener("keydown", onKeyDown);
document.addEventListener("keyup",   onKeyUp);

document.getElementById("helpBtn").addEventListener("click", function () {
  playSound("sndClick");
  showToast("Move with Arrow keys or WASD. Hold Z to purify the water, press X near debris to gather it (and to pop pollutants). Press R to reset.");
});
document.getElementById("loginBtn").addEventListener("click", function () {
  playSound("sndClick");
  showToast("Accounts arrive in a later build. For now, just press Start.");
});
document.getElementById("settingsBtn").addEventListener("click", function () {
  playSound("sndClick");
  showToast("Settings are still on the workbench.");
});
document.getElementById("optionsBtn").addEventListener("click", function () {
  playSound("sndClick");
  showToast("Options are still on the workbench.");
});
document.getElementById("nextLevelBtn").addEventListener("click", function () {
  playSound("sndClick");
  showToast("Only the Village spring exists so far. Clear this one first.");
});

/* Start on Normal by default. */
applyDifficulty("normal");
showScreen("start");
