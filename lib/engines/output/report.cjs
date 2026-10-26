// Ver 2.0 outputs over the model and its review (V2-3.9 output): the open items, the integrated XLSX sheets and the
// printable HTML report with the plans, diagrams and fire-rating plans. New code (D7); 1.0 lib/report.cjs is the
// reference, its sheet layout and wording the specification (the golden values compare them). Networks a 1.0 file
// brought (made by PHG D) are named so; networks of the 2.0 duct engine are named as its own.
//   openItems(m, rv) → [[level, area, text]]; sheets(m, rv) → [{ name, head, widths, rows }]; html(m, rv, opt) → text
//   rv: lib/engines/review/review.cjs
'use strict';
const C = require('../fire/classify.cjs'), R = require('../fire/rate.cjs'), RS = require('../systems/risers.cjs'), RV = require('../review/review.cjs'), AC = require('../review/air.cjs');
const SVG = require('./svg.cjs'), DG = require('./diagram.cjs'), FP = require('./fireplan.cjs'), { esc, localTime, pathLength, r0, r1 } = require('./text.cjs');

const KINDS = ['supply', 'exhaust', 'return'], KIND_LABEL = { supply: '급기(SA)', exhaust: '배기(EA)', return: '환기(RA)' };
const LEVEL = { fail: '실패', check: '확인 필요', ok: '통과', info: '참고' };
const ROOT_TEXT = src => !src ? '' : src === 'user' ? '지정' : src.startsWith('fan-room') ? '팬룸 ' + src.split(':')[1] : src.startsWith('own-room') ? '실 자체 ' + src.split(':')[1] : src.startsWith('shaft-room') ? '샤프트 ' + src.split(':')[1] : src === 'above-unit' ? '공조기 수직 위·아래' : src.includes('corridor') ? '임시 (복도 ' + src.split(':').pop() + ' 끝)' : '임시 (Deck 모서리)';
const STATUS = r => !r?.at ? '미생성' : r.stale ? '다시 보내기 필요' : r.auto ? 'AUTO 완료' : 'RU 배치';
const source = m => m.source?.v1?.contractSource || {};
const PROJECT_NAME = m => { const p = String(source(m).project || ''); if (p === 'built-in S5 example') return 'S5 예제 (BOX 내장)'; const name = p.replace(/.(box.)?json$/i, ''); return name === 'T3' ? 'T3 시험선' : name; };
// the networks came from 1.0 (PHG D) when every one did
const byPhg = m => Object.values(m.networks || {}).every(n => n.source === 'v1');
// the airflow rules in words (F-1: one summer airflow, winter the heating capacity), the same in the XLSX and the report
const AIR_RULES = (r, cond) => { const sf = cond?.safetyFactorPct ?? 0, pct = r.pressurizationPct ?? 5, basis = r.pressurizationBasis === 'supply' ? '급기' : '배기';
 return `급기 = 올림(max(냉방 현열 W${sf ? ` × 안전율 ${(1 + sf / 100).toFixed(2)}(BOX 설계 조건, 관례)` : ''} × 3 ÷ ΔT ${r.supplyDeltaTK} K(관례; ISO 7547 6.3 한계 15 K), 최소 신기(4.4·6.2.1 c))) — 여름 풍량 하나로 설계하고 겨울은 같은 풍량에 난방 용량(히터·재열기, 계통·팬 시트)으로 처리(겨울 풍량을 따로 두지 않음; 난방 급기 온도차 > 22 K(6.3)인 실은 보조 난방 확인) · × 3 = A.11의 F 1.2 kW/(m³/s·K) · 배기 = 올림(환기 횟수 × 체적), 6.4.1로 검사 · 공조 구역 신기 = max(최소 신기 합, 배기 합 + ${basis}의 ${pct} % 가압`
  + `(관례; 6.5 양압), ${(r.minOaPct ?? 0) > 0 ? `급기 × ${r.minOaPct} %(선주 하한)` : '선주 하한 없음'}) · 환기 = 급기 − 신기 · 전달 공기를 보내는 실의 보충 급기 = 자기 배기 + 보내는 전달 공기 × ${1 + pct / 100} · 가압이 급기의 ${AC.LIMITS.reliefPct} %를 넘으면 릴리프 확인`; };
