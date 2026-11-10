// ================= 1:1 결투 (선미 갑판, 밤) =================
class Duel extends Phaser.Scene {
  constructor(){ super('duel'); }
  init(d){ this.d = d; }

  create(){
    document.body.classList.add('duel');
    const SW = this.scale.width, SH = this.scale.height;
    const cx = SW/2, cy = SH/2 + 24, R = Math.max(110, Math.min(SW*0.44, (SH - 150)/2, 250));
    this.A = { cx, cy, R };

    const g = this.add.graphics();
    g.fillStyle(0x07151b, 1).fillRect(0, 0, SW, SH);
    g.fillStyle(0x0d2a36, 1).fillCircle(cx, cy, R + 120);       // 어두운 바다
    g.fillStyle(0x3a2414, 1).fillCircle(cx, cy, R + 14);        // 난간
    g.fillStyle(0x6b4424, 1).fillCircle(cx, cy, R);             // 갑판
    g.lineStyle(1, 0x553519, 1);
    for(let y = -R + 18; y < R; y += 18){ const hw = Math.sqrt(R*R - y*y); g.lineBetween(cx - hw, cy + y, cx + hw, cy + y); }
    // 키(조타륜) 장식
    const wx = cx, wy = cy - R*0.72;
    g.lineStyle(4, 0x3a2414, 0.9).strokeCircle(wx, wy, 16);
    for(let i = 0; i < 8; i++){ const a = i*PI/4; g.lineBetween(wx + Math.cos(a)*6, wy + Math.sin(a)*6, wx + Math.cos(a)*24, wy + Math.sin(a)*24); }
    g.lineStyle(6, 0x2a190d, 1).strokeCircle(cx, cy, R + 10);

    this.lanterns = [0.75, 2.4, 3.9, 5.5].map(a => ({ x: cx + Math.cos(a)*(R + 10), y: cy + Math.sin(a)*(R + 10), seed: Math.random()*10 }));
    this.light = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.fxG = this.add.graphics(); this.fG = this.add.graphics(); this.rainG = this.add.graphics().setDepth(5);
    this.joyG = this.add.graphics().setDepth(10);
    this.rain = Array.from({ length:70 }, () => ({ x:Math.random()*SW, y:Math.random()*SH, s:400 + Math.random()*250 }));

    const base = { r:20, cd:0, swing:0, hitDone:true, block:false, blockT:0, stun:0, kx:0, ky:0, flash:0 };
    this.me = { ...base, x:cx - R*0.5, y:cy, face:0, hp:this.d.myHp, max:this.d.myMax };
    this.en = { ...base, x:cx + R*0.5, y:cy, face:PI, hp:this.d.enHp, max:this.d.enMax, cd:1.2, state:'approach', t:0, strafe:1 };
    this.fx = []; this.hitStop = 0; this.slow = 1; this.ended = false; this.ready = false;

    this.input.addPointer(2);
    this.joy = { id:null, bx:0, by:0, dx:0, dy:0 };
    this.input.on('pointerdown', p => { if(this.joy.id === null && p.x < this.scale.width*0.6) Object.assign(this.joy, { id:p.id, bx:p.x, by:p.y, dx:0, dy:0 }); });
    this.input.on('pointermove', p => {
      if(p.id !== this.joy.id) return;
      let dx = p.x - this.joy.bx, dy = p.y - this.joy.by; const d = Math.hypot(dx, dy);
      if(d > JOY_R){ dx *= JOY_R/d; dy *= JOY_R/d; }
      this.joy.dx = dx; this.joy.dy = dy;
    });
    const release = p => { if(p.id === this.joy.id){ this.joy.id = null; this.joy.dx = this.joy.dy = 0; } };
    this.input.on('pointerup', release); this.input.on('pointerupoutside', release);
    this.keys = this.input.keyboard.addKeys('SPACE,SHIFT,W,A,S,D,UP,DOWN,LEFT,RIGHT');
    atkTap = false;

    // 인트로
    const t1 = this.add.text(cx, cy - 20, '1 : 1 결투', { fontFamily:FONT, fontSize:'42px', fontStyle:'bold', color:'#c9a24a', stroke:'#000', strokeThickness:7 }).setOrigin(0.5).setDepth(20).setScale(2.2).setAlpha(0);
    const t2 = this.add.text(cx, cy + 28, '적이 붉게 빛나면 그때 막기!', { fontFamily:FONT, fontSize:'17px', color:'#f3ecd9', stroke:'#000', strokeThickness:4 }).setOrigin(0.5).setDepth(20).setAlpha(0);
    this.tweens.add({ targets:t1, scale:1, alpha:1, duration:350, ease:'Back.easeOut' });
    this.tweens.add({ targets:t2, alpha:1, delay:250, duration:300 });
    this.cameras.main.shake(200, 0.006);
    this.time.delayedCall(1400, () => {
      this.ready = true;
      this.tweens.add({ targets:[t1, t2], alpha:0, duration:300, onComplete:() => { t1.destroy(); t2.destroy(); } });
    });
  }

