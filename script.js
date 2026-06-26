/* =================================================================
   WATER ALCHEMIST  -  game logic
   var only, named functions, no arrow functions, + for strings
   ================================================================= */

/* ---- Tunable settings ---- */
var TOTAL_TIME       = 90;
var DEBRIS_COUNT     = 6;
var PURIFY_PER_CLICK = 10;   /* 10 clicks to fully purify */
var POINTS_PER_PURIFY = 5;
var POINTS_PER_DEBRIS = 50;

/* ---- Game state ---- */
var currentTool    = "purify";
var purity         = 0;
var score          = 0;
var debrisRemaining = 0;   /* starts at 0; only set inside spawnDebris */
var debrisSpawned   = false; /* TRUE once spawnDebris has run for this round */
var timeLeft       = TOTAL_TIME;
var timerId        = null;
var gameActive     = false;

/* Character movement state */
var charX = 72;   /* % from left inside pond */
var charY = 72;   /* % from top  inside pond */
var charTargetX = 72;
var charTargetY = 72;
var charMoveId  = null;   /* requestAnimationFrame handle */

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

var resultTitle = document.getElementById("resultTitle");
var resultText  = document.getElementById("resultText");
var toast       = document.getElementById("toast");

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

  /* Reset character to lower-right starting position */
  charX = 72;
  charY = 72;
  charTargetX = 72;
  charTargetY = 72;
  placeCharacter();

  setTool("purify");
  clearDebris();
  spawnDebris(DEBRIS_COUNT);   /* sets debrisRemaining = DEBRIS_COUNT */

  updateScore();
  updateWater();
  updateTimeDisplay();
  updateTaskHint();

  showScreen("game");
  gameActive = true;
  startTimer();
  startCharacterLoop();
}

/* =================================================================
   TIMER
   ================================================================= */
function startTimer() {
  clearTimer();
  timerId = setInterval(tick, 1000);
}

function clearTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
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
  debrisSpawned   = true;   /* now the win check is allowed */
}

/* Rejection sampling — land inside the circle, away from the character */
function randomPointInCircle() {
  var centerX = 50;
  var centerY = 50;
  var radius  = 36;
  var x = 0;
  var y = 0;
  var tries = 0;
  while (tries < 200) {
    x = Math.random() * 100;
    y = Math.random() * 100;
    var dx = x - centerX;
    var dy = y - centerY;
    var distance = Math.sqrt(dx * dx + dy * dy);
    var nearCharacter = (x > 58 && y > 58);
    if (distance <= radius && nearCharacter === false) {
      return { x: x, y: y };
    }
    tries = tries + 1;
  }
  return { x: 30, y: 30 };
}

function onDebrisClick(event) {
  if (gameActive === false) { return; }
  if (currentTool === "collect") {
    collectDebris(event.currentTarget, event);
  } else {
    purifyAt(event.clientX, event.clientY);
  }
}

function collectDebris(piece, event) {
  if (piece.classList.contains("collected")) { return; }
  piece.classList.add("collected");
  piece.removeEventListener("click", onDebrisClick);
  debrisRemaining = debrisRemaining - 1;
  score = score + POINTS_PER_DEBRIS;
  updateScore();
  updateTaskHint();
  showScorePop(event.clientX, event.clientY, "+" + POINTS_PER_DEBRIS);
  setTimeout(function () { piece.remove(); }, 220);

  /* Walk the character toward the collected piece */
  var pondBounds = pond.getBoundingClientRect();
  charTargetX = ((event.clientX - pondBounds.left) / pondBounds.width)  * 100;
  charTargetY = ((event.clientY - pondBounds.top)  / pondBounds.height) * 100;

  checkWin();
}

/* =================================================================
   PURIFYING
   ================================================================= */
function onPondClick(event) {
  if (gameActive === false) { return; }
  /* Only react to clicks on the bare water layers, not debris */
  if (event.target !== pond &&
      event.target !== pondClean &&
      event.target !== document.querySelector(".sigil-ring")) { return; }
  if (currentTool === "purify") {
    purifyAt(event.clientX, event.clientY);
  }
}

function purifyAt(clientX, clientY) {
  if (purity >= 100) { return; }
  purity = purity + PURIFY_PER_CLICK;
  if (purity > 100) { purity = 100; }
  score = score + POINTS_PER_PURIFY;
  updateScore();
  updateWater();
  updateTaskHint();
  spawnRipple(clientX, clientY);

  /* Walk the character toward where the player purified */
  var pondBounds = pond.getBoundingClientRect();
  charTargetX = ((clientX - pondBounds.left) / pondBounds.width)  * 100;
  charTargetY = ((clientY - pondBounds.top)  / pondBounds.height) * 100;

  checkWin();
}

function updateWater() {
  pondClean.style.opacity = purity / 100;
  purityFill.style.width  = purity + "%";
}

/* =================================================================
   TASK HINT
   ================================================================= */
function updateTaskHint() {
  var waterDone  = (purity >= 100);
  var debrisDone = (debrisRemaining <= 0 && debrisSpawned === true);

  if (waterDone === false && debrisDone === false) {
    taskHint.textContent = "Purify the water and collect the debris";
  } else if (waterDone === false) {
    taskHint.textContent = "Now purify the water!";
  } else if (debrisDone === false) {
    taskHint.textContent = "Now collect the remaining debris!";
  } else {
    taskHint.textContent = "Complete!";
  }
}

/* =================================================================
   WIN / LOSE
   The debrisSpawned guard stops the win from firing at startup
   when debrisRemaining is still 0 from initialization.
   ================================================================= */