const TRANSFER_RULES = '배기만 있는 실(화장실 등)은 같은 Deck의 급기 실에서 전달 공기: 사용자 지정 → 딸린 실(이름 또는 둘레 40 %) → 복도(가장 긴 벽의 절반 이상) → 가장 긴 벽. 출처 제외: 급기 ≤ 배기인 실, 계단·개방갑판·창고·트렁크·팬룸·조리실·기관구역·밀폐 실. CO₂·축전지·페인트 실은 자체 흡입구. 계단실에서 받으면 실패(II-2/9.4.2), A급 경계를 넘으면 확인(방화댐퍼 전달 덕트), 복도 문 통기구 ≤ 0.05 m²(화물선)';
const BOUNDARY_KIND = { bulkhead: '격벽', outer: '외벽', deck: '갑판', floor: '바닥(모델 가장자리)', ceiling: '천장(모델 가장자리)', void: '구멍' };

const helpers = m => {
 const deck = id => m.decks.find(d => d.id === id)?.name || id, room = id => m.rooms.find(r => r.id === id), roomText = id => { const r = room(id); return r ? `${r.no} ${r.name}` : ''; };
 return { deck, room, roomText, sys: id => m.assign[id] || {} };
};
// a plan key as a person reads it: deck name · system
function planLabel(m, key, plans) {
 const { deck } = helpers(m), p = plans.find(x => x.key === key); if (p) return `${deck(p.deckId)} · ${p.systemId}`;
 const d = m.decks.map(x => x.id).filter(id => String(key).startsWith(id + '__')).sort((a, b) => b.length - a.length)[0];
 return d ? `${deck(d)} · ${String(key).slice(d.length + 2)}` : String(key).replace('__', ' · ');
}

// every open item, worst first: what a designer still has to fix or confirm
function openItems(m, rv) {
 const { roomText, deck } = helpers(m), key = k => planLabel(m, k, rv.plans), out = [], S = rv.solas;
 for (const x of rv.air.filter(x => x.level !== 'info')) out.push([x.level, '풍량', x.text]);
 for (const p of S.passages) out.push([p.level, p.roomId ? '제한 구역 통과' : '덕트 경로', `${p.systemId} (${KIND_LABEL[p.kind]}) · ${p.roomId ? roomText(p.roomId) : p.space} ${p.lengthM} m — ${p.text} (${p.rule})`]);
 for (const w of S.warnings) out.push(['fail', 'SOLAS 계통', `${w.text} (${w.rule})`]);
 for (const x of S.checklist) out.push([x.level, 'SOLAS 점검표', `${x.systemId ? x.systemId + ': ' : ''}${x.text} (${x.rule})`]);
 for (const id of S.summary.unclassified) out.push(['check', 'SOLAS 실', `${roomText(id)}: 미분류 — 공간 지정 필요`]);
 for (const [id, k] of Object.entries(S.classes)) if (k.check) out.push(['check', 'SOLAS 실', `${roomText(id)}: ${k.check}`]);
 const WALL = { bulkhead: '격벽', outer: '외벽', deck: '갑판', floor: '바닥', ceiling: '천장', void: '구멍' };
 for (const b of S.boundaries) for (const t of b.check) out.push(['check', '방화 경계', `${WALL[b.kind]} ${roomText(b.roomA) || '(밖)'} ↔ ${roomText(b.roomB) || '(밖)'} ${b.grade || '미정'}: ${t}`]);
 for (const p of S.penetrations) { if (/SIZE|CHECK/.test(p.code)) out.push(['check', '관통', `${p.no} ${p.systemId} ${p.duct}: ${p.text}`]); if (p.note) out.push(['check', '관통', `${p.no} ${p.systemId} ${p.duct}: ${p.note}`]); }
 for (const k of rv.rootsOutside) out.push(['fail', '공조기 위치', `${key(k)}: 지정 위치가 실 밖`]);
 for (const t of rv.trunks) out.push(['check', '수직 덕트', `${roomText(t.roomId)}: 트렁크 ${t.haveM2} m² < 수직 덕트 + 단열 ${t.needM2} m² ÷ ${RV.LIMITS.trunkFill}`]);
 for (const d of rv.deepDucts) out.push(['check', '천장 속', `${key(d.key)} ${d.duct} ${d.size}: 천장 속 ${RV.LIMITS.ceilingVoidMm} mm보다 높음`]);
 for (const r of rv.risers.filter(r => r.exceeded)) out.push(['check', '수직 덕트', `${r.systemId} ${deck(r.fromDeckId)}→${deck(r.toDeckId)}: ${r.flowCmh} CMH — 최대 단면에서도 풍속·마찰 한계 초과`]);
 const RELAXED = { outside: '실 밖 금지 영역을 풀어야 모든 RU에 닿음(제한 구역은 지킴) — 실 밖 덕트 검토', rooms: '제한 구역을 지키는 경로가 없어 제한 구역 해제(실 밖은 지킴) — 통과 구간 검토', all: '금지 영역을 모두 풀고 AUTO — 경로 검토' };
 for (const p of rv.plans) { const r = rv.results[p.key]; if (!r?.auto) out.push(['check', 'AUTO', `${key(p.key)}: AUTO 결과 없음`]); else if (r.stale) out.push(['check', 'AUTO', `${key(p.key)}: 계획이 바뀜 — 다시 보내기 필요`]); else if (r.zonesRelaxed) out.push(['check', 'AUTO', `${key(p.key)}: ${RELAXED[r.zonesRelaxed === true ? 'all' : r.zonesRelaxed] || '금지 영역 완화 — 경로 검토'}`]); }
 const order = { fail: 0, check: 1 };
 return out.sort((x, y) => order[x[0]] - order[y[0]]);
}

