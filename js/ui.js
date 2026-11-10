// ================= 항구·정비소·지도·이야기 화면 =================
const $port = $('port'), $map = $('map'), $intro = $('intro'), $dock = $('dockBtn');
const seaScene = () => game.scene.getScene('sea');

// ---------- 항구 ----------
const repairCost = pl => Math.ceil((pl.maxHull - pl.hull)*0.4 + (100 - pl.sail)*0.2);

function portStatus(){
  const pl = seaScene().player;
  $('pStatus').innerHTML = `선체 <b>${Math.ceil(pl.hull)}/${pl.maxHull}</b> · 돛 <b>${Math.ceil(pl.sail)}%</b> · 선원 <b>${pl.crew}/${pl.maxCrew}</b> · 금화 <b>${save.gold}</b>`;
  $('pStatus').innerHTML += ` · 짐 <b>${cargoUsed()}/${stat.hold()}</b>`;
  $('cargoN').textContent = `${cargoUsed()}/${stat.hold()}`;
  const rc = repairCost(pl);
  $('pRepair').textContent = rc > 0 ? `수리 · ${rc} 금화` : '수리 · 필요 없음';
  $('pRepair').disabled = rc === 0 || save.gold < rc;
  const need = pl.maxCrew - pl.crew, n = Math.min(need, Math.floor(save.gold / CREW_COST));
  $('pCrew').textContent = need === 0 ? '선원 모집 · 가득 참' : `선원 모집 · ${n}명 ${n*CREW_COST} 금화`;
  $('pCrew').disabled = n === 0;
}

function openPort(sea, p){
  sea.inPort = p; sea.gasId = null; held.L = held.R = false;
  const pl = sea.player;
  pl.img.x = p.x; pl.img.y = p.y; pl.st.vx = pl.st.vy = pl.st.speed = 0;
  pl.st.heading = p.out; pl.img.rotation = p.out;
  sea.cameras.main.centerOn(p.x, p.y);
  save.lastPort = p.id; persist();
  $('pRegion').textContent = p.region;
  $('pName').textContent = p.nm;
  $('pOrg').textContent = p.org;
  $('pDesc').textContent = p.desc;
  $('pRumor').hidden = true;
  $dock.hidden = true; sea.dockShown = null;
  portStatus();
  if(!save.introSeen){ $intro.hidden = false; return; }
  $port.hidden = false;
}

$('introGo').addEventListener('click', () => {
  save.introSeen = true; addGold(150); $intro.hidden = true; portStatus(); $port.hidden = false;
  toast('아버지가 남긴 금화 150닢을 받았다');
});

$dock.addEventListener('click', () => { const sea = seaScene(); if(sea.nearPort) openPort(sea, sea.nearPort); });

$('pRepair').addEventListener('click', () => {
  const pl = seaScene().player, c = repairCost(pl);
  if(c === 0 || save.gold < c) return;
  addGold(-c); pl.hull = pl.maxHull; pl.sail = 100;
  if(pl.torn){ pl.torn = false; pl.img.setTexture(pl.key); }
  portStatus();
});
$('pCrew').addEventListener('click', () => {
  const pl = seaScene().player, n = Math.min(pl.maxCrew - pl.crew, Math.floor(save.gold / CREW_COST));
  if(n <= 0) return;
  addGold(-n*CREW_COST); pl.crew += n; portStatus();
});
$('pTavern').addEventListener('click', () => {
  const p = seaScene().inPort; if(!p) return;
  const r = $('pRumor'), list = p.rumors;
  let pick = list[Math.floor(Math.random()*list.length)];
  if(list.length > 1) while(pick === r.dataset.last) pick = list[Math.floor(Math.random()*list.length)];
  if(Math.random() < 0.5){ const m = marketRumor(p.id); if(m && m !== r.dataset.last) pick = m; }
  r.dataset.last = pick; r.textContent = `“${pick}”`; r.hidden = false;
});
$('pTrade').addEventListener('click', () => { $port.hidden = true; renderTrade(); $trade.hidden = false; });
$('tClose').addEventListener('click', () => { $trade.hidden = true; portStatus(); $port.hidden = false; });
$('pShip').addEventListener('click', () => { $port.hidden = true; renderShop(); $shop.hidden = false; });
$('pLeave').addEventListener('click', () => {
  const sea = seaScene(), p = sea.inPort;
  $port.hidden = true; sea.inPort = null; sea.leftPort = p ? p.id : null;
  hintShown = true; $hint.style.opacity = 1;
});

