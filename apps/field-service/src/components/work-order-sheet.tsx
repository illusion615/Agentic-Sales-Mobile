import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  MapPin,
  Navigation,
  Phone,
  Play,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import {
  assessSla,
  buildTimeSlot,
  slotDraftFor,
  SLOT_DURATION_CHOICES,
  type SlotDraft,
} from '@/domain/scheduling';
import type { WorkOrderSummary } from '@/domain/work-order';
import { startRefusal } from '@/domain/work-order';
import {
  useDataCapabilities,
  useRescheduleWorkOrder,
  useStartWorkOrder,
  useBriefing,
  useWorkOrderBriefing,
} from '@/hooks/use-work-orders';
import { navigationUrl } from '@/lib/navigation';
import { formatRemaining, SlaBadge } from './sla-badge';

function formatSlot(start?: string, end?: string): string | null {
  if (!start) return null;
  const from = new Date(start);
  if (Number.isNaN(from.getTime())) return null;
  const day = from.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
  const time = from.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (!end) return `${day} ${time}`;
  const to = new Date(end);
  if (Number.isNaN(to.getTime())) return `${day} ${time}`;
  return `${day} ${time} – ${to.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * The work order card behind a map pin.
 *
 * It opens instantly on what the dashboard already knows, then fills in the
 * detail and the pre-visit briefing as they resolve — a technician tapping a
 * pin should never wait to find out which job they tapped. Every action a visit
 * can start with lives here, so the map is a working surface rather than a
 * picture.
 */
/**
 * Who the job is for, how urgent it is, and what it is — the identity line the
 * map card and the list card must read identically.
 */
export function WorkOrderHeadline({ workOrder }: { workOrder: WorkOrderSummary }) {
  const navigate = useNavigate();
  const sla = assessSla(workOrder);

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            navigate(`/customers/${workOrder.customerId}`);
          }}
          className="flex min-w-0 items-center gap-0.5 text-left"
        >
          <h2 className="truncate text-base font-semibold text-foreground">
            {workOrder.customerName}
          </h2>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
        <SlaBadge workOrder={workOrder} />
      </div>
      <p className="mt-1 truncate text-sm text-muted-foreground">
        {workOrder.number} · {workOrder.incidentType ?? '未分类'} ·{' '}
        {formatRemaining(sla.minutesRemaining)}
      </p>
    </div>
  );
}

/**
 * Everything a technician reads before arriving. Shared by the map card and the
 * expanded list card so the two can never tell different stories about a job.
 */
export function WorkOrderDetails({
  workOrder,
  active,
  className,
}: {
  workOrder: WorkOrderSummary;
  active?: WorkOrderSummary;
  className?: string;
}) {
  const capabilities = useDataCapabilities();
  const { data } = useWorkOrderBriefing(workOrder.id);
  const briefingQuery = useBriefing(workOrder.id);
  const reschedule = useRescheduleWorkOrder(workOrder.id);

  const [scheduling, setScheduling] = useState(false);
  const detail = data?.workOrder;
  const briefing = briefingQuery.data;
  const slot = formatSlot(
    detail?.scheduledStart ?? workOrder.scheduledStart,
    detail?.scheduledEnd ?? workOrder.scheduledEnd,
  );
  const promised = formatSlot(workOrder.promisedWindowStart, workOrder.promisedWindowEnd);
  const blockedByOther = startRefusal(workOrder, active) === 'another-underway';

  // Scheduling is offered as its own control rather than a hidden tap on the date.
  const scheduleAction = capabilities.selfScheduling ? (
    <button
      type="button"
      onClick={() => setScheduling((open) => !open)}
      aria-expanded={scheduling}
      aria-label={slot ? '修改排程' : '安排时间'}
      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
        scheduling ? 'bg-primary/10 text-primary' : 'text-primary'
      }`}
    >
      <CalendarPlus className="h-4 w-4" />
    </button>
  ) : undefined;

  return (
    <div className={className}>
      <dl className="flex flex-col gap-2 text-sm">
        <Fact
          icon={<MapPin className="h-4 w-4" />}
          label="地址"
          action={
            <a
              href={navigationUrl(workOrder.address)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="导航前往"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-primary"
            >
              <Navigation className="h-4 w-4" />
            </a>
          }
        >
          {workOrder.address.line1}
        </Fact>
        {slot && (
          <Fact icon={<CalendarClock className="h-4 w-4" />} label="已排程" action={scheduleAction}>
            {slot}
          </Fact>
        )}
        {promised && !slot && (
          <Fact
            icon={<CalendarClock className="h-4 w-4" />}
            label="承诺窗口"
            action={scheduleAction}
          >
            {promised}
          </Fact>
        )}
        {!slot && !promised && capabilities.selfScheduling && (
          <Fact icon={<CalendarClock className="h-4 w-4" />} label="排程" action={scheduleAction}>
            <span className="text-muted-foreground">尚未排程</span>
          </Fact>
        )}

        {scheduling && (
          <ReschedulePanel
            initial={slotDraftFor(detail ?? workOrder)}
            pending={reschedule.isPending}
            onCancel={() => setScheduling(false)}
            onConfirm={async (draft) => {
              const built = buildTimeSlot(draft);
              if (!built) return;
              await reschedule.mutateAsync(built);
              setScheduling(false);
            }}
          />
        )}
        {detail?.assetName && (
          <Fact icon={<Wrench className="h-4 w-4" />} label="设备">
            {detail.assetName}
          </Fact>
        )}
        {detail?.contactName && (
          <Fact icon={<Phone className="h-4 w-4" />} label="联系人">
            {detail.contactName}
            {detail.contactPhone && (
              <a
                href={`tel:${detail.contactPhone}`}
                aria-label={`呼叫 ${detail.contactName}`}
                className="ml-2 inline-flex items-center gap-1 rounded-lg bg-card px-2 py-1 text-primary ring-1 ring-border"
              >
                <Phone className="h-3.5 w-3.5" />
                {detail.contactPhone}
              </a>
            )}
          </Fact>
        )}
      </dl>

      {detail?.summary && (
        <p className="mt-3 text-sm leading-relaxed text-foreground/80">{detail.summary}</p>
      )}
      {detail?.instructions && (
        <p className="mt-2 rounded-lg bg-muted/60 p-2 text-sm leading-relaxed text-foreground/80">
          {detail.instructions}
        </p>
      )}

      <section className="mt-4 rounded-xl bg-muted/40 p-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">服务前洞察</h3>
        </div>

        {briefingQuery.isPending && (
          <p className="mt-2 text-sm text-muted-foreground">正在整理这次上门的背景…</p>
        )}

        {briefingQuery.isError && (
          <div className="mt-2 flex items-center gap-2">
            <p className="min-w-0 flex-1 text-sm text-rose-600">AI 暂时不可用，没能写出洞察。</p>
            <button
              type="button"
              onClick={() => void briefingQuery.refetch()}
              className="shrink-0 rounded-full bg-card px-2.5 py-0.5 text-xs text-rose-600 ring-1 ring-rose-300"
            >
              重试
            </button>
          </div>
        )}

        {briefing && (
          <>
            <p className="mt-2 text-sm leading-relaxed text-foreground/80">{briefing.background}</p>
            {briefing.watchOuts.length > 0 && (
              <InsightList
                title="注意事项"
                titleClass="text-amber-700 dark:text-amber-300"
                items={briefing.watchOuts}
              />
            )}
            {briefing.preparation.length > 0 && (
              <InsightList
                title="出发前准备"
                titleClass="text-emerald-700 dark:text-emerald-300"
                items={briefing.preparation}
              />
            )}
          </>
        )}
      </section>

      {!capabilities.selfScheduling && (
        <p className="mt-3 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
          当前数据源由调度统一排程，应用内无法直接改期。
        </p>
      )}

      {blockedByOther && active && (
        <p className="mt-3 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
          {active.customerName}（{active.number}）正在进行中，完成后才能开始本单。
        </p>
      )}
    </div>
  );
}

