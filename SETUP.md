# 설정 가이드

> 이 문서는 새 환경을 로컬에서 재현하고, 운영 적용 전 점검하는 절차입니다.
> 개발/운영 자격 증명과 원격 프로젝트 값은 저장소에 기록하지 않습니다. 아래의
> `✅` 표시는 코드에 존재하는 계약을 뜻하며, 현재 환경에서의 live 성공을 의미하지
> 않습니다.

---

## 1. Supabase 프로젝트

Supabase는 데이터베이스·Storage 역할을 담당하고 Clerk가 인증을 담당합니다.
새 환경에서는 로컬 fixture-FAPI 스택을 먼저 초기화하며, 링크된 원격 프로젝트에는
이 절차가 자동으로 적용되지 않습니다.

마이그레이션 기준:

- `0012`–`0014`: 기존 AI/권한/기능 기반
- `20260729121035_draft_claim_and_finalization.sql`: queue claim, stale-token fencing,
  원자적 finalization, `cards.source_draft_id`, 보호 컬럼 경계. `ai_settings`의 회사
  검색 provider는 `openai-codex`, `anthropic-claude`, `openai-api`를 모두 허용하며
  기존 `openai-codex` 설정을 강제로 변환하지 않습니다.

모든 변경 함수는 Clerk `sub` 기반 owner RLS를 유지하며, 검색 함수는
`security invoker`로 남습니다. queue transition/finalization/enrich mutation만
좁은 `security definer` 경계를 사용하고 명시적 grants와 빈 `search_path`를 갖습니다.

---

## 2. Supabase ↔ Clerk 연결

Supabase 가 Clerk 이 발급한 로그인 토큰을 신뢰하도록 등록하는 단계입니다.
(대시보드 로그인이 필요한 작업이라 직접 하셨습니다.)

1. Supabase 대시보드 → Authentication → Third-Party Auth 로 이동
2. **Add integration → Clerk** 선택
3. Clerk 도메인에 아래 값을 그대로 붙여넣고 저장

```
<개발 Clerk Frontend API URL>
```

> Clerk 쪽 준비(세션 토큰에 `role: authenticated` 클레임 추가)는 CLI 로 이미
> 끝내 뒀습니다. 위 3단계만 하면 됩니다.

설정 전에는 앱을 열면 **"Supabase 연결이 한 단계 남았습니다"** 안내가 뜨고,
같은 3단계가 화면에 적혀 있습니다. 설정 후 그 화면의 **다시 시도** 를 누르면 됩니다.

기존 데이터와 OAuth 연결은 계정별로 분리됩니다. 이 문서에는 계정 식별자나
명함 데이터를 기록하지 않습니다.

---

## 3. 환경변수 — ✅ 완료

`.env.local` 에 Supabase URL/anon key 와 Clerk 키가 모두 채워져 있습니다
(Clerk 키는 `clerk init` 이 자동으로 넣었습니다).

`ALLOWED_EMAILS` 에 등록된 이메일만 앱에 들어올 수 있습니다. Clerk 으로 로그인해도
이 목록에 없으면 거부됩니다 — 개인용 앱이라 이중으로 잠가둔 것입니다.
현재 허용 목록은 각 환경의 `ALLOWED_EMAILS`/`ALLOWED_USER_IDS` 값으로 관리합니다.

---

## 3-1. 가족·동료를 추가하려면

한 사람이 늘어도 **DB 는 그대로 하나**입니다. 같은 테이블에 `owner_id` 만 다른 행이
쌓이고, DB 정책(RLS)이 남의 행을 아예 안 돌려줍니다. 서로의 명함은 보이지 않습니다.

### 이메일을 아는 경우 (구글 로그인 등)

`ALLOWED_EMAILS` 에 쉼표로 추가하면 끝입니다. 배포본이면 Vercel 환경변수를 고치고
재배포하세요.

### Apple 로그인을 쓰는 경우 ⚠️

Apple 은 로그인할 때 **"이메일 가리기"** 를 고를 수 있고, 그러면 실제 주소 대신
`xxxxx@privaterelay.appleid.com` 같은 임의 주소가 앱에 전달됩니다. 이 주소는 미리
알 수 없으므로 **이메일로는 등록할 수 없습니다.**

그래서 사용자 ID 로도 등록할 수 있게 해뒀습니다:

1. 상대방이 먼저 로그인합니다 (Apple 이든 구글이든)
2. **"아직 사용 권한이 없습니다"** 화면이 뜨고, 거기에 본인 **사용자 ID**(`user_…`)가
   표시됩니다. **복사하기** 버튼으로 복사해 보내달라고 하세요