function sheets(m, rv) {
 const { deck, roomText, sys } = helpers(m), res = rv.results, S = rv.solas, sum = S.summary, ship = S.settings.ship, src = source(m), cond = m.conditions.project, out = [];
 out.push({ name: '요약', head: ['항목', '값'], widths: [34, 70], rows: [
  ['프로젝트', PROJECT_NAME(m)], ['BOX 원본', `${src.app || ''} ${src.sha256 || ''}`], ['저장', localTime(m.savedAt)],
  ['Deck · 격실', `${m.decks.length} · ${m.rooms.length}`], ['풍량 규칙', AIR_RULES(m.rules, cond)], ['전달 공기', TRANSFER_RULES],
  ...KINDS.map(k => [`${KIND_LABEL[k]} 계통 / 풍량 (CMH)`, `${m.systems.filter(s => s.kind === k).length} / ${m.systems.filter(s => s.kind === k).reduce((t, s) => t + s.designCmh, 0)}`]),
  ['Deck·계통 덕트망', `${rv.done}/${rv.total} AUTO 완료${rv.stale ? ` · 다시 보내기 ${rv.stale}` : ''}`], ['수직 덕트', `${rv.risers.length}개 · ${r1(rv.risers.reduce((t, r) => t + r.lengthM, 0))} m`],
  ['SOLAS 선종 / 방화방식', `${C.DATA.ships[ship].label} (Table ${C.DATA.ships[ship].tB}/${C.DATA.ships[ship].tD}) / ${S.settings.method}`],
  ['방화 경계 · 덕트 관통 · 방화댐퍼', `${sum.boundaries} · ${sum.penetrations} · ${sum.fireDampers}`],
  ['검토', `실패 ${rv.count.fail} · 확인 필요 ${rv.count.check} · 통과 ${rv.count.ok}`], ...rv.checks.map(k => [`${LEVEL[k.level]}`, k.text]),
  ['주의', '설계 보조 결과 — 최종 판단은 설계자·주관청·선급']] });
 out.push({ name: '확인 사항', head: ['구분', '분야', '내용'], widths: [10, 14, 110], rows: openItems(m, rv).map(([lv, area, text]) => [LEVEL[lv], area, text]) });
 // a room whose load is not done shows no load: a partial sensible W beside a total of 0 reads as a result
 out.push({ name: '격실', head: ['Deck', '번호', '실명', 'ISO 분류', 'SOLAS 공간', '범주', '면적 (m²)', '체적 (m³)', '냉방 현열 (W)', '냉방 잠열 (W)', '냉방 합계 (W)', '난방 (W)', '최소 신기 (CMH)', '급기 계통', '급기 (CMH)', '배기 계통', '배기 (CMH)', '환기 계통', '환기 (CMH)', '전달 공기 받음 (CMH)', '전달 공기 출처', '부하 상태'],
  widths: [10, 8, 20, 14, 26, 6, 10, 10, 12, 12, 12, 10, 12, 12, 10, 12, 10, 12, 10, 12, 16, 18],
  rows: m.rooms.map(r => { const L = m.loads[r.id], A = m.airflow[r.id], k = S.classes[r.id] || {}, s = sys(r.id);
   return [deck(r.deckId), r.no, r.name, r.isoClass || '', k.space || '미분류', k.cat || '', r1(r.areaM2), r1(r.volumeM3), ...(L.complete ? [r0(L.coolingSensibleW), r0(L.coolingLatentW), r0(L.coolingW), r0(L.heatingW)] : ['', '', '', '']), r1(L.minFreshAirCmh),
    s.supply || '', A.supplyCmh, s.exhaust || '', A.exhaustCmh, s.return || '', A.returnCmh, A.transferInCmh || '', A.transferFrom === 'outside' ? '외부' : A.transferFrom ? roomText(A.transferFrom) : '', L.status || (L.complete ? '완료' : '미완료')]; }) });
 out.push({ name: '구역 수지', head: ['공조 구역 (급기 계통)', '격실', '급기 SA', '배기 EA (전달 포함)', '최소 신기', '필요 신기', '신기 OA', '환기 RA', '신기 비율 (%)', '가압 (CMH)', '가압 (% 급기)', '판정'], widths: [20, 8, 10, 14, 10, 10, 10, 10, 10, 10, 10, 10],
  rows: rv.zones.map(z => [z.supplySystemId, z.roomIds.length, z.saCmh, z.eaCmh, z.minOaCmh, z.oaNeedCmh, z.oaCmh, z.raCmh, z.oaPct, z.pressurizationCmh, z.saCmh ? Math.round(z.pressurizationCmh / z.saCmh * 1000) / 10 : 0, z.ok ? '적합' : '급기 부족']) });
 // F-1: winter is the heating capacity on the summer airflow - the rooms' heating (outdoor air excluded, as the load gives it)
 const heatKw = s => s.kind !== 'supply' ? '' : Math.round((m.systems.find(x => x.kind === s.kind && x.id === s.systemId)?.roomIds || []).reduce((t, id) => t + (m.loads[id]?.complete ? +m.loads[id].heatingW || 0 : 0), 0) / 100) / 10;
 const waiting = byPhg(m) ? 'PHG D 결과 대기' : 'AUTO 결과 대기';
 out.push({ name: '계통·팬', head: ['종류', '계통', 'Deck', '공조기 Deck', '공조기 위치', '팬 풍량 (CMH)', '겨울 난방 용량 (kW, 격실 합계)', '수직 덕트 (m)', '덕트 외부 정압 ESP (Pa)', '최대 Deck', '팬 정압 추정 (Pa)', '상태'], widths: [8, 14, 18, 12, 22, 12, 16, 12, 18, 10, 16, 16],
  rows: rv.systems.map(s => [KIND_LABEL[s.kind], s.systemId, s.decks.map(d => deck(d.deckId)).join(', '), deck(s.unitDeckId), ROOT_TEXT(s.unitSource), s.fanCmh, heatKw(s), s.riserLengthM, s.indexPa ?? '', s.indexDeckId ? deck(s.indexDeckId) : '', s.fanPa ?? '', s.complete ? '계산 완료' : s.stale ? '다시 보내기 필요' : waiting]) });
 out.push({ name: 'Deck 덕트망', head: ['Deck', '종류', '계통', '시작점', '시작점 위치', 'RU', 'RU 풍량 (CMH)', '설계 풍량 (CMH)', '덕트', '덕트 길이 (m)', 'Deck 최대 손실 (Pa)', '수평 방화댐퍼 여유 (Pa)', '수직 덕트 손실 (Pa)', '합계 (Pa)', 'AUTO (s)', '상태'],
  widths: [10, 8, 14, 10, 22, 6, 12, 12, 6, 12, 16, 18, 16, 10, 8, 16],
  rows: rv.plans.map(p => { const r = res[p.key] || {}, sd = rv.systems.find(s => s.systemKey === p.systemKey)?.decks.find(d => d.key === p.key);
   return [deck(p.deckId), KIND_LABEL[p.kind], p.systemId, p.isUnitDeck ? '공조기·팬' : '수직 덕트', ROOT_TEXT(p.rootSource), r.rus ?? p.rus.length, r.flowCmh ?? '', p.designCmh, r.ducts ?? '', r.lengthM ?? '', r.indexPa ?? '', sd?.damperPa || '', sd ? sd.riserPa : '', sd?.totalPa ?? '', r.seconds ?? '', STATUS(r)]; }) });
 const ductRows = [];
 for (const p of rv.plans) for (const d of rv.nets[p.key]?.ducts || []) {
  const sec = d.diameterMm ? { diameterMm: d.diameterMm } : d.widthMm && d.heightMm ? { widthMm: d.widthMm, heightMm: d.heightMm } : null, L = pathLength(d.points) / 1000, pam = sec && d.flowCmh > 0 ? RS.paPerM(d.flowCmh, sec) : null;
  ductRows.push([deck(p.deckId), KIND_LABEL[p.kind], p.systemId, d.displayName || '', { main: '주 덕트', branch: '분기', sub_branch: '보조 분기' }[d.type] || d.type || '', r0(d.flowCmh), d.diameterMm ? `Ø${d.diameterMm}` : d.widthMm ? `${d.widthMm}×${d.heightMm}` : '', sec && d.flowCmh ? r1(RS.velocity(d.flowCmh, sec)) : '', Math.round(L * 100) / 100, pam == null ? '' : Math.round(pam * 100) / 100, pam == null ? '' : r1(pam * L)]);
 }
 out.push({ name: '덕트', head: ['Deck', '종류', '계통', '덕트', '구분', '풍량 (CMH)', '크기 (mm)', '풍속 (m/s)', '길이 (m)', '마찰 (Pa/m)', '마찰 손실 (Pa)'], widths: [10, 8, 14, 12, 10, 10, 12, 10, 10, 10, 12], rows: ductRows });
 out.push({ name: '수직 덕트', head: ['종류', '계통', '구간', '풍량 (CMH)', '크기 (mm)', '수직 (m)', '수평 (m)', '길이 (m)', '엘보', '풍속 (m/s)', '마찰 (Pa)', '엘보 (Pa)', '분기 T (Pa)', '방화댐퍼 (Pa)', '구간 합계 (Pa)', '통과 Deck (실 없음)'], widths: [8, 14, 16, 10, 12, 8, 8, 8, 6, 10, 10, 10, 10, 12, 12, 18],
  rows: rv.risers.map(r => [KIND_LABEL[r.kind], r.systemId, `${deck(r.fromDeckId)} → ${deck(r.toDeckId)}`, r.flowCmh, `${r.widthMm}×${r.heightMm}${r.exceeded ? ' (한계 초과)' : ''}`, r.verticalM, r.offsetM, r.lengthM, r.elbows, r.velocityMps, r.frictionPa, r.elbowPa, r.branchPa, r.damperPa, r.totalPa, r.through.map(deck).join(', ')]) });
 out.push({ name: 'RU', head: ['Deck', '종류', '계통', 'RU', '실', '풍량 (CMH)', 'X (mm)', 'Y (mm)'], widths: [10, 8, 14, 22, 22, 10, 10, 10],
  rows: rv.plans.flatMap(p => p.rus.map(u => [deck(p.deckId), KIND_LABEL[p.kind], p.systemId, u.id, roomText(u.roomId), u.flowCmh, u.x, u.y])) });
 out.push({ name: '방화 경계', head: ['구분', 'Deck', '실 A (갑판: 아래)', '공간 A', '범주 A', '실 B (갑판: 위)', '공간 B', '범주 B', '표', '표 원문', '최소 등급', '길이 (m) / 면적 (m²)', '확인 사항', '주석'],
  widths: [12, 10, 20, 22, 6, 20, 22, 6, 6, 12, 8, 14, 50, 8],
  rows: S.boundaries.map(b => [BOUNDARY_KIND[b.kind], deck(b.deckId), b.roomA ? roomText(b.roomA) : b.kind === 'floor' ? (S.settings.lowestBelow || '(아래)') : '(밖)', b.aSpace || '미분류', b.aCat || '', b.roomB ? roomText(b.roomB) : '(밖)', b.bSpace || '미분류', b.bCat || '', b.table || '', b.raw || '', b.grade || '미정', b.areaM2 != null ? b.areaM2 : Math.round(b.lengthMm / 100) / 10, b.check.join(' / '), b.notes.map(n => n.key).join(' ')]) });
 out.push({ name: '관통 목록', head: ['번호', 'Deck', '종류', '계통', '덕트', '경계', '실 A', '실 B', '등급', '크기 (mm)', '면적 (m²)', '풍량 (CMH)', '조치', '슬리브 (mm)', '방화댐퍼', '비고', 'X (mm)', 'Y (mm)'],
  widths: [8, 10, 8, 14, 18, 6, 20, 20, 8, 12, 10, 10, 44, 10, 8, 30, 10, 10],
  rows: S.penetrations.map(p => [p.no, deck(p.deckId), KIND_LABEL[p.kind], p.systemId, p.duct, BOUNDARY_KIND[p.boundaryKind] || p.boundaryKind, roomText(p.roomA), p.roomB ? roomText(p.roomB) : '(외부)', p.grade || '미정', p.size, p.areaM2, r0(p.flowCmh), p.text, p.sleeveMm || '', p.damper ? 'FD' : '', p.note || '', p.x, p.y]) });
 out.push({ name: '제한 구역 통과', head: ['판정', 'Deck', '종류', '계통', '통과 실', 'SOLAS 공간', '길이 (m)', '조항', '내용'], widths: [10, 10, 8, 14, 20, 22, 8, 16, 60],
  rows: S.passages.map(p => [LEVEL[p.level], deck(p.deckId), KIND_LABEL[p.kind], p.systemId, roomText(p.roomId), p.space, p.lengthM, p.rule, p.text]) });
 out.push({ name: 'SOLAS 점검표', head: ['판정', '계통', '조항', '항목'], widths: [10, 14, 22, 100], rows: [...S.warnings.map(w => ['실패', w.systemId, w.rule, w.text]), ...S.checklist.map(x => [LEVEL[x.level], x.systemId || '전체', x.rule, x.text])] });
 out.push({ name: '물량', head: ['품목', '규격', '수량', '비고'], widths: [16, 16, 8, 60], rows: [
  ...Object.entries(sum.sleeves).map(([mm, n]) => ['강재 슬리브 3t', `L ${mm}`, n, mm === '900' ? 'A급 > 0.02 m² (A-0 외 경계와 같은 등급 단열) · B급 > 0.02 m²' : 'A급 ≤ 0.02 m²']),
  ...Object.entries(sum.dampers).map(([size, n]) => ['자동 방화댐퍼', size, n, 'A급 경계 · 덕트 > 0.075 m² — 양쪽 수동 폐쇄·개폐 표시·점검구']),
  ...S.checklist.filter(x => x.rule === 'II-2/9.7.5').map(x => ['조리실 배기 부속', x.systemId, 1, '그리스 트랩 · 하단 방화댐퍼 · 덕트 소화장치 (계통당)']),
  ...rv.risers.map(r => ['수직 덕트', `${r.widthMm}×${r.heightMm}`, r.lengthM, `${r.systemId} ${deck(r.fromDeckId)}→${deck(r.toDeckId)} (m)`])] });
 return out;
}