// ---------- 조선소 (강화) ----------
function renderShop(){
  showGold();
  $('upList').innerHTML = UPG.map(u => {
    const lv = save.up[u.k], max = lv >= MAX_LV, c = cost(lv);
    const dots = '●'.repeat(lv) + '○'.repeat(MAX_LV - lv);
    const desc = max ? u.ds(lv) : `${u.ds(lv)} → ${u.ds(lv + 1).replace(/^[^\d+]*/, '')}`;
    return `<div class="up"><div><span class="nm">${u.nm}</span><span class="lv">${dots}</span></div>
      <div class="ds">${desc}</div>
      <button data-k="${u.k}" ${max || save.gold < c ? 'disabled' : ''}>${max ? '최대' : c + ' 금화'}</button></div>`;
  }).join('');
}
$('upList').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]'); if(!b) return;
  const k = b.dataset.k, lv = save.up[k], c = cost(lv);
  if(lv >= MAX_LV || save.gold < c) return;
  save.gold -= c; save.up[k]++; persist();
  seaScene().applyUpgrades();
  renderShop();
});
$('closeShop').addEventListener('click', () => { $shop.hidden = true; portStatus(); $port.hidden = false; });

// ---------- 세계 지도 ----------
function drawMap(){
  const sea = seaScene(), c = $('mapCanvas');
  const Wd = c.clientWidth, Ht = c.clientHeight, dpr = window.devicePixelRatio || 1;
  c.width = Wd*dpr; c.height = Ht*dpr;
  const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = Math.min(Wd/WORLD_W, Ht/WORLD_H), ox = (Wd - WORLD_W*s)/2, oy = (Ht - WORLD_H*s)/2;
  const path = P => { ctx.beginPath(); P.p.forEach(([x, y], i) => i ? ctx.lineTo(ox + x*s, oy + y*s) : ctx.moveTo(ox + x*s, oy + y*s)); ctx.closePath(); };
  ctx.save();
  ctx.beginPath(); ctx.rect(ox, oy, WORLD_W*s, WORLD_H*s); ctx.clip();
  ctx.fillStyle = '#1d5a73'; ctx.fillRect(ox, oy, WORLD_W*s, WORLD_H*s);
  ctx.lineWidth = 1.2; ctx.strokeStyle = '#d9c48f';
  ctx.fillStyle = '#8f9e6b'; path(MAINLAND); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1d5a73'; for(const C of CARVES){ path(C); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = '#8f9e6b'; for(const I of ISLANDS){ path(I); ctx.fill(); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
  for(let lon = LON0; lon <= LON1; lon += 10){ const [x] = geo(lon, 0); ctx.beginPath(); ctx.moveTo(ox + x*s, oy); ctx.lineTo(ox + x*s, oy + WORLD_H*s); ctx.stroke(); }
  for(let lat = -40; lat <= LAT1; lat += 10){ const [, y] = geo(0, lat); ctx.beginPath(); ctx.moveTo(ox, oy + y*s); ctx.lineTo(ox + WORLD_W*s, oy + y*s); ctx.stroke(); }
  ctx.restore();
  ctx.font = 'bold 11px "Gowun Batang", serif';
  ctx.lineJoin = 'round';
  for(const p of sea.ports){
    if(!save.found[p.id]) continue;
    const x = ox + p.x*s, y = oy + p.y*s;
    ctx.fillStyle = '#c9533b'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 3; ctx.strokeText(p.nm, x + 5, y - 5);
    ctx.fillStyle = '#f3ecd9'; ctx.fillText(p.nm, x + 5, y - 5);
  }
  const pl = sea.player, px = ox + pl.img.x*s, py = oy + pl.img.y*s;
  ctx.save(); ctx.translate(px, py); ctx.rotate(pl.st.heading);
  ctx.fillStyle = '#c9a24a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(201,162,74,.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 13, 0, PI*2); ctx.stroke();
  const n = PORTS.filter(p => save.found[p.id]).length;
  $('mapInfo').textContent = `발견한 항구 ${n} / ${PORTS.length}`;
}
$('mapBtn').addEventListener('click', () => {
  const sea = seaScene(); if(sea.inPort || sea.boarding) return;
  sea.mapOpen = true; sea.gasId = null; $map.hidden = false; drawMap();
});
$('mapClose').addEventListener('click', () => { $map.hidden = true; seaScene().mapOpen = false; });
window.addEventListener('resize', () => { if(!$map.hidden) drawMap(); });