3. 받은 ID 를 `ALLOWED_USER_IDS` 에 쉼표로 추가 → 재배포
4. 상대방이 새로고침하면 들어옵니다

관리자 쪽에서 직접 확인해도 됩니다:

```bash
clerk users list
```

### 추가된 사람이 해야 할 일

- **AI 연결은 각자** 합니다. 설정 화면에서 본인 ChatGPT/Claude 구독을 연결해야
  명함 인식·질문이 작동합니다. 다른 사람의 구독은 공유되지 않습니다.
- 명함첩은 **빈 상태로 시작**합니다.

### 다 모였으면 가입을 잠그세요 (권장)

지금은 누구나 Clerk 계정을 만들 수 있습니다(만들어도 데이터는 못 봅니다). 필요한
사람이 다 등록됐으면 잠가두는 편이 낫습니다:

```bash
clerk config patch --json '{"auth_access_control":{"sign_up_mode":"restricted"}}' --yes
```

---

## 4. 실행

```bash
npm run dev
```

http://localhost:3000 접속 → Clerk 로그인 화면에서 **Google 로 로그인**
(또는 이메일) → 홈 화면이 뜨면 성공입니다.

---

## 5. AI 연결 경로

명함 인식과 질문은 사용자 OAuth(구독) 경로입니다. 회사 정보 검색은 설정에서 다음
세 경로 중 하나를 선택합니다.

- **ChatGPT OAuth (비공식·실험)** — 구독 연결을 사용하지만 비공식 Codex backend에
  의존해 예고 없이 중단되거나 응답 형식이 바뀔 수 있습니다.
- **Claude OAuth** — 연결한 Claude 구독을 사용합니다.
- **OpenAI API (공식·서버 소유)** — `OPENAI_API_KEY`와
  `OPENAI_SEARCH_MODEL`(기본 `gpt-5.6`)을 사용합니다. API 사용료는 ChatGPT 구독과
  별도입니다.

`provider: null`인 회사 검색 설정은 현재 활성 OAuth 연결을 사용합니다. 특정 OAuth
provider를 고르면 그 연결이 있을 때만 실행됩니다. 인증 만료, 사용량 제한, 비정상
응답, 검색 미실행, 출처 없음은 고정 오류 코드로 중단하며 **다른 provider로 자동
전환하지 않습니다.** 남은 회사는 대기 상태로 보존되므로 설정에서 Claude나 공식
OpenAI API를 직접 선택한 뒤 다시 시도합니다. 공식 API를 선택했는데 키가 없으면
`provider_unconfigured`를 표시합니다.

### 5-1. AI 구독 연결 (ChatGPT / Claude — 하나만 해도 됩니다)

앱 안에서 합니다. **설정 → AI 분석 연결**. 두 제공자를 모두 연결해 두고
한쪽이 사용량 한도에 걸리면 "이걸로 사용" 버튼으로 전환할 수 있습니다.

### ChatGPT (Plus/Pro 구독)

1. **ChatGPT 연결하기** → 새 탭에서 ChatGPT 로그인
2. 로그인을 마치면 `localhost:1455/auth/callback?code=...` 로 이동하면서
   **"연결할 수 없음" 오류 페이지**가 뜹니다 → **정상입니다**
3. 그 페이지의 **주소창 URL 전체를 복사**해서 앱의 입력칸에 붙여넣고 **연결 완료**

### Claude (Pro/Max 구독)

1. **Claude 연결하기** → 새 탭에서 Claude 로그인 + 권한 승인
2. 승인이 끝나면 **화면에 인증 코드가 표시됩니다** (`…#…` 형태)
3. 그 코드를 **전체 복사**해서 앱의 입력칸에 붙여넣고 **연결 완료**

왜 이렇게 하냐면 — 두 OAuth 클라이언트 모두 리다이렉트 주소가 고정되어 있어서
(ChatGPT 는 `localhost:1455`, Claude 는 콘솔의 코드 표시 페이지), 호스팅된 웹앱이
콜백을 직접 받을 수 없기 때문입니다. OpenClaw 등이 헤드리스 환경에서 쓰는 것과
같은 방식입니다. **최초 1회만** 하면 이후로는 토큰이 자동 갱신됩니다.

> Claude 쪽 모델은 `.env.local` 의 `CLAUDE_MODEL` 로 바꿀 수 있습니다
> (기본 `claude-sonnet-5`).