const CSS = ` @page{size:A4 landscape;margin:12mm}
 *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
 body{font:12.5px/1.5 "Malgun Gothic","Noto Sans KR",system-ui,sans-serif;color:#1d2228;margin:24px auto;max-width:1180px;padding:0 16px;background:#fff}
 h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:26px 0 8px;border-bottom:2px solid #1f5fa8;padding-bottom:4px;break-after:avoid}.muted{color:#5f6871}
 .kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin:14px 0}.kpi{border:1px solid #d7dce2;border-radius:6px;padding:8px 10px}.kpi b{display:block;font-size:18px}.kpi span{color:#5f6871;font-size:12px}.kpi.fail{border-color:#b3261e;color:#b3261e}.kpi.check{border-color:#9a6700}
 table{border-collapse:collapse;width:100%;font-size:11px;margin:6px 0;table-layout:auto}th,td{border:1px solid #d7dce2;padding:3px 5px;text-align:left;vertical-align:top}th{background:#e8eef5}td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}td.w{min-width:200px}
 .lv-fail{color:#b3261e;font-weight:600}.lv-check{color:#9a6700}.lv-ok{color:#1b7a3d}
 figure{margin:12px 0}figure.dia{break-inside:avoid;border:1px solid #d4d8dc;border-radius:4px;padding:8px}figure.dia svg{max-width:100%;height:auto;display:block}figure.page{break-before:page;break-inside:avoid}h2.page{break-before:page;break-after:avoid}h2.page+figure.page{break-before:auto}figcaption{font-weight:600;margin-bottom:4px;break-after:avoid}figure .legend{margin-bottom:4px;break-after:avoid}svg{max-width:100%;height:auto}figure>svg{display:block;max-height:160mm;width:100%}figure>svg{border:1px solid #d7dce2}
 .legend,.fp-legend,.fp-cats{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center;font-size:11.5px}.legend span,.fp-legend span,.fp-cats span{display:inline-flex;align-items:center;gap:4px}
 .note{border-left:4px solid #9a6700;background:#fff8e1;padding:8px 12px;margin:12px 0}
 dl{display:grid;grid-template-columns:120px 1fr;gap:3px 12px;margin:6px 0}dt{color:#5f6871}dd{margin:0}
 @media print{body{margin:0;max-width:none;font-size:11px}table{font-size:8.5px}th,td{padding:2px 4px}td.w{min-width:120px}}
`;

