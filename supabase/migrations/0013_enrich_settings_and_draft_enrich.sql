-- 회사 정보 검색(enrich)을 작업별 모델 설정에 편입 + 대기열 자동 보강
--
-- 지금까지 웹 검색은 Claude 로 고정돼 있었다. Codex(ChatGPT) 백엔드도
-- tools:[{type:'web_search'}] 를 받아준다는 걸 실측으로 확인해서
-- (web_search_preview 는 400), 명함 인식·질문과 마찬가지로 사용자가 고를 수 있게 한다.

alter table public.ai_settings
  add column if not exists enrich_provider text
    check (enrich_provider in ('openai-codex', 'anthropic-claude')),
  add column if not exists enrich_model text;

-- 대기열에서 미리 받아둔 회사 정보 제안.
--
-- 자동으로 태그를 적용하지는 않는다 — 웹 검색은 동명 회사 오답이 나올 수 있어
-- 사용자가 보고 고르는 게 원칙이다. 여기 담아두는 이유는 검토 화면을 열었을 때
-- 20~40초를 기다리지 않게 하기 위해서다.
alter table public.card_drafts
  add column if not exists enrich jsonb;

-- 역량 태그는 사람이 아니라 회사에 붙는 정보다. 같은 회사 명함이 여러 장이면
-- 검색 한 번의 결과를 전부에 꽂아 넣어 재검색을 막는다.
-- 회사명 표기 흔들림((주)선진템 / 주식회사 선진템)은 normalize_company 가 흡수한다.
create or replace function public.apply_draft_enrich(p_company text, p_enrich jsonb)
returns integer
language sql
security invoker
set search_path = public
as $$
  with updated as (
    update public.card_drafts
    set enrich = p_enrich
    where owner_id = (select auth.jwt()->>'sub')
      and normalize_company(p_company) is not null
      and normalize_company(extracted->>'company') = normalize_company(p_company)
    returning 1
  )
  select count(*)::integer from updated;
$$;
