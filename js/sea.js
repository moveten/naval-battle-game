// ================= 바다 (세계 지도) =================
class Sea extends Phaser.Scene {
  constructor(){ super('sea'); }

  drawShip(key, hull, deck, sail, accent, torn){
    const s = this.make.graphics({ add:false });
    s.fillStyle(hull, 1).fillPoints([{x:2,y:22},{x:16,y:6},{x:62,y:7},{x:86,y:22},{x:62,y:37},{x:16,y:38}], true);
    s.fillStyle(deck, 1).fillPoints([{x:8,y:22},{x:19,y:11},{x:60,y:12},{x:78,y:22},{x:60,y:32},{x:19,y:33}], true);
    s.lineStyle(1, hull, .6); for(let x = 26; x < 66; x += 8) s.lineBetween(x, 13, x, 31);
    s.fillStyle(0x222222, 1); [24,44,64].forEach(x => { s.fillRect(x-3, 3, 6, 5); s.fillRect(x-3, 36, 6, 5); });
    s.fillStyle(sail, 1);
    if(torn) s.fillRoundedRect(30, 4, 6, 11, 3).fillRoundedRect(30, 25, 6, 15, 3).fillRoundedRect(52, 16, 5, 13, 3);
    else s.fillRoundedRect(30, 4, 6, 36, 3).fillRoundedRect(52, 7, 5, 30, 3);
    s.fillStyle(accent, 1).fillCircle(33, 22, 2.5).fillCircle(54.5, 22, 2.2);
    s.generateTexture(key, 88, 44); s.destroy();
  }

  makeTextures(){
    if(this.textures.exists('waves')) return;
    const w = this.make.graphics({ add:false });
    w.fillStyle(0x1d5a73, 1).fillRect(0, 0, 256, 256);
    const rnd = new Phaser.Math.RandomDataGenerator(['sea']);
    for(let i = 0; i < 46; i++){
      const x = rnd.between(0,256), y = rnd.between(0,256), len = rnd.between(8,22);
      w.lineStyle(2, 0x8fc4cf, rnd.realInRange(.15,.4)); w.beginPath(); w.arc(x, y, len, PI*1.15, PI*1.85); w.strokePath();
    }
    w.generateTexture('waves', 256, 256); w.destroy();
    this.drawShip('ship', 0x4a2a14, 0x8a5a32, 0xf3ecd9, 0xc9a24a, false);
    this.drawShip('ship_torn', 0x4a2a14, 0x8a5a32, 0xf3ecd9, 0xc9a24a, true);
    this.drawShip('enemy', 0x2b1e18, 0x5a4030, 0x3b3633, 0xc9533b, false);
    this.drawShip('enemy_torn', 0x2b1e18, 0x5a4030, 0x3b3633, 0xc9533b, true);
  }

  create(){
    this.makeTextures();
    kills = 0; $kills.textContent = `격침 0 · 최고 ${save.best}`;
    $over.hidden = true; $('overTitle').textContent = '침몰했습니다';
    showGold();
    this.grapple = 0; this.boarding = false; this.inPort = null; this.mapOpen = false;
    this.leftPort = null; this.dockShown = null; this.nearestDist = Infinity; this.posT = 0;

    this.water = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'waves').setOrigin(0).setScrollFactor(0);
    this.drawWorld();

    // 항구
    this.ports = PORTS.map(p => { const [x, y] = geo(p.lon, p.lat); return { ...p, x, y }; });
    this.ports.forEach(p => p.out = this.findOpenSea(p.x, p.y));
    this.portG = this.add.graphics();
    this.portLabels = {};
    for(const p of this.ports){
      this.portLabels[p.id] = this.add.text(p.x, p.y - 54, p.nm, { fontFamily:FONT, fontSize:'22px', fontStyle:'bold', color:'#f3ecd9', stroke:'#0b1e26', strokeThickness:4 }).setOrigin(0.5).setDepth(3);
    }
    this.drawPorts();

    // 바람·날씨·보급품
    this.wind = { a: Math.random()*PI*2, target:0, t:0 }; this.wind.target = this.wind.a;
    this.weather = { storm:false, t:70, bolt:3 };
    this.barrels = []; this.barrelT = 3;
    this.barrelG = this.add.graphics();

    this.fxLow = this.add.graphics();
    this.aimG = this.add.graphics();
    this.fx = [];
    const start = this.ports.find(p => p.id === save.lastPort) || this.ports[0];
    this.player = this.makeShip(start.x, start.y, 'ship', true, 0);
    this.player.st.heading = start.out; this.player.img.rotation = start.out;
    this.enemies = []; this.enemyT = 45;
    this.fxHigh = this.add.graphics().setDepth(5);
    this.ballG = this.add.graphics().setDepth(5); this.balls = [];
    this.hpG = this.add.graphics().setDepth(6);
    this.uiG = this.add.graphics().setScrollFactor(0).setDepth(20);
    this.dark = this.add.rectangle(0, 0, 4000, 4000, 0x061018, 1).setOrigin(0).setScrollFactor(0).setDepth(15).setAlpha(0);
    this.stormG = this.add.graphics().setScrollFactor(0).setDepth(16);
    this.rain = Array.from({ length:90 }, () => ({ x:Math.random()*2000, y:Math.random()*1200, s:500 + Math.random()*300 }));
    this.shakeCool = 0;

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.startFollow(this.player.img, true, 0.08, 0.08);
    cam.centerOn(start.x, start.y);

