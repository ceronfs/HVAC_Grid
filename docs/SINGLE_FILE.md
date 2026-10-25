# HVAC Grid 한 파일판 (`dist/HVAC_Grid.html`)

작성 2026-10-25 · 도구 `tools/make-single.cjs` · 시험 `test/single.test.cjs`(단위), `test/e2e/single.e2e.cjs`(Edge, `file://`)

HVAC Grid 전체(셸 ①~⑤, BOX CAL Enhance, PHG D, lib/, T3 시험선)를 **HTML 파일 하나**로 묶은 판입니다. 파일을 아무 폴더에 복사해 **더블클릭**하면 열립니다. 서버(`tools/serve.cjs`)·Node.js·인터넷이 필요 없습니다. README의 원칙("배포물은 가능하면 단일 HTML(`file://`)")을 따른 배포물입니다.

## 만들기

```
npm run make:single                         # → dist/HVAC_Grid.html (약 9.5 MB)
node tools/make-single.cjs <출력.html>      # 다른 위치로
npm run test:single                         # 만든 파일을 빈 임시 폴더에 복사해 Edge로 file://에서 T3 끝까지
```

`app/`·`lib/`·`vendor/`·`samples/t3/`를 고친 뒤에는 다시 만들어야 합니다. 파일에는 빌드 때의 내용이 그대로 들어갑니다. 어떤 판인지는 파일 안 `<meta name="hvac-grid-build">`(커밋·날짜)와 `window.HVACGridBuild`(커밋, 넣은 파일마다 SHA-256 앞 16자리)에 적힙니다. vendor 두 앱의 해시는 `vendor/VERSIONS.json`의 `sha256_16`과 같습니다(단위 시험이 확인).

## 묶는 방법

vendor 사본은 **고치지 않고 그대로** 넣습니다. `docs/VENDOR_PATCHES.md`의 패치(A·B·M·N·J·O~W·N2·O2)는 사본에 이미 들어 있으므로 한 파일판에도 그대로 들어갑니다(단위 시험이 넣은 글자와 `vendor/` 파일이 같은지 확인).

| 무엇 | 어떻게 |
|---|---|
| `app/index.html` | 페이지 본체 |
| `app/shell.css`, 아이콘·로고(`logo-32/64/128.png`) | `<style>`과 `data:` URL로 페이지 안에 |
| `app/bridge.js`, `app/shell.js` | `<script>`로 페이지 안에 (`</script` → `<\/script`, 같은 글자) |
| BOX CAL Enhance, PHG D, `lib/*.cjs`·`lib/solas-data.json`, `samples/t3/T3.box.json`·`T3.solas.json`, `app/popup.css`, 표 창 로고 | `window.HVACGridFiles` — 셸이 부르는 경로(`../vendor/BOX_CAL_Enhance.html`, `../lib/util.cjs` …)를 키로 한 글자 묶음. JSON의 `<`는 모두 `<`로 적어 어떤 글자도 스크립트를 끝내지 못함 |

넣는 파일 목록은 독립망 복사본 도구의 목록(`tools/make-offline.cjs` `FILES`)에서 가져옵니다. 그 목록은 빌드 때마다 셸이 부르는 경로(`shell.js`의 lib 목록, `'../lib|samples|vendor/…'` 경로)와 대조되므로(`missingFiles`), 셸이 새 파일을 읽게 되면 빌드가 멈추고 목록을 고치라고 알립니다. 셸이 읽지 않는 파일(`vendor/VERSIONS.json`, `samples/s5.contract.json`·`t3.contract.json`)은 넣지 않습니다. S5·H5 예제는 BOX 안에 들어 있습니다.

## `file://`에서 생기는 제약과 해결

