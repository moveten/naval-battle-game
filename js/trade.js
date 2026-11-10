// ================= 교역 =================
// 특산품: from = 싸게 살 수 있는 항구, base = 산지 가격
const GOODS = [
  { id:'wine',      nm:'포도주', base:12, from:['lisbon','madeira'] },
  { id:'cloth',     nm:'모직물', base:15, from:['lisbon'] },
  { id:'sugar',     nm:'설탕',   base:10, from:['madeira'] },
  { id:'salt',      nm:'소금',   base:5,  from:['capeverde'] },
  { id:'gold',      nm:'금',     base:60, from:['elmina'] },
  { id:'ivory',     nm:'상아',   base:30, from:['luanda','mozambique','mombasa'] },
  { id:'pearl',     nm:'진주',   base:50, from:['hormuz'] },
  { id:'cotton',    nm:'면직물', base:14, from:['goa'] },
  { id:'pepper',    nm:'후추',   base:10, from:['cochin','goa'] },
  { id:'cinnamon',  nm:'계피',   base:16, from:['colombo'] },
  { id:'clove',     nm:'정향',   base:22, from:['malacca'] },
  { id:'nutmeg',    nm:'육두구', base:26, from:['malacca'] },
  { id:'silk',      nm:'비단',   base:30, from:['macau','hormuz'] },
  { id:'porcelain', nm:'도자기', base:24, from:['macau'] },
  { id:'silver',    nm:'은',     base:40, from:['nagasaki','manila'] },
  { id:'lacquer',   nm:'칠기',   base:28, from:['nagasaki'] },
];
const GOOD = Object.fromEntries(GOODS.map(g => [g.id, g]));

// 특별히 비싸게 사 주는 곳 (실제 역사의 교역 흐름)
const DEMAND = {
  lisbon:   { pepper:1.5, cinnamon:1.4, clove:1.5, nutmeg:1.5, silk:1.2, porcelain:1.3, pearl:1.2 },
  goa:      { gold:1.2, ivory:1.3, wine:1.4, cloth:1.3 },
  hormuz:   { pepper:1.3, cotton:1.3 },
  malacca:  { cotton:1.4, cloth:1.2 },
  macau:    { silver:1.6, pepper:1.3, clove:1.2 },
  manila:   { silk:1.5, porcelain:1.4 },
  nagasaki: { silk:1.7, porcelain:1.3, wine:1.3 },
};

// 항로를 따라 잰 거리 (아프리카 남쪽은 희망봉을 돌아가는 길로 계산)
const ROUTE_CUM = (() => {
  const cum = {}; let d = 0, prev = null;
  for(const p of PORTS){
    const [x, y] = geo(p.lon, p.lat);
    if(prev){
      if(p.id === 'mozambique'){ const [wx, wy] = geo(19, -37); d += Math.hypot(wx - prev[0], wy - prev[1]) + Math.hypot(x - wx, y - wy); }
      else d += Math.hypot(x - prev[0], y - prev[1]);
    }
    cum[p.id] = d; prev = [x, y];
  }
  cum.__total = d; return cum;
})();

if(!save.cargo) save.cargo = {};
if(!save.market) save.market = {};
// 교역 이전부터 하던 저장에도 시작 자금 한 번 지급
if(!save.startFunds){ save.startFunds = true; if(save.introSeen) save.gold += 150; persist(); }

// 시장 상태: 많이 팔면 값이 떨어지고(glut), 많이 사면 오름(scar). 3분마다 절반씩 회복
function mkt(portId, gid){
  const m = (save.market[portId] ||= {});
  const e = (m[gid] ||= { glut:0, scar:0, t:Date.now() });
  const k = Math.pow(0.5, (Date.now() - e.t) / 1000 / 180);
  e.glut *= k; e.scar *= k; e.t = Date.now();
  return e;
}
const isLocal = (g, portId) => g.from.includes(portId);
function buyPrice(g, portId){
  if(!isLocal(g, portId)) return null;
  return Math.max(1, Math.round(g.base * (1 + mkt(portId, g.id).scar)));
}
function sellPrice(g, portId){
  const e = mkt(portId, g.id);
  const far = Math.min(...g.from.map(o => Math.abs(ROUTE_CUM[portId] - ROUTE_CUM[o]))) / ROUTE_CUM.__total;
  let p = isLocal(g, portId) ? g.base * 0.8 : g.base * (1.15 + 2.6 * far);
  p *= (DEMAND[portId] && DEMAND[portId][g.id]) || 1;
  return Math.max(1, Math.round(p * (1 - e.glut)));
}

const cargoUsed = () => Object.values(save.cargo).reduce((a, c) => a + c.q, 0);
const cargoSpace = () => stat.hold() - cargoUsed();
function addCargo(gid, q, totalCost){
  const c = (save.cargo[gid] ||= { q:0, c:0 });
  c.q += q; c.c += totalCost;
}
function clearCargo(){ save.cargo = {}; persist(); }

// 받침에 따라 을/를
const eul = w => { const c = w.charCodeAt(w.length - 1) - 0xAC00; return c >= 0 && c % 28 ? '을' : '를'; };