---

## 6. 배포 전 preflight (읽기 전용)

Todo 11 통합 검증은 Vercel/Supabase 설정을 읽기만 하며, 원격 migration 적용·배포·
publish·commit·push를 수행하지 않습니다. 운영 적용 전 담당자가 별도로 다음을
확인합니다.

1. 운영 Clerk 인스턴스와 Supabase Third-Party Auth가 같은 Frontend API를 가리키는지 확인
2. 운영 환경변수에 서버 전용 키를 입력하고 브라우저 번들에 포함되지 않는지 확인
3. `0012` 이후 migration을 백업·승인된 순서로 적용하고 DB/RLS smoke를 재실행
4. Vercel build 로그에서 remote Supabase mutation·secret 출력이 없는지 확인

이 문서의 로컬 명령은 새 임시 포트/임시 디렉터리에서 실행하며, 원격 값이 감지되면
`remote_target_gate`로 중단합니다.

---

## 중복 명함은 어떻게 처리되나

저장 버튼을 누르면 먼저 비슷한 명함이 있는지 확인하고, 상황별로 다르게 묻습니다.
**저장을 막지는 않습니다** — 판단은 항상 사용자가 합니다.

| 상황 | 판정 근거 | 화면 동작 |
|---|---|---|
| 같은 사람이 명함을 새로 줌 (직함 변경, 이직) | 이메일·휴대폰이 같거나 회사+이름이 같음 | **"이 명함을 새 명함으로 교체"** → 옛 명함은 *지난 명함* 으로 내려가고 서로 링크됨 |
| 같은 회사의 다른 사람 | 회사명만 같음 | 기존 동료 목록을 보여주고 그대로 저장 |
| 같은 사람인데 따로 보관하고 싶음 | — | **"그래도 새 명함으로 저장"** |

- 전화번호는 표기가 달라도(`+84 368 114 882` vs `0368-114-882`) 같은 번호로 인식합니다.
- *지난 명함* 은 목록·검색·질문에서 기본으로 빠지지만 삭제되지 않습니다.
  옛 연락처도 단서가 되기 때문입니다. **명함 → "지난 명함"** 필터로 볼 수 있습니다.
- 회사명 옆의 **"외 N명"** 을 누르면 그 회사 사람들만 모아 볼 수 있습니다.

---

## 전화번호 자동 정리

국가번호가 붙은 번호는 저장할 때 현지 표기로 바꿉니다. 명함에 적힌 원문이 아니라
**바로 누를 수 있는 형태**로 저장하기 위해서입니다.

| 명함 원문 | 저장되는 값 |
|---|---|
| `+82 10-7494-1491` | `010-7494-1491` |
| `+84 368 114 882` | `0368-114-882` |
| `+82 (0)2 555 0199` | `02-555-0199` |
| `054)976-6665` | `054-976-6665` |

한국(+82)·베트남(+84)만 변환하고, 그 외 국가번호는 원문 그대로 둡니다.
잘못 바꾸는 것보다 안 바꾸는 쪽이 안전하기 때문입니다.

---

## 7. 검증과 증적

| 항목 | 상태 |
|---|---|
| 로컬 unit/CT/lint/typecheck/build | `npm run test`, `npm run test:ct`, `npm run lint`, `npm run typecheck`, `npm run build` |
| 로컬 DB/RLS/동시성 | `npm run test:db:local`, `npm run test:db:concurrency -- --scenario full` (fixture-FAPI wrapper 필수) |
| production E2E | `node scripts/run-local-production-e2e.mjs -- ...` (Clerk identity + local data-plane 조건 필요) |
| 공식 OpenAI live smoke | `npm run test:openai:live -- --company OpenAI` (키가 있을 때만) |
| 증적 검사/동결 | `npm run evidence:scan`, `npm run delivery:snapshot`, `npm run evidence:freeze` |

자격 증명 누락은 `credential_gate`, Docker 미실행은 `docker_gate`, 원격 DB와
OpenAI live 검증은 `blocked_external`로 기록합니다. 이 상태를 pass로 바꾸지 않습니다.
실행 후 sanitized 영수증은 `.omo/evidence/business-card-priority-fixes/`에 두며,
raw trace·auth state·서버·임시 디렉터리는 cleanup receipt 확인 후 제거합니다.

## 8. 롤백과 운영 적용

