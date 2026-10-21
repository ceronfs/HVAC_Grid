// What a change of K values in BOX CAL (ISO 적용 K7, LY 적용 C✓, KU 사용자 K) does to the design rooms: two snapshots of
// CAL's rooms (app/bridge.js calSnapshot: the K mode, the design conditions, each room's inputs and loads) compared.
// The room design conditions (temperatures, humidity, people, lighting, equipment, fresh air, windows) are not K and
// should not move - any that does is listed first. Then each room whose loads move: transmission, solar through the
// structure, cooling and heating, and the supply airflow HVAC Grid makes of them (lib/contract.cjs, the project's rules).
'use strict';
const K = require('./contract.cjs'), U = require('./util.cjs');

const MODES = { project: '프로젝트 기본 K', 'iso-standard': 'ISO 7547 기준 K (ISO 적용)', calculated: 'LY 구조 계산 K (LY 적용)', user: 'KU 사용자 K' };
const modeName = m => MODES[m] || m || '알 수 없음';
// a room's design conditions as BOX CAL keeps them
const INPUTS = [['coolTemp', '냉방 실내 온도', '°C'], ['coolingRh', '냉방 실내 습도', '%'], ['heatTemp', '난방 실내 온도', '°C'], ['heatingRh', '난방 실내 습도', '%'],
 ['people', '재실 인원', '명'], ['activity', '활동 강도', ''], ['lighting', '조명', ''], ['equipW', '기기 발열', 'W'], ['minimumFreshAir', '최소 신기', ''], ['minimumAch', '최소 환기 횟수', '회/h'],
 ['loadIncluded', '부하 계산 포함', ''], ['windowType', '창 종류', ''], ['windowArea', '창 면적', '㎡'], ['windowK', '창 K', 'W/㎡K'], ['sup', '급기 계통', ''], ['exh', '배기 계통', ''], ['ret', '환기 계통', '']];
// the loads a K change moves (W)
const LOADS = [['coolingTransmissionW', '냉방 관류'], ['heatingTransmissionW', '난방 관류'], ['solarTransmissionW', '구조체 일사'], ['coolingSensibleW', '냉방 현열'], ['coolingW', '냉방 합계'], ['heatingW', '난방']];
// the project's design conditions (BOX 설계 조건) by name
const CONDITIONS = { indoorCoolTemp: '실내 냉방 온도', indoorCoolRh: '실내 냉방 습도', indoorHeatTemp: '실내 난방 온도', externalCoolTemp: '외기 냉방 온도', externalHeatTemp: '외기 난방 온도', externalRh: '외기 습도',
 externalK: '프로젝트 외부 K', internalK: '프로젝트 내부 K', safetyFactorPct: '안전율', freshAirCmhPerPerson: '1인당 신기', peopleSensibleW: '인체 현열', peopleLatentW: '인체 잠열', daylightLighting: '주광 실 조명', solarFaceMode: '일사 면 선택' };
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const label = r => `${r.no ?? ''} ${r.name ?? ''}`.trim() || String(r.id);
// the contract's airflow per room (null when the snapshot cannot make one)
function airflow(s, rules) {
 try { const c = K.buildContract({ source: {}, decks: s.decks || [], conditions: s.conditions || null, rooms: s.rooms }, rules || {}); return c.airflow || {}; } catch { return {}; }
}

// before / after: { kMode, conditions, decks, rooms: [CAL room record] }; rules: the contract's (the airflow as the
// project makes it). minW: a load change smaller than this is not listed.
function diff(before, after, rules = {}, minW = 1) {
 const byId = new Map(after.rooms.map(r => [String(r.id), r])), a0 = airflow(before, rules), a1 = airflow(after, rules);
 const inputs = [], rooms = [], gone = [];
 for (const r0 of before.rooms) {
  const id = String(r0.id), r1 = byId.get(id); if (!r1) { gone.push(label(r0)); continue; }
  for (const [k, name, unit] of INPUTS) if (!same(r0[k], r1[k])) inputs.push({ id, room: label(r0), deck: r0.deck || r0.deckId || '', field: k, name, unit, from: r0[k] ?? null, to: r1[k] ?? null });
  const loads = Object.fromEntries(LOADS.map(([k]) => [k, [U.round(r0[k], 0), U.round(r1[k], 0)]]));
  const s0 = a0[id]?.supplyCmh ?? null, s1 = a1[id]?.supplyCmh ?? null;
  if (LOADS.some(([k]) => Math.abs(U.num(r1[k]) - U.num(r0[k])) >= minW) || s0 !== s1) rooms.push({ id, room: label(r0), deck: r0.deck || r0.deckId || '', loads, supplyCmh: [s0, s1], basis: [a0[id]?.basis || null, a1[id]?.basis || null] });
 }
 const conditions = Object.keys({ ...before.conditions, ...after.conditions }).filter(k => !same(before.conditions?.[k], after.conditions?.[k]))
  .map(k => ({ field: k, name: CONDITIONS[k] || k, from: before.conditions?.[k] ?? null, to: after.conditions?.[k] ?? null }));
 const sum = (list, k, i) => list.reduce((t, r) => t + U.num(r.loads[k][i]), 0), all = before.rooms.filter(r => byId.has(String(r.id)));
 const tot = k => [U.round(all.reduce((t, r) => t + U.num(r[k]), 0)), U.round(all.reduce((t, r) => t + U.num(byId.get(String(r.id))[k]), 0))];
 const supply = [Object.values(a0).reduce((t, x) => t + U.num(x.supplyCmh), 0), Object.values(a1).reduce((t, x) => t + U.num(x.supplyCmh), 0)];
 return { from: before.kMode || null, to: after.kMode || null, fromName: modeName(before.kMode), toName: modeName(after.kMode), conditions, inputs, rooms, gone,
  totals: { coolingW: tot('coolingW'), heatingW: tot('heatingW'), supplyCmh: supply, roomsChanged: rooms.length, roomsTotal: before.rooms.length, coolingChanged: [sum(rooms, 'coolingW', 0), sum(rooms, 'coolingW', 1)] } };
}

