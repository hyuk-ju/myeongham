# 명함첩 디자인 시스템

이 문서는 명함첩의 기존 화면과 CSS에서 추출한 시각·상호작용 계약이다. 새 화면은
여기에 없는 색이나 컴포넌트 문법을 임의로 만들지 않고, 필요한 변화가 생기면 먼저
이 문서를 갱신한다.

## 0. Research Log

- 기존 구현: `app/globals.css`, 인증 화면, 하단 탐색, 카드 목록과 촬영·검토 화면의
  반복 패턴을 조사했다. Tailwind CSS 4의 CSS 토큰 방식을 유지한다.
- 로컬 화면 자료: 안전 기준 manifest의 포함 목록이 비어 있어 픽셀 기준본으로 쓰지
  않았다. 제외된 화면은 비공개 로컬 구조 참고로만 확인했으며 콘텐츠나 식별값을 이
  문서와 증거에 옮기지 않았다.
- 방향: 기존의 따뜻한 종이 바탕, 흰 카드 슬립, 코발트 단일 강조색, 절제된 깊이를
  보존한다. 외부 브랜드나 새 시각 언어는 도입하지 않는다.
- 승인 기준: 375/768/1280px, 키보드, 200% 확대, 명확한 상태 피드백, WCAG 2.2 AA를
  우선한다. 장식용 이미지나 동작은 추가하지 않는다.

## 1. Atmosphere & Identity

명함첩은 오래 쓰는 종이 명함 바인더처럼 조용하고 믿을 수 있어야 한다. 배경은 따뜻한
종이, 작업 단위는 살짝 들린 흰 카드 슬립, 행동의 표식은 코발트 한 색이다. 시그니처는
`paper → slip → cobalt mark`의 세 층이다. 화면은 화려함보다 빠른 훑어보기, 안정적인
입력, 분명한 복구를 우선한다.

### 사용 맥락과 페르소나

- 현장 사용자: 한 손으로 촬영·검토하며 44px 이상의 터치 영역과 짧고 구체적인
  상태 문구가 필요하다.
- 키보드 사용자: 모든 행동을 논리적 탭 순서와 강한 `focus-visible` 표시로 수행한다.
- 저시력·확대 사용자: 200% 확대와 375px 폭에서도 주요 콘텐츠가 가로로 넘치지 않고
  텍스트가 잘리지 않아야 한다.
- 주의가 분산된 사용자: 한 화면의 기본 행동은 하나가 가장 강하고, 오류는 원인과
  다음 행동을 함께 설명하며, 진행 상태는 텍스트로도 전달한다.

## 2. Color

### Palette

| 역할 | CSS token | Light | Dark | 용도 |
| --- | --- | --- | --- | --- |
| Paper | `--paper` | `#f5f4f1` | `#121110` | 앱 배경 |
| Surface | `--surface` | `#ffffff` | `#1c1b19` | 카드, 필드 |
| Raised | `--surface-raised` | `#ffffff` | `#232220` | 떠 있는 패널 |
| Hover | `--surface-hover` | `#eeece7` | `#2b2926` | 중립 hover |
| Ink | `--ink` | `#1c1a17` | `#ebe8e3` | 본문·제목 |
| Soft ink | `--ink-soft` | `#6f6a63` | `#aaa49b` | 보조 정보 |
| Faint ink | `--ink-faint` | `#837d75` | `#918b82` | 비활성·메타데이터 |
| Line | `--line` | `#e5e2dc` | `#35322e` | 구분선 |
| Strong line | `--line-strong` | `#cec9c0` | `#4a4640` | 필드 경계 |
| Cobalt | `--brand` | `#2f4fd8` | `#7890f2` | 주 행동·링크 |
| Cobalt hover | `--brand-hover` | `#243fbc` | `#93a5f6` | 주 행동 hover |
| On cobalt | `--brand-ink` | `#ffffff` | `#10131f` | 강조면 위 텍스트 |
| Cobalt soft | `--brand-soft` | `#e9edfc` | `#232a44` | 선택·정보 배경 |
| Success | `--ok` / `--ok-soft` | `#0e7a4f` / `#e3f4ec` | `#58d09e` / `#163024` | 완료 |
| Warning | `--warn` / `--warn-soft` | `#805407` / `#fdf3df` | `#efbf62` / `#322916` | 주의 |
| Danger | `--danger` / `--danger-soft` | `#b52e2e` / `#fbe9e9` | `#ee8585` / `#351d1d` | 실패·파괴 |
| Focus | `--focus` | `#183bbf` | `#a9b7ff` | 키보드 초점 |

### Rules

- 강조색은 행동, 선택, 초점에만 쓴다. 장식에는 쓰지 않는다.
- 상태는 색과 함께 아이콘 또는 텍스트를 제공한다.
- `foreground`, `surface-hover` 같은 호환 유틸도 위 토큰으로만 해석한다.
- raw hex/rgb 색은 이 표와 `app/globals.css`의 토큰 선언 밖에서 쓰지 않는다.

## 3. Typography

