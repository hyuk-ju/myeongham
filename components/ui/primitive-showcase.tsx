import { Camera, MoreHorizontal, Save, Trash2 } from "lucide-react";
import {
  Action,
  Chip,
  FormField,
  IconButton,
  Panel,
  Progress,
  StateBlock,
  StatusBadge,
  Surface,
} from "@/components/ui";

export function PrimitiveShowcase() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      <header className="max-w-2xl">
        <p className="text-xs font-semibold text-brand">개발 전용</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Paper binder primitives</h1>
        <p className="mt-2 text-sm text-soft">
          기본·hover·focus·disabled·loading·error·empty 상태를 한 화면에서 확인합니다.
        </p>
      </header>

      <Panel
        title="Actions"
        description="모든 조작 영역은 최소 44px이며 키보드 초점이 보입니다."
        variant="slip"
      >
        <div className="flex flex-wrap gap-3">
          <Action icon={<Save aria-hidden="true" className="size-4" />}>저장</Action>
          <Action variant="secondary" icon={<Camera aria-hidden="true" className="size-4" />}>
            촬영
          </Action>
          <Action variant="quiet">나중에</Action>
          <Action variant="danger" icon={<Trash2 aria-hidden="true" className="size-4" />}>
            삭제
          </Action>
          <Action disabled>비활성</Action>
          <Action loading>저장 중</Action>
          <IconButton aria-label="더 보기" icon={<MoreHorizontal className="size-5" />} />
        </div>
      </Panel>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Fields" variant="slip">
          <div className="space-y-5">
            <FormField
              id="showcase-company"
              label="회사명"
              description="명함에 적힌 이름을 입력하세요."
              inputProps={{ placeholder: "회사명" }}
            />
            <FormField
              id="showcase-email"
              label="이메일"
              error="이메일 형식을 확인해 주세요."
              inputProps={{ defaultValue: "invalid-value" }}
            />
          </div>
        </Panel>

        <Panel title="Status and progress" variant="slip">
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <StatusBadge>대기</StatusBadge>
              <StatusBadge tone="brand">검토</StatusBadge>
              <StatusBadge tone="success">완료</StatusBadge>
              <StatusBadge tone="warning">확인 필요</StatusBadge>
              <StatusBadge tone="danger">실패</StatusBadge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip>전체</Chip>
              <Chip selected>선택됨</Chip>
            </div>
            <Progress label="명함 분석" value={64} />
            <Progress label="회사 정보를 찾는 중" />
          </div>
        </Panel>
      </div>

      <Surface variant="tinted" className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold">State blocks</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <StateBlock state="loading" title="명함을 읽는 중" description="잠시만 기다려 주세요." />
          <StateBlock state="empty" title="아직 담긴 명함이 없습니다" description="촬영하면 여기에 표시됩니다." />
          <StateBlock state="error" title="저장하지 못했습니다" description="입력 내용을 유지했습니다. 다시 시도해 주세요." />
          <StateBlock state="success" title="저장했습니다" description="명함 목록에서 바로 확인할 수 있습니다." />
        </div>
      </Surface>
    </main>
  );
}
