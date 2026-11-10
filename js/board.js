// ================= 백병전 =================
class Board extends Phaser.Scene {
  constructor(){ super('board'); }
  init(d){ this.d = d; }

  create(){
    document.body.classList.add('boarding');
    const SW = this.scale.width, SH = this.scale.height, top = 70;
    const dw = Math.min(SW*0.94, 900), dh = Math.min(SH - top - 24, 520);
    const A = this.arena = { x:(SW - dw)/2, y: top + (SH - top - 24 - dh)/2, w:dw, h:dh };
    const g = this.add.graphics();
    g.fillStyle(0x174a5e, 1).fillRect(0, 0, SW, SH);
    g.fillStyle(0x8a5a32, 1).fillRect(A.x, A.y, A.w, A.h);
    g.lineStyle(1, 0x6e4626, 1);
    for(let y = A.y + 20; y < A.y + A.h; y += 20) g.lineBetween(A.x, y, A.x + A.w, y);
    const mx = A.x + A.w/2;
    g.fillStyle(0x000000, 0.18).fillRect(mx, A.y, A.w/2, A.h);
    g.fillStyle(0x4a2a14, 1).fillRect(mx - 4, A.y, 8, A.h);
    g.lineStyle(3, 0xd9c48f, 0.8);
    for(let y = A.y + 40; y < A.y + A.h; y += 90) g.lineBetween(mx - 26, y, mx + 26, y + 12);
    g.lineStyle(8, 0x4a2a14, 1).strokeRect(A.x, A.y, A.w, A.h);

    this.units = []; this.fx = [];
    this.cap = this.addUnit('me', A.x + A.w*0.12, A.y + A.h/2, true);
    this.enCap = this.addUnit('en', A.x + A.w*0.88, A.y + A.h/2, true);
    for(let i = 0; i < this.d.myCrew; i++) this.addUnit('me', Phaser.Math.Between(A.x + 20, A.x + A.w*0.4), Phaser.Math.Between(A.y + 20, A.y + A.h - 20), false);
    for(let i = 0; i < this.d.enemyCrew; i++) this.addUnit('en', Phaser.Math.Between(A.x + A.w*0.6, A.x + A.w - 20), Phaser.Math.Between(A.y + 20, A.y + A.h - 20), false);

    this.fxG = this.add.graphics(); this.unitG = this.add.graphics();
    this.joyG = this.add.graphics().setDepth(10);
    this.ended = false; this.dueling = false;

    this.input.addPointer(2);
    this.joy = { id:null, bx:0, by:0, dx:0, dy:0 };
    this.input.on('pointerdown', p => { if(this.joy.id === null) Object.assign(this.joy, { id:p.id, bx:p.x, by:p.y, dx:0, dy:0 }); });
    this.input.on('pointermove', p => {
      if(p.id !== this.joy.id) return;
      let dx = p.x - this.joy.bx, dy = p.y - this.joy.by; const d = Math.hypot(dx, dy);
      if(d > JOY_R){ dx *= JOY_R/d; dy *= JOY_R/d; }
      this.joy.dx = dx; this.joy.dy = dy;
    });
    const release = p => { if(p.id === this.joy.id){ this.joy.id = null; this.joy.dx = this.joy.dy = 0; } };
    this.input.on('pointerup', release); this.input.on('pointerupoutside', release);

    const banner = this.add.text(SW/2, A.y + A.h/2, '백병전!\n선장끼리 맞붙으면 1:1 결투', { fontFamily:FONT, fontSize:'22px', fontStyle:'bold', color:'#f3ecd9', align:'center', stroke:'#0b1e26', strokeThickness:5 }).setOrigin(0.5).setDepth(11);
    this.tweens.add({ targets:banner, alpha:0, delay:1800, duration:700, onComplete:() => banner.destroy() });
  }

  addUnit(team, x, y, captain){
    const u = { team, x, y, captain, alive:true, hp: captain ? 90 : 30, maxHp: captain ? 90 : 30,
      dmg: captain ? 14 : 6, cd: Math.random()*0.6, speed: captain ? 130 : 60 + Math.random()*20, face: team === 'me' ? 0 : PI, swing:0 };
    this.units.push(u); return u;
  }