  say(x, y, text, color, size = 18){
    const t = this.add.text(x, y, text, { fontFamily:FONT, fontSize:size + 'px', fontStyle:'bold', color, stroke:'#000', strokeThickness:4 }).setOrigin(0.5).setDepth(15);
    this.tweens.add({ targets:t, y:y - 40, alpha:0, duration:800, onComplete:() => t.destroy() });
  }

  sparks(x, y, n, color){
    for(let i = 0; i < n; i++){ const a = Math.random()*PI*2, s = 80 + Math.random()*220; this.fx.push({ t:'spark', x, y, vx:Math.cos(a)*s, vy:Math.sin(a)*s, age:0, life:0.3 + Math.random()*0.2, c:color }); }
  }

  facing(a, b, tol){ return Math.abs(W(Math.atan2(b.y - a.y, b.x - a.x) - a.face)) < tol; }

  hit(target, from, dmg){
    target.hp -= dmg; target.flash = 0.15;
    const a = Math.atan2(target.y - from.y, target.x - from.x);
    target.kx = Math.cos(a)*260; target.ky = Math.sin(a)*260;
    this.fx.push({ t:'slash', x:target.x, y:target.y, a: a + PI/2, age:0, life:0.22 });
    this.sparks(target.x, target.y, 8, 0xffd1a1);
    this.say(target.x, target.y - 30, `-${Math.round(dmg)}`, target === this.me ? '#ff9a85' : '#f3ecd9');
    this.hitStop = 0.07;
    this.cameras.main.shake(110, target === this.me ? 0.01 : 0.006);
    if(target.hp <= 0) this.end(target === this.en);
  }

  end(win){
    if(this.ended) return;
    this.ended = true; this.slow = 0.25;
    this.cameras.main.flash(300, 255, 240, 220);
    this.time.delayedCall(700, () => {
      this.slow = 1;
      const { cx, cy } = this.A;
      const t = this.add.text(cx, cy, win ? '적 선장 격파!' : '패배…', { fontFamily:FONT, fontSize:'38px', fontStyle:'bold', color: win ? '#c9a24a' : '#ff9a85', stroke:'#000', strokeThickness:7 }).setOrigin(0.5).setDepth(20).setScale(1.6);
      this.tweens.add({ targets:t, scale:1, duration:300, ease:'Back.easeOut' });
    });
    this.time.delayedCall(2100, () => {
      document.body.classList.remove('duel');
      this.d.onEnd({ win, myHp: Math.max(1, this.me.hp) });
      this.scene.stop();
    });
  }