### Font stack

- Primary: `Pretendard`, Apple·Windows 한국어 시스템 산세리프 순서.
- Mono: `ui-monospace`, `SFMono-Regular`, `Menlo`, `Consolas`, monospace.
- 별도 웹폰트 요청을 만들지 않는다. 한국어 가독성과 초기 표시 안정성을 우선한다.

### Scale

| 단계 | Token | 크기 / 행간 | 무게 | 용도 |
| --- | --- | --- | --- | --- |
| Display | `--text-display` | `2rem / 1.18` | 750 | 인증·빈 상태의 큰 제목 |
| H1 | `--text-h1` | `1.5rem / 1.3` | 700 | 화면 제목 |
| H2 | `--text-h2` | `1.125rem / 1.4` | 650 | 패널 제목 |
| Body | `--text-body` | `1rem / 1.6` | 400 | 입력·본문 |
| Small | `--text-small` | `0.875rem / 1.55` | 400 | 설명 |
| Caption | `--text-caption` | `0.75rem / 1.5` | 550 | 상태·메타 |

제목은 `text-wrap: balance`, 본문은 `text-wrap: pretty`를 기본으로 한다. 한국어 의미
단위를 억지로 한 줄에 고정하지 않으며, 긴 식별 문자열은 `overflow-wrap: anywhere`로
컨테이너 안에서 줄바꿈한다. 입력 글자는 모바일 확대를 막기 위해 16px 미만으로
내리지 않는다.

## 4. Spacing & Layout

### Spacing

기본 단위는 4px이다.

| Token | 값 | 용도 |
| --- | --- | --- |
| `--space-1` | 4px | 아이콘과 짧은 라벨 |
| `--space-2` | 8px | 조밀한 묶음 |
| `--space-3` | 12px | 필드 내부·목록 간격 |
| `--space-4` | 16px | 모바일 패널 내부 |
| `--space-5` | 20px | 편안한 묶음 |
| `--space-6` | 24px | 데스크톱 패널 내부 |
| `--space-8` | 32px | 섹션 간격 |
| `--space-10` | 40px | 큰 구분 |
| `--space-12` | 48px | 화면 상단 여백 |

### Radius, elevation, layout

| Token | 값 | 용도 |
| --- | --- | --- |
| `--radius-sm` | 8px | 작은 배지 |
| `--radius-md` | 12px | 버튼·필드 |
| `--radius-lg` | 16px | 기본 패널 |
| `--radius-xl` | 24px | 인증 카드·주요 표면 |
| `--shadow-slip` | 종이색이 섞인 2단 그림자 | 카드 슬립 |
| `--shadow-float` | 종이색이 섞인 3단 그림자 | 인증·떠 있는 표면 |

- 콘텐츠 폭은 인증 28rem, 읽기 42rem, 작업 화면 80rem을 상한으로 한다.
- 375px: 한 열, 16px 좌우 여백. 768px: 24px 여백. 1280px: 중앙 정렬과 32px 여백.
- 전체 높이는 `min-height: 100dvh`; 하단 고정 영역은 safe-area inset을 더한다.
- 스크롤 소유자는 페이지다. 고정 하단 바가 있을 때 본문이 가리지 않도록
  `pb-safe-nav`를 쓴다.

## 5. Components

### Action

- 구조: `<button>` 또는 링크 역할을 보존한 `<a>`, 아이콘, 라벨, 로딩 표시.
- 변형: primary, secondary, quiet, danger.
- 상태: default, hover, active, focus-visible, disabled, loading.
- 접근성: 최소 높이 44px, 로딩 중 `aria-busy`, 비활성화, 시각 외 텍스트 유지.
- 동작: hover는 색·그림자, active는 `transform`; 레이아웃 값은 애니메이션하지 않는다.

### IconButton

- 구조: Lucide 아이콘을 담는 정사각형 버튼.
- 변형: neutral, primary, danger.
- 접근성: 필수 `aria-label`, 44×44px, 장식 아이콘 `aria-hidden`.

### Surface / Panel

- 구조: 의미에 맞는 `section`, `article`, `aside`, `div` 안에 제목·설명·내용.
- 변형: plain, slip, raised, tinted.
- 상태: 정적 표면에는 hover나 장식 움직임을 넣지 않는다.
- 깊이: border + tonal shift + 토큰 그림자의 혼합 전략을 쓴다.

### Chip / StatusBadge

- Chip은 필터·선택에, StatusBadge는 정보 상태에 쓴다.
- 상태: neutral, brand, success, warning, danger. 선택 가능 Chip은
  `button`과 `aria-pressed`를 사용한다.
- 긴 라벨은 줄바꿈하되 영역 밖으로 넘치지 않는다.

### FormField

- 구조: `<label>` 안의 라벨, 선택 설명, control, 오류.
- 상태: default, focus-within, disabled, error.
- 접근성: 설명·오류 ID를 `aria-describedby`로 연결하고 오류는 `role="alert"`로 알린다.

### Progress

