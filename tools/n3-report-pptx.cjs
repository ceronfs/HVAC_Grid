// The N3 run as a PowerPoint report: what was drawn (the three decks, drawn from the room outlines), every step with its
// screen capture and what it shows, the system pressures, the program issues and the design checks, the verdict.
//   node tools/n3-report-pptx.cjs out/n3/<seed>       -> out/n3/<seed>/N3_report_<seed>.pptx
// Reads summary.json, N3.inputs.json and the step captures test/e2e/n3.e2e.cjs leaves in that folder.
'use strict';
const fs = require('fs'), path = require('path'), PptxGenJS = require('pptxgenjs');

const COL = { ink: '1B2A3A', ink2: '3A4B5C', paper: 'FFFFFF', mist: 'EEF2F5', line: 'C9D3DC', teal: '0F8B8D', ok: '2E8B57', warn: 'B7791F', fail: 'C0392B', muted: '5F6B76' };
const FONT = 'Malgun Gothic';
const BOW = { rect: '직각 선수', chamfer: '모따기 선수', taper: '테이퍼 선수', curve: '곡선 선수' }, CORR = { straight: '일직선 복도', offset: '한쪽으로 치우친 복도', jog: '중간에 꺾인 복도' };

function build(dir) {
 const S = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8')), I = JSON.parse(fs.readFileSync(path.join(dir, 'N3.inputs.json'), 'utf8'));
 const step = name => S.steps.find(x => x.name.includes(name)) || {}, auto = step('모든 계통 AUTO'), data = step('② 설계 데이터');
 const program = S.findings.filter(f => ['E2E', 'Deck id 노출', 'dialog'].includes(f.at)), design = S.findings.filter(f => !program.includes(f) && f.at !== '검토');
 const pass = S.result === 'PASS', v = I.variant || {};
 const pres = new PptxGenJS(); pres.layout = 'LAYOUT_WIDE'; pres.title = `N3 일일 시험 ${S.seed}`; pres.author = 'HVAC Grid'; pres.theme = { headFontFace: FONT, bodyFontFace: FONT };
 // layouts: a dark title / verdict frame, a light content frame with the title at the top and the page number
 pres.defineSlideMaster({ title: 'DARK', background: { color: COL.ink }, objects: [] });
 pres.defineSlideMaster({ title: 'CONTENT', background: { color: COL.paper }, slideNumber: { x: 12.6, y: 7.05, w: 0.5, h: 0.3, fontFace: FONT, fontSize: 10, color: COL.muted },
  objects: [{ placeholder: { options: { name: 'title', type: 'title', x: 0.5, y: 0.3, w: 12.3, h: 0.75, fontFace: FONT, fontSize: 28, bold: true, color: COL.ink, align: 'left', valign: 'middle', margin: 0 }, text: '' } },
   { text: { text: `N3 일일 시험 · ${S.seed}`, options: { x: 0.5, y: 7.05, w: 6, h: 0.3, fontFace: FONT, fontSize: 10, color: COL.muted, margin: 0 } } }] });
 const content = title => { const s = pres.addSlide({ masterName: 'CONTENT' }); s.addText(title, { placeholder: 'title' }); return s; };
 const txt = (s, text, o) => s.addText(text, { isTextBox: true, fontFace: FONT, color: COL.ink, margin: 0, ...o });
 const verdict = pass ? 'PASS' : 'FAIL', vcol = pass ? COL.ok : COL.fail;
 const shipLine = `${(I.lengthMm / 1000).toFixed(0)} × ${(I.breadthMm / 1000).toFixed(0)} m · 3층 · ${I.rooms.length}실 · ${BOW[v.bow] || ''}${v.stepped ? ` · 3층 ${(v.step / 1000)} m 짧음` : ''} · ${CORR[v.corridor] || ''}`;

 // 1 title
 { const s = pres.addSlide({ masterName: 'DARK' });
  txt(s, 'N3 일일 시험 보고', { x: 0.8, y: 1.6, w: 9, h: 1, fontSize: 44, bold: true, color: COL.paper });
  txt(s, `시드 ${S.seed}${I.plan != null ? ` · 20일 계획 ${I.plan + 1}일째` : ''}`, { x: 0.8, y: 2.65, w: 9, h: 0.5, fontSize: 20, color: 'C9D6E2' });
  txt(s, shipLine, { x: 0.8, y: 3.25, w: 11, h: 0.5, fontSize: 18, color: 'C9D6E2' });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.8, y: 4.4, w: 2.6, h: 1.1, fill: { color: vcol }, line: { color: vcol }, rectRadius: 0.12 });
  txt(s, verdict, { x: 0.8, y: 4.4, w: 2.6, h: 1.1, fontSize: 36, bold: true, color: COL.paper, align: 'center', valign: 'middle' });
  txt(s, `프로그램 이상 ${program.length}건 · 설계 확인 사항 ${design.length}건`, { x: 3.7, y: 4.65, w: 8, h: 0.6, fontSize: 20, color: COL.paper });
  txt(s, `실행 ${S.startedAt?.slice(0, 16).replace('T', ' ')} UTC · HVAC Grid → BOX CAL → PHG D, DXF 도면부터 출력까지`, { x: 0.8, y: 6.6, w: 11.5, h: 0.4, fontSize: 12, color: '9FB0C0' });
  s.addNotes('도면 3장(DXF)을 BOX로 열어 HVAC Grid를 처음부터 끝까지 돌린 결과입니다. 프로그램 이상은 실패한 단계·페이지 오류·Deck id 노출, 설계 확인 사항은 규칙이 시험선 배치와 입력에서 잡은 경고입니다.'); }

 // 2 at a glance
 { const s = content('한눈에 보기');
  const cards = [[verdict, '결과', vcol], [String(program.length), '프로그램 이상', program.length ? COL.fail : COL.ok], [auto.done || '-', 'AUTO 완료 (Deck·계통)', COL.teal],
   [`${auto.penetrations ?? '-'} · ${auto.fireDampers ?? '-'}`, '덕트 관통 · 방화댐퍼', COL.teal], [String(design.length), '설계 확인 사항', design.length ? COL.warn : COL.ok], [`${Math.round((S.steps.at(-1)?.s || 0))} s`, '전체 소요 시간', COL.ink2]];
  cards.forEach(([big, label, c], i) => { const x = 0.5 + (i % 3) * 4.15, y = 1.4 + Math.floor(i / 3) * 2.55;
   s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 3.9, h: 2.25, fill: { color: COL.mist }, line: { color: COL.mist }, rectRadius: 0.1 });
   txt(s, big, { x: x + 0.3, y: y + 0.3, w: 3.3, h: 1.1, fontSize: 40, bold: true, color: c });
   txt(s, label, { x: x + 0.3, y: y + 1.45, w: 3.3, h: 0.5, fontSize: 16, color: COL.ink2 }); });
  txt(s, shipLine, { x: 0.5, y: 6.55, w: 12.3, h: 0.4, fontSize: 14, color: COL.muted });
  s.addNotes(`계통 ${(data.systems || []).length}개, 급기 합계 ${data.supply ?? '-'} CMH, 미완료 부하 ${data.pendingN ?? '-'}실.`); }

 // 3 the decks as drawn: side by side, the rooms from the drawing generator, the hull line bold
 { const s = content('오늘의 평면도 — 3개 Deck');
  const L = Math.max(...I.decks.map(d => d.lengthMm)), gap = 0.3, wAll = 12.3, sc = Math.min((wAll - 2 * gap) / 3 / L, 3.3 / I.breadthMm), h = I.breadthMm * sc;
  I.decks.forEach((d, k) => { const ox = 0.5 + k * ((wAll + gap) / 3), oy = 1.75;
   txt(s, `${d.name} · Z ${d.z} mm`, { x: ox, y: 1.3, w: 3.9, h: 0.3, fontSize: 12, bold: true, color: COL.ink2 });
   const shape = (pts, fill, lineCol, w, name) => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), y1 = Math.max(...ys);
    s.addShape(pres.shapes.CUSTOM_GEOMETRY, { x: ox + x0 * sc, y: oy + (I.breadthMm - y1) * sc, w: Math.max((Math.max(...xs) - x0) * sc, 0.01), h: Math.max((y1 - Math.min(...ys)) * sc, 0.01), objectName: name,
     fill: fill ? { color: fill } : { type: 'none' }, line: { color: lineCol, width: w }, points: [...pts.map(([px, py], i) => ({ x: (px - x0) * sc, y: (y1 - py) * sc, ...(i === 0 ? { moveTo: true } : {}) })), { close: true }] }); };
   for (const r of I.rooms.filter(q => q.deck === d.id)) {
    shape(r.points, r.use === 'corridor' ? 'CDEBEE' : /galley/.test(r.use) ? 'F8D9B5' : /wheel/.test(r.use) ? 'FCE9D2' : r.sup ? 'F4F7F9' : 'DDE2E7', 'AAB6C1', 0.5, `${d.id} ${r.no}`);
    const xs = r.points.map(p => p[0]), ys = r.points.map(p => p[1]);
    if ((Math.max(...xs) - Math.min(...xs)) * sc > 0.32 && (Math.max(...ys) - Math.min(...ys)) * sc > 0.22) { const cx = r.points.reduce((t, p) => t + p[0], 0) / r.points.length, cy = r.points.reduce((t, p) => t + p[1], 0) / r.points.length;
     txt(s, r.no, { x: ox + cx * sc - 0.2, y: oy + (I.breadthMm - cy) * sc - 0.08, w: 0.4, h: 0.16, fontSize: 7, color: COL.ink2, align: 'center', valign: 'middle' }); } }
   shape(d.outline, null, COL.ink, 1.75, `${d.id} outline`); });
  const col = (x, head, body) => txt(s, [{ text: head, options: { bold: true, breakLine: true, color: COL.ink } }, { text: body, options: { color: COL.ink2 } }], { x, y: 1.85 + h, w: 3.9, h: 1.6, fontSize: 13, valign: 'top' });
  col(0.5, '외곽선 (아웃라인)', `${BOW[v.bow]}${v.stepped ? ` · 3층이 ${v.step / 1000} m 짧은 계단형` : ' · 3개 층 같은 길이'}. 선수 쪽 실은 선체선에 맞춰 잘림.`);
  col(4.7, '내부 (인라인)', `${CORR[v.corridor]}${v.corridor === 'jog' ? ` (복도 ${v.cy1 / 1000} → ${v.cy2 / 1000} m)` : ''}. 조리실 ${v.galleyPort ? '좌현' : '우현'} · 의무실 ${v.hospPort ? '좌현' : '우현'}.`);
  col(8.9, '색', '청록 복도 · 주황 조리실 · 연주황 조타실 · 밝은 회색 급기 실 · 회색 급기 없는 실. 숫자는 실 번호.');
  s.addNotes('도면 생성기(tools/make-test-ship3.cjs)가 그린 실 경계를 그대로 그렸습니다. 굵은 선이 Deck 외곽선(선체)입니다.'); }

 // 4.. step captures: the capture with numbered marks on it, the same numbers on the explanation beside it
 // marks: [x, y] as fractions of the 1600 x 900 capture, or null for a line without a mark
 const fmtIso = (step('붙여넣기').isoClassAuto || []).map(([k, n]) => `${k} ${n}`).join(', ');
 const shots = [
  ['1-box-drawings', '① 도면을 BOX로 — 3개 Deck', [
   [[0.035, 0.095], `DXF 3장(1층 R12 한글)을 BOX로 열어 Deck ${I.decks.length}개, 실 ${step('① DXF').rooms ?? '-'}개를 번호·이름까지 읽음. 빠진 실 ${(step('① DXF').missing || []).length}개.`],
   [[0.45, 0.5], '도면: 벽은 LINE, 실 번호·이름은 TEXT. 선수 쪽 실은 선체선(외곽선)에 맞춰 잘려 있음.'],
   [[0.93, 0.28], `Deck 목록에 이름·Z·높이를 입력하고, 외곽선 ${step('외곽선').outline?.done ?? '-'}변을 하부·상부 외곽선(OL)으로 지정.`]]],
  ['2-room-list', '② 격실 입력 — 설계자가 넣는 값', [
   [[0.07, 0.022], `격실 입력 표(BOX CAL)에 ${step('붙여넣기').cells ?? '-'}칸을 붙여넣음(엑셀 붙여넣기와 같은 경로).`],
   [[0.565, 0.172], '계통: SUP(급기)·EXH(배기)·RET(환기). 이것으로 Grid가 계통을 만듦.'],
   [[0.4, 0.172], '온습도: 급기 있는 실 25 ℃/55 %, 급기 없는 실은 ISO 7547 표 1 차이.'],
   [[0.83, 0.172], `인원·최소 신기·장비 발열·환기 횟수. ISO 구분은 비워 둠 → BOX가 실 이름으로 정함(${fmtIso}).`]]],
  ['2-load', '② 부하 — BOX CAL 격실 부하', [
   [[0.07, 0.075], `모든 실 부하 계산 완료(미완료 ${data.pendingN ?? '-'}실). 이 값으로 설계 데이터 ${data.rooms ?? '-'}실을 만듦.`],
   [null, `계통 ${(data.systems || []).length}개 · 급기 합계 ${data.supply?.toLocaleString?.('ko-KR') ?? '-'} CMH · 여러 Deck 계통: ${(data.multi || []).join(', ')}.`]]],
  ['3-air', '③ 풍량 — 여름 풍량 하나 (F-1)', [
   [[0.12, 0.09], '풍량 규칙: 급기 ΔT 10 K, 가압 5 %, 최소 신기 25 %. 풍량 = 여름 냉방 현열 또는 최소 신기 중 큰 값.'],
   [[0.43, 0.09], `계통 선택: 급기·배기·환기. 공조 구역 ${(step('구역 수지').zones || []).join(' / ')}.`],
   [[0.47, 0.5], '평면: 실마다 급기 풍량(CMH), 화장실로 가는 화살표는 전달 공기.'],
   [[0.9, 0.28], `Deck 요약과 계통 카드. 난방으로 풍량을 정한 실 ${step('구역 수지').heatingBasis ?? '-'}개 — 겨울은 난방 용량으로.`]]],
  ['3-air-root', '③ 배기팬 위치 지정', [
   [[0.57, 0.09], '"위치 지정"을 누르고 평면에서 실을 클릭.'],
   [[0.5, 0.5], `의무실 배기(EF-HOS)는 그 Deck에 팬룸이 없어 린넨창고에 지정 — "${step('배기팬').before ?? '-'}" → "${step('배기팬').after ?? '-'}".`],
   [[0.25, 0.985], step('배기팬').msg || '상태줄에 지정 결과.']]],
  ['4-duct', '④ 모든 계통 AUTO — PHG D 덕트망', [
   [[0.5, 0.5], `Deck·계통 ${auto.done ?? '-'} 완료, ${auto.seconds ?? '-'}초. 공조기·팬에서 시작해 트렁크의 수직 덕트로 각 Deck에 연결.`],
   [[0.9, 0.45], '계통 카드: 덕트 수·길이, Deck 최대 손실, 상태.'],
   [[0.5, 0.93], `연결 안 된 RU ${auto.unconnected ?? '-'} · 선체 밖 덕트 ${auto.outsideM ?? '-'} m · 금지 영역 완화 ${auto.relaxed ?? 0}계획.`]]],
  ['5-review-nets', '⑤ 검토 — Deck·계통 덕트망', [
   [[0.3, 0.165], `검토 결과: 통과 ${auto.count?.ok ?? '-'} · 확인 ${auto.count?.check ?? '-'} · 실패 ${auto.count?.fail ?? '-'}.`],
   [[0.5, 0.45], 'Deck·계통마다 RU·덕트·길이·최대 손실과 AUTO 상태.']]],
  ['5-review-systems', '⑤ 검토 — 계통·수직 덕트', [
   [[0.5, 0.4], '계통별 팬 풍량, 덕트 외부 정압(ESP), 팬 정압과 Deck 사이 수직 덕트(크기·손실).']]],
  ['5-diagram', '⑤ 계통도', [
   [[0.5, 0.45], '계통마다 공조기·팬 → 수직 덕트 → 각 Deck 덕트망. 도면 없이 계통 구성을 한눈에.']]],
  ['5-review-fire', '⑤ 방화 (SOLAS II-2)', [
   [[0.3, 0.24], `방화 경계 ${step('SOLAS').boundaries ?? '-'}개(등급별), 최하층 아래 = 기관실 A류.`],
   [[0.4, 0.36], `실 분류: 미분류 ${(step('SOLAS').unclassified || []).length}개, 확인 항목.`],
   [[0.4, 0.6], '제한 구역 통과·SOLAS 점검표.'],
   [[0.2, 0.95], `덕트 관통 ${auto.penetrations ?? '-'}곳, 자동 방화댐퍼 ${auto.fireDampers ?? '-'}개(A급 경계 · 0.075 m² 초과, II-2/9.7.3).`]]],
  ['5-fire-plan', '⑤ 방화 등급도', [
   [[0.5, 0.5], '실마다 SOLAS 범주, 벽·갑판 등급(A-60·A-0·B-0 …), 방화댐퍼(FD)·슬리브(SL) 위치. DXF로도 출력.']]]];
 for (const [file, title, items] of shots) {
  const img = ['.png', '.jpg'].map(e => path.join(dir, file + e)).find(f => fs.existsSync(f)); if (!img) continue;
  const s = content(title), X = 0.5, Y = 1.2, W = 8.7, Hh = W * 900 / 1600;
  s.addImage({ path: img, x: X, y: Y, w: W, h: Hh, altText: `${title} 화면 캡처` });
  s.addShape(pres.shapes.RECTANGLE, { x: X, y: Y, w: W, h: Hh, fill: { type: 'none' }, line: { color: COL.line, width: 0.75 } });
  let n = 0, ty = Y;
  for (const [mark, line] of items) {
   const k = mark ? ++n : null;
   if (mark) {
    // the number sits beside its target (up-left, or toward the middle near an edge) with a short leader and a dot on the
    // target, so the mark does not hide what it points at
    const tx = X + mark[0] * W, tY = Y + mark[1] * Hh, dx = tx - X < 0.6 ? 1 : -1, dy = tY - Y < 0.6 ? 1 : -1, cx = tx + dx * 0.38, cy = tY + dy * 0.38;
    s.addShape(pres.shapes.LINE, { x: Math.min(tx, cx), y: Math.min(tY, cy), w: Math.abs(cx - tx), h: Math.abs(cy - tY), flipH: dx * dy < 0, line: { color: COL.teal, width: 1.5 } });
    s.addShape(pres.shapes.OVAL, { x: tx - 0.05, y: tY - 0.05, w: 0.1, h: 0.1, fill: { color: COL.teal }, line: { color: COL.paper, width: 0.75 } });
    s.addShape(pres.shapes.OVAL, { x: cx - 0.17, y: cy - 0.17, w: 0.34, h: 0.34, fill: { color: COL.teal }, line: { color: COL.paper, width: 1.5 } });
    txt(s, String(k), { x: cx - 0.17, y: cy - 0.17, w: 0.34, h: 0.34, fontSize: 12, bold: true, color: COL.paper, align: 'center', valign: 'middle' });
    s.addShape(pres.shapes.OVAL, { x: 9.5, y: ty + 0.02, w: 0.3, h: 0.3, fill: { color: COL.teal }, line: { color: COL.teal } });
    txt(s, String(k), { x: 9.5, y: ty + 0.02, w: 0.3, h: 0.3, fontSize: 11, bold: true, color: COL.paper, align: 'center', valign: 'middle' }); }
   const lines = Math.ceil(line.length / 21), hh = Math.max(0.4, lines * 0.25);
   txt(s, line, { x: 9.95, y: ty, w: 2.9, h: hh, fontSize: 12, valign: 'top', color: COL.ink });
   ty += hh + 0.18;
  }
  txt(s, '화면: HVAC Grid 실행 중 캡처 — 번호는 오른쪽 설명과 짝', { x: X, y: Y + Hh + 0.08, w: W, h: 0.3, fontSize: 10, color: COL.muted });
  s.addNotes(items.map(([m, t], i) => `${m ? '' : '- '}${t}`).join('\n'));
 }

 // system pressures
 const sys = (auto.systems || []).map(t => /^(\S+) (\d+) CMH ESP ([\d.]+|-) Pa 팬 ([\d.]+|-) Pa/.exec(t)).filter(Boolean).map(m => ({ id: m[1], cmh: +m[2], esp: +m[3] || 0, fan: +m[4] || 0 }));
 if (sys.length) { const s = content('계통별 압력 — 덕트 외부 정압과 팬 정압');
  s.addChart(pres.charts.BAR, [{ name: 'ESP (Pa)', labels: sys.map(x => x.id), values: sys.map(x => x.esp) }, { name: '팬 정압 추정 (Pa)', labels: sys.map(x => x.id), values: sys.map(x => x.fan) }],
   { x: 0.5, y: 1.25, w: 8.4, h: 5.5, barDir: 'bar', barGrouping: 'clustered', chartColors: [COL.teal, 'A9B7C4'], showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 10, dataLabelFontFace: FONT,
    catAxisLabelFontFace: FONT, valAxisLabelFontFace: FONT, catAxisLabelFontSize: 11, valAxisLabelFontSize: 10, catAxisLabelColor: COL.ink2, valAxisLabelColor: COL.muted, valGridLine: { color: 'E1E6EA', size: 0.5 }, catGridLine: { style: 'none' },
    showLegend: true, legendPos: 'b', legendFontFace: FONT, legendFontSize: 11 });
  const top = sys.slice().sort((a, b) => b.esp - a.esp).slice(0, 3);
  txt(s, [{ text: 'ESP가 큰 계통', options: { bold: true, breakLine: true } }, ...top.map((x, i) => ({ text: `${x.id}: ${x.esp} Pa (${x.cmh.toLocaleString('ko-KR')} CMH)`, options: { bullet: true, breakLine: i < top.length - 1 } }))],
   { x: 9.2, y: 1.4, w: 3.7, h: 2.6, fontSize: 14, valign: 'top', paraSpaceAfter: 6 });
  txt(s, 'ESP = Deck 덕트망 최대 손실 + 방화댐퍼 여유 + 수직 덕트. 팬 정압 = ESP + 공조기 내부·루버 손실(추정).', { x: 9.2, y: 4.3, w: 3.7, h: 1.6, fontSize: 12, color: COL.muted, valign: 'top' }); }

 // findings
 { const s = content('확인 사항');
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 1.3, w: 3.6, h: 1.9, fill: { color: program.length ? 'FBE9E7' : 'E6F4EC' }, line: { color: program.length ? 'FBE9E7' : 'E6F4EC' }, rectRadius: 0.1 });
  txt(s, String(program.length), { x: 0.8, y: 1.45, w: 3, h: 0.9, fontSize: 40, bold: true, color: program.length ? COL.fail : COL.ok });
  txt(s, program.length ? '프로그램 이상' : '프로그램 이상 없음', { x: 0.8, y: 2.4, w: 3, h: 0.5, fontSize: 16, color: COL.ink2 });
  if (program.length) txt(s, program.slice(0, 6).map((f, i, a) => ({ text: `${f.at}: ${f.text}`.slice(0, 160), options: { bullet: true, breakLine: i < a.length - 1 } })), { x: 0.5, y: 3.4, w: 3.6, h: 3.3, fontSize: 11, valign: 'top' });
  else txt(s, '실패한 단계·페이지 오류·Deck id 노출이 없음. 아래는 규칙이 시험선의 배치·입력에서 잡은 설계 경고(정상 동작).', { x: 0.5, y: 3.4, w: 3.6, h: 2, fontSize: 12, color: COL.muted, valign: 'top' });
  const CODE = { TRANSFER_OUTSIDE: '전달 공기 출처 없음', ROOM_OA: '실 신기 부족', TRANSFER_A: '전달 공기가 A급 경계 통과', DOOR_GRILLE: '문 통기구 > 0.05 m²', NEG_PRESSURE: '부압 미확보', EXHAUST_ISO: '6.4.1 배기 부족', HEATING_DT: '난방 급기 온도차 > 22 K', EXHAUST_GROUPS: '배기 계통 분리(6.4.2)', NEG_MARGIN: '부압 여유', RELIEF: '릴리프 필요', ANNEX_E: '부속서 E' };
  const groups = new Map(); for (const f of design) { const m = /^(?:check|fail|info) ([A-Z_]+) (.*)$/.exec(f.text), k = m ? CODE[m[1]] || m[1] : f.at; const g = groups.get(k) || []; g.push(m ? m[2] : f.text); groups.set(k, g); }
  const rows = [[{ text: '종류', options: { bold: true, fill: { color: COL.ink }, color: COL.paper } }, { text: '건수', options: { bold: true, fill: { color: COL.ink }, color: COL.paper, align: 'center' } }, { text: '예', options: { bold: true, fill: { color: COL.ink }, color: COL.paper } }],
   ...[...groups].map(([k, g]) => [k, { text: String(g.length), options: { align: 'center' } }, g[0].slice(0, 95) + (g[0].length > 95 ? '…' : '')])];
  if (rows.length > 1) s.addTable(rows.slice(0, 10), { x: 4.4, y: 1.3, w: 8.45, colW: [2.2, 0.75, 5.5], fontFace: FONT, fontSize: 11, color: COL.ink, border: { type: 'solid', pt: 0.5, color: COL.line }, valign: 'middle', rowH: 0.42 });
  else txt(s, '설계 확인 사항 없음', { x: 4.4, y: 1.3, w: 8.4, h: 0.6, fontSize: 18, color: COL.ok });
  s.addNotes(design.map(f => `${f.level} · ${f.at} · ${f.text}`).join('\n') || '없음'); }

 // verdict
 { const s = pres.addSlide({ masterName: 'DARK' });
  txt(s, pass ? '판정: 이상 없음' : '판정: 확인 필요', { x: 0.8, y: 1.5, w: 11, h: 1, fontSize: 40, bold: true, color: COL.paper });
  const next = pass ? ['프로그램 이상 없음 — 다음 정기 실행에서 다른 평면도로 다시 확인.', '설계 확인 사항은 시험선 배치·입력에 따른 경고로, 프로그램 결함이 아님.', `내일: 20일 계획의 다음 외곽선·복도 형상.`]
   : ['실패한 단계와 오류 메시지는 "확인 사항"과 summary.md에 있음.', '같은 시드로 다시 실행하면 같은 도면이 나와 재현 가능: node test/e2e/n3.e2e.cjs ' + S.seed, '원인을 고친 뒤 다시 실행.'];
  txt(s, next.map((t, i, a) => ({ text: t, options: { bullet: true, breakLine: i < a.length - 1 } })), { x: 0.8, y: 2.8, w: 11.5, h: 3, fontSize: 18, color: 'DDE5EC', valign: 'top', paraSpaceAfter: 10 });
  txt(s, `파일: out/n3/${S.seed}/ — summary.md · n3.report.html · n3.xlsx · n3.dxf · n3.project.json`, { x: 0.8, y: 6.5, w: 11.5, h: 0.4, fontSize: 12, color: '9FB0C0' }); }

 const file = path.join(dir, `N3_report_${S.seed}.pptx`);
 return pres.writeFile({ fileName: file }).then(() => file);
}

if (require.main === module) build(process.argv[2]).then(f => console.log(f), e => { console.error(e); process.exit(1); });
module.exports = { build };