  update(time, delta){
    let dt = Math.min(delta/1000, 0.05);
    const me = this.me, en = this.en, A = this.A, k = this.keys;
    const SW = this.scale.width, SH = this.scale.height;

    // 비
    const rg = this.rainG; rg.clear(); rg.lineStyle(1, 0x9fc4d1, 0.28);
    for(const r of this.rain){ r.y += r.s*dt; r.x -= r.s*0.25*dt; if(r.y > SH){ r.y = -20; r.x = Math.random()*(SW + 100); } rg.lineBetween(r.x, r.y, r.x + 4, r.y - 16); }

    if(this.hitStop > 0){ this.hitStop -= dt; dt = 0; }
    dt *= this.slow;

    const atk = atkTap || Phaser.Input.Keyboard.JustDown(k.SPACE); atkTap = false;
    const blk = held.blk || k.SHIFT.isDown;
    const dist = Math.hypot(en.x - me.x, en.y - me.y);
    const REACH = 64;

    if(dt > 0){
      // ---- 나 ----
      me.cd -= dt; me.flash = Math.max(0, me.flash - dt); me.stun = Math.max(0, me.stun - dt);
      const prevSwing = me.swing; me.swing = Math.max(0, me.swing - dt);
      me.face = Math.atan2(en.y - me.y, en.x - me.x); // 항상 적을 바라봄
      if(this.ready && !this.ended && me.stun <= 0){
        if(blk && !me.block){ me.block = true; me.blockT = 0; }
        if(!blk) me.block = false;
        if(me.block) me.blockT += dt;
        let mx = 0, my = 0;
        const m = Math.hypot(this.joy.dx, this.joy.dy) / JOY_R;
        if(this.joy.id !== null && m > 0.1){ mx = this.joy.dx/JOY_R; my = this.joy.dy/JOY_R; }
        if(k.A.isDown || k.LEFT.isDown) mx = -1; if(k.D.isDown || k.RIGHT.isDown) mx = 1;
        if(k.W.isDown || k.UP.isDown) my = -1; if(k.S.isDown || k.DOWN.isDown) my = 1;
        const sp = 150 * (me.block ? 0.4 : 1);
        me.x += mx*sp*dt; me.y += my*sp*dt;
        if(atk && me.cd <= 0 && !me.block){ me.cd = 0.5; me.swing = 0.22; me.hitDone = false; }
      } else me.block = false;
      if(me.swing > 0 && me.swing < 0.12 && !me.hitDone){
        me.hitDone = true;
        if(dist <= REACH && this.facing(me, en, 1.2)){
          if(en.block && this.facing(en, me, 1.3) && en.stun <= 0){
            this.sparks((me.x + en.x)/2, (me.y + en.y)/2, 10, 0xffffff); this.say(en.x, en.y - 30, '막음', '#f3ecd9', 15);
            me.kx = -Math.cos(me.face)*220; me.ky = -Math.sin(me.face)*220; this.cameras.main.shake(60, 0.003);
          } else this.hit(en, me, 12 * (en.stun > 0 ? 1.6 : 1) * (0.9 + Math.random()*0.2));
        }
      }

      // ---- 적 선장 ----
      en.cd -= dt; en.flash = Math.max(0, en.flash - dt);
      const toMe = Math.atan2(me.y - en.y, me.x - en.x);
      en.face += W(toMe - en.face) * Math.min(1, dt*10);
      const rage = en.hp/en.max < 0.4; // 체력 낮으면 더 빨라짐
      if(en.stun > 0){ en.stun -= dt; en.state = 'approach'; en.block = false; en.swing = 0; }
      else if(this.ready && !this.ended) switch(en.state){
        case 'approach': {
          if(dist > 60){ en.x += Math.cos(toMe)*115*dt; en.y += Math.sin(toMe)*115*dt; }
          else { const sa = toMe + PI/2*en.strafe; en.x += Math.cos(sa)*65*dt; en.y += Math.sin(sa)*65*dt; if(Math.random() < dt*0.8) en.strafe *= -1; }
          if(dist > 120 && Math.random() < dt*0.7){ en.kx = Math.cos(toMe)*420; en.ky = Math.sin(toMe)*420; } // 돌진
          if(me.swing > 0.18 && prevSwing === 0 && dist < 80 && Math.random() < (rage ? 0.25 : 0.4)){ en.state = 'block'; en.t = 0.5; en.block = true; }
          else if(en.cd <= 0 && dist < 75){ en.state = 'windup'; en.t = rage ? 0.33 : 0.45; }
          break; }
        case 'windup':
          en.x -= Math.cos(toMe)*25*dt; en.y -= Math.sin(toMe)*25*dt;
          en.t -= dt; if(en.t <= 0){ en.state = 'strike'; en.swing = 0.22; en.hitDone = false; }
          break;
        case 'strike':
          en.x += Math.cos(toMe)*170*dt; en.y += Math.sin(toMe)*170*dt;
          en.swing = Math.max(0, en.swing - dt);
          if(en.swing < 0.12 && !en.hitDone){
            en.hitDone = true;
            if(dist <= REACH + 4 && this.facing(en, me, 1.2)){
              if(me.block && this.facing(me, en, 1.3)){
                if(me.blockT < 0.3){ // 타이밍 좋게 막음 → 패리
                  en.stun = 1.1; this.say(me.x, me.y - 34, '패리!', '#c9a24a', 24);
                  this.sparks((me.x + en.x)/2, (me.y + en.y)/2, 18, 0xc9a24a);
                  en.kx = Math.cos(toMe + PI)*300; en.ky = Math.sin(toMe + PI)*300;
                  this.hitStop = 0.12; this.cameras.main.shake(120, 0.008);
                } else {
                  me.hp -= 2; this.say(me.x, me.y - 30, '막음', '#f3ecd9', 15);
                  this.sparks((me.x + en.x)/2, (me.y + en.y)/2, 8, 0xffffff);
                  me.kx = -Math.cos(me.face)*200; me.ky = -Math.sin(me.face)*200;
                  if(me.hp <= 0) this.end(false);
                }
              } else this.hit(me, en, (rage ? 13 : 11) * (0.9 + Math.random()*0.2));
            }
          }
          if(en.swing <= 0){ en.state = 'recover'; en.t = 0.45; }
          break;
        case 'recover':
          en.t -= dt; if(en.t <= 0){ en.state = 'approach'; en.cd = (rage ? 0.3 : 0.6) + Math.random()*0.9; }
          break;
        case 'block':
          en.t -= dt; if(en.t <= 0){ en.block = false; en.state = 'approach'; }
          break;
      }

      // 밀려남 + 갑판 밖으로 못 나감 + 서로 겹치지 않게
      for(const f of [me, en]){
        f.x += f.kx*dt; f.y += f.ky*dt; const d = Math.exp(-8*dt); f.kx *= d; f.ky *= d;
        const dx = f.x - A.cx, dy = f.y - A.cy, dd = Math.hypot(dx, dy), lim = A.R - f.r;
        if(dd > lim){ f.x = A.cx + dx/dd*lim; f.y = A.cy + dy/dd*lim; }
      }
      const dx = en.x - me.x, dy = en.y - me.y, dd = Math.hypot(dx, dy);
      if(dd < 42 && dd > 0){ const p = (42 - dd)/2; me.x -= dx/dd*p; me.y -= dy/dd*p; en.x += dx/dd*p; en.y += dy/dd*p; }
    }

    // ---- 그리기 ----
    const L = this.light; L.clear();
    for(const l of this.lanterns){
      const fl = 0.5 + 0.5*Math.sin(time/90 + l.seed) * Math.sin(time/230 + l.seed*2);
      L.fillStyle(0xffa64a, 0.07 + fl*0.04).fillCircle(l.x, l.y, 90);
      L.fillStyle(0xffc46b, 0.12 + fl*0.05).fillCircle(l.x, l.y, 40);
      L.fillStyle(0xffe2a8, 0.9).fillCircle(l.x, l.y, 5);
    }

    const fg = this.fxG; fg.clear();
    for(let i = this.fx.length - 1; i >= 0; i--){
      const f = this.fx[i]; f.age += dt || 0.0001;
      if(f.age > f.life){ this.fx.splice(i, 1); continue; }
      const t = f.age / f.life;
      if(f.t === 'spark'){ f.x += f.vx*dt; f.y += f.vy*dt; fg.fillStyle(f.c, 1 - t).fillCircle(f.x, f.y, 2.5*(1 - t) + 1); }
      else if(f.t === 'slash'){ const l = 34, c = Math.cos(f.a)*l, s = Math.sin(f.a)*l; fg.lineStyle(5*(1 - t) + 1, 0xffffff, 1 - t).lineBetween(f.x - c, f.y - s, f.x + c, f.y + s); }
    }

    const G = this.fG; G.clear();
    const drawF = (f, me2) => {
      const body = me2 ? 0xf3ecd9 : 0x2f2a28, rim = me2 ? 0xc9a24a : 0xc9533b;
      G.fillStyle(0x000000, .35).fillEllipse(f.x + 3, f.y + 5, f.r*2.2, f.r*1.6);
      // 적 공격 준비: 붉게 빛남
      if(!me2 && f.state === 'windup'){ const p = 1 - f.t/0.45; G.fillStyle(0xff3b2f, 0.25 + 0.35*p).fillCircle(f.x, f.y, f.r + 10 + p*8); }
      G.fillStyle(f.flash > 0 ? 0xffffff : body, 1).fillCircle(f.x, f.y, f.r);
      G.lineStyle(3, rim, 1).strokeCircle(f.x, f.y, f.r);
      // 모자
      const hx = f.x + Math.cos(f.face)*3, hy = f.y + Math.sin(f.face)*3;
      G.fillStyle(me2 ? 0x2a1a0c : 0x14100e, 1).fillTriangle(
        hx + Math.cos(f.face)*12, hy + Math.sin(f.face)*12,
        hx + Math.cos(f.face + 2.4)*12, hy + Math.sin(f.face + 2.4)*12,
        hx + Math.cos(f.face - 2.4)*12, hy + Math.sin(f.face - 2.4)*12);
      // 칼
      let a = f.face + 0.7, len = f.r + 26;
      if(f.swing > 0){ const p = 1 - f.swing/0.22; a = f.face - 1.3 + p*2.6; }
      if(f.block){ a = f.face + PI/2; len = f.r + 18; }
      if(!me2 && f.state === 'windup') a = f.face - 1.6;
      const bx = f.x + Math.cos(f.face)*(f.block ? f.r + 4 : 0), by = f.y + Math.sin(f.face)*(f.block ? f.r + 4 : 0);
      if(f.block){ G.lineStyle(3, 0xbfe3ff, 0.6); G.beginPath(); G.arc(f.x, f.y, f.r + 12, f.face - 0.9, f.face + 0.9); G.strokePath(); }
      if(f.swing > 0){ G.lineStyle(10, 0xffffff, 0.18); G.beginPath(); G.arc(f.x, f.y, f.r + 18, f.face - 1.3, a); G.strokePath(); }
      G.lineStyle(4, 0xe6e6e6, 1).lineBetween(bx - Math.cos(a)*(f.block ? 18 : -f.r*0.5), by - Math.sin(a)*(f.block ? 18 : -f.r*0.5), bx + Math.cos(a)*(f.block ? 18 : len), by + Math.sin(a)*(f.block ? 18 : len));
      if(f.stun > 0){ for(let i = 0; i < 3; i++){ const sa = time/150 + i*2.1; G.fillStyle(0xffd36b, 1).fillCircle(f.x + Math.cos(sa)*16, f.y - f.r - 8 + Math.sin(sa)*5, 3); } }
    };
    drawF(en, false); drawF(me, true);

    const jg = this.joyG; jg.clear();
    if(this.joy.id !== null){
      jg.lineStyle(2, 0xf3ecd9, .5).strokeCircle(this.joy.bx, this.joy.by, JOY_R);
      jg.fillStyle(0xc9a24a, .85).fillCircle(this.joy.bx + this.joy.dx, this.joy.by + this.joy.dy, 22);
    }
    $('dMe').style.width = Math.max(0, me.hp/me.max*100) + '%';
    $('dEn').style.width = Math.max(0, en.hp/en.max*100) + '%';
  }
}