  nearestFoe(u, skipCap){
    let best = null, bd = Infinity;
    for(const o of this.units){
      if(!o.alive || o.team === u.team) continue;
      if(skipCap && o.captain) continue;
      const d = Math.hypot(o.x - u.x, o.y - u.y); if(d < bd){ bd = d; best = o; }
    }
    return [best, bd];
  }

  startDuel(){
    this.dueling = true;
    this.joy.id = null; this.joy.dx = this.joy.dy = 0;
    this.cameras.main.flash(250, 255, 255, 255);
    this.scene.pause();
    this.scene.launch('duel', { myHp:this.cap.hp, myMax:this.cap.maxHp, enHp:this.enCap.hp, enMax:this.enCap.maxHp, onEnd: res => this.endDuel(res) });
  }

  endDuel(res){
    this.scene.resume();
    this.joy.id = null; this.joy.dx = this.joy.dy = 0;
    this.cap.hp = res.myHp;
    if(res.win){
      this.enCap.alive = false;
      this.fx.push({ t:'down', x:this.enCap.x, y:this.enCap.y, team:'en', age:0, life:2.5 });
      for(const u of this.units) if(u.alive && u.team === 'en'){ u.alive = false; this.fx.push({ t:'flag', x:u.x, y:u.y, age:0, life:3 }); }
      this.finish(true, '적 선원 항복!');
    } else { this.cap.alive = false; this.finish(false); }
  }