    this.keys = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');

    // 왼쪽 화면 어디든 누르면 가속
    this.input.addPointer(2);
    this.joy = { id:null, bx:0, by:0, dx:0, dy:0 };
    this.gasId = null; this.gasPos = { x:0, y:0 };
    this.input.on('pointerdown', p => {
      if(this.gasId === null && p.x < this.scale.width * 0.55){ this.gasId = p.id; this.gasPos = { x:p.x, y:p.y }; hideHint(); }
    });
    this.input.on('pointermove', p => { if(p.id === this.gasId) this.gasPos = { x:p.x, y:p.y }; });
    const gasOff = p => { if(p.id === this.gasId) this.gasId = null; };
    this.input.on('pointerup', gasOff); this.input.on('pointerupoutside', gasOff);

    this.onResize = size => this.water.setSize(size.width, size.height);
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize));

    this.time.delayedCall(10, () => openPort(this, start)); // 항구에 정박한 채로 시작
  }

  // 항구에서 가장 탁 트인 바다 방향
  findOpenSea(x, y){
    const free = [];
    for(let i = 0; i < 36; i++){
      const a = i/36*PI*2; let d = 0;
      while(d < 2400 && !isLand(x + Math.cos(a)*(d + 50), y + Math.sin(a)*(d + 50))) d += 50;
      free.push(d);
    }
    // 이웃 방향까지 함께 탁 트인 쪽을 고름
    let best = -1, bestI = 0;
    for(let i = 0; i < 36; i++){
      const sc = free[(i + 35) % 36] + free[i]*2 + free[(i + 1) % 36];
      if(sc > best){ best = sc; bestI = i; }
    }
    return bestI/36*PI*2;
  }

  drawWorld(){
    const g = this.add.graphics();
    const pts = P => P.p.map(([x, y]) => ({ x, y }));
    const lands = [MAINLAND, ...ISLANDS];
    g.lineStyle(44, 0x3f8fa3, 0.45); for(const L of lands) g.strokePoints(pts(L), true);  // 얕은 바다
    g.lineStyle(8, 0xd9c48f, 1);     for(const L of lands) g.strokePoints(pts(L), true);  // 해변
    g.fillStyle(0x8f9e6b, 1).fillPoints(pts(MAINLAND), true);                              // 대륙
    g.fillStyle(0x1d5a73, 1); for(const C of CARVES) g.fillPoints(pts(C), true);           // 지중해 등
    g.lineStyle(6, 0xd9c48f, 1); for(const C of CARVES) g.strokePoints(pts(C), true);
    g.fillStyle(0x8f9e6b, 1); for(const I of ISLANDS) g.fillPoints(pts(I), true);          // 섬
    // 경선·위선
    g.lineStyle(1, 0xffffff, 0.07);
    for(let lon = LON0; lon <= LON1; lon += 10){ const [x] = geo(lon, 0); g.lineBetween(x, 0, x, WORLD_H); }
    for(let lat = -40; lat <= LAT1; lat += 10){ const [, y] = geo(0, lat); g.lineBetween(0, y, WORLD_W, y); }
    const [, ey] = geo(0, 0); g.lineStyle(2, 0xc9a24a, 0.2).lineBetween(0, ey, WORLD_W, ey); // 적도
    for(const [t, lon, lat, size, kind] of LABELS){
      const [x, y] = geo(lon, lat);
      this.add.text(x, y, t, { fontFamily:FONT, fontSize:size + 'px', fontStyle: kind === 'sea' ? 'italic' : 'bold', color: kind === 'sea' ? '#cfe6ec' : '#2f3a22' })
        .setOrigin(0.5).setAlpha(kind === 'sea' ? 0.3 : 0.45);
    }
  }

  drawPorts(){
    const g = this.portG; g.clear();
    for(const p of this.ports){
      const f = !!save.found[p.id];
      this.portLabels[p.id].setVisible(f);
      if(!f) continue;
      const x = p.x, y = p.y;
      g.lineStyle(3, 0xc9a24a, .55).strokeCircle(x, y, 36);
      g.fillStyle(0x3a2414, 1).fillRect(x - 16, y + 6, 32, 7);
      g.fillStyle(0xf3ecd9, 1).fillRect(x - 1.5, y - 28, 3, 34);
      g.fillStyle(0xc9533b, 1).fillTriangle(x + 1.5, y - 28, x + 22, y - 21, x + 1.5, y - 14);
    }
  }

  discover(p){
    if(save.found[p.id]) return;
    save.found[p.id] = true; persist();
    this.drawPorts();
    addGold(GOLD_DISCOVER);
    toast(`새 항구 발견: ${p.nm} +${GOLD_DISCOVER} 금화`);
  }

  makeShip(x, y, key, isPlayer, lvl){
    const maxHull = isPlayer ? stat.hull() : 100 + 10*lvl;
    const maxCrew = isPlayer ? stat.crew() : 14 + lvl;
    return { img: this.add.image(x, y, key).setDepth(4), key, isPlayer, alive:true, lvl,
      hull:maxHull, maxHull, sail:100, crew:maxCrew, maxCrew, torn:false, dmgT:0,
      reload:{ '-1':0, '1':0 }, st:{ vx:0, vy:0, speed:0, heading:-PI/2, wakeT:0, bumpCool:0 } };
  }

  applyUpgrades(){
    const pl = this.player, old = pl.maxHull;
    pl.maxHull = stat.hull(); pl.hull += pl.maxHull - old; pl.maxCrew = stat.crew();
  }

  // 리스본에서 멀수록, 많이 이길수록 적이 강해짐
  enemyLevel(x, y){
    const lis = this.ports[0];
    return Math.min(10, Math.floor(kills/2) + Math.floor(Math.hypot(x - lis.x, y - lis.y)/3500));
  }

  spawnEnemy(){
    const p = this.player.img;
    for(let t = 0; t < 30; t++){
      const a = Math.random()*PI*2, d = 800 + Math.random()*300;
      const x = p.x + Math.cos(a)*d, y = p.y + Math.sin(a)*d;
      if(x < 100 || y < 100 || x > WORLD_W - 100 || y > WORLD_H - 100) continue;
      if(isLand(x, y) || [0,1,2,3].some(i => isLand(x + Math.cos(i*PI/2)*90, y + Math.sin(i*PI/2)*90))) continue;
      const e = this.makeShip(x, y, 'enemy', false, this.enemyLevel(x, y));
      e.st.heading = Math.atan2(p.y - y, p.x - x);
      this.enemies.push(e);
      toast('⚠ 해적선이 나타났다!');
      return true;
    }
    return false;
  }

  stepShip(sh, throttle, steer, dt, time, spin = 0){
    const s = sh.st, img = sh.img;
    const storm = this.weather.storm;
    const windFx = 1 + (storm ? 0.35 : 0.25) * Math.cos(s.heading - this.wind.a);
    const sailPower = (0.45 + 0.55 * sh.sail/100) * (sh.isPlayer ? stat.speedMul() : 1) * windFx;
    const target = throttle * MAX_SPEED * sailPower;
    let accel;
    if(target > s.speed) accel = s.speed < 100 ? 220 : 70;
    else accel = throttle === 0 ? 150 : 60;
    s.speed = s.speed < target ? Math.min(target, s.speed + accel*dt) : Math.max(target, s.speed - accel*dt);

    const turnFactor = Phaser.Math.Clamp(Math.abs(s.speed)/60, 0.6, 1);
    s.heading = W(s.heading + steer * 2.0 * turnFactor * dt + spin * 1.8 * dt);

    const f = 1 - Math.exp(-3*dt);
    s.vx += (Math.cos(s.heading)*s.speed - s.vx) * f;
    s.vy += (Math.sin(s.heading)*s.speed - s.vy) * f;
    if(throttle === 0){ const k = Math.exp(-1.2*dt); s.vx *= k; s.vy *= k; }

    // 이동 + 육지에 막힘 (해안선을 따라 미끄러짐)
    const drift = storm ? 45 : 6;
    const vx = s.vx + Math.cos(this.wind.a)*drift, vy = s.vy + Math.sin(this.wind.a)*drift;
    const ox = img.x, oy = img.y, nx = ox + vx*dt, ny = oy + vy*dt, sp = Math.hypot(vx, vy) || 1;
    // 빠를 때만 뱃머리 앞쪽까지 검사 (느릴 땐 바람에 밀려도 갇히지 않게)
    const blocked = (x, y) => isLand(x, y) || (sp > 40 && isLand(x + vx/sp*24, y + vy/sp*24));
    let bump = false;
    s.bumpCool = Math.max(0, s.bumpCool - dt);
    if(isLand(ox, oy) || !blocked(nx, ny)){ img.x = nx; img.y = ny; }
    else {
      if(!blocked(nx, oy)){ img.x = nx; s.vy *= -0.2; }
      else if(!blocked(ox, ny)){ img.y = ny; s.vx *= -0.2; }
      else { s.vx *= -0.3; s.vy *= -0.3; }
      if(sp > 110 && s.bumpCool === 0){ bump = true; s.bumpCool = 1; }
      if(sp > 60) s.speed *= 0.6;
    }
    img.x = Phaser.Math.Clamp(img.x, 40, WORLD_W - 40);
    img.y = Phaser.Math.Clamp(img.y, 40, WORLD_H - 40);

    img.rotation = s.heading;
    const wobble = 0.035 + (1 - sh.hull/sh.maxHull) * 0.05 + (storm ? 0.05 : 0);
    img.setScale(1, 1 + Math.sin(time/420 + (sh.isPlayer ? 0 : 2)) * wobble);

    const real = Math.hypot(s.vx, s.vy);
    s.wakeT += dt;
    if(real > 15 && s.wakeT > 0.05){
      s.wakeT = 0;
      const c = Math.cos(s.heading), sn = Math.sin(s.heading), bx = img.x - c*38, by = img.y - sn*38, p = Math.min(1, real/140);
      this.fx.push({ t:'wake', x:bx - sn*9, y:by + c*9, age:0, life:1.8, p });
      this.fx.push({ t:'wake', x:bx + sn*9, y:by - c*9, age:0, life:1.8, p });
    }
    return bump;
  }

  reloadTime(sh){
    const base = sh.isPlayer ? stat.reload() : RELOAD_E;
    return base * (1 + (1 - sh.crew/sh.maxCrew) * 0.8);
  }

  autoFire(sh, t){
    if(!sh.alive || !t || !t.alive) return;
    const range = sh.isPlayer ? stat.range() : RANGE;
    const sx = sh.img.x, sy = sh.img.y, dx = t.img.x - sx, dy = t.img.y - sy, dist = Math.hypot(dx, dy);
    if(dist > range) return;
    const rel = W(Math.atan2(dy, dx) - sh.st.heading);
    if(Math.abs(rel) < FRONT_BLIND || Math.abs(rel) > PI - FRONT_BLIND) return;
    const side = rel > 0 ? 1 : -1;
    if(sh.reload[side] > 0) return;
    sh.reload[side] = this.reloadTime(sh);
    const dmg = sh.isPlayer ? stat.dmg() : DMG + Math.min(sh.lvl, 6);
    const h = sh.st.heading, dir = h + side*PI/2, lead = dist / BALL_SPEED;
    const ax = t.img.x + t.st.vx*lead, ay = t.img.y + t.st.vy*lead;
    for(const k of [-22, 0, 22]){
      const ox = sx + Math.cos(h)*k + Math.cos(dir)*18, oy = sy + Math.sin(h)*k + Math.sin(dir)*18;
      const a = Math.atan2(ay - oy, ax - ox) + (Math.random() - 0.5) * (this.weather.storm ? 0.4 : 0.14);
      this.balls.push({ x:ox, y:oy, vx:Math.cos(a)*BALL_SPEED, vy:Math.sin(a)*BALL_SPEED, life:(dist + 50)/BALL_SPEED, owner:sh, dmg });
      this.fx.push({ t:'smoke', x:ox, y:oy, vx:Math.cos(dir)*30, vy:Math.sin(dir)*30, age:0, life:1.1 });
    }
  }

  thinkEnemy(e, dt, time){
    const p = this.player, s = e.st, h = s.heading, x = e.img.x, y = e.img.y;
    if(!p.alive){ this.stepShip(e, 0.3, 0.3, dt, time); return; }
    const dx = p.img.x - x, dy = p.img.y - y, dist = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    let desired, throttle;
    if(dist > RANGE - 30){ desired = ang; throttle = 0.85; }
    else {
      const a1 = ang + PI/2, a2 = ang - PI/2;
      desired = Math.abs(W(a1-h)) < Math.abs(W(a2-h)) ? a1 : a2;
      throttle = dist < 200 ? 0.8 : 0.55;
    }
    // 앞에 육지가 있으면 비어 있는 쪽으로 꺾음
    const look = 170, probe = a => isLand(x + Math.cos(a)*look, y + Math.sin(a)*look);
    if(probe(h)){ const l = probe(h - 0.8), r = probe(h + 0.8); desired = h + (l && !r ? 1.4 : -1.4); }
    this.stepShip(e, throttle, Phaser.Math.Clamp(W(desired - h)*2, -1, 1), dt, time);
    this.autoFire(e, p);
  }

  hitShip(t, b){
    const h = t.st.heading, c = Math.cos(h), s = Math.sin(h);
    const rx = b.x - t.img.x, ry = b.y - t.img.y, along = Phaser.Math.Clamp(rx*c + ry*s, -36, 36);
    return Math.hypot(rx - c*along, ry - s*along) < 16;
  }

  floatText(x, y, text, color){
    const t = this.add.text(x, y, text, { fontFamily:FONT, fontSize:'15px', fontStyle:'bold', color, stroke:'#0b1e26', strokeThickness:3 }).setOrigin(0.5).setDepth(8);
    this.tweens.add({ targets:t, y:y - 34, alpha:0, duration:900, onComplete:() => t.destroy() });
  }

  damage(t, x, y, dmg){
    const r = Math.random();
    this.fx.push({ t:'flash', x, y, age:0, life:0.25 }, { t:'smoke', x, y, vx:0, vy:-10, age:0, life:1.2 });
    if(r < 0.6){ t.hull -= dmg; this.floatText(x, y, `선체 -${dmg}`, '#e8c172'); for(let i=0;i<3;i++) this.fx.push({ t:'chip', x, y, vx:(Math.random()-.5)*120, vy:(Math.random()-.5)*120, age:0, life:0.6 }); }
    else if(r < 0.85){ t.sail = Math.max(0, t.sail - 12); this.floatText(x, y, '돛 -12', '#f3ecd9'); }
    else if(t.crew > 0){ t.crew -= 1; this.floatText(x, y, '선원 -1', '#ff9a85'); }
    else t.hull -= dmg;
    if(!t.torn && t.sail < 50){ t.torn = true; t.img.setTexture(t.key + '_torn'); }
    if(t.isPlayer && this.shakeCool <= 0){ this.cameras.main.shake(90, 0.005); this.shakeCool = 0.2; }
    if(t.hull <= 0 && t.alive) this.sink(t);
  }

  repair(t){
    t.hull = Math.min(t.maxHull, t.hull + t.maxHull*0.25); t.sail = Math.min(100, t.sail + 30); t.crew = Math.min(t.maxCrew, t.crew + 3);
    if(t.torn && t.sail >= 50){ t.torn = false; t.img.setTexture(t.key); }
  }

  addKill(gold, msg){
    kills++; if(kills > save.best){ save.best = kills; persist(); }
    $kills.textContent = `격침 ${kills} · 최고 ${save.best}`;
    addGold(gold); toast(`${msg} +${gold} 금화`);
    this.enemyT = 50 + Math.random()*40;
  }

  gameOver(title){
    this.player.alive = false;
    const last = this.ports.find(p => p.id === save.lastPort) || this.ports[0];
    $('overTitle').textContent = title;
    const lost = cargoUsed();
    clearCargo();
    $('overSub').textContent = `${lost ? `실었던 짐 ${lost}개를 잃었어요 · ` : ''}금화 ${save.gold} · 강화 유지 · ${last.nm}에서 다시 출항해요`;
    $over.hidden = false;
  }

  sink(t){
    t.alive = false;
    const x = t.img.x, y = t.img.y;
    for(let i = 0; i < 4; i++) this.fx.push({ t:'ring', x, y, age:-i*0.35, life:1.6 });
    for(let i = 0; i < 14; i++) this.fx.push({ t:'bubble', x:x + (Math.random()-.5)*70, y:y + (Math.random()-.5)*30, age:-Math.random()*1.8, life:0.7 });
    for(let i = 0; i < 9; i++){ const a = Math.random()*PI*2, sp = 15 + Math.random()*35;
      this.fx.push({ t:'plank', x:x + (Math.random()-.5)*40, y:y + (Math.random()-.5)*20, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, rot:Math.random()*PI, age:-0.4, life:5 }); }
    for(let i = 0; i < 6; i++) this.fx.push({ t:'smoke', x:x + (Math.random()-.5)*60, y:y + (Math.random()-.5)*30, vx:0, vy:-15, age:-i*0.15, life:1.6 });
    this.tweens.add({ targets:t.img, scaleY:0.25, scaleX:0.8, angle:t.img.angle + 35, alpha:0, duration:2600, ease:'Quad.easeIn',
      onComplete:() => { if(!t.isPlayer){ t.img.destroy(); this.enemies = this.enemies.filter(e => e !== t); } } });
    if(t.isPlayer) this.time.delayedCall(1800, () => this.gameOver('침몰했습니다'));
    else { this.addKill(GOLD_SINK, '해적선 격침!'); this.repair(this.player); }
  }

  startBoarding(e){
    this.boarding = true; this.grapple = 0;
    this.gasId = null; held.L = held.R = false;
    $('dockBtn').hidden = true; this.dockShown = null;
    this.scene.pause();
    this.scene.launch('board', { myCrew:this.player.crew, enemyCrew:e.crew, onEnd: res => this.endBoarding(e, res) });
  }

  endBoarding(e, res){
    this.scene.resume();
    this.boarding = false; this.gasId = null;
    const pl = this.player;
    if(res.win){
      e.alive = false;
      this.floatText(e.img.x, e.img.y - 20, '나포!', '#c9a24a');
      this.tweens.add({ targets:e.img, alpha:0, duration:1200, onComplete:() => { e.img.destroy(); this.enemies = this.enemies.filter(x => x !== e); } });
      this.addKill(GOLD_CAPTURE, '나포 성공!');
      this.repair(pl);
      pl.crew = Math.min(pl.maxCrew, res.survivors + 3);
      this.loot();
    } else this.time.delayedCall(500, () => this.gameOver('백병전 패배'));
  }

  // 나포한 배의 짐 (가장 가까운 항구의 특산품)
  loot(){
    const pl = this.player.img;
    const near = this.ports.reduce((a, p) => Math.hypot(p.x - pl.x, p.y - pl.y) < Math.hypot(a.x - pl.x, a.y - pl.y) ? p : a);
    const pool = GOODS.filter(g => g.from.includes(near.id));
    const g = (pool.length ? pool : GOODS)[Math.floor(Math.random() * (pool.length || GOODS.length))];
    const q = Math.min(cargoSpace(), 4 + Math.floor(Math.random() * 7));
    if(q <= 0){ this.time.delayedCall(1800, () => toast('짐칸이 가득 차 전리품을 못 실었다')); return; }
    addCargo(g.id, q, 0); persist();
    this.time.delayedCall(1800, () => toast(`전리품: ${g.nm} ${q}개`));
  }

  update(time, delta){
    if(this.inPort || this.mapOpen) return; // 항구·지도 화면에선 멈춤
    const dt = Math.min(delta/1000, 0.05);
    const pl = this.player, s = pl.st, k = this.keys, w = this.wasd, cam = this.cameras.main;
    this.shakeCool -= dt;

    // 1) 내 배
    let throttle = 0;
    if(pl.alive){
      if(k.up.isDown || w.W.isDown || this.gasId !== null) throttle = 1;
      let spin = 0;
      if(k.left.isDown || w.A.isDown || held.L) spin -= 1;
      if(k.right.isDown || w.D.isDown || held.R) spin += 1;
      if(throttle || spin) hideHint();
      if(this.stepShip(pl, throttle, 0, dt, time, spin)) cam.shake(120, 0.004);
    }

    // 2) 바람 (천천히 바뀜)
    this.wind.t -= dt;
    if(this.wind.t <= 0){ this.wind.t = 20 + Math.random()*15; this.wind.target = this.wind.a + (Math.random() - 0.5)*PI; }
    this.wind.a += W(this.wind.target - this.wind.a) * Math.min(1, dt*0.3);

    // 3) 폭풍
    const wt = this.weather; wt.t -= dt;
    if(wt.t <= 0){
      wt.storm = !wt.storm;
      wt.t = wt.storm ? 25 : 80 + Math.random()*40;
      this.tweens.add({ targets:this.dark, alpha: wt.storm ? 0.38 : 0, duration:2500 });
      if(wt.storm){ toast('⛈ 폭풍이 몰려온다!'); this.wind.target = this.wind.a + (Math.random() - 0.5)*2; }
      else toast('폭풍이 지나갔다');
    }
    const sg = this.stormG; sg.clear();
    if(wt.storm){
      wt.bolt -= dt;
      if(wt.bolt <= 0){ wt.bolt = 3 + Math.random()*4; cam.flash(140, 210, 225, 255); cam.shake(200, 0.004); }
      const SW2 = this.scale.width, SH2 = this.scale.height, wx = Math.cos(this.wind.a)*0.4;
      sg.lineStyle(1, 0xbfdbe6, 0.35);
      for(const r of this.rain){
        r.y += r.s*dt; r.x += r.s*wx*dt;
        if(r.y > SH2){ r.y = -20; r.x = Math.random()*(SW2 + 200) - 100; }
        if(r.x > SW2 + 50) r.x -= SW2 + 100;
        if(r.x < -50) r.x += SW2 + 100;
        sg.lineBetween(r.x, r.y, r.x - wx*18, r.y - 18);
      }
    }

    // 4) 보급품 통
    this.barrelT -= dt;
    if(this.barrelT <= 0 && this.barrels.length < 5){
      this.barrelT = 12;
      for(let t = 0; t < 30; t++){
        const a = Math.random()*PI*2, d = 300 + Math.random()*700;
        const x = Phaser.Math.Clamp(pl.img.x + Math.cos(a)*d, 100, WORLD_W - 100), y = Phaser.Math.Clamp(pl.img.y + Math.sin(a)*d, 100, WORLD_H - 100);
        if(!isLand(x, y) && !isLand(x + 40, y) && !isLand(x - 40, y)){ this.barrels.push({ x, y, seed:Math.random()*10 }); break; }
      }
    }
    const brg = this.barrelG; brg.clear();
    for(let i = this.barrels.length - 1; i >= 0; i--){
      const b = this.barrels[i];
      const bx = b.x + Math.cos(this.wind.a)*(wt.storm ? 20 : 4)*dt, by = b.y + Math.sin(this.wind.a)*(wt.storm ? 20 : 4)*dt;
      if(!isLand(bx, by)){ b.x = bx; b.y = by; }
      const bd = Math.hypot(b.x - pl.img.x, b.y - pl.img.y);
      if(pl.alive && bd < 42){
        this.barrels.splice(i, 1);
        if(Math.random() < 0.6){ addGold(15); this.floatText(b.x, b.y, '+15 금화', '#c9a24a'); }
        else {
          pl.hull = Math.min(pl.maxHull, pl.hull + pl.maxHull*0.15); pl.sail = Math.min(100, pl.sail + 20);
          if(pl.torn && pl.sail >= 50){ pl.torn = false; pl.img.setTexture(pl.key); }
          this.floatText(b.x, b.y, '수리 자재!', '#bfe3c0');
        }
        this.fx.push({ t:'splash', x:b.x, y:b.y, age:0, life:0.7 });
        continue;
      }
      if(bd > 2500){ this.barrels.splice(i, 1); continue; }
      const bob = Math.sin(time/300 + b.seed)*2;
      brg.fillStyle(0xffffff, .25).fillCircle(b.x, b.y + 3, 14 + bob);
      brg.fillStyle(0x7a4a22, 1).fillCircle(b.x, b.y + bob*0.3, 10);
      brg.lineStyle(2, 0x3a2414, 1).strokeCircle(b.x, b.y + bob*0.3, 10).strokeCircle(b.x, b.y + bob*0.3, 5);
    }

    // 5) 항구 발견·입항
    let near = null, nearD = Infinity, portClose = false;
    for(const p of this.ports){
      const d = Math.hypot(p.x - pl.img.x, p.y - pl.img.y);
      if(d < PORT_FIND_R) this.discover(p);
      if(d < 1000) portClose = true;
      if(d < PORT_DOCK_R && d < nearD){ near = p; nearD = d; }
      if(p.id === this.leftPort && d > 320) this.leftPort = null;
    }

    // 6) 해적 등장·사라짐
    for(const sh of [pl, ...this.enemies]){ sh.reload['-1'] = Math.max(0, sh.reload['-1'] - dt); sh.reload['1'] = Math.max(0, sh.reload['1'] - dt); }
    this.enemyT -= dt;
    if(pl.alive && this.enemyT <= 0 && !this.enemies.some(e => e.alive)){
      if(!portClose && this.spawnEnemy()) this.enemyT = 60 + Math.random()*40;
      else this.enemyT = 5;
    }
    let nearest = null, nd = Infinity;
    for(const e of [...this.enemies]){
      if(!e.alive) continue;
      const d = Math.hypot(e.img.x - pl.img.x, e.img.y - pl.img.y);
      if(d > 2600){ e.alive = false; e.img.destroy(); this.enemies = this.enemies.filter(x => x !== e); this.enemyT = 30; continue; }
      if(d < nd){ nd = d; nearest = e; }
    }
    this.nearestDist = nd;
    this.autoFire(pl, nearest);
    for(const e of this.enemies) if(e.alive) this.thinkEnemy(e, dt, time);

    const dockable = pl.alive && near && near.id !== this.leftPort && nd > 600 ? near : null;
    if((dockable && dockable.id) !== this.dockShown){
      this.dockShown = dockable && dockable.id;
      $('dockBtn').hidden = !dockable;
      if(dockable) $('dockBtn').textContent = `⚓ ${dockable.nm} 입항`;
    }
    this.nearPort = dockable;

    // 7) 갈고리 → 백병전
    if(pl.alive && !this.boarding && nearest && nd < 110){
      this.grapple += dt;
      const kk = Math.exp(-1.5*dt);
      for(const sh of [pl, nearest]){ sh.st.vx *= kk; sh.st.vy *= kk; sh.st.speed *= kk; }
      if(this.grapple >= GRAPPLE_TIME){ this.startBoarding(nearest); return; }
    } else this.grapple = Math.max(0, this.grapple - dt*2);

    // 8) 부서진 배 연기·불
    for(const sh of [pl, ...this.enemies]){
      if(!sh.alive || sh.hull/sh.maxHull >= 0.6) continue;
      sh.dmgT += dt;
      const low = sh.hull/sh.maxHull < 0.3, every = low ? 0.12 : 0.28;
      if(sh.dmgT > every){
        sh.dmgT = 0;
        const off = (Math.random() - 0.5) * 50, h = sh.st.heading;
        const x = sh.img.x + Math.cos(h)*off, y = sh.img.y + Math.sin(h)*off;
        this.fx.push({ t:'smoke', x, y, vx:-sh.st.vx*0.3, vy:-sh.st.vy*0.3 - 10, age:0, life:1.4, dark:true });
        if(low) this.fx.push({ t:'fire', x, y, age:0, life:0.4 });
      }
    }

    // 9) 포탄
    const bg = this.ballG; bg.clear();
    for(let i = this.balls.length - 1; i >= 0; i--){
      const b = this.balls[i]; b.life -= dt; b.x += b.vx*dt; b.y += b.vy*dt;
      let gone = false;
      for(const t of [pl, ...this.enemies]){
        if(t.alive && t.isPlayer !== b.owner.isPlayer && this.hitShip(t, b)){ this.damage(t, b.x, b.y, b.dmg); gone = true; break; }
      }
      if(!gone && isLand(b.x, b.y)){ this.fx.push({ t:'smoke', x:b.x, y:b.y, vx:0, vy:0, age:0, life:0.8 }); gone = true; }
      if(!gone && b.life <= 0){ this.fx.push({ t:'splash', x:b.x, y:b.y, age:0, life:0.7 }); gone = true; }
      if(gone){ this.balls.splice(i, 1); continue; }
      bg.fillStyle(0x000000, .25).fillCircle(b.x+2, b.y+3, 4.5);
      bg.fillStyle(0x1e1e1e, 1).fillCircle(b.x, b.y, 4);
    }

    // 10) 효과
    const lo = this.fxLow, hi = this.fxHigh; lo.clear(); hi.clear();
    for(let i = this.fx.length - 1; i >= 0; i--){
      const f = this.fx[i]; f.age += dt;
      if(f.age > f.life){ this.fx.splice(i, 1); continue; }
      if(f.age < 0) continue;
      const t = f.age / f.life;
      switch(f.t){
        case 'wake':   lo.fillStyle(0xe8f1ef, (1-t)*0.45*f.p).fillCircle(f.x, f.y, 3 + f.age*12); break;
        case 'splash': lo.lineStyle(2, 0xffffff, (1-t)*0.8).strokeCircle(f.x, f.y, 4 + t*18); lo.fillStyle(0xffffff, (1-t)*0.6).fillCircle(f.x, f.y, 5*(1-t)); break;
        case 'ring':   lo.lineStyle(3, 0xe8f1ef, (1-t)*0.6).strokeCircle(f.x, f.y, 20 + t*90); break;
        case 'bubble': lo.lineStyle(1.5, 0xffffff, (1-t)*0.8).strokeCircle(f.x, f.y, 2 + t*4); break;
        case 'plank': {
          f.x += f.vx*dt; f.y += f.vy*dt; f.vx *= 0.985; f.vy *= 0.985; f.rot += dt*0.4;
          const c = Math.cos(f.rot)*8, s2 = Math.sin(f.rot)*8, a = t < 0.7 ? 1 : (1-t)/0.3;
          lo.lineStyle(4, 0x6b4423, a).lineBetween(f.x - c, f.y - s2, f.x + c, f.y + s2); break; }
        case 'chip': f.x += f.vx*dt; f.y += f.vy*dt; hi.fillStyle(0x8a5a32, 1-t).fillRect(f.x-2, f.y-2, 4, 4); break;
        case 'smoke':  f.x += f.vx*dt; f.y += f.vy*dt; hi.fillStyle(f.dark ? 0x4a4542 : 0xd8d2c4, (1-t)*0.55).fillCircle(f.x, f.y, 5 + t*14); break;
        case 'fire':   hi.fillStyle(0xff7a2f, (1-t)*0.9).fillCircle(f.x, f.y, 6*(1-t) + 3); hi.fillStyle(0xffd36b, (1-t)).fillCircle(f.x, f.y, 3*(1-t) + 1); break;
        case 'flash':  hi.fillStyle(0xffb347, 1-t).fillCircle(f.x, f.y, 10 + t*12); break;
      }
    }

    // 11) 사거리 원 + 갈고리
    const ag = this.aimG; ag.clear();
    if(pl.alive){
      const range = stat.range(), inRange = nearest && nd <= range, h = s.heading;
      ag.lineStyle(2, inRange ? 0xc9a24a : 0xf3ecd9, inRange ? 0.7 : 0.18).strokeCircle(pl.img.x, pl.img.y, range);
      if(inRange){
        ag.fillStyle(0x000000, 0.08);
        ag.slice(pl.img.x, pl.img.y, range, h - FRONT_BLIND, h + FRONT_BLIND).fillPath();
        ag.slice(pl.img.x, pl.img.y, range, h + PI - FRONT_BLIND, h + PI + FRONT_BLIND).fillPath();
      }
      if(this.grapple > 0 && nearest){
        const p = Math.min(1, this.grapple / GRAPPLE_TIME);
        ag.lineStyle(2, 0xd9c48f, 0.9);
        ag.lineBetween(pl.img.x, pl.img.y, nearest.img.x, nearest.img.y);
        ag.lineBetween(pl.img.x + Math.cos(h)*25, pl.img.y + Math.sin(h)*25, nearest.img.x, nearest.img.y);
        ag.lineStyle(5, 0xc9a24a, 1); ag.beginPath(); ag.arc(pl.img.x, pl.img.y, 62, -PI/2, -PI/2 + PI*2*p); ag.strokePath();
      }
    }

    // 12) 적 체력바
    const hg = this.hpG; hg.clear();
    for(const e of this.enemies){
      if(!e.alive) continue;
      hg.fillStyle(0x000000, .45).fillRect(e.img.x-30, e.img.y-46, 60, 6);
      hg.fillStyle(0xc9533b, 1).fillRect(e.img.x-30, e.img.y-46, 60*Math.max(0, e.hull)/e.maxHull, 6);
    }

    this.water.tilePositionX = cam.scrollX + time*0.006;
    this.water.tilePositionY = cam.scrollY + time*0.003;

    // 13) 화면 UI: 가속 표시 + 화면 밖 적 화살표
    const ug = this.uiG; ug.clear();
    if(this.gasId !== null){
      const gx = this.gasPos.x, gy = this.gasPos.y;
      ug.lineStyle(3, 0xc9a24a, 0.8).strokeCircle(gx, gy, 34);
      ug.fillStyle(0xc9a24a, 0.85).fillTriangle(gx, gy - 14, gx - 11, gy + 8, gx + 11, gy + 8);
    }
    const SW = this.scale.width, SH = this.scale.height, cx = SW/2, cy = SH/2;
    for(const e of this.enemies){
      if(!e.alive) continue;
      const sx = e.img.x - cam.scrollX, sy = e.img.y - cam.scrollY;
      if(sx > 0 && sx < SW && sy > 0 && sy < SH) continue;
      const a = Math.atan2(sy - cy, sx - cx), tx = Math.cos(a), ty = Math.sin(a);
      const kk = Math.min((SW/2 - 44)/Math.max(Math.abs(tx), 1e-6), (SH/2 - 44)/Math.max(Math.abs(ty), 1e-6));
      const px = cx + tx*kk, py = cy + ty*kk;
      ug.fillStyle(0xc9533b, .9).fillTriangle(px + tx*14, py + ty*14, px - ty*9 - tx*6, py + tx*9 - ty*6, px + ty*9 - tx*6, py - tx*9 - ty*6);
    }

    // 14) 계기판
    $spd.textContent = Math.round(Math.hypot(s.vx, s.vy) / 12);
    $state.textContent = throttle > 0 ? '전속' : '정지';
    $needle.style.transform = `rotate(${s.heading*180/PI + 90}deg)`;
    $('windArrow').style.transform = `rotate(${this.wind.a*180/PI + 90}deg)`;
    $hull.style.width = Math.max(0, pl.hull/pl.maxHull*100) + '%';
    $sail.style.width = Math.max(0, pl.sail) + '%';
    $crew.textContent = `${pl.crew}/${pl.maxCrew}`;
    $('cargoN').textContent = `${cargoUsed()}/${stat.hold()}`;
    this.posT -= dt;
    if(this.posT <= 0){
      this.posT = 0.3;
      const [lon, lat] = toLonLat(pl.img.x, pl.img.y);
      $pos.textContent = `${lat >= 0 ? '북위' : '남위'} ${Math.abs(lat).toFixed(1)}° · ${lon >= 0 ? '동경' : '서경'} ${Math.abs(lon).toFixed(1)}°`;
    }
  }
}
