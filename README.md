# Team 3 Landing (시안)

7명의 To-do를 한 화면에서 여는 발표용 랜딩입니다. 무지개색 연기(성운) 위에 7명을 상징하는 항성이 떠 있고, 별을 고르면 그 사람의 To-do가 열립니다.

## 실행

```bash
npm install
npm run dev      # http://localhost:5173/todo_list_3th/
npm run build    # dist/ 생성
npm run preview  # 빌드 결과 확인 http://localhost:4173/todo_list_3th/
```

URL 옵션

| 옵션 | 효과 |
|---|---|
| (없음) | 전체 연출. OS의 '애니메이션 효과' 설정과 관계없이 항상 켜짐 |
| `?reduced` | 움직임을 최소화하고 완성된 화면을 바로 표시 |
| `?lite` | 연기 해상도를 낮춤 (저사양 PC) |
| `?debug` | 좌하단에 fps·해상도·상태 표시 |

## 발표 조작

| 키 | 동작 |
|---|---|
| `→` / `Enter` / 클릭 | 인트로 → 항성 등장 |
| `←` `→` 또는 `1`~`7` | 사람 선택 |
| `Enter` / 항성 클릭 | To-do 열기 |
| `Esc` | 닫기 (iframe 안에서도 동작) |

## 팀원 규칙

각자 `public/todos/<자기 폴더>/` 안에서만 작업합니다.

| 폴더 | 이름 | 색 |
|---|---|---|
| `01-gang` | 강성수 | `#FF3B4E` |
| `02-seo` | 서종찬 | `#FF8A2B` |
| `03-oh` | 오명석 | `#FFD93B` |
| `04-yu` | 유상진 | `#3BE07A` |
| `05-lee-mj` | 이명지 | `#3B8BFF` |
| `06-lee-je` | 이정은 | `#5B4BFF` |
| `07-hong` | 홍정기 | `#B04BFF` |

1. 시작 파일은 `index.html`입니다.
2. `<meta charset>` 바로 다음, 다른 script보다 먼저 아래 한 줄을 넣습니다.
   ```html
   <script src="../../shared/storage-scope.js"></script>
   ```
   평소처럼 `localStorage.setItem('todos', ...)`를 쓰면 실제로는 `team3:<폴더>:todos`로 저장됩니다. `clear()`는 자기 폴더 키만 지웁니다.
3. 파일명은 소문자와 하이픈만 씁니다. 경로는 `./style.css`처럼 상대 경로로 씁니다. `/style.css`처럼 `/`로 시작하면 배포 후 깨집니다.
4. 저장 데이터가 비어 있으면 예시 항목을 채웁니다. 발표 PC에는 각자 입력한 데이터가 없습니다.
5. `top.location` 변경 같은 프레임 탈출 코드는 쓰지 않습니다.
6. Esc를 직접 처리하려면 `event.preventDefault()`를 호출하세요. 그러면 랜딩 뷰어가 닫히지 않습니다.

`storage-scope.js`는 브라우저가 강제하는 격리가 아닙니다. 이 스크립트를 빼먹거나 IndexedDB·쿠키를 쓰면 분리되지 않습니다.

## 구조

```
index.html              랜딩
src/main.js             장면·입력·전환
src/fluid.js            WebGL2 연기 시뮬레이션
src/style.css
src/members.json        이름·색·경로
public/shared/storage-scope.js
public/todos/<폴더>/     각자 To-do (현재는 임시 페이지)
```

`vite.config.js`의 `base`는 `/todo_list_3th/`입니다 (GitHub Pages 하위 경로).
