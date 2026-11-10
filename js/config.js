// ================= 기본 설정 =================
const MAX_SPEED = 230;     // 최고 속도
const JOY_R = 60;          // 백병전·결투 조이스틱 반경
const BALL_SPEED = 520;    // 포탄 속도
const RANGE = 400;         // 기본 사거리
const DMG = 8;             // 적 포탄 기본 피해
const RELOAD_P = 1.6;      // 내 장전 시간
const RELOAD_E = 2.6;      // 적 장전 시간
const FRONT_BLIND = 0.45;  // 정면·꼬리 못 쏘는 각도
const GRAPPLE_TIME = 1.5;  // 붙어 있어야 백병전
const GOLD_SINK = 40, GOLD_CAPTURE = 70, GOLD_DISCOVER = 20;
const PORT_DOCK_R = 200;   // 이 거리 안이면 입항 가능
const PORT_FIND_R = 400;   // 이 거리 안이면 항구 발견
const CREW_COST = 4;       // 선원 1명 모집 비용

// ================= 저장 =================
const SAVE_KEY = 'naval-save-v2';
let save = { gold:0, best:0, up:{ cannon:0, reload:0, range:0, sail:0, hull:0, crew:0, hold:0 }, found:{ lisbon:true }, lastPort:'lisbon', introSeen:false, cargo:{}, market:{} };
try {
  const s = JSON.parse(localStorage.getItem(SAVE_KEY));
  if(s && s.up) save = { ...save, ...s, up:{ ...save.up, ...s.up }, found:{ ...save.found, ...(s.found || {}) } };
  else { // 이전 버전의 금화·강화 이어받기
    const o = JSON.parse(localStorage.getItem('naval-save-v1'));
    if(o && o.up){ save.gold = o.gold || 0; save.best = o.best || 0; save.up = { ...save.up, ...o.up }; }
  }
} catch(e) {}
function persist(){ try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch(e) {} }

// ================= 강화 =================
const MAX_LV = 5, cost = lv => 60 * (lv + 1);
const stat = {
  dmg:     () => 8 + 2*save.up.cannon,
  reload:  () => RELOAD_P * (1 - 0.1*save.up.reload),
  range:   () => RANGE + 30*save.up.range,
  speedMul:() => 1 + 0.08*save.up.sail,
  hull:    () => 100 + 20*save.up.hull,
  crew:    () => 20 + 3*save.up.crew,
  hold:    () => 40 + 12*save.up.hold,
};
const UPG = [
  { k:'cannon', nm:'대포',   ds:lv => `포탄 피해 ${8 + 2*lv}` },
  { k:'reload', nm:'장전',   ds:lv => `장전 ${(RELOAD_P*(1 - 0.1*lv)).toFixed(2)}초` },
  { k:'range',  nm:'사거리', ds:lv => `사거리 ${RANGE + 30*lv}` },
  { k:'sail',   nm:'돛',     ds:lv => `최고 속도 +${lv*8}%` },
  { k:'hull',   nm:'선체',   ds:lv => `내구도 ${100 + 20*lv}` },
  { k:'crew',   nm:'선원',   ds:lv => `최대 선원 ${20 + 3*lv}명` },
  { k:'hold',   nm:'짐칸',   ds:lv => `짐칸 ${40 + 12*lv}개` },
];

// ================= 화면 도우미 =================
const $ = id => document.getElementById(id);
const $spd=$('spd'), $state=$('state'), $needle=$('needle'), $hint=$('hint'), $hull=$('hullF'), $sail=$('sailF'),
      $crew=$('crew'), $kills=$('kills'), $toast=$('toast'), $over=$('over'), $shop=$('shop'), $pos=$('pos');
let hintShown = true, kills = 0, toastTimer = null;
function hideHint(){ if(hintShown){ hintShown = false; $hint.style.opacity = 0; } }
function toast(t){ $toast.textContent = t; $toast.style.opacity = 1; clearTimeout(toastTimer); toastTimer = setTimeout(()=>$toast.style.opacity = 0, 1900); }
function showGold(){ $('goldShop').textContent = save.gold; }
function addGold(n){ save.gold += n; persist(); showGold(); }

// 누르고 있는 버튼 (손가락이 밖으로 끌려도 떼기 전까진 유지)
const held = { L:false, R:false, blk:false };
function bindHold(id, k){
  const b = $(id);
  const on = e => {
    e.preventDefault(); held[k] = true; b.classList.add('on'); hideHint();
    if(e.pointerId !== undefined){ try { b.setPointerCapture(e.pointerId); } catch(_) {} }
  };
  const off = () => { held[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on);
  ['pointerup','pointercancel','lostpointercapture'].forEach(ev => b.addEventListener(ev, off));
  b.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' ') on(e); });
  b.addEventListener('keyup', off);
}
bindHold('turnL', 'L'); bindHold('turnR', 'R'); bindHold('blkBtn', 'blk');
let atkTap = false;
$('atkBtn').addEventListener('pointerdown', e => { e.preventDefault(); atkTap = true; $('atkBtn').classList.add('on'); });
['pointerup','pointercancel','pointerleave'].forEach(ev => $('atkBtn').addEventListener(ev, () => $('atkBtn').classList.remove('on')));

const W = Phaser.Math.Angle.Wrap, PI = Math.PI;
const FONT = '"Gowun Batang", serif';