/** The one action a visit begins with, subject to the one-job-at-a-time rule. */
export function WorkOrderStartAction({
  workOrder,
  active,
  className,
}: {
  workOrder: WorkOrderSummary;
  active?: WorkOrderSummary;
  className?: string;
}) {
  const navigate = useNavigate();
  const startWorkOrder = useStartWorkOrder(workOrder.id);
  const refusal = startRefusal(workOrder, active);

  return (
    <button
      type="button"
      disabled={startWorkOrder.isPending || refusal === 'another-underway'}
      onClick={async () => {
        await startWorkOrder.mutateAsync();
        navigate(`/work-orders/${workOrder.id}/capture`);
      }}
      className={`flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40 ${
        className ?? ''
      }`}
    >
      <Play className="h-4 w-4" />
      {refusal === 'already-underway' ? '继续服务' : '开始工单'}
    </button>
  );
}

export function WorkOrderSheet({
  workOrder,
  active,
  onClose,
}: {
  workOrder: WorkOrderSummary;
  /** The job already under way, which blocks starting any other. */
  active?: WorkOrderSummary;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center">
      <div className="pointer-events-auto flex max-h-[76vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-card shadow-2xl ring-1 ring-border backdrop-blur-2xl keyboard-inset-bottom">
        <div className="flex items-start gap-3 border-b border-border p-4">
          <WorkOrderHeadline workOrder={workOrder} />
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground ring-1 ring-border"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <WorkOrderDetails
          workOrder={workOrder}
          active={active}
          className="flex-1 overflow-y-auto p-4"
        />

        <div className="border-t border-border p-3">
          <WorkOrderStartAction workOrder={workOrder} active={active} />
        </div>
      </div>
    </div>
  );
}