- determinate는 `role="progressbar"`와 현재값을 제공한다.
- indeterminate는 `role="status"`와 텍스트를 제공하며 회전 아이콘은 장식이다.
- 감소 모션에서는 회전을 제거해도 상태 문구가 의미를 보존한다.

### StateBlock

- 구조: Lucide 아이콘, 상태 제목, 설명, 선택적 행동.
- 변형: loading, empty, error, success, info.
- 오류는 `role="alert"`, 나머지 동적 상태는 `role="status"`와 `aria-live`를 쓴다.
- 텍스트는 원인과 다음 행동을 짧게 설명한다.

### AuthView

- 서버 데이터나 Clerk 의존성이 없는 순수 뷰다. 제품 마크·제목·설명·알림·인증
  슬롯을 렌더링한다.
- 375px에서는 페이지 자체가 카드 여백을 담당하고, 넓은 화면에서는 raised paper
  frame 안에 인증 공급자 UI를 둔다.
- Clerk 페이지는 이 뷰를 서버에서 조합하고, Clerk 카드 스타일은 동일 토큰에 맞춘다.

### NotAllowedView / CopySupportDetails

- 서버 경계가 원본 계정 식별자를 보유하고 비가역 지원 코드와 마스킹 이메일만 만든다.
- 클라이언트 props, DOM, 클립보드에는 마스킹 값만 전달한다.
- 복사 성공은 `aria-live="polite"`로 알리고 텍스트와 Lucide 아이콘을 함께 쓴다.

## 6. Motion & Interaction

| Token | 값 | 용도 |
| --- | --- | --- |
| `--motion-fast` | 120ms | 누름·초점 |
| `--motion-standard` | 200ms | hover·상태 변화 |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | 물리감 있는 정착 |

- 의미 있는 상호작용에서만 `transform`, `opacity`, `filter`를 애니메이션한다.
- 버튼은 hover에서 표면 대비를 높이고 active에서 최대 1px만 이동한다.
- `prefers-reduced-motion: reduce`에서는 애니메이션·부드러운 스크롤을 제거한다.
- 자동 재생, 장식용 진입, 무한 애니메이션은 없다. 진행 표시만 상태 전달 목적으로
  회전할 수 있다.

## 7. Depth & Surface

전략은 mixed이다. 종이 배경과 흰 슬립의 tonal shift, 얇은 따뜻한 border, 종이색이
섞인 낮은 그림자를 함께 쓴다. 그림자의 광원은 위쪽이며, hover 가능한 슬립만 아주
미세하게 깊이가 바뀐다. 입력과 내부 배지는 외부 패널보다 작은 radius를 사용해
계층을 드러낸다. `backdrop-filter`나 유리 효과는 하단 탐색처럼 실제 겹침을 설명하는
경우에만 쓴다.

## 8. Accessibility Constraints, Debt & Handoff

### Constraints

- 목표: WCAG 2.2 AA. 일반 텍스트 4.5:1, 큰 텍스트·UI 경계 3:1 이상.
- 모든 조작 요소는 최소 44×44 CSS px, 보이는 `focus-visible`, 키보드 도달이 필요하다.
- 색만으로 상태를 표현하지 않는다. 상태 변경은 적절한 `aria-live`, `status`, `alert`로
  알린다.
- 확대를 막지 않으며 200% 확대, 긴 한국어·영문·끊기지 않는 문자열을 견딘다.
- 감소 모션과 safe-area를 지원한다. 로딩·빈 상태·오류에는 다음 행동이 드러난다.
- 전체 Clerk 사용자 ID, 인증 토큰, 실제 개인 데이터는 DOM·클립보드·스크린샷·증거에
  포함하지 않는다.

### Accepted debt

| 항목 | 위치 | 이유 | Owner / Exit |
| --- | --- | --- | --- |
| 기존 기능 화면의 primitive 전환 | Todo 8–10 소유 화면 | 현재 작업의 파일 소유권 밖이며 병렬 변경 충돌 방지 | 해당 Todo가 이 계약을 적용 |
| 인증된 전체 여정 visual QA | production E2E | 개발 Clerk 자격증명과 통합된 로컬 데이터 plane이 필요 | Todo 11 통합 gate |
| 배포 환경 Lighthouse | 배포 URL | 이 작업은 배포를 허용하지 않음 | Todo 11 배포 후 mobile/desktop 측정 |

### Handoff

- 기능 화면은 raw 색과 손수 만든 SVG를 추가하지 말고 이 문서의 토큰과
  `components/ui` primitive를 사용한다.
- `AuthView`와 `NotAllowedView`는 인증 공급자와 분리된 순수 뷰이며, Clerk 동작은
  서버 경계에서 안전한 action slot으로 주입한다.
- 새 상태가 필요하면 `StateBlock` 의미와 ARIA 계약을 먼저 확장한다.
- 최종 통합 gate는 375/768/1280px, 200% 확대, 키보드, 감소 모션, 긴 CJK 텍스트를
  같은 빌드에서 검증하고 남은 debt를 갱신한다.