  update(time, delta){
    const dt = Math.min(delta/1000, 0.05), A = this.arena, REACH = 24;
    for(const u of this.units){
      if(!u.alive) continue;
      u.swing = Math.max(0, u.swing - dt);
      const [t, d] = this.nearestFoe(u, u.captain); // 선장은 선원만 공격 (선장끼리는 결투)
      if(u === this.cap){
        const m = Math.hypot(this.joy.dx, this.joy.dy) / JOY_R;
        if(this.joy.id !== null && m > 0.1){ const a = Math.atan2(this.joy.dy, this.joy.dx); u.x += Math.cos(a)*u.speed*m*dt; u.y += Math.sin(a)*u.speed*m*dt; u.face = a; }
      } else if(u === this.enCap){ // 적 선장: 내 선장을 찾아옴
        const c = this.cap; if(c.alive){ const a = Math.atan2(c.y - u.y, c.x - u.x); u.face = a; u.x += Math.cos(a)*u.speed*0.45*dt; u.y += Math.sin(a)*u.speed*0.45*dt; }
      } else if(t && d > REACH - 4){
        const a = Math.atan2(t.y - u.y, t.x - u.x); u.face = a;
        u.x += Math.cos(a)*u.speed*dt; u.y += Math.sin(a)*u.speed*dt;
      }
      u.cd -= dt;
      if(!this.ended && t && d <= REACH + (u.captain ? 6 : 0) && u.cd <= 0){
        u.cd = u.captain ? 0.55 : 0.85; u.swing = 0.18; u.face = Math.atan2(t.y - u.y, t.x - u.x);
        t.hp -= u.dmg * (0.8 + Math.random()*0.4);
        this.fx.push({ t:'hit', x:t.x, y:t.y, age:0, life:0.2 });
        if(t.hp <= 0){ t.alive = false; this.fx.push({ t:'down', x:t.x, y:t.y, team:t.team, age:0, life:2.5 }); }
      }
    }
    const alive = this.units.filter(u => u.alive);
    for(let i = 0; i < alive.length; i++) for(let j = i + 1; j < alive.length; j++){
      const a = alive[i], b = alive[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = (a.captain ? 12 : 9) + (b.captain ? 12 : 9);
      if(d < min && d > 0){ const push = (min - d)/2, nx = dx/d, ny = dy/d; a.x -= nx*push; a.y -= ny*push; b.x += nx*push; b.y += ny*push; }
    }
    for(const u of alive){ u.x = Phaser.Math.Clamp(u.x, A.x + 12, A.x + A.w - 12); u.y = Phaser.Math.Clamp(u.y, A.y + 12, A.y + A.h - 12); }

    // 선장끼리 가까우면 결투!
    if(!this.ended && !this.dueling && this.cap.alive && this.enCap.alive && Math.hypot(this.cap.x - this.enCap.x, this.cap.y - this.enCap.y) < 46){
      this.startDuel(); return;
    }

    const fg = this.fxG; fg.clear();
    for(let i = this.fx.length - 1; i >= 0; i--){
      const f = this.fx[i]; f.age += dt;
      if(f.age > f.life){ this.fx.splice(i, 1); continue; }
      const t = f.age / f.life;
      if(f.t === 'hit') fg.fillStyle(0xffffff, 1 - t).fillCircle(f.x, f.y, 6 + t*8);
      else if(f.t === 'flag'){ const a = t < 0.7 ? 1 : (1 - t)/0.3; fg.lineStyle(2, 0x3b3633, a).lineBetween(f.x, f.y + 8, f.x, f.y - 14); fg.fillStyle(0xffffff, a).fillRect(f.x, f.y - 14, 12, 8); }
      else { fg.lineStyle(3, f.team === 'me' ? 0xf3ecd9 : 0x3b3633, (1 - t)*0.8); fg.lineBetween(f.x - 6, f.y - 6, f.x + 6, f.y + 6); fg.lineBetween(f.x - 6, f.y + 6, f.x + 6, f.y - 6); }
    }
    const ug = this.unitG; ug.clear();
    if(this.cap.alive) ug.lineStyle(2, 0xc9a24a, 0.5).strokeCircle(this.cap.x, this.cap.y, 20);
    if(this.enCap.alive) ug.lineStyle(2, 0xc9533b, 0.5).strokeCircle(this.enCap.x, this.enCap.y, 20);
    for(const u of alive){
      const r = u.captain ? 12 : 9, me = u.team === 'me';
      ug.fillStyle(0x000000, .25).fillCircle(u.x + 2, u.y + 3, r);
      ug.fillStyle(me ? 0xf3ecd9 : 0x3b3633, 1).fillCircle(u.x, u.y, r);
      ug.lineStyle(2, me ? 0xc9a24a : 0xc9533b, 1).strokeCircle(u.x, u.y, r);
      if(u.captain) ug.fillStyle(me ? 0x2a1a0c : 0xc9533b, 1).fillCircle(u.x, u.y, 5);
      const len = r + (u.swing > 0 ? 12 : 7), a = u.face + (u.swing > 0 ? (u.swing/0.18 - 0.5)*1.6 : 0.6);
      ug.lineStyle(2, 0xdedede, 1).lineBetween(u.x + Math.cos(a)*r*0.6, u.y + Math.sin(a)*r*0.6, u.x + Math.cos(a)*len, u.y + Math.sin(a)*len);
      if(u.hp < u.maxHp){ ug.fillStyle(0x000000, .5).fillRect(u.x - 10, u.y - r - 7, 20, 3); ug.fillStyle(me ? 0xc9a24a : 0xc9533b, 1).fillRect(u.x - 10, u.y - r - 7, 20*Math.max(0, u.hp)/u.maxHp, 3); }
    }
    const jg = this.joyG; jg.clear();
    if(this.joy.id !== null){
      jg.lineStyle(2, 0xf3ecd9, .5).strokeCircle(this.joy.bx, this.joy.by, JOY_R);
      jg.fillStyle(0xc9a24a, .85).fillCircle(this.joy.bx + this.joy.dx, this.joy.by + this.joy.dy, 22);
    }

    const meN = alive.filter(u => u.team === 'me').length, enN = alive.filter(u => u.team === 'en').length;
    $('bMe').textContent = meN; $('bEn').textContent = enN;
    $('capF').style.width = Math.max(0, this.cap.hp/this.cap.maxHp*100) + '%';
    if(!this.ended){
      if(enN === 0) this.finish(true);
      else if(!this.cap.alive) this.finish(false);
    }
  }

  finish(win, msg){
    this.ended = true;
    this.add.text(this.scale.width/2, this.scale.height/2, msg || (win ? '나포 성공!' : '선장이 쓰러졌다…'), { fontFamily:FONT, fontSize:'30px', fontStyle:'bold', color: win ? '#c9a24a' : '#ff9a85', stroke:'#0b1e26', strokeThickness:6 }).setOrigin(0.5).setDepth(12);
    const survivors = this.units.filter(u => u.team === 'me' && !u.captain && u.alive).length;
    this.time.delayedCall(1500, () => {
      document.body.classList.remove('boarding');
      this.d.onEnd({ win, survivors });
      this.scene.stop();
    });
  }
}