| 제약 | 해결 |
|---|---|
| 셸이 vendor 앱 iframe 안을 스크립트로 다뤄야 하는데, `file://` 문서끼리는 같은 출처가 아님(Chromium: 파일마다 고유 출처). `blob:` URL iframe도 막힘(시험함) | vendor 앱을 **`srcdoc` iframe**으로 엶. srcdoc 문서는 부모 페이지의 출처를 물려받아 셸이 지금처럼 다룸. BOX도 CAL 패널을 srcdoc으로 띄우므로 같은 방식. srcdoc 안에서 Worker(`blob:`·`data:`)·localStorage·IndexedDB 모두 동작(시험함) — `app/bridge.js` `VendorFrame.load` |
| `fetch`로 `../lib/`, `../samples/` 읽기 불가 | `app/bridge.js`의 `get(url)`: `window.HVACGridFiles`에 있으면 그 글자로 `Response`를 만들어 줌, 없으면(서버판) 지금처럼 `fetch`. lib 로더·T3 예제·표 창 CSS가 이것을 씀 |
| PHG D **설계 비교**(자동 라우팅 > 비교)는 숨은 작업 창에 자기 파일을 `URL#phgd-compare`로 다시 엶. srcdoc에서는 자기 URL이 `about:srcdoc`이라 열 수 없음 | `app/bridge.js` `Phg.compareFrame`: PHG D 창에서 그 주소로 iframe을 열 때만 같은 PHG D 글자를 srcdoc으로 주고, PHG D 스크립트보다 먼저 `location.hash = "phgd-compare"`를 실행. PHG D는 자기가 작업 창임을 알고(자동 저장 안 함) 그대로 비교. PHG D 자체는 고치지 않음 |
| 로컬 서버 생존 신호(`/__alive`, `/__bye`) | 한 파일판에는 서버가 없으므로 보내지 않음(`HVACGridBridge.single`) |
| 다운로드 | `<a download>` + `blob:` URL이 `file://`에서도 그대로 동작. Edge·Chrome에서는 `file://`도 보안 컨텍스트라 **파일 저장 창(File System Access)**·최근 프로젝트(IndexedDB에 파일 핸들)도 서버판과 같이 동작 |
| localStorage | `file://`에서도 동작(테마, PHG D 자동 저장). e2e가 다시 읽기 후 테마 유지를 확인 |
| 표 창(격실 입력·격실 부하 …) | `window.open`으로 연 빈 창은 여는 페이지의 출처를 물려받아 서버판과 같이 꾸며짐(로고는 `data:` URL) |

## 확인한 것 (`npm run test:single`)

만든 파일만 운영체제 임시 폴더의 빈 폴더에 복사해(저장소 파일을 옆에 두지 않음) Edge 헤드리스로 `file://`에서 엽니다.

1. BOX가 srcdoc 프레임으로 열리고 셸이 BOX 명령 막대를 숨김
2. ① **T3 시험선** → ② CAL 표 창(격실 입력)이 앱처럼 꾸며짐 → **설계 데이터 만들기**: 79실·18계획, 풍량이 `samples/t3.contract.json`과 같음
3. ③ T3 시험선(SOLAS 설정 `T3.solas.json` 포함) → ⑤ 최하층 아래 기관실 → **모든 계통 AUTO** 18/18, 검토 실패 0, 선체 밖 덕트 0
4. 프로젝트·통합 XLSX·**보고서** 다운로드(보고서에 "HVAC Grid 설계 보고서"), S5로 바꾼 뒤 저장한 프로젝트 다시 열기 → 같은 결과
5. ④ PHG D 편집기와 **설계 비교**(작업 창이 PHG D 글자로 열려 결과 표가 나옴)
6. 어두운 화면이 다시 읽기 뒤에도 유지(localStorage)
7. **페이지 오류 0**, 페이지 밖(http·https) 요청 0

2026-10-25 이 PC(Edge): 여는 데 약 0.5초, AUTO 약 54초, 전체 약 67초.

## 한계

- **시험한 브라우저는 Microsoft Edge**(Chromium)입니다. Chrome도 같은 엔진이라 같게 동작할 것으로 보지만 자동 시험은 Edge만 합니다(`HVAC_GRID_BROWSER=chrome`으로 바꿀 수 있음). Firefox·Safari는 시험하지 않았습니다 — 파일 저장 창이 없는 브라우저는 다운로드로 저장합니다.
- 파일이 큽니다(약 9.5 MB, 대부분 BOX 7 MB · PHG D 1.5 MB). 메일 첨부 한도에 걸릴 수 있습니다.
- `file://` 페이지의 localStorage·IndexedDB는 브라우저가 **모든 로컬 파일에 하나로** 둡니다. 다른 폴더에 둔 한 파일판, `file://`로 연 다른 HTML과 테마·PHG D 자동 저장·최근 프로젝트 목록을 함께 씁니다. 서버판(`http://127.0.0.1:…`)과는 따로입니다.
- 창을 닫으면 끝입니다(서버가 없음). 저장하지 않은 작업이 있으면 닫기 전에 묻는 것은 서버판과 같습니다. 도움말의 `HVAC_Grid.bat console`·`launch.log` 안내는 서버판에만 해당합니다.
- 빌드 때의 내용이 고정됩니다. vendor 사본을 바꾸면(`vendor/VERSIONS.json`, `npm run extract:s5`·`npm run make:t3`) 한 파일판도 다시 만들어야 합니다.
- SOLAS 방화 등급 표기 도구는 따로 한 파일(`npm run make:solas-tool`)입니다. 한 파일판 HVAC Grid의 ⑤ 방화 기능은 그대로 들어 있습니다.
- 회사 보안 정책이 로컬 HTML의 스크립트를 막는 PC(메일·메신저의 보호된 보기 등)에서는 파일을 먼저 디스크에 저장한 뒤 엽니다.