function html(m, rv, opt = {}) {
 const sh = sheets(m, rv), get = n => sh.find(s => s.name === n), S = rv.solas, sum = S.summary, items = openItems(m, rv), sup = m.systems.filter(s => s.kind === 'supply'), ship = C.DATA.ships[S.settings.ship], src = source(m);
 const wide = h => /조치|확인|주석|통과|비고|내용|항목/.test(h);   // long text columns wrap, the rest stay on one line
 const table = (s, limit) => `<table><thead><tr>${s.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${s.rows.slice(0, limit || s.rows.length).map(r => `<tr>${r.map((v, j) => `<td${typeof v === 'number' ? ' class="n"' : wide(s.head[j]) ? ' class="w"' : ''}>${esc(typeof v === 'number' ? v.toLocaleString('ko-KR') : v)}</td>`).join('')}</tr>`).join('')}</tbody></table>${limit && s.rows.length > limit ? `<p class="muted">… ${s.rows.length - limit}행 더 — XLSX 참조</p>` : ''}`;
 const kpi = (v, l, cls = '') => `<div class="kpi ${cls}"><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
 const ln = (col, w = 4) => `<svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke="${col}" stroke-width="${w}" /></svg>`;
 const legend = `<div class="legend">${[['급기(SA)', SVG.KIND_COLORS.supply], ['배기(EA)', SVG.KIND_COLORS.exhaust], ['환기(RA)', SVG.KIND_COLORS.return]].map(([l, cl]) => `<span>${ln(cl, 3)}${l}</span>`).join('')}${['A-60', 'A-30', 'A-15', 'A-0', 'B-15', 'B-0'].map(g => `<span>${ln(SVG.GRADE_COLORS[g], g === 'A-60' ? 4 : 3)}${g}</span>`).join('')}<span>${SVG.SYMBOL.unit} 공조기·팬</span><span>${SVG.SYMBOL.shaft} 수직 덕트</span><span>${SVG.SYMBOL.pen} 관통</span><span>${SVG.SYMBOL.fd} 방화댐퍼 관통</span><span>${SVG.SYMBOL.deckPen} 갑판 관통</span><span>→ 선수(FWD) · ↑ 좌현(P)</span></div>`;
 const top = m.decks.slice().sort((x, y) => y.z - x.z);
 const plans = top.map(d => { const svg = SVG.deckSvg(m, d.id, { plans: rv.plans, nets: rv.nets, boundaries: S.boundaries, penetrations: S.penetrations, fitMm: { w: 273, h: 160 } }); return svg ? `<figure class="page"><figcaption>${esc(d.name)} · Z ${d.z} mm</figcaption>${legend}${svg}</figure>` : ''; }).join('');
 const RR = RS.RULES, FAN = RS.FAN;
 const assumptions = [['풍량 규칙', AIR_RULES(m.rules, m.conditions.project)], ['전달 공기', TRANSFER_RULES], ['RU', '500 CMH마다 1개, 실 안 고른 배치 · 배기·환기 RU는 급기 RU에서 먼 쪽'],
  ['덕트망', `${byPhg(m) ? 'Deck·계통별 PHG D AUTO (첫 후보)' : 'Deck·계통별 HVAC Grid 덕트 엔진 AUTO (같은 길이 비용 +10 % 안에서 압력이 가장 낮은 후보)'}, 제한 구역은 금지 영역 · 수직 덕트 ≤ 10 m/s · ≤ 2 Pa/m · 엘보 K ${RR.elbowK} · 분기 K ${RR.branchK} · 방화댐퍼 K ${RR.fireDamperK}`],
  ['압력', `덕트 외부 정압(ESP) = Deck 최대 손실 + 그 Deck 수평 덕트 방화댐퍼(K ${RR.fireDamperK} × 동압, 경로를 몰라 모두 더한 보수적 여유) + 수직 덕트 경로(방화댐퍼 포함) · 팬 정압 추정 = ESP + 공조기 내부 ${FAN.ahuInternalPa} Pa(배기·환기 팬 ${FAN.fanInternalPa} Pa) + 루버 ${FAN.louverPa} Pa`],
  ['SOLAS', `${ship.label} · Table ${ship.tB}/${ship.tD} · 방화방식 ${S.settings.method} · 최하층 아래: ${S.settings.lowestBelow || '미지정'} · 표 원본 ${C.DATA.sha256}`],
  ['원본', `BOX CAL ${src.sha256 || ''} · 좌표: 선박 좌표(mm), +x 선수 · +y 좌현`]];
 const fm = FP.model(m, S), rows = opt.itemRows || 300;
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>HVAC Grid 보고서 — ${esc(PROJECT_NAME(m))}</title><style>
${CSS}</style></head><body>
<h1>HVAC Grid 설계 보고서</h1><div class="muted">${esc(PROJECT_NAME(m))} · 저장 ${esc(localTime(m.savedAt))} · ${esc(ship.label)} / ${esc(S.settings.method)}</div>
<div class="note">설계 보조 결과입니다. 부하·풍량·덕트·방화 판정은 설계자가 확인하고, 최종 판단은 주관청·선급에 따릅니다.</div>
<div class="kpis">${kpi(rv.count.fail, '검토 실패', rv.count.fail ? 'fail' : '')}${kpi(rv.count.check, '확인 필요', rv.count.check ? 'check' : '')}${kpi(m.decks.length + ' · ' + m.rooms.length, 'Deck · 격실')}${kpi(sup.reduce((t, s) => t + s.designCmh, 0).toLocaleString('ko-KR') + ' CMH', `급기 ${sup.length}계통`)}${kpi(`${rv.done}/${rv.total}`, 'Deck·계통 AUTO')}${kpi(rv.risers.length, '수직 덕트')}${kpi(sum.penetrations, '덕트 관통')}${kpi(sum.fireDampers, '방화댐퍼')}</div>
<h2>검토</h2><table><tbody>${rv.checks.map(k => `<tr><td class="lv-${k.level}" style="width:80px">${LEVEL[k.level]}</td><td>${esc(k.text)}</td></tr>`).join('')}</tbody></table>
<h2>미해결 확인 사항 ${items.length}건</h2>${items.length ? `<table><thead><tr><th>구분</th><th>분야</th><th>내용</th></tr></thead><tbody>${items.slice(0, rows).map(([lv, area, text]) => `<tr><td class="lv-${lv}" style="white-space:nowrap">${LEVEL[lv]}</td><td style="white-space:nowrap">${esc(area)}</td><td>${esc(text)}</td></tr>`).join('')}</tbody></table>${items.length > rows ? `<p class="muted">… ${items.length - rows}건 더 — XLSX "확인 사항"</p>` : ''}` : '<p class="lv-ok">없음</p>'}
<h2>가정·근거</h2><dl>${assumptions.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
<h2>공조 구역 풍량 수지</h2>${table(get('구역 수지'))}
<h2>계통·팬 선정</h2>${table(get('계통·팬'))}
<h2 class="page">계통도</h2>${DG.systemDiagrams(m, rv).map(d => `<figure class="dia">${DG.toSvg(d)}</figure>`).join('')}
<h2>수직 덕트</h2>${rv.risers.length ? table(get('수직 덕트')) : '<p class="muted">여러 Deck을 담당하는 계통이 없습니다.</p>'}
<h2>Deck 덕트망</h2>${table(get('Deck 덕트망'))}
<h2 class="page">Deck 평면</h2>${plans}
<h2>방화 (SOLAS II-2) — 경계 ${sum.boundaries}개</h2><p>${Object.entries(sum.byGrade).sort((x, y) => R.rank(x[0]) - R.rank(y[0])).map(([g, n]) => `${esc(g)} ${n}`).join(' · ')}</p>
${table(get('방화 경계'), opt.boundaryRows || 400)}
<h2 class="page">방화 등급도</h2><p class="muted">실 안: 번호 이름 / (SOLAS 범주) 공간 / 바닥·천장 등급 · 벽: 같은 등급으로 이어진 격벽마다 등급 · FD 방화댐퍼, SL 슬리브 · C급·외벽(*)은 표기 생략</p>${fm.decks.slice().reverse().map(d => `<figure class="page"><figcaption>방화 등급도 — ${esc(d.name)} · Z ${d.z} mm</figcaption>${FP.legendHtml(fm)}${FP.toSvg(fm, d.id, { fitMm: { w: 273, h: 160 } })}</figure>`).join('')}
<h2>제한 구역 통과 (II-2/9.7.2)</h2>${S.passages.length ? table(get('제한 구역 통과')) : '<p class="lv-ok">없음</p>'}
<h2>SOLAS 점검표</h2>${table(get('SOLAS 점검표'))}
<h2>덕트 관통 ${sum.penetrations}곳</h2>${table(get('관통 목록'), opt.penetrationRows || 400)}
<h2>물량</h2>${table(get('물량'))}
<h2>격실</h2>${table(get('격실'), opt.roomRows || 400)}
<p class="muted">HVAC Grid · BOX CAL ${esc(src.sha256 || '')} · SOLAS 표 ${esc(C.DATA.sha256)} · 작성 ${esc(localTime())}</p></body></html>`;
}

module.exports = { sheets, html, openItems, planLabel, ROOT_TEXT, PROJECT_NAME, LEVEL, KIND_LABEL };