// ---------- 교역소 화면 ----------
let tradeQty = 5;
const $trade = $('trade');

function renderTrade(){
  const p = seaScene().inPort; if(!p) return;
  $('cargoN').textContent = `${cargoUsed()}/${stat.hold()}`;
  $('tInfo').innerHTML = `짐칸 <b>${cargoUsed()}/${stat.hold()}</b> · 금화 <b>${save.gold}</b>`;
  document.querySelectorAll('#tQty button').forEach(b => b.classList.toggle('on', String(tradeQty) === b.dataset.q));
  const local = GOODS.filter(g => isLocal(g, p.id));
  const held = GOODS.filter(g => !isLocal(g, p.id) && save.cargo[g.id] && save.cargo[g.id].q > 0);
  const row = g => {
    const bp = buyPrice(g, p.id), sp = sellPrice(g, p.id), c = save.cargo[g.id], q = c ? c.q : 0;
    const avg = q ? Math.round(c.c / q) : 0;
    const cls = q ? (sp > avg ? 'up' : sp < avg ? 'down' : '') : '';
    const canBuy = bp !== null && cargoSpace() > 0 && save.gold >= bp;
    return `<div class="good">
      <div class="gInfo">
        <div class="gName">${g.nm}${bp !== null ? '<span class="tag">특산</span>' : ''}</div>
        <div class="gPrice">${bp !== null ? `살 때 <b>${bp}</b> · ` : ''}팔 때 <b class="${cls}">${sp}</b></div>
        <div class="gHold">${q ? `보유 ${q} · 평균 ${avg}` : '보유 없음'}</div>
      </div>
      ${bp !== null ? `<button class="buy" data-g="${g.id}" ${canBuy ? '' : 'disabled'}>사기</button>` : '<span></span>'}
      <button class="sell" data-g="${g.id}" ${q ? '' : 'disabled'}>팔기</button>
    </div>`;
  };
  $('tList').innerHTML =
    `<p class="tSec">이 항구의 특산품</p>` + (local.map(row).join('') || '<p class="tNone">없음</p>') +
    (held.length ? `<p class="tSec">내 짐 팔기</p>` + held.map(row).join('') : '');
}

function doBuy(gid){
  const p = seaScene().inPort, g = GOOD[gid];
  let n = tradeQty === 'max' ? Infinity : tradeQty, bought = 0, spent = 0;
  while(n-- > 0 && cargoSpace() > 0){
    const price = buyPrice(g, p.id);
    if(save.gold < price) break;
    save.gold -= price; spent += price; bought++;
    addCargo(gid, 1, price);
    mkt(p.id, gid).scar = Math.min(1, mkt(p.id, gid).scar + 0.008);
  }
  if(bought){ persist(); showGold(); toast(`${g.nm} ${bought}개 구입 · -${spent} 금화`); }
  renderTrade();
}
function doSell(gid){
  const p = seaScene().inPort, g = GOOD[gid], c = save.cargo[gid];
  if(!c || !c.q) return;
  let n = tradeQty === 'max' ? c.q : Math.min(tradeQty, c.q), sold = 0, earned = 0, cost = 0;
  while(n-- > 0){
    const price = sellPrice(g, p.id), avg = c.c / c.q;
    save.gold += price; earned += price; cost += avg; sold++;
    c.q--; c.c -= avg;
    mkt(p.id, gid).glut = Math.min(0.6, mkt(p.id, gid).glut + 0.01);
  }
  if(c.q <= 0) delete save.cargo[gid];
  persist(); showGold();
  const profit = Math.round(earned - cost);
  toast(`${g.nm} ${sold}개 판매 +${earned} 금화 (이익 ${profit >= 0 ? '+' : ''}${profit})`);
  renderTrade();
}

$('tList').addEventListener('click', e => {
  const b = e.target.closest('button[data-g]'); if(!b || b.disabled) return;
  if(b.classList.contains('buy')) doBuy(b.dataset.g); else doSell(b.dataset.g);
});
$('tQty').addEventListener('click', e => {
  const b = e.target.closest('button[data-q]'); if(!b) return;
  tradeQty = b.dataset.q === 'max' ? 'max' : Number(b.dataset.q);
  renderTrade();
});

// 주점 소문: 어디서 무엇이 비싸게 팔리는지
function marketRumor(here){
  const ports = PORTS.filter(p => save.found[p.id] && p.id !== here);
  if(!ports.length) return null;
  let best = null;
  for(let i = 0; i < 12; i++){
    const p = ports[Math.floor(Math.random() * ports.length)], g = GOODS[Math.floor(Math.random() * GOODS.length)];
    if(isLocal(g, p.id)) continue;
    const ratio = sellPrice(g, p.id) / g.base;
    if(!best || ratio > best.ratio) best = { p, g, ratio };
  }
  if(!best) return null;
  return `${best.p.nm}에서는 ${best.g.nm}${eul(best.g.nm)} 산지보다 ${best.ratio.toFixed(1)}배 값에 사 준다더군.`;
}