function checkWin() {
  if (debrisSpawned === false) { return; }   /* not ready yet */
  if (purity >= 100 && debrisRemaining <= 0) {
    endGame(true);
  }
}

function endGame(won) {
  gameActive = false;
  clearTimer();
  stopCharacterLoop();
  if (won) {
    resultTitle.textContent = "The wellspring runs clear";
    resultText.textContent  = "The village drinks freely tonight. Final score: " + score + ".";
  } else {
    resultTitle.textContent = "The waters clouded over";
    resultText.textContent  = "Time ran dry before the spring did. Score: " + score + ".";
  }
  showScreen("result");
}

/* =================================================================
   SCORE + TOOL DISPLAY
   ================================================================= */
function updateScore() {
  scoreValue.textContent = "" + score;
}

function setTool(tool) {
  currentTool = tool;
  if (tool === "purify") {
    purifyTool.classList.add("active");
    collectTool.classList.remove("active");
    pointerGlow.className = "pointer-glow purify";
  } else {
    collectTool.classList.add("active");
    purifyTool.classList.remove("active");
    pointerGlow.className = "pointer-glow collect";
  }
}

/* =================================================================
   CHARACTER MOVEMENT
   The character slides toward charTargetX/Y each frame.
   It stays clamped inside the pond circle so it never escapes.
   ================================================================= */
function placeCharacter() {
  character.style.left = charX + "%";
  character.style.top  = charY + "%";
}

function startCharacterLoop() {
  stopCharacterLoop();
  charMoveId = requestAnimationFrame(characterStep);
}

function stopCharacterLoop() {
  if (charMoveId !== null) {
    cancelAnimationFrame(charMoveId);
    charMoveId = null;
  }
}

function characterStep() {
  var speed = 0.04;   /* fraction of remaining distance to close each frame */

  var dx = charTargetX - charX;
  var dy = charTargetY - charY;

  /* Only move if there is meaningful distance left */
  if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
    charX = charX + dx * speed;
    charY = charY + dy * speed;

    /* Clamp inside pond circle (center 50,50 radius ~38) */
    var cdx = charX - 50;
    var cdy = charY - 50;
    var dist = Math.sqrt(cdx * cdx + cdy * cdy);
    if (dist > 38) {
      charX = 50 + (cdx / dist) * 38;
      charY = 50 + (cdy / dist) * 38;
    }

    placeCharacter();
  }

  if (gameActive) {
    charMoveId = requestAnimationFrame(characterStep);
  }
}

/* =================================================================
   VISUAL EFFECTS
   ================================================================= */
function clientToPercent(clientX, clientY) {
  var bounds = pond.getBoundingClientRect();
  var px = ((clientX - bounds.left) / bounds.width)  * 100;
  var py = ((clientY - bounds.top)  / bounds.height) * 100;
  return { x: px, y: py };
}

function spawnRipple(clientX, clientY) {
  var spot = clientToPercent(clientX, clientY);
  var ring = document.createElement("div");
  ring.className  = "ripple";
  ring.style.left = spot.x + "%";
  ring.style.top  = spot.y + "%";
  pond.appendChild(ring);
  setTimeout(function () { ring.remove(); }, 600);
}

function showScorePop(clientX, clientY, text) {
  var spot = clientToPercent(clientX, clientY);
  var pop  = document.createElement("div");
  pop.className   = "score-pop";
  pop.textContent = text;
  pop.style.left  = spot.x + "%";
  pop.style.top   = spot.y + "%";
  pond.appendChild(pop);
  setTimeout(function () { pop.remove(); }, 700);
}

function onPondMove(event) {
  var spot = clientToPercent(event.clientX, event.clientY);
  pointerGlow.style.left    = spot.x + "%";
  pointerGlow.style.top     = spot.y + "%";
  pointerGlow.style.opacity = 1;
}

function onPondLeave() {
  pointerGlow.style.opacity = 0;
}

/* =================================================================
   TOAST
   ================================================================= */
var toastTimer = null;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  if (toastTimer !== null) { clearTimeout(toastTimer); }
  toastTimer = setTimeout(function () {
    toast.classList.remove("show");
  }, 2600);
}

/* =================================================================
   EVENT WIRING
   ================================================================= */
document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("playAgainBtn").addEventListener("click", startGame);

purifyTool.addEventListener("click",  function () { setTool("purify"); });
collectTool.addEventListener("click", function () { setTool("collect"); });

pond.addEventListener("click",      onPondClick);
pond.addEventListener("mousemove",  onPondMove);
pond.addEventListener("mouseleave", onPondLeave);

document.addEventListener("keydown", function (event) {
  if (event.key === "1") { setTool("purify"); }
  if (event.key === "2") { setTool("collect"); }
});

document.getElementById("helpBtn").addEventListener("click", function () {
  showToast("Purifying Hand: click the water to clean it. Gathering Hand: click debris to collect it. Finish both before time runs out!");
});
document.getElementById("loginBtn").addEventListener("click", function () {
  showToast("Accounts arrive in a later build. For now, just press Start.");
});
document.getElementById("settingsBtn").addEventListener("click", function () {
  showToast("Settings are still on the workbench.");
});
document.getElementById("optionsBtn").addEventListener("click", function () {
  showToast("Options are still on the workbench.");
});
document.getElementById("nextLevelBtn").addEventListener("click", function () {
  showToast("Only the Village spring exists so far. Clear this one first.");
});

showScreen("start");