// the list as HTML (the shell's dialog, a report): what moved, room by room
const fmt = v => v == null || v === '' ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('ko-KR') : U.round(v, 2).toLocaleString('ko-KR')) : typeof v === 'object' ? JSON.stringify(v) : String(v);
const delta = ([a, b]) => { const d = U.num(b) - U.num(a); return d === 0 ? '0' : (d > 0 ? '+' : '') + Math.round(d).toLocaleString('ko-KR'); };
const pct = ([a, b]) => U.num(a) ? `${(U.num(b) - U.num(a)) / U.num(a) * 100 >= 0 ? '+' : ''}${U.round((U.num(b) - U.num(a)) / U.num(a) * 100, 1)}%` : '';
function toHtml(d, title = '') {
 const e = U.esc, t = d.totals;
 const head = `<p class="kchg-mode"><b>${e(d.fromName)}</b> → <b>${e(d.toName)}</b>${d.from === d.to ? ' <span class="warn">(K 방식 그대로)</span>' : ''}</p>`
  + `<p>냉방 합계 ${fmt(t.coolingW[0])} → ${fmt(t.coolingW[1])} W (${delta(t.coolingW)}, ${pct(t.coolingW)}) · 난방 ${fmt(t.heatingW[0])} → ${fmt(t.heatingW[1])} W (${delta(t.heatingW)}, ${pct(t.heatingW)}) · 급기 ${fmt(t.supplyCmh[0])} → ${fmt(t.supplyCmh[1])} CMH (${delta(t.supplyCmh)})</p>`;
 const cond = `<h4>1. 격실 설계 조건 (온도·습도·인원·조명·기기·신기·창·계통)</h4>` + (d.inputs.length || d.conditions.length
  ? `<p class="warn">K값 변경으로 설계 조건이 바뀌었습니다 — 확인하세요.</p><table class="kchg-t"><thead><tr><th>격실 / 항목</th><th>항목</th><th>변경 전</th><th>변경 후</th></tr></thead><tbody>`
   + d.conditions.map(c => `<tr><td>프로젝트 설계 조건</td><td>${e(c.name)}</td><td>${e(fmt(c.from))}</td><td>${e(fmt(c.to))}</td></tr>`).join('')
   + d.inputs.map(c => `<tr><td>${e(c.room)}</td><td>${e(c.name)}${c.unit ? ` (${e(c.unit)})` : ''}</td><td>${e(fmt(c.from))}</td><td>${e(fmt(c.to))}</td></tr>`).join('') + `</tbody></table>`
  : `<p class="ok">변경 없음 — 실내 온도·습도, 인원, 조명, 기기 발열, 최소 신기·환기 횟수, 창, 계통과 프로젝트 설계 조건이 모두 그대로입니다. K값은 경계의 열관류율만 바꿉니다.</p>`);
 const rows = d.rooms.map(r => { const L = r.loads;
  return `<tr><td>${e(r.deck)}</td><td>${e(r.room)}</td><td>${fmt(L.coolingTransmissionW[0])} → ${fmt(L.coolingTransmissionW[1])}</td><td>${fmt(L.heatingTransmissionW[0])} → ${fmt(L.heatingTransmissionW[1])}</td><td>${fmt(L.solarTransmissionW[0])} → ${fmt(L.solarTransmissionW[1])}</td>`
   + `<td>${fmt(L.coolingW[0])} → ${fmt(L.coolingW[1])} <small>(${delta(L.coolingW)})</small></td><td>${fmt(L.heatingW[0])} → ${fmt(L.heatingW[1])} <small>(${delta(L.heatingW)})</small></td>`
   + `<td${r.supplyCmh[0] !== r.supplyCmh[1] ? ' class="chg"' : ''}>${fmt(r.supplyCmh[0])} → ${fmt(r.supplyCmh[1])}</td></tr>`; }).join('');
 const loads = `<h4>2. 부하·풍량이 바뀐 격실 ${d.rooms.length} / ${t.roomsTotal}</h4>` + (d.rooms.length
  ? `<table class="kchg-t"><thead><tr><th>Deck</th><th>격실</th><th>냉방 관류 W</th><th>난방 관류 W</th><th>구조체 일사 W</th><th>냉방 합계 W</th><th>난방 W</th><th>급기 CMH</th></tr></thead><tbody>${rows}</tbody></table>`
  : '<p>없음</p>') + (d.gone.length ? `<p class="warn">비교하지 못한 격실 ${d.gone.length}개: ${e(d.gone.slice(0, 10).join(', '))}</p>` : '');
 const note = `<p class="muted">급기 CMH는 HVAC Grid 풍량 규칙(급기 ΔT·안전율·난방 22 K·최소 신기)으로 계산한 값입니다. ③ 풍량·계통에 반영하려면 ② 부하에서 <b>설계 데이터 만들기</b>를 다시 누르세요.</p>`;
 return (title ? `<h3>${e(title)}</h3>` : '') + head + cond + loads + note;
}

module.exports = { MODES, INPUTS, LOADS, modeName, diff, toHtml };
