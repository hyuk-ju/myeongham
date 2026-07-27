-- 보안 린터 경고 해소: 함수 search_path 고정
-- (mutable search_path 는 스키마 하이재킹에 악용될 수 있다)

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