Todo 11은 원격 migration을 적용하거나 배포·커밋하지 않습니다. 운영 적용 시에는
백업과 승인 후 `0012` 이후 순서를 확인하고, migration별 smoke/RLS 테스트가 통과한
것만 다음 단계로 진행합니다. 실패 시 새 migration을 덧대어 상태를 명시적으로
복구하거나 검증된 백업을 되돌린 뒤 `npm run test:db:local`과 동시성 테스트를 다시
실행합니다. 보호 컬럼 grants/RLS 변경을 수동 SQL로 우회하지 마세요.

ChatGPT 경로를 쓰다 문제가 생기면 설정에서 Claude로 전환하면 됩니다.
모델명이 안 맞을 때는 설정의 **작업별 모델** 에서 다른 모델을 고르거나,
`.env.local` 의 `CODEX_MODEL` / `CLAUDE_MODEL` 로 기본값을 바꿀 수 있습니다.

Codex 백엔드는 **비공식 표면**이라 OpenAI가 예고 없이 바꿀 수 있습니다.
그때는 `lib/ai/codex.ts` 한 파일만 고치면 되도록 분리해뒀습니다.

---

## 개발 중 자동 로그인 (`/api/dev/login`)

로컬에서 화면을 확인할 때마다 소셜 로그인을 다시 하는 게 번거로워서, 개발 서버에만
열리는 자동 로그인 경로를 뒀습니다. 브라우저에서 한 번 열면 로그인된 상태가 됩니다.

```
http://localhost:3000/api/dev/login
```

Clerk 의 **sign-in token** 을 발급받아 `/sign-in?__clerk_ticket=…` 으로 넘기는 방식이라
비밀번호가 필요 없고, 만들어지는 세션은 평소 로그인과 완전히 같습니다 —
Supabase RLS 도 그대로 동작합니다.

로그인할 사용자는 `.env.local` 에서 지정합니다.

```
DEV_LOGIN_USER_ID=user_…   # Clerk 사용자 ID
```

**프로덕션에는 절대 넣지 마세요.** Vercel 환경변수에 추가할 필요도 없습니다.
세 겹으로 잠겨 있어 하나라도 어긋나면 404 입니다.

1. 프로덕션 빌드(`NODE_ENV=production`)에서는 무조건 차단
2. `CLERK_SECRET_KEY` 가 `sk_test_`(개발 인스턴스)일 때만 동작
3. `DEV_LOGIN_USER_ID` 를 직접 넣었을 때만 동작

`proxy.ts` 의 공개 경로 목록에도 개발 모드에서만 추가됩니다.

> 테스트 명함이 실제 명함과 섞이는 게 싫으면, Clerk 대시보드에서 테스트용 사용자를
> 하나 만들고 그 ID 를 `DEV_LOGIN_USER_ID` 와 `ALLOWED_USER_IDS` 에 넣으면 됩니다.
> 데이터는 `owner_id` 로 분리돼 있어 서로 보이지 않습니다.

---

## 문제가 생기면

| 증상 | 원인 |
|---|---|
| `토큰 조회 실패: No suitable key or wrong key type` | **2번(Supabase ↔ Clerk 연결)을 안 했습니다.** 가장 흔한 원인 |
| 로그인 후 계속 `/sign-in` 으로 튕김 | `ALLOWED_EMAILS` 에 로그인한 이메일이 없음 |
| 명함이 0장으로 보임 | 다른 계정으로 로그인했거나 로컬 Supabase/RLS preflight가 끝나지 않았습니다 |
| `환경변수 ... 가 설정되지 않았습니다` | `.env.local` 누락 → 서버 재시작 필요 |
| `/api/dev/login` 이 404 | 프로덕션 빌드이거나 Clerk 키가 `sk_live_` — 개발 서버에서만 열립니다 |
| `/api/dev/login` 이 400 | `DEV_LOGIN_USER_ID` 없음 → `.env.local` 에 넣고 서버 재시작 |
| 명함 분석 시 401 | AI 토큰 만료 → 설정에서 다시 연결 |
| 명함 분석 시 429 | 구독 사용량 한도 도달 → 설정에서 다른 AI로 전환하거나 리셋 후 재시도 |
| 이미지 업로드는 되는데 분석만 실패 | 이미지는 저장돼 있으니 수동 입력으로 진행 가능. 설정에서 다른 모델로 바꿔 재시도 |
| 번호 두 개가 한 칸에 들어감 | 저장 시 자동 분리되지만, 안 되면 확인 화면에서 *휴대폰 2* 로 옮기면 됩니다 |