function Fact({
  icon,
  label,
  action,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 flex-1 text-foreground/80">{children}</dd>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function InsightList({
  title,
  titleClass,
  items,
}: {
  title: string;
  titleClass: string;
  items: readonly string[];
}) {
  return (
    <>
      <h4 className={`mt-3 text-xs font-medium ${titleClass}`}>{title}</h4>
      <ul className="mt-1 list-disc pl-4 text-sm text-foreground/80">
        {items.map((item) => (
          <li key={item} className="mt-0.5">
            {item}
          </li>
        ))}
      </ul>
    </>
  );
}

function ReschedulePanel({
  initial,
  pending,
  onCancel,
  onConfirm,
}: {
  initial: SlotDraft;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (draft: SlotDraft) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const preview = buildTimeSlot(draft);

  return (
    <section className="mt-4 rounded-xl bg-muted/40 p-3">
      <h3 className="text-sm font-medium text-foreground">改期</h3>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          日期
          <input
            type="date"
            value={draft.date}
            onChange={(event) => setDraft({ ...draft, date: event.target.value })}
            className="w-full min-w-0 rounded-lg bg-card px-2 py-1.5 text-sm text-foreground ring-1 ring-border"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          开始时间
          <input
            type="time"
            value={draft.time}
            onChange={(event) => setDraft({ ...draft, time: event.target.value })}
            className="w-full min-w-0 rounded-lg bg-card px-2 py-1.5 text-sm text-foreground ring-1 ring-border"
          />
        </label>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">时长</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {SLOT_DURATION_CHOICES.map((minutes) => (
          <button
            key={minutes}
            type="button"
            onClick={() => setDraft({ ...draft, durationMinutes: minutes })}
            className={`rounded-full px-2.5 py-1 text-xs ${
              draft.durationMinutes === minutes
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-foreground ring-1 ring-border'
            }`}
          >
            {minutes >= 60 ? `${minutes / 60} 小时` : `${minutes} 分钟`}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={!preview || pending}
          onClick={() => onConfirm(draft)}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
        >
          {pending ? '保存中…' : '确认改期'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground">
          取消
        </button>
      </div>
    </section>
  );
}
