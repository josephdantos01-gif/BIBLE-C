(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  // ============================================================
  // ASSETS
  // Reemplaza estos PNG en /assets por tus sprites.
  // El juego seguirá funcionando con gráficos de respaldo
  // aunque todavía no hayas creado las imágenes.
  // ============================================================
  const ASSET_PATHS = {
    background: "assets/background.png",
    oldBible: "assets/bible-old.png",
    newBible: "assets/bible-new.png",
    leaf: "assets/leaf.png",
    powerStar: "assets/power-star.png",
    powerShield: "assets/power-shield.png",
    powerHeart: "assets/power-heart.png",
    powerClock: "assets/power-clock.png"
  };

  const images = {};
  for (const [key, src] of Object.entries(ASSET_PATHS)) {
    const img = new Image();
    img.src = src;
    images[key] = img;
  }

  // ============================================================
  // LIBROS DE LA BIBLIA zs
  // ============================================================
  const OLD_BOOKS = [
    "Génesis","Éxodo","Levítico","Números","Deuteronomio",
    "Josué","Jueces","Rut","1 Samuel","2 Samuel","1 Reyes","2 Reyes",
    "1 Crónicas","2 Crónicas","Esdras","Nehemías","Ester","Job",
    "Salmos","Proverbios","Eclesiastés","Cantares","Isaías","Jeremías",
    "Lamentaciones","Ezequiel","Daniel","Oseas","Joel","Amós","Abdías",
    "Jonás","Miqueas","Nahúm","Habacuc","Sofonías","Hageo","Zacarías","Malaquías"
  ];

  const NEW_BOOKS = [
    "Mateo","Marcos","Lucas","Juan","Hechos","Romanos",
    "1 Corintios","2 Corintios","Gálatas","Efesios","Filipenses","Colosenses",
    "1 Tesalonicenses","2 Tesalonicenses","1 Timoteo","2 Timoteo","Tito",
    "Filemón","Hebreos","Santiago","1 Pedro","2 Pedro","1 Juan","2 Juan",
    "3 Juan","Judas","Apocalipsis"
  ];

  const ALL_BOOKS = [
    ...OLD_BOOKS.map((name, index) => ({ name, testament: "old", order: index })),
    ...NEW_BOOKS.map((name, index) => ({ name, testament: "new", order: index }))
  ];

  // ============================================================
  // CONFIGURACIÓN
  // ============================================================
  const CONFIG = {
    bibleWidth: 250,
    bibleHeight: 150,
    bibleY: 835,
    moveSpeed: 900,
    startLives: 4,
    maxLives: 6,

    leafWidth: 205,
    leafHeight: 128,
    startFallSpeed: 225,
    speedPerLevel: 30,
    maxFallSpeed: 600,

    spawnBase: 1250,
    spawnMin: 520,
    maxActiveBooks: 6,

    powerChance: 0.10,
    powerFallSpeed: 235,
    powerSize: 82,

    pointsCorrect: 100,
    wrongPenalty: 75,

    levelEvery: 8,
    starDuration: 7000,
    clockDuration: 5000
  };

  // ============================================================
  // DOM
  // ============================================================
  const menu = document.getElementById("menu");
  const howPanel = document.getElementById("how-panel");
  const pausePanel = document.getElementById("pause-panel");
  const endPanel = document.getElementById("end-panel");

  const pauseBtn = document.getElementById("pause-btn");
  const touchControls = document.getElementById("touch-controls");

  const endTitle = document.getElementById("end-title");
  const endKicker = document.getElementById("end-kicker");
  const endMessage = document.getElementById("end-message");
  const finalScore = document.getElementById("final-score");
  const bestScoreEl = document.getElementById("best-score");
  const finalBooks = document.getElementById("final-books");

  // ============================================================
  // ESTADO
  // ============================================================
  let gameMode = 1;
  let state = "menu"; // menu | playing | paused | end
  let lastTime = performance.now();

  let players = [];
  let fallingBooks = [];
  let powerUps = [];
  let particles = [];
  let floatingTexts = [];

  let queue = [];
  let completed = new Set();
  let totalCompleted = 0;
  let level = 1;
  let spawnTimer = 0;
  let nextSpawn = CONFIG.spawnBase;
  let elapsed = 0;
  let slowUntil = 0;

  const keys = new Set();

  // ============================================================
  // UTILIDADES
  // ============================================================
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function intersects(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function roundedRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function imageReady(img) {
    return img && img.complete && img.naturalWidth > 0;
  }

  function formatScore(n) {
    return Math.max(0, Math.floor(n)).toLocaleString("es-GT");
  }

  function getTotalScore() {
    return players.reduce((sum, p) => sum + p.score, 0);
  }

  function getBestKey() {
    return `bibleDropBest_mode${gameMode}`;
  }

  // ============================================================
  // JUGADORES / BIBLIAS
  // ============================================================
  function createPlayers() {
    players = [
      {
        id: 1,
        testament: "old",
        label: gameMode === 2 ? "JUGADOR 1" : "ANTIGUO",
        x: W * 0.24 - CONFIG.bibleWidth / 2,
        y: CONFIG.bibleY,
        w: CONFIG.bibleWidth,
        h: CONFIG.bibleHeight,
        leftKey: "KeyA",
        rightKey: "KeyD",
        score: 0,
        lives: CONFIG.startLives,
        streak: 0,
        shield: 0,
        starUntil: 0,
        flashUntil: 0
      },
      {
        id: 2,
        testament: "new",
        label: gameMode === 2 ? "JUGADOR 2" : "NUEVO",
        x: W * 0.76 - CONFIG.bibleWidth / 2,
        y: CONFIG.bibleY,
        w: CONFIG.bibleWidth,
        h: CONFIG.bibleHeight,
        leftKey: "ArrowLeft",
        rightKey: "ArrowRight",
        score: 0,
        lives: CONFIG.startLives,
        streak: 0,
        shield: 0,
        starUntil: 0,
        flashUntil: 0
      }
    ];
  }

  function playerMultiplier(player, now) {
    let mult = 1;
    if (player.streak >= 10) mult = 3;
    else if (player.streak >= 5) mult = 2;
    if (player.starUntil > now) mult *= 2;
    return mult;
  }

  // ============================================================
  // INICIO / FIN
  // ============================================================
  function startGame(mode) {
    gameMode = mode;
    state = "playing";
    menu.classList.remove("visible");
    howPanel.classList.remove("visible");
    pausePanel.classList.remove("visible");
    endPanel.classList.remove("visible");

    pauseBtn.classList.add("visible");
    touchControls.classList.add("active");
    touchControls.setAttribute("aria-hidden", "false");

    createPlayers();
    fallingBooks = [];
    powerUps = [];
    particles = [];
    floatingTexts = [];

    queue = shuffle(ALL_BOOKS.map(book => ({ ...book })));
    completed = new Set();
    totalCompleted = 0;
    level = 1;
    spawnTimer = 0;
    nextSpawn = 650;
    elapsed = 0;
    slowUntil = 0;

    lastTime = performance.now();
  }

  function returnToMenu() {
    state = "menu";
    fallingBooks = [];
    powerUps = [];
    keys.clear();

    menu.classList.add("visible");
    pausePanel.classList.remove("visible");
    endPanel.classList.remove("visible");

    pauseBtn.classList.remove("visible");
    touchControls.classList.remove("active");
    touchControls.setAttribute("aria-hidden", "true");
  }

  function endGame(victory = false) {
    state = "end";
    keys.clear();

    const totalScore = getTotalScore();
    const oldBest = Number(localStorage.getItem(getBestKey()) || 0);
    const best = Math.max(oldBest, totalScore);
    localStorage.setItem(getBestKey(), String(best));

    endKicker.textContent = victory ? "¡MISIÓN COMPLETADA!" : "FIN DE LA PARTIDA";
    endTitle.textContent = victory ? "BIBLE COMPLETE!" : "GAME OVER";
    endMessage.textContent = victory
      ? "¡Completaste los 66 libros de la Biblia!"
      : "Vuelve a intentarlo y completa todos los libros.";

    finalScore.textContent = formatScore(totalScore);
    bestScoreEl.textContent = formatScore(best);
    finalBooks.textContent = `${totalCompleted}/66`;

    endPanel.classList.add("visible");
    pauseBtn.classList.remove("visible");
    touchControls.classList.remove("active");
    touchControls.setAttribute("aria-hidden", "true");
  }

  function togglePause() {
    if (state === "playing") {
      state = "paused";
      pausePanel.classList.add("visible");
      keys.clear();
    } else if (state === "paused") {
      state = "playing";
      pausePanel.classList.remove("visible");
      lastTime = performance.now();
    }
  }

  // ============================================================
  // SPAWN
  // ============================================================
  function currentFallSpeed() {
    return Math.min(
      CONFIG.maxFallSpeed,
      CONFIG.startFallSpeed + (level - 1) * CONFIG.speedPerLevel
    );
  }

  function currentSpawnDelay() {
    return Math.max(
      CONFIG.spawnMin,
      CONFIG.spawnBase - (level - 1) * 70
    );
  }

  function spawnBook() {
    if (queue.length === 0 || fallingBooks.length >= CONFIG.maxActiveBooks) return;

    const book = queue.shift();
    const w = CONFIG.leafWidth;
    const h = CONFIG.leafHeight;

    fallingBooks.push({
      ...book,
      x: random(45, W - w - 45),
      y: -h - random(20, 130),
      w,
      h,
      speed: currentFallSpeed() * random(0.92, 1.08),
      sway: random(15, 45),
      swaySpeed: random(1.4, 2.7),
      phase: random(0, Math.PI * 2),
      angle: random(-0.08, 0.08)
    });
  }

  function requeueBook(book) {
    setTimeout(() => {
      if (state === "playing" || state === "paused") {
        const exists =
          completed.has(book.name) ||
          queue.some(b => b.name === book.name) ||
          fallingBooks.some(b => b.name === book.name);

        if (!exists) {
          const insertAt = Math.min(queue.length, 4 + Math.floor(Math.random() * 7));
          queue.splice(insertAt, 0, {
            name: book.name,
            testament: book.testament,
            order: book.order
          });
        }
      }
    }, 350);
  }

  function maybeSpawnPowerUp() {
    if (Math.random() > CONFIG.powerChance || powerUps.length >= 2) return;

    const types = ["star", "shield", "heart", "clock"];
    const type = types[Math.floor(Math.random() * types.length)];

    powerUps.push({
      type,
      x: random(80, W - CONFIG.powerSize - 80),
      y: -CONFIG.powerSize - 30,
      w: CONFIG.powerSize,
      h: CONFIG.powerSize,
      speed: CONFIG.powerFallSpeed,
      bob: random(0, Math.PI * 2)
    });
  }

  // ============================================================
  // COLISIONES / PUNTOS
  // ============================================================
  function onCorrectCatch(player, book, now) {
    if (completed.has(book.name)) return;

    completed.add(book.name);
    totalCompleted = completed.size;
    player.streak += 1;

    const mult = playerMultiplier(player, now);
    const gained = CONFIG.pointsCorrect * mult;
    player.score += gained;
    player.flashUntil = now + 180;

    floatingTexts.push({
      x: book.x + book.w / 2,
      y: book.y,
      text: `+${gained}`,
      life: 900,
      maxLife: 900,
      kind: "good"
    });

    burst(book.x + book.w / 2, book.y + book.h / 2, player.testament);

    if (totalCompleted % CONFIG.levelEvery === 0 && totalCompleted < 66) {
      level += 1;
      floatingTexts.push({
        x: W / 2,
        y: H * 0.43,
        text: `LEVEL ${level}`,
        life: 1400,
        maxLife: 1400,
        kind: "level"
      });
    }

    maybeSpawnPowerUp();

    if (totalCompleted >= 66) {
      setTimeout(() => {
        if (state === "playing") endGame(true);
      }, 450);
    }
  }

  function takeDamage(player, reason, x, y) {
    player.streak = 0;

    if (player.shield > 0) {
      player.shield -= 1;
      floatingTexts.push({
        x, y,
        text: "¡ESCUDO!",
        life: 950,
        maxLife: 950,
        kind: "shield"
      });
      return;
    }

    player.lives -= 1;
    player.score = Math.max(0, player.score - CONFIG.wrongPenalty);

    floatingTexts.push({
      x, y,
      text: reason,
      life: 1050,
      maxLife: 1050,
      kind: "bad"
    });

    if (player.lives <= 0) {
      setTimeout(() => {
        if (state === "playing") endGame(false);
      }, 250);
    }
  }

  function onWrongCatch(player, book) {
    takeDamage(
      player,
      "TESTAMENTO INCORRECTO",
      book.x + book.w / 2,
      book.y
    );
    requeueBook(book);
  }

  function onMiss(book) {
    const owner = players.find(p => p.testament === book.testament);
    if (!owner) return;

    takeDamage(
      owner,
      "¡SE ESCAPÓ!",
      book.x + book.w / 2,
      H - 180
    );
    requeueBook(book);
  }

  function applyPowerUp(player, power, now) {
    switch (power.type) {
      case "star":
        player.starUntil = Math.max(player.starUntil, now) + CONFIG.starDuration;
        floatingTexts.push({
          x: power.x, y: power.y,
          text: "x2 PUNTOS",
          life: 1100, maxLife: 1100, kind: "power"
        });
        break;

      case "shield":
        player.shield = Math.min(2, player.shield + 1);
        floatingTexts.push({
          x: power.x, y: power.y,
          text: "ESCUDO +1",
          life: 1100, maxLife: 1100, kind: "power"
        });
        break;

      case "heart":
        player.lives = Math.min(CONFIG.maxLives, player.lives + 1);
        floatingTexts.push({
          x: power.x, y: power.y,
          text: "VIDA +1",
          life: 1100, maxLife: 1100, kind: "power"
        });
        break;

      case "clock":
        slowUntil = Math.max(slowUntil, now) + CONFIG.clockDuration;
        floatingTexts.push({
          x: power.x, y: power.y,
          text: "TIEMPO LENTO",
          life: 1100, maxLife: 1100, kind: "power"
        });
        break;
    }

    burst(power.x + power.w / 2, power.y + power.h / 2, "power");
  }

  // ============================================================
  // PARTÍCULAS
  // ============================================================
  function burst(x, y, type) {
    for (let i = 0; i < 14; i++) {
      particles.push({
        x, y,
        vx: random(-170, 170),
        vy: random(-210, 40),
        life: random(450, 850),
        maxLife: 850,
        size: random(5, 12),
        type
      });
    }
  }

  // ============================================================
  // UPDATE
  // ============================================================
  function update(dt, now) {
    elapsed += dt;

    // Movimiento de jugadores
    for (const p of players) {
      let dir = 0;
      if (keys.has(p.leftKey)) dir -= 1;
      if (keys.has(p.rightKey)) dir += 1;

      p.x += dir * CONFIG.moveSpeed * (dt / 1000);
      p.x = clamp(p.x, 18, W - p.w - 18);
    }

    // Spawn de libros
    spawnTimer += dt;
    if (spawnTimer >= nextSpawn) {
      spawnTimer = 0;
      spawnBook();
      nextSpawn = currentSpawnDelay() * random(0.86, 1.08);
    }

    const slowFactor = now < slowUntil ? 0.55 : 1;

    // Libros cayendo
    for (let i = fallingBooks.length - 1; i >= 0; i--) {
      const book = fallingBooks[i];

      book.y += book.speed * slowFactor * (dt / 1000);
      book.phase += book.swaySpeed * (dt / 1000);
      book.x += Math.sin(book.phase) * book.sway * (dt / 1000);
      book.x = clamp(book.x, 20, W - book.w - 20);

      let caught = false;
      for (const p of players) {
        const hitbox = {
          x: p.x + p.w * 0.08,
          y: p.y + p.h * 0.15,
          w: p.w * 0.84,
          h: p.h * 0.72
        };

        if (intersects(book, hitbox)) {
          if (p.testament === book.testament) {
            onCorrectCatch(p, book, now);
          } else {
            onWrongCatch(p, book);
          }

          fallingBooks.splice(i, 1);
          caught = true;
          break;
        }
      }

      if (caught) continue;

      if (book.y > H + 25) {
        fallingBooks.splice(i, 1);
        onMiss(book);
      }
    }

    // Power-ups
    for (let i = powerUps.length - 1; i >= 0; i--) {
      const power = powerUps[i];
      power.y += power.speed * (dt / 1000);
      power.bob += dt * 0.004;

      let caught = false;
      for (const p of players) {
        if (intersects(power, p)) {
          applyPowerUp(p, power, now);
          powerUps.splice(i, 1);
          caught = true;
          break;
        }
      }

      if (!caught && power.y > H + 80) {
        powerUps.splice(i, 1);
      }
    }

    // Partículas
    for (let i = particles.length - 1; i >= 0; i--) {
      const part = particles[i];
      part.life -= dt;
      part.x += part.vx * (dt / 1000);
      part.y += part.vy * (dt / 1000);
      part.vy += 420 * (dt / 1000);
      if (part.life <= 0) particles.splice(i, 1);
    }

    // Textos
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const f = floatingTexts[i];
      f.life -= dt;
      f.y -= 45 * (dt / 1000);
      if (f.life <= 0) floatingTexts.splice(i, 1);
    }
  }

  // ============================================================
  // DRAW: FONDO
  // ============================================================
  function drawBackground(now) {
    if (imageReady(images.background)) {
      ctx.drawImage(images.background, 0, 0, W, H);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#152448");
      g.addColorStop(0.55, "#0d1430");
      g.addColorStop(1, "#070912");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // estrellas/píxeles de respaldo
      ctx.fillStyle = "rgba(255,255,255,.17)";
      for (let i = 0; i < 46; i++) {
        const x = (i * 173 + 90) % W;
        const y = (i * 79 + 60) % 660;
        const s = 2 + (i % 3);
        ctx.fillRect(x, y, s, s);
      }
    }

    // Separador visual sutil entre Testamentos
    const gradLeft = ctx.createLinearGradient(0, 0, W / 2, 0);
    gradLeft.addColorStop(0, "rgba(255,216,77,.10)");
    gradLeft.addColorStop(1, "rgba(255,216,77,0)");
    ctx.fillStyle = gradLeft;
    ctx.fillRect(0, 0, W / 2, H);

    const gradRight = ctx.createLinearGradient(W, 0, W / 2, 0);
    gradRight.addColorStop(0, "rgba(104,183,255,.10)");
    gradRight.addColorStop(1, "rgba(104,183,255,0)");
    ctx.fillStyle = gradRight;
    ctx.fillRect(W / 2, 0, W / 2, H);

    // piso
    ctx.fillStyle = "rgba(3,5,12,.72)";
    ctx.fillRect(0, 990, W, 90);
    ctx.fillStyle = "rgba(255,255,255,.08)";
    ctx.fillRect(0, 990, W, 3);
  }

  // ============================================================
  // DRAW: HOJAS / LIBROS
  // ============================================================
  function drawBookLeaf(book) {
    ctx.save();

    const cx = book.x + book.w / 2;
    const cy = book.y + book.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate(book.angle + Math.sin(book.phase) * 0.03);

    const x = -book.w / 2;
    const y = -book.h / 2;

    if (imageReady(images.leaf)) {
      ctx.drawImage(images.leaf, x, y, book.w, book.h);
    } else {
      ctx.shadowColor = "rgba(0,0,0,.45)";
      ctx.shadowBlur = 14;
      roundedRect(x, y, book.w, book.h, 18);
      ctx.fillStyle = "#f7e6b2";
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = "#b48646";
      ctx.lineWidth = 5;
      roundedRect(x + 4, y + 4, book.w - 8, book.h - 8, 16);
      ctx.stroke();

      // pequeñas marcas de pergamino
      ctx.fillStyle = "rgba(113,76,32,.22)";
      ctx.fillRect(x + 20, y + 22, book.w - 40, 4);
      ctx.fillRect(x + 20, y + book.h - 26, book.w - 40, 4);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#33220f";
    ctx.font = `900 ${fitBookFont(book.name)}px Trebuchet MS`;
    ctx.fillText(book.name.toUpperCase(), 0, 3);

    // Pequeño indicador casi imperceptible para depuración/estética.
    ctx.fillStyle = book.testament === "old"
      ? "rgba(148,95,13,.58)"
      : "rgba(25,80,125,.58)";
    ctx.fillRect(x + 17, y + book.h - 16, book.w - 34, 3);

    ctx.restore();
  }

  function fitBookFont(name) {
    if (name.length <= 6) return 34;
    if (name.length <= 11) return 29;
    if (name.length <= 17) return 24;
    return 20;
  }

  // ============================================================
  // DRAW: BIBLIAS
  // ============================================================
  function drawBible(player, now) {
    const img = player.testament === "old" ? images.oldBible : images.newBible;
    const color = player.testament === "old" ? "#ffd84d" : "#68b7ff";
    const glow = player.flashUntil > now ? 26 : 12;

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;

    if (imageReady(img)) {
      ctx.drawImage(img, player.x, player.y, player.w, player.h);
    } else {
      // Biblia abierta de respaldo
      ctx.translate(player.x, player.y);
      ctx.fillStyle = player.testament === "old" ? "#70542c" : "#204d7c";

      roundedRect(0, 28, player.w * .49, player.h - 28, 18);
      ctx.fill();
      roundedRect(player.w * .51, 28, player.w * .49, player.h - 28, 18);
      ctx.fill();

      ctx.fillStyle = "#f3e7bd";
      roundedRect(10, 10, player.w * .46, player.h - 34, 15);
      ctx.fill();
      roundedRect(player.w * .54, 10, player.w * .46, player.h - 34, 15);
      ctx.fill();

      ctx.fillStyle = "rgba(0,0,0,.18)";
      ctx.fillRect(player.w / 2 - 4, 16, 8, player.h - 32);

      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(30, 56);
      ctx.lineTo(player.w * .44, 56);
      ctx.moveTo(player.w * .56, 56);
      ctx.lineTo(player.w - 30, 56);
      ctx.stroke();
    }

    ctx.restore();

    // etiqueta de jugador/testamento
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.font = "900 24px Trebuchet MS";
    ctx.fillText(
      player.testament === "old" ? "ANTIGUO TESTAMENTO" : "NUEVO TESTAMENTO",
      player.x + player.w / 2,
      player.y + player.h + 30
    );

    if (gameMode === 2) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 17px Trebuchet MS";
      ctx.fillText(
        player.label,
        player.x + player.w / 2,
        player.y + player.h + 56
      );
    }

    // escudo
    if (player.shield > 0) {
      ctx.font = "36px Arial";
      ctx.fillText("🛡️", player.x + player.w - 18, player.y + 6);
    }

    // estrella
    if (player.starUntil > now) {
      ctx.font = "34px Arial";
      ctx.fillText("⭐", player.x + 28, player.y + 5);
    }
  }

  // ============================================================
  // DRAW: POWER UPS
  // ============================================================
  function drawPowerUp(power) {
    const map = {
      star: images.powerStar,
      shield: images.powerShield,
      heart: images.powerHeart,
      clock: images.powerClock
    };

    const emoji = {
      star: "⭐",
      shield: "🛡️",
      heart: "❤️",
      clock: "⏱️"
    };

    const img = map[power.type];
    const bobY = Math.sin(power.bob) * 8;

    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,.7)";
    ctx.shadowBlur = 22;

    if (imageReady(img)) {
      ctx.drawImage(img, power.x, power.y + bobY, power.w, power.h);
    } else {
      ctx.font = "68px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        emoji[power.type],
        power.x + power.w / 2,
        power.y + power.h / 2 + bobY
      );
    }

    ctx.restore();
  }

  // ============================================================
  // DRAW: HUD
  // ============================================================
  function drawHUD(now) {
    // franja superior
    ctx.fillStyle = "rgba(4,6,16,.72)";
    ctx.fillRect(0, 0, W, 148);

    // centro
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 33px Trebuchet MS";
    ctx.fillText(`LEVEL ${level}`, W / 2, 42);

    ctx.fillStyle = "#cbd3e4";
    ctx.font = "700 18px Trebuchet MS";
    ctx.fillText(`BIBLIA ${totalCompleted}/66`, W / 2, 76);

    // barra de progreso
    const barW = 470;
    const barH = 17;
    const bx = W / 2 - barW / 2;
    const by = 97;

    roundedRect(bx, by, barW, barH, 9);
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.fill();

    if (totalCompleted > 0) {
      roundedRect(bx, by, barW * (totalCompleted / 66), barH, 9);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }

    drawPlayerHUD(players[0], 56, 24, "left", now);
    drawPlayerHUD(players[1], W - 56, 24, "right", now);

    // indicadores de conteo
    const oldCount = [...completed].filter(name => OLD_BOOKS.includes(name)).length;
    const newCount = totalCompleted - oldCount;

    ctx.textAlign = "left";
    ctx.fillStyle = "#ffd84d";
    ctx.font = "900 18px Trebuchet MS";
    ctx.fillText(`AT ${oldCount}/39`, 56, 130);

    ctx.textAlign = "right";
    ctx.fillStyle = "#68b7ff";
    ctx.fillText(`NT ${newCount}/27`, W - 56, 130);

    if (now < slowUntil) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#e7f4ff";
      ctx.font = "900 18px Trebuchet MS";
      ctx.fillText("⏱ TIEMPO LENTO", W / 2, 132);
    }
  }

  function drawPlayerHUD(p, x, y, align, now) {
    ctx.textAlign = align;

    const color = p.testament === "old" ? "#ffd84d" : "#68b7ff";
    const title = p.testament === "old"
      ? (gameMode === 2 ? "J1 • ANTIGUO" : "ANTIGUO")
      : (gameMode === 2 ? "J2 • NUEVO" : "NUEVO");

    ctx.fillStyle = color;
    ctx.font = "900 22px Trebuchet MS";
    ctx.fillText(title, x, y + 12);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 38px Trebuchet MS";
    ctx.fillText(formatScore(p.score), x, y + 54);

    const hearts = "❤".repeat(Math.max(0, p.lives));
    ctx.fillStyle = "#ff5d6e";
    ctx.font = "26px Arial";
    ctx.fillText(hearts, x, y + 87);

    const mult = playerMultiplier(p, now);
    if (mult > 1) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 17px Trebuchet MS";
      ctx.fillText(`COMBO x${mult}`, x, y + 114);
    }
  }

  // ============================================================
  // DRAW: EFECTOS
  // ============================================================
  function drawEffects() {
    for (const p of particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha;

      if (p.type === "old") ctx.fillStyle = "#ffd84d";
      else if (p.type === "new") ctx.fillStyle = "#68b7ff";
      else ctx.fillStyle = "#ffffff";

      ctx.fillRect(p.x, p.y, p.size, p.size);
    }

    ctx.globalAlpha = 1;

    for (const f of floatingTexts) {
      const alpha = clamp(f.life / f.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      if (f.kind === "good") ctx.fillStyle = "#8effa5";
      else if (f.kind === "bad") ctx.fillStyle = "#ff6f80";
      else if (f.kind === "shield") ctx.fillStyle = "#8fd5ff";
      else if (f.kind === "level") ctx.fillStyle = "#ffd84d";
      else ctx.fillStyle = "#ffffff";

      const size = f.kind === "level" ? 70 : 28;
      ctx.font = `900 ${size}px Trebuchet MS`;
      ctx.shadowColor = "rgba(0,0,0,.65)";
      ctx.shadowBlur = 10;
      ctx.fillText(f.text, f.x, f.y);
      ctx.shadowBlur = 0;
    }

    ctx.globalAlpha = 1;
  }

  // ============================================================
  // DRAW GENERAL
  // ============================================================
  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    drawBackground(now);

    for (const book of fallingBooks) drawBookLeaf(book);
    for (const power of powerUps) drawPowerUp(power);
    for (const player of players) drawBible(player, now);

    if (players.length) drawHUD(now);
    drawEffects();

    // Ayuda de controles al iniciar
    if (state === "playing" && elapsed < 4300) {
      const alpha = clamp(1 - Math.max(0, elapsed - 2500) / 1800, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(4,6,16,.72)";
      roundedRect(W / 2 - 320, H - 210, 640, 72, 18);
      ctx.fill();

      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.font = "800 24px Trebuchet MS";
      ctx.fillText("A / D  =  ANTIGUO        ← / →  =  NUEVO", W / 2, H - 174);
      ctx.globalAlpha = 1;
    }
  }

  // ============================================================
  // LOOP
  // ============================================================
  function frame(now) {
    const dt = Math.min(40, now - lastTime);
    lastTime = now;

    if (state === "playing") {
      update(dt, now);
    }

    draw(now);
    requestAnimationFrame(frame);
  }

  // ============================================================
  // INPUT
  // ============================================================
  window.addEventListener("keydown", e => {
    if (["ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      e.preventDefault();
    }

    if (e.code === "Escape" && (state === "playing" || state === "paused")) {
      togglePause();
      return;
    }

    keys.add(e.code);
  });

  window.addEventListener("keyup", e => {
    keys.delete(e.code);
  });

  window.addEventListener("blur", () => {
    keys.clear();
    if (state === "playing") togglePause();
  });

  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      startGame(Number(btn.dataset.mode));
    });
  });

  document.getElementById("how-btn").addEventListener("click", () => {
    howPanel.classList.add("visible");
  });

  document.getElementById("how-close").addEventListener("click", () => {
    howPanel.classList.remove("visible");
  });

  pauseBtn.addEventListener("click", togglePause);
  document.getElementById("resume-btn").addEventListener("click", togglePause);

  document.getElementById("restart-from-pause").addEventListener("click", () => {
    pausePanel.classList.remove("visible");
    startGame(gameMode);
  });

  document.getElementById("menu-from-pause").addEventListener("click", returnToMenu);

  document.getElementById("play-again").addEventListener("click", () => {
    startGame(gameMode);
  });

  document.getElementById("back-menu").addEventListener("click", returnToMenu);

  // Controles táctiles
  document.querySelectorAll("#touch-controls button").forEach(btn => {
    const code = btn.dataset.key;

    const press = e => {
      e.preventDefault();
      keys.add(code);
    };

    const release = e => {
      e.preventDefault();
      keys.delete(code);
    };

    btn.addEventListener("pointerdown", press);
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("pointerleave", release);
  });

  // Primer dibujo
  createPlayers();
  draw(performance.now());
  players = [];
  requestAnimationFrame(frame);
})();

