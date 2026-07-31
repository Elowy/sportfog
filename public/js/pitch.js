// Animált foci-header a főoldalra. Tiszta canvas + vanilla JS, build nélkül.
// Két csapat (Piros vs Kék) passzolgat, lő, gólt szerez (GÓL!), van szöglet,
// kirúgás stb. – mind véletlenszerűen. Tiszteletben tartja a prefers-reduced-motion-t.
(function () {
  const canvas = document.getElementById('pitch');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const GRASS_DARK = '#15803d';
  const GRASS_LIGHT = '#16a34a';
  const LINE = 'rgba(255,255,255,0.65)';

  const TEAM_A = { color: '#ef4444', name: 'Piros', dir: 1, goals: 0 }; // jobbra támad
  const TEAM_B = { color: '#3b82f6', name: 'Kék', dir: -1, goals: 0 }; // balra támad

  let W = 0, H = 0, dpr = 1;
  let players = [];
  let ball = null;
  let popups = [];
  let flash = null;        // nagy GÓL! felirat középen
  let kickoffTimer = 0;    // gól utáni rövid szünet
  let concededTeam = null; // ki kap középkezdést
  let t = 0;               // eltelt idő (s) – jitterhez

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const newW = Math.max(1, rect.width);
    const newH = Math.max(1, rect.height);
    dpr = window.devicePixelRatio || 1;
    if (players.length && W && H) {
      const sx = newW / W, sy = newH / H;
      players.forEach((p) => { p.x *= sx; p.y *= sy; });
      if (ball) { ball.x *= sx; ball.y *= sy; }
    }
    W = newW; H = newH;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function geom() {
    const goalH = H * 0.30;
    return {
      goalTop: (H - goalH) / 2,
      goalBot: (H + goalH) / 2,
      pr: clamp(Math.min(W, H) * 0.03, 6, 13),
    };
  }

  function makeTeam(team) {
    const lanesX = team.dir === 1
      ? [0.06, 0.26, 0.40, 0.56, 0.72]
      : [0.94, 0.74, 0.60, 0.44, 0.28];
    const lanesY = [0.5, 0.26, 0.74, 0.42, 0.6];
    const numbers = team.dir === 1 ? [1, 2, 5, 8, 9] : [1, 3, 4, 10, 11];
    return lanesX.map((bx, i) => ({
      team,
      isGK: i === 0,
      bx,
      by: lanesY[i],
      x: bx * W,
      y: lanesY[i] * H,
      number: numbers[i],
      seed: Math.random() * 10,
    }));
  }

  function init() {
    players = makeTeam(TEAM_A).concat(makeTeam(TEAM_B));
    ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, owner: null, lastOwner: null, noCapture: 0, actionTimer: 1, shooting: false };
    popups = [];
    flash = null;
    kickoffTimer = 0;
    giveBallToNearest(null);
  }

  function giveBallToNearest(team) {
    let cand = null, md = Infinity;
    players.forEach((p) => {
      if (team && p.team !== team) return;
      if (p.isGK) return;
      const d = dist(p, ball);
      if (d < md) { md = d; cand = p; }
    });
    if (cand) {
      ball.owner = cand;
      ball.vx = ball.vy = 0;
      ball.shooting = false;
      ball.actionTimer = rand(0.5, 1.1);
    }
  }

  function addPopup(text, x, y, color, big) {
    popups.push({ text, x: clamp(x, W * 0.12, W * 0.88), y, color, life: big ? 1.1 : 0.9, vy: -H * 0.05, big: !!big });
  }

  function releaseBall(owner, tx, ty, speed, shooting) {
    const dx = tx - ball.x, dy = ty - ball.y;
    const d = Math.hypot(dx, dy) || 1;
    ball.vx = (dx / d) * speed;
    ball.vy = (dy / d) * speed;
    ball.owner = null;
    ball.lastOwner = owner;
    ball.lastTeam = owner.team;
    ball.shooting = shooting;
    ball.noCapture = 0.18;
  }

  function ownerAction(owner) {
    const goalX = owner.team.dir === 1 ? W : 0;
    const inRange = Math.abs(goalX - owner.x) < W * 0.34;
    if (inRange && Math.random() < 0.55) {
      const g = geom();
      const ty = rand(g.goalTop - H * 0.05, g.goalBot + H * 0.05); // néha mellé
      releaseBall(owner, goalX, ty, Math.min(W, H) * rand(1.4, 1.9), true);
      if (Math.random() < 0.5) addPopup('LÖVÉS!', owner.x, owner.y - 10, owner.team.color);
    } else {
      const mates = players.filter((p) => p.team === owner.team && p !== owner);
      const forward = mates.filter((p) => (owner.team.dir === 1 ? p.x > owner.x - W * 0.05 : p.x < owner.x + W * 0.05));
      const target = (forward.length && Math.random() < 0.7) ? pick(forward) : pick(mates);
      releaseBall(owner, target.x + rand(-W * 0.03, W * 0.03), target.y + rand(-H * 0.03, H * 0.03), Math.min(W, H) * rand(0.85, 1.25), false);
      if (Math.random() < 0.35) addPopup('PASSZ', owner.x, owner.y - 10, '#e2e8f0');
    }
  }

  function scoreGoal(team) {
    team.goals++;
    flash = { text: 'GÓL!', color: team.color, life: 1.7 };
    addPopup('GÓL! ⚽', W / 2, H * 0.4, team.color, true);
    concededTeam = team === TEAM_A ? TEAM_B : TEAM_A;
    ball.x = W / 2; ball.y = H / 2; ball.vx = ball.vy = 0;
    ball.owner = null; ball.lastOwner = null;
    kickoffTimer = 1.7;
  }

  function outAtGoalLine(side) {
    const attackingFromOut = ball.lastTeam; // aki utoljára ért hozzá
    // Szöglet, ha a védekező csapat tette ki; egyébként kirúgás. Egyszerűsítve random.
    if (Math.random() < 0.5) {
      const cx = side === 'left' ? W * 0.05 : W * 0.95;
      const cy = ball.y < H / 2 ? H * 0.07 : H * 0.93;
      addPopup('SZÖGLET', cx, cy, '#fde68a');
      ball.x = cx; ball.y = cy;
    } else {
      addPopup('KIRÚGÁS', side === 'left' ? W * 0.12 : W * 0.88, H * 0.5, '#e2e8f0');
      ball.x = side === 'left' ? W * 0.08 : W * 0.92; ball.y = H / 2;
    }
    ball.vx = ball.vy = 0; ball.owner = null; ball.lastOwner = null; ball.noCapture = 0.1;
    void attackingFromOut;
  }

  function moveToward(p, tx, ty, dt, fast) {
    const dx = tx - p.x, dy = ty - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = Math.min(W, H) * (fast ? 0.21 : 0.16);
    const step = Math.min(d, sp * dt);
    p.x = clamp(p.x + (dx / d) * step, W * 0.01, W * 0.99);
    p.y = clamp(p.y + (dy / d) * step, H * 0.02, H * 0.98);
  }

  function update(dt) {
    t += dt;
    if (flash) { flash.life -= dt; if (flash.life <= 0) flash = null; }
    for (let i = popups.length - 1; i >= 0; i--) {
      const pu = popups[i];
      pu.life -= dt; pu.y += pu.vy * dt;
      if (pu.life <= 0) popups.splice(i, 1);
    }

    if (kickoffTimer > 0) {
      kickoffTimer -= dt;
      ball.x = W / 2; ball.y = H / 2;
      if (kickoffTimer <= 0) giveBallToNearest(concededTeam);
    }

    // Ki üldözi a labdát (a hozzá legközelebbi, ha szabad a labda)
    let chaser = null;
    if (!ball.owner && kickoffTimer <= 0) {
      let md = Infinity;
      players.forEach((p) => { if (p.isGK) return; const d = dist(p, ball); if (d < md) { md = d; chaser = p; } });
    }

    const g = geom();
    players.forEach((p, idx) => {
      const jx = Math.sin(t * 0.8 + p.seed + idx) * W * 0.012;
      const jy = Math.cos(t * 0.9 + p.seed) * H * 0.02;
      let tx, ty, fast = false;

      if (ball.owner === p) {
        // dribli a kapu felé
        tx = p.team.dir === 1 ? W * 0.97 : W * 0.03;
        ty = clamp(p.y + Math.sin(t * 2 + p.seed) * H * 0.06, H * 0.12, H * 0.88);
      } else if (p === chaser) {
        tx = ball.x; ty = ball.y; fast = true;
      } else if (p.isGK) {
        // kapus a gólvonalon, a labda magasságát követve
        tx = p.team.dir === 1 ? W * 0.04 : W * 0.96;
        ty = clamp(ball.y, g.goalTop, g.goalBot);
      } else {
        const possessTeam = ball.owner ? ball.owner.team : (chaser ? chaser.team : null);
        const possess = possessTeam === p.team;
        const shift = possess ? p.team.dir * 0.09 : -p.team.dir * 0.05;
        tx = (p.bx + shift) * W + jx;
        ty = p.by * H + jy;
      }
      moveToward(p, tx, ty, dt, fast);
    });

    // Labda
    if (ball.owner) {
      ball.actionTimer -= dt;
      const d = ball.owner.team.dir;
      ball.x = ball.owner.x + d * (g.pr + 3);
      ball.y = ball.owner.y;
      if (ball.actionTimer <= 0) ownerAction(ball.owner);
    } else {
      ball.noCapture -= dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      const f = Math.exp(-1.5 * dt);
      ball.vx *= f; ball.vy *= f;

      // Oldalvonal: pattanjon vissza
      if (ball.y <= H * 0.02) { ball.y = H * 0.02; ball.vy = Math.abs(ball.vy) * 0.6; }
      if (ball.y >= H * 0.98) { ball.y = H * 0.98; ball.vy = -Math.abs(ball.vy) * 0.6; }

      // Gólvonalak
      if (ball.x <= W * 0.012) {
        if (ball.y > g.goalTop && ball.y < g.goalBot) scoreGoal(TEAM_B);
        else outAtGoalLine('left');
      } else if (ball.x >= W * 0.988) {
        if (ball.y > g.goalTop && ball.y < g.goalBot) scoreGoal(TEAM_A);
        else outAtGoalLine('right');
      }

      // Elkapás
      if (!ball.owner && ball.noCapture <= 0 && kickoffTimer <= 0) {
        const capR = g.pr + 7;
        let cand = null, md = capR;
        players.forEach((p) => {
          if (p === ball.lastOwner) return;
          const d = dist(p, ball);
          if (d < md) { md = d; cand = p; }
        });
        if (cand) {
          ball.owner = cand; ball.vx = ball.vy = 0; ball.shooting = false;
          ball.actionTimer = rand(0.5, 1.2);
        }
      }
    }
  }

  // ---- Rajzolás ----------------------------------------------------------
  function roundRect(x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPitch() {
    const bands = 8, bw = W / bands;
    for (let i = 0; i < bands; i++) {
      ctx.fillStyle = i % 2 === 0 ? GRASS_DARK : GRASS_LIGHT;
      ctx.fillRect(i * bw, 0, bw + 1, H);
    }
    const g = geom();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = Math.max(1.5, Math.min(W, H) * 0.006);
    const m = Math.min(W, H) * 0.03;
    ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
    // felezővonal + középkör
    ctx.beginPath(); ctx.moveTo(W / 2, m); ctx.lineTo(W / 2, H - m); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, H * 0.16, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 2.5, 0, Math.PI * 2); ctx.fillStyle = LINE; ctx.fill();
    // tizenhatosok
    const boxW = W * 0.11, boxTop = (H - H * 0.55) / 2, boxH = H * 0.55;
    ctx.strokeRect(m, boxTop, boxW, boxH);
    ctx.strokeRect(W - m - boxW, boxTop, boxW, boxH);
    // kapuk
    ctx.lineWidth = Math.max(3, Math.min(W, H) * 0.012);
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath(); ctx.moveTo(m * 0.5, g.goalTop); ctx.lineTo(m * 0.5, g.goalBot); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W - m * 0.5, g.goalTop); ctx.lineTo(W - m * 0.5, g.goalBot); ctx.stroke();
  }

  function drawPlayer(p) {
    const g = geom();
    const r = p.isGK ? g.pr * 0.95 : g.pr;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + r * 0.9, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = p.isGK ? '#facc15' : p.team.color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
    ctx.fillStyle = p.isGK ? '#1f2937' : '#fff';
    ctx.font = `bold ${Math.round(r * 1.05)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(p.number), p.x, p.y);
  }

  function drawBall() {
    const g = geom();
    const r = g.pr * 0.55;
    ctx.beginPath();
    ctx.ellipse(ball.x, ball.y + r * 1.1, r, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#1f2937';
    ctx.stroke();
    ctx.fillStyle = '#1f2937';
    ctx.beginPath(); ctx.arc(ball.x, ball.y, r * 0.32, 0, Math.PI * 2); ctx.fill();
  }

  function drawPopups() {
    popups.forEach((pu) => {
      ctx.globalAlpha = clamp(pu.life, 0, 1);
      ctx.fillStyle = pu.color;
      ctx.font = `bold ${Math.round(Math.min(W, H) * (pu.big ? 0.09 : 0.05))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.strokeText(pu.text, pu.x, pu.y);
      ctx.fillText(pu.text, pu.x, pu.y);
      ctx.globalAlpha = 1;
    });
  }

  function drawScoreboard() {
    const label = `${TEAM_A.goals} – ${TEAM_B.goals}`;
    const fs = Math.round(clamp(Math.min(W, H) * 0.055, 12, 22));
    ctx.font = `bold ${fs}px system-ui, sans-serif`;
    const tw = ctx.measureText(label).width;
    const padX = fs * 0.7, dot = fs * 0.42, gap = fs * 0.5;
    const boxW = tw + padX * 2 + (dot * 2 + gap * 2) * 2;
    const boxH = fs * 1.7;
    const x = (W - boxW) / 2, y = H * 0.035;
    ctx.fillStyle = 'rgba(15,23,42,0.78)';
    roundRect(x, y, boxW, boxH, boxH / 2); ctx.fill();
    const cy = y + boxH / 2;
    ctx.beginPath(); ctx.arc(x + padX + dot, cy, dot, 0, Math.PI * 2); ctx.fillStyle = TEAM_A.color; ctx.fill();
    ctx.beginPath(); ctx.arc(x + boxW - padX - dot, cy, dot, 0, Math.PI * 2); ctx.fillStyle = TEAM_B.color; ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, W / 2, cy + 1);
  }

  function drawFlash() {
    const a = clamp(flash.life / 1.7, 0, 1);
    ctx.globalAlpha = a * 0.9;
    ctx.fillStyle = flash.color;
    const fs = Math.round(Math.min(W, H) * 0.22);
    ctx.font = `900 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeText(flash.text, W / 2, H / 2);
    ctx.fillText(flash.text, W / 2, H / 2);
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawPitch();
    players.forEach(drawPlayer);
    drawBall();
    drawPopups();
    drawScoreboard();
    if (flash) drawFlash();
  }

  // ---- Indítás -----------------------------------------------------------
  resize();
  init();
  window.addEventListener('resize', resize);

  if (reduced) {
    draw(); // egyetlen statikus képkocka
    return;
  }

  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    if (!document.hidden) {
      update(dt);
      draw();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
