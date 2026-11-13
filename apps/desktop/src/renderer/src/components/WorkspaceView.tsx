import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Clock,
  Database,
  Flash,
  NavArrowDown,
  NavArrowRight,
  Play,
  Sparks,
  UserStar,
  WarningTriangle
} from 'iconoir-react';
import {
  isGeminiModel,
  type AliveWindow,
  type ChatMessage,
  type PlanSpec,
  type ThinkingLevel,
  type ToolActivityStep,
  type WindowRole
} from '@archpi/shared';
import { useArchpiStore } from '../store/useArchpiStore';
import { ROLE_BADGE_META } from './statusTheme';
import { GlowSelect } from './GlowSelect';
import { SlashCommandPanel, type SlashCommandItem } from './SlashCommandPanel';
import { TopGlowBox } from './TopGlowBox';
import { MarkdownContent } from './MarkdownContent';
import { RoleModelThinkingBar } from './RoleModelThinkingBar';
import { type VoiceInputHandle } from './VoiceInputButton';
import { useT } from '../i18n';

const PLAN_STATUS_META: Record<
  PlanSpec['status'],
  { label: string; badgeClass: string }
> = {
  draft: {
    label: '草稿',
    badgeClass: 'bg-white/[0.07] text-neutral-300'
  },
  dispatched: {
    label: '已派发',
    badgeClass: 'bg-blue-500/15 text-blue-300'
  },
  completed: {
    label: '已完成',
    badgeClass: 'bg-emerald-500/15 text-emerald-300'
  },
  changes_requested: {
    label: '需修改',
    badgeClass: 'bg-amber-500/15 text-amber-300'
  },
  approved: {
    label: '已通过',
    badgeClass: 'bg-emerald-500/15 text-emerald-300'
  }
};

const NEW_WORKER_OPTION = '__new_worker__';

const PlanCard: React.FC<{
  plan: PlanSpec;
  workers: AliveWindow[];
  reviewers: AliveWindow[];
  onDispatch: (workerId: string, reviewerId?: string) => void;
}> = ({ plan, workers, reviewers, onDispatch }) => {
  const defaultAutoReview = useArchpiStore((s) => Boolean(s.userSettings.defaultAutoReview));
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(
    plan.targetWorkerId || workers[0]?.id || NEW_WORKER_OPTION
  );
  const [selectedReviewerId, setSelectedReviewerId] = useState<string>(
    plan.targetReviewerId || (defaultAutoReview ? reviewers[0]?.id || '' : '')
  );

  useEffect(() => {
    if (plan.targetWorkerId) {
      setSelectedWorkerId(plan.targetWorkerId);
    } else if (!selectedWorkerId) {
      setSelectedWorkerId(workers[0]?.id || NEW_WORKER_OPTION);
    }
  }, [plan.targetWorkerId, workers, selectedWorkerId]);

  useEffect(() => {
    if (defaultAutoReview && !selectedReviewerId && reviewers[0]?.id) {
      setSelectedReviewerId(reviewers[0].id);
    }
  }, [defaultAutoReview, reviewers, selectedReviewerId]);

  const t = useT();
  const statusMeta = PLAN_STATUS_META[plan.status];
  const isDraft = plan.status === 'draft';
  const targetWorker = plan.targetWorkerId
    ? workers.find((w) => w.id === plan.targetWorkerId)
    : undefined;
  const doneSteps = plan.steps.filter((s) => s.done).length;
  const isCompleted = plan.status === 'completed' || plan.status === 'approved';
  const stats = plan.executionStats;
  const workerName = stats?.workerTitle || targetWorker?.title || 'Worker';
  const totalTokens =
    stats?.inputTokens !== undefined || stats?.outputTokens !== undefined
      ? (stats.inputTokens ?? 0) + (stats.outputTokens ?? 0)
      : undefined;
  const completedTimeLabel = stats?.completedAt
    ? new Date(stats.completedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
    : undefined;

  return (
    <div className="mt-2 w-full">
    <TopGlowBox
      className="w-full"
      roundedClassName="rounded-2xl"
      innerRoundedClassName="rounded-[15px]"
      innerClassName="p-4 sm:p-5"
    >
      <div className="mb-2.5 flex items-center gap-2">
        <Sparks className="h-4 w-4 text-violet-400" />
        <span className="text-xs font-semibold tracking-wide text-violet-300">
          {t.workspace.planCardTitle}
        </span>
        {!isDraft && (
          <span
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${statusMeta.badgeClass}`}
          >
            {statusMeta.label}
          </span>
        )}
      </div>

      <h4 className="text-[15px] font-semibold leading-snug text-neutral-100">
        {plan.title}
      </h4>
      {plan.summary && (
        <p className="mt-1 text-xs leading-relaxed text-neutral-400">
          {plan.summary}
        </p>
      )}

      {/* Timeline steps */}
      <div className="mt-4">
        {plan.steps.map((step, idx) => {
          const isLast = idx === plan.steps.length - 1;
          return (
            <div key={step.id} className="flex items-stretch gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                    step.done
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-white/[0.08] text-neutral-200'
                  }`}
                >
                  {step.done ? <CheckCircle className="h-3.5 w-3.5" /> : idx + 1}
                </span>
                {!isLast && (
                  <div
                    className={`my-1 w-px flex-1 ${
                      step.done ? 'bg-emerald-500/25' : 'bg-white/[0.08]'
                    }`}
                  />
                )}
              </div>
              <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-3.5'}`}>
                <div
                  className={`text-[13px] font-medium leading-snug ${
                    step.done ? 'text-neutral-200' : 'text-neutral-100'
                  }`}
                >
                  {step.title}
                </div>
                {step.detail && (
                  <div className="mt-0.5 text-xs leading-relaxed text-neutral-400">
                    {step.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {plan.acceptanceCriteria.length > 0 && (
        <div className="mt-4 border-t border-white/[0.06] pt-3.5">
          <div className="mb-2 text-[11px] font-medium tracking-wide text-neutral-500">
            {t.workspace.acceptanceCriteria}
          </div>
          <ul className="space-y-1.5 text-xs text-neutral-300">
            {plan.acceptanceCriteria.map((c, i) => (
              <li key={i} className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dispatch Bar (draft) or Active Execution Status Footer (dispatched / changes_requested) */}
      {isDraft ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3.5">
          <GlowSelect
            value={selectedWorkerId}
            onChange={setSelectedWorkerId}
            placeholder={t.workspace.targetWorker}
            options={[
              ...workers.map((w) => ({
                value: w.id,
                label: `${w.title} (${w.status})`
              })),
              {
                value: NEW_WORKER_OPTION,
                label: t.workspace.createNewWorker
              }
            ]}
          />

          {reviewers.length > 0 && (
            <GlowSelect
              value={selectedReviewerId}
              onChange={setSelectedReviewerId}
              options={[
                { value: '', label: t.workspace.noAutoReview },
                ...reviewers.map((r) => ({
                  value: r.id,
                  label: `${r.title}`
                }))
              ]}
            />
          )}

          <button
            disabled={!selectedWorkerId}
            onClick={() => onDispatch(selectedWorkerId, selectedReviewerId || undefined)}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3.5 py-1.5 text-xs font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-3 w-3 fill-current" />
            <span>{t.workspace.dispatchPlan}</span>
          </button>
        </div>
      ) : (
        !isCompleted && (
          <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-3 text-xs text-neutral-400">
            {plan.status === 'dispatched' && (
              <>
                <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                <span>
                  {t.workspace.planSummary.dispatchedTo.replace('{worker}', workerName)}
                  {plan.steps.length > 0 && (
                    <span className="ml-1.5 text-neutral-500">
                      ({doneSteps}/{plan.steps.length})
                    </span>
                  )}
                </span>
              </>
            )}
            {plan.status === 'changes_requested' && (
              <>
                <WarningTriangle className="h-3.5 w-3.5 text-amber-400" />
                <span>
                  {t.workspace.planSummary.needsChanges.replace('{worker}', workerName)}
                </span>
              </>
            )}
          </div>
        )
      )}
    </TopGlowBox>

    {isCompleted && (
      <TopGlowBox
        className="mt-2.5 w-full"
        roundedClassName="rounded-2xl"
        innerRoundedClassName="rounded-[15px]"
        innerClassName="px-4 py-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span className="truncate text-xs font-medium text-neutral-200">
              {workerName}
            </span>
            <span className="shrink-0 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10.5px] font-medium leading-none text-emerald-300">
              {statusMeta.label}
            </span>
          </div>
          {completedTimeLabel && (
            <span
              className="shrink-0 text-[10.5px] text-neutral-500 tabular-nums"
              title={stats?.completedAt ? new Date(stats.completedAt).toLocaleString() : undefined}
            >
              {completedTimeLabel}
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500 tabular-nums">
          {targetWorker?.model && (
            <span className="text-neutral-400">{targetWorker.model}</span>
          )}
          {plan.steps.length > 0 && (
            <span
              className="inline-flex items-center gap-1 text-neutral-400"
              title="步骤进度"
            >
              <CheckCircle className="h-3 w-3 text-emerald-400/75" />
              {doneSteps}/{plan.steps.length}
            </span>
          )}
          {(stats?.inputTokens !== undefined || stats?.outputTokens !== undefined) && (() => {
            const inputTok = stats?.inputTokens ?? 0;
            const outputTok = stats?.outputTokens ?? 0;
            const cacheTok = stats?.cacheReadTokens ?? 0;
            const cachePct =
              cacheTok > 0
                ? Math.round((cacheTok / Math.max(1, inputTok + cacheTok)) * 100)
                : 0;
            return (
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-0.5"
                  title={`输入 Token: ${inputTok.toLocaleString()}`}
                >
                  <ArrowUp className="h-3 w-3 opacity-75" />
                  {inputTok.toLocaleString()}
                </span>
                <span
                  className="inline-flex items-center gap-0.5"
                  title={`输出 Token: ${outputTok.toLocaleString()}`}
                >
                  <ArrowDown className="h-3 w-3 opacity-75" />
                  {outputTok.toLocaleString()}
                </span>
                <span
                  className={`inline-flex items-center gap-0.5 ${getCacheRateColorClass(cachePct)}`}
                  title={
                    cacheTok > 0
                      ? `缓存命中: ${cacheTok.toLocaleString()} tokens (${cachePct}%)`
                      : '缓存命中: 0 tokens (0%)'
                  }
                >
                  <Database className="h-3 w-3 opacity-75" />
                  {cachePct}%
                </span>
              </span>
            );
          })()}
          {stats?.durationMs !== undefined && (
            <span
              className="inline-flex items-center gap-0.5"
              title="执行耗时"
            >
              <Clock className="h-3 w-3 opacity-75" />
              {formatWorkDuration(stats.durationMs, t.workspace.activity)}
            </span>
          )}
        </div>
      </TopGlowBox>
    )}
    </div>
  );
};

function getCacheRateColorClass(pct: number): string {
  if (pct >= 100) return 'text-amber-200/60';
  if (pct >= 99) return 'text-pink-300/60';
  if (pct >= 95) return 'text-orange-300/60';
  if (pct >= 75) return 'text-violet-300/60';
  if (pct >= 50) return 'text-sky-300/60';
  if (pct >= 25) return 'text-emerald-300/55';
  return 'text-neutral-500';
}

function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 60) return '刚刚';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  return new Date(timestamp).toLocaleDateString();
}

type ActivityI18n = ReturnType<typeof useT>['workspace']['activity'];

function formatWorkDuration(ms: number | undefined, act: ActivityI18n): string {
  if (!ms || ms < 1000) return act.lessThanOneSec;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return act.secUnit.replace('{n}', String(totalSec));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return secs > 0
    ? act.minSecUnit.replace('{m}', String(mins)).replace('{s}', String(secs))
    : act.minUnit.replace('{n}', String(mins));
}

function summarizeActivityCategories(steps: ToolActivityStep[], act: ActivityI18n): string {
  const parts: string[] = [];
  if (steps.some((s) => s.kind === 'thinking' || s.category === 'thinking')) parts.push(act.catThinking);
  if (steps.some((s) => s.category === 'read')) parts.push(act.catRead);
  if (steps.some((s) => s.category === 'search')) parts.push(act.catSearch);
  if (steps.some((s) => s.category === 'run')) parts.push(act.catRun);
  if (steps.some((s) => s.category === 'edit')) parts.push(act.catEdit);
  if (steps.some((s) => s.category === 'plan')) parts.push(act.catPlan);
  if (parts.length === 0) parts.push(act.catOther);
  const joined = parts.join(act.listSep);
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

function resolveStepVerb(step: ToolActivityStep, act: ActivityI18n): string {
  const verbs = act.verbs as Record<string, string>;
  return verbs[step.toolName] ?? step.verb ?? verbs.default;
}

function getFileBadge(target: string): { label: string; className: string } | null {
  const match = target.match(/\.([a-z0-9]+)$/i);
  if (!match) return null;
  const ext = match[1].toLowerCase();
  if (ext === 'ts') return { label: 'TS', className: 'text-sky-400' };
  if (ext === 'tsx') return { label: 'TSX', className: 'text-cyan-400' };
  if (ext === 'js' || ext === 'mjs') return { label: 'JS', className: 'text-amber-400' };
  if (ext === 'jsx') return { label: 'JSX', className: 'text-amber-300' };
  if (ext === 'json') return { label: '{}', className: 'text-yellow-400' };
  if (ext === 'css' || ext === 'scss') return { label: 'CSS', className: 'text-indigo-400' };
  if (ext === 'md') return { label: 'MD', className: 'text-neutral-400' };
  return { label: ext.toUpperCase().slice(0, 4), className: 'text-neutral-400' };
}

const TimelineThinkingItem: React.FC<{
  step: ToolActivityStep;
  act: ActivityI18n;
  defaultOpen?: boolean;
}> = ({ step, act, defaultOpen = false }) => {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const isRunning = step.status === 'running';
  const open = manualOpen ?? (defaultOpen || isRunning);
  const content = step.text?.trim() ?? '';

  return (
    <div className="py-0.5">
      <button
        type="button"
        onClick={() => setManualOpen((prev) => !(prev ?? (defaultOpen || isRunning)))}
        className="inline-flex items-center gap-1.5 text-[12px] text-neutral-400 transition-colors hover:text-neutral-200"
      >
        <NavArrowRight
          className={`h-3 w-3 shrink-0 transition-transform duration-150 ${
            open ? 'rotate-90' : ''
          }`}
        />
        {isRunning && (
          <span className="h-1.5 w-1.5 rounded-full bg-violet-400/80 animate-pulse" />
        )}
        <span className={isRunning ? 'text-neutral-300' : 'text-neutral-400'}>
          {isRunning ? act.thinkingStep : act.thoughtStep}
        </span>
      </button>
      {open && content && (
        <div className="mt-1 ml-1.5 max-h-52 select-text overflow-y-auto border-l-2 border-white/10 pl-3 text-[12px] leading-relaxed whitespace-pre-wrap text-neutral-400">
          {content}
        </div>
      )}
    </div>
  );
};

const BarsFadeSpinner: React.FC<{ className?: string }> = ({ className = 'h-3.5 w-3.5' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <rect x="1" y="4" width="6" height="14" opacity="1">
      <animate
        id="svgSpinnersBarsFade0"
        fill="freeze"
        attributeName="opacity"
        begin="0;svgSpinnersBarsFade1.end-0.25s"
        dur="0.75s"
        values="1;0.2"
      />
    </rect>
    <rect x="9" y="4" width="6" height="14" opacity="0.4">
      <animate
        fill="freeze"
        attributeName="opacity"
        begin="svgSpinnersBarsFade0.begin+0.15s"
        dur="0.75s"
        values="1;0.2"
      />
    </rect>
    <rect x="17" y="4" width="6" height="14" opacity="0.3">
      <animate
        id="svgSpinnersBarsFade1"
        fill="freeze"
        attributeName="opacity"
        begin="svgSpinnersBarsFade0.begin+0.3s"
        dur="0.75s"
        values="1;0.2"
      />
    </rect>
  </svg>
);

const ActivityTimeline: React.FC<{
  steps: ToolActivityStep[];
  isStreaming?: boolean;
  workDurationMs?: number;
}> = ({ steps, isStreaming, workDurationMs }) => {
  const defaultExpandThinking = useArchpiStore((s) => Boolean(s.userSettings.defaultExpandThinking));
  const defaultExpandToolSteps = useArchpiStore((s) => Boolean(s.userSettings.defaultExpandToolSteps));
  const [rootOpen, setRootOpen] = useState(() => defaultExpandToolSteps);
  const [groupOpen, setGroupOpen] = useState(true);
  const t = useT();
  const act = t.workspace.activity;

  const summary = summarizeActivityCategories(steps, act);
  const hasThinking = steps.some((s) => s.kind === 'thinking' || s.category === 'thinking');
  const hasTool = steps.some((s) => s.kind !== 'thinking' && s.category !== 'thinking');
  const hasRunning = isStreaming || steps.some((s) => s.status === 'running');
  const durationText = formatWorkDuration(workDurationMs, act);
  const headerLabel = hasRunning
    ? hasThinking
      ? act.thinkingAndWorking
      : act.working
    : hasThinking && hasTool
      ? act.thoughtAndWorkedFor.replace('{duration}', durationText)
      : hasThinking
        ? act.thoughtFor.replace('{duration}', durationText)
        : act.workedFor.replace('{duration}', durationText);

  return (
    <div className="mb-2 w-full select-none pl-2 text-[12px] leading-relaxed">
      <button
        type="button"
        onClick={() => setRootOpen((v) => !v)}
        className="flex items-center gap-1.5 text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        {hasRunning ? (
          <BarsFadeSpinner className="h-3.5 w-3.5 shrink-0 text-violet-400" />
        ) : (
          <Clock className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
        )}
        <span className={hasRunning ? 'text-neutral-300' : ''}>{headerLabel}</span>
        {rootOpen ? (
          <NavArrowDown className="h-3.5 w-3.5 text-neutral-500" />
        ) : (
          <NavArrowRight className="h-3.5 w-3.5 text-neutral-500" />
        )}
      </button>

      {rootOpen && (
        <div className="mt-1 pl-5">
          <button
            type="button"
            onClick={() => setGroupOpen((v) => !v)}
            className="flex items-center gap-1.5 text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <span>{summary}</span>
            {groupOpen ? (
              <NavArrowDown className="h-3.5 w-3.5 text-neutral-500" />
            ) : (
              <NavArrowRight className="h-3.5 w-3.5 text-neutral-500" />
            )}
          </button>

          {groupOpen && (
            <div className="mt-1 space-y-1 pl-3.5">
              {steps.map((step) => {
                if (step.kind === 'thinking' || step.category === 'thinking') {
                  return (
                    <TimelineThinkingItem
                      key={step.id}
                      step={step}
                      act={act}
                      defaultOpen={defaultExpandThinking}
                    />
                  );
                }
                const badge =
                  step.category === 'read' || step.category === 'edit'
                    ? getFileBadge(step.target)
                    : null;
                return (
                  <div
                    key={step.id}
                    className="flex min-w-0 items-center gap-1.5 text-[12px]"
                  >
                    <span
                      className={`shrink-0 ${
                        step.status === 'error' ? 'text-red-400' : 'text-neutral-400'
                      }`}
                    >
                      {resolveStepVerb(step, act)}
                    </span>
                    {badge && (
                      <span
                        className={`shrink-0 text-[10px] font-semibold tracking-tight ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    )}
                    <span className="truncate text-[12px] text-neutral-200">
                      {step.target}
                    </span>
                    {step.detail && (
                      <span className="shrink-0 text-[12px] text-neutral-500">
                        {step.detail}
                      </span>
                    )}
                    {step.category === 'edit' &&
                      (step.addedLines !== undefined || step.removedLines !== undefined) && (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[11.5px] tabular-nums">
                          <span className="text-emerald-400">+{step.addedLines ?? 0}</span>
                          {step.removedLines !== undefined && (
                            <span className="text-red-400">-{step.removedLines}</span>
                          )}
                        </span>
                      )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface ParsedDispatchedTask {
  title: string;
  summary: string;
  steps: Array<{ id: string; title: string; detail?: string; done?: boolean }>;
  status?: PlanSpec['status'];
}

function parseDispatchedPlanFallback(content: string): ParsedDispatchedTask | null {
  const headerMatch = content.match(/^\[Plan from [^:]+:\s*(.+?)\]\s*(?:\(planId:\s*[^)]+\))?\s*\n([\s\S]*)$/);
  if (!headerMatch) return null;

  const title = headerMatch[1].trim();
  const rest = headerMatch[2].replace(/\n+As you complete each step,\s*call update_plan_step\([\s\S]*$/m, '').trim();
  const [summaryPart, stepsPart] = rest.split(/\n\s*Steps:\s*\n/);
  const steps: ParsedDispatchedTask['steps'] = [];

  if (stepsPart) {
    for (const line of stepsPart.split('\n')) {
      const m = line.match(/^\d+\.\s*(?:\[([^\]]+)\]\s*)?(.+)$/);
      if (!m) continue;
      const stepId = m[1] || `step-${steps.length + 1}`;
      const body = m[2].trim();
      const colonIdx = body.indexOf(': ');
      if (colonIdx > 0) {
        steps.push({
          id: stepId,
          title: body.slice(0, colonIdx).trim(),
          detail: body.slice(colonIdx + 2).trim()
        });
      } else {
        steps.push({ id: stepId, title: body });
      }
    }
  }

  return {
    title,
    summary: (summaryPart || '').trim(),
    steps
  };
}

const DispatchedTaskCard: React.FC<{
  fromTitle: string;
  task: ParsedDispatchedTask;
}> = ({ fromTitle, task }) => {
  const statusMeta = task.status ? PLAN_STATUS_META[task.status] : undefined;
  return (
    <div className="w-full max-w-[90%] rounded-2xl border border-violet-400/20 bg-[#1a1822]/80 p-3.5 text-left shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-violet-300">
          <Sparks className="h-3.5 w-3.5" />
          来自 {fromTitle} 的任务
        </span>
        {statusMeta && task.status !== 'draft' && (
          <span
            className={`rounded-md px-2 py-0.5 text-[10.5px] font-medium leading-none ${statusMeta.badgeClass}`}
          >
            {statusMeta.label}
          </span>
        )}
      </div>

      <div className="text-[13.5px] font-semibold leading-snug text-neutral-100">
        {task.title}
      </div>
      {task.summary && (
        <p className="mt-1 text-xs leading-relaxed text-neutral-400">
          {task.summary}
        </p>
      )}

      {task.steps.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-2.5">
          {task.steps.map((step, idx) => (
            <div key={step.id} className="flex items-start gap-2 text-xs">
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${
                  step.done
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-white/[0.08] text-neutral-300'
                }`}
              >
                {step.done ? <CheckCircle className="h-3 w-3" /> : idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-neutral-200">{step.title}</div>
                {step.detail && (
                  <div className="mt-0.5 text-[11px] leading-relaxed text-neutral-400">
                    {step.detail}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MessageBubble: React.FC<{
  msg: ChatMessage;
  workers: AliveWindow[];
  reviewers: AliveWindow[];
  onDispatchPlan: (plan: PlanSpec, workerId: string, reviewerId?: string) => void;
}> = ({ msg, workers, reviewers, onDispatchPlan }) => {
  const chatFontSize = useArchpiStore((s) => s.userSettings.chatFontSize ?? 'md');
  const chatFontSizeClass =
    chatFontSize === 'sm' ? 'text-[12px]' : chatFontSize === 'lg' ? 'text-[14px]' : 'text-[13px]';
  const isUser = msg.role === 'user';
  const isSystem = msg.role === 'system';

  if (isSystem) {
    if (/^Worker「.+」已完成「.+」$/.test(msg.content)) {
      return null;
    }
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-white/[0.04] px-3 py-1 text-[11px] text-neutral-400">
          {msg.content}
        </span>
      </div>
    );
  }

  const dispatchedTask: ParsedDispatchedTask | null =
    isUser && msg.dispatchedFrom
      ? msg.plan
        ? {
            title: msg.plan.title,
            summary: msg.plan.summary,
            steps: msg.plan.steps,
            status: msg.plan.status
          }
        : parseDispatchedPlanFallback(msg.content)
      : null;

  if (isUser && msg.dispatchedFrom && dispatchedTask) {
    return (
      <div className="mt-5 flex flex-col items-end first:mt-0">
        <DispatchedTaskCard
          fromTitle={msg.dispatchedFrom.windowTitle}
          task={dispatchedTask}
        />
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isUser ? 'items-end mt-5 first:mt-0' : 'items-start'}`}>
      {msg.dispatchedFrom && (
        <span className="mb-1 text-[10px] text-violet-300/80">
          Dispatched from {msg.dispatchedFrom.windowTitle}
        </span>
      )}

      {!isUser && msg.activitySteps && msg.activitySteps.length > 0 && (
        <ActivityTimeline
          steps={msg.activitySteps}
          isStreaming={msg.isStreaming}
          workDurationMs={msg.workDurationMs}
        />
      )}

      {/* Single-layer message surface; PlanCard & Review render as standalone cards outside bubble background */}
      {(msg.content || msg.isStreaming) && (
        <div
          className={`rounded-2xl px-4 py-2.5 leading-relaxed ${
            chatFontSizeClass
          } ${
            isUser
              ? 'w-fit max-w-[80%] rounded-br-sm bg-[#262626] text-neutral-100'
              : `${msg.content ? 'w-full' : 'w-fit'} rounded-bl-sm bg-[#1c1c1c] text-neutral-200`
          }`}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{msg.content}</div>
          ) : msg.content ? (
            <MarkdownContent content={msg.content} isStreaming={msg.isStreaming} />
          ) : (
            <div className="flex items-center gap-2 py-0.5 text-neutral-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400/80 animate-pulse" />
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400/60 animate-pulse [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400/40 animate-pulse [animation-delay:300ms]" />
              </span>
              <span className="text-[12px] text-neutral-400">等待响应...</span>
            </div>
          )}
        </div>
      )}

      {!isUser && !msg.isStreaming && msg.meta && (
        <div className="mt-1 flex w-full flex-wrap items-center justify-end gap-x-2 gap-y-0.5 px-1 text-[10.5px] text-neutral-500 tabular-nums">
          {msg.meta.model && (
            <span className="text-neutral-400">
              {msg.meta.model}
              {msg.meta.thinkingLevel &&
                msg.meta.thinkingLevel !== 'off' &&
                !/\b(minimal|low|medium|high|xhigh|max|ultra)\b|-(minimal|low|medium|high|xhigh|max|ultra)/i.test(
                  msg.meta.model
                ) && (
                  <span className="ml-1 text-neutral-500">({msg.meta.thinkingLevel})</span>
                )}
            </span>
          )}
          {(msg.meta.inputTokens !== undefined || msg.meta.outputTokens !== undefined) && (() => {
            const inputTok = msg.meta.inputTokens ?? 0;
            const outputTok = msg.meta.outputTokens ?? 0;
            const cacheTok = msg.meta.cacheReadTokens ?? 0;
            const cachePct =
              cacheTok > 0
                ? Math.round((cacheTok / Math.max(1, inputTok + cacheTok)) * 100)
                : 0;
            return (
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-0.5"
                  title={`输入 Token: ${inputTok.toLocaleString()}`}
                >
                  <ArrowUp className="h-3 w-3 opacity-75" />
                  {inputTok.toLocaleString()}
                </span>
                <span
                  className="inline-flex items-center gap-0.5"
                  title={`输出 Token: ${outputTok.toLocaleString()}`}
                >
                  <ArrowDown className="h-3 w-3 opacity-75" />
                  {outputTok.toLocaleString()}
                </span>
                <span
                  className={`inline-flex items-center gap-0.5 ${getCacheRateColorClass(cachePct)}`}
                  title={
                    cacheTok > 0
                      ? `缓存命中: ${cacheTok.toLocaleString()} tokens (${cachePct}%)`
                      : '缓存命中: 0 tokens (0%)'
                  }
                >
                  <Database className="h-3 w-3 opacity-75" />
                  {cachePct}%
                </span>
              </span>
            );
          })()}
          {msg.meta.ttftMs !== undefined && (() => {
            const ttftLabel =
              msg.meta.ttftMs >= 1000
                ? `${(msg.meta.ttftMs / 1000).toFixed(2)}s`
                : `${msg.meta.ttftMs}ms`;
            return (
              <span
                className="inline-flex items-center gap-0.5"
                title={`首字延迟 (TTFT): ${ttftLabel}`}
              >
                <Clock className="h-3 w-3 opacity-75" />
                {ttftLabel}
              </span>
            );
          })()}
          {msg.meta.tokensPerSec !== undefined && (
            <span
              className="inline-flex items-center gap-0.5"
              title={`生成速度: ${msg.meta.tokensPerSec} tok/s`}
            >
              <Flash className="h-3 w-3 opacity-75" />
              {msg.meta.tokensPerSec}/s
            </span>
          )}
          <span title={new Date(msg.timestamp).toLocaleString()}>
            {formatRelativeTime(msg.timestamp)}
          </span>
        </div>
      )}

      {msg.plan && (
        <div className="w-full">
          <PlanCard
            plan={msg.plan}
            workers={workers}
            reviewers={reviewers}
            onDispatch={(workerId, reviewerId) =>
              onDispatchPlan(msg.plan!, workerId, reviewerId)
            }
          />
        </div>
      )}

      {msg.review && (
        <div
          className={`mt-2 w-full max-w-[85%] rounded-xl p-3.5 text-xs ${
            msg.review.verdict === 'PASS'
              ? 'bg-emerald-500/10 text-emerald-200'
              : 'bg-amber-500/10 text-amber-200'
          }`}
        >
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            {msg.review.verdict === 'PASS' ? (
              <UserStar className="h-4 w-4 text-emerald-400" />
            ) : (
              <WarningTriangle className="h-4 w-4 text-amber-400" />
            )}
            <span>Review Verdict: {msg.review.verdict}</span>
          </div>
          <p className="text-neutral-300">{msg.review.summary}</p>
        </div>
      )}
    </div>
  );
};

const WindowPane: React.FC<{
  windowId: string;
}> = ({ windowId }) => {
  const {
    windows,
    messagesByWindow,
    providerConfig,
    roleModels,
    voiceConfig,
    userSettings,
    masterWorkerLink,
    masterWorkerLinks,
    sendMessage,
    dispatchPlan,
    createWindow
  } = useArchpiStore();
  const t = useT();

  const [input, setInput] = useState('');
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [selectedRole, setSelectedRole] = useState<WindowRole | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedThinking, setSelectedThinking] = useState<ThinkingLevel | '' | undefined>(
    undefined
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAutoScrollPinnedRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const voiceRef = useRef<VoiceInputHandle | null>(null);
  const spaceRecordingRef = useRef(false);

  const slashMatch = input.match(/^\/([^\s]*)$/);
  const showSlashPanel = Boolean(slashMatch) && !slashDismissed;
  const slashFilter = slashMatch ? slashMatch[1] : '';

  const handleSelectSlashCommand = (cmd: SlashCommandItem) => {
    setInput(`/${cmd.name} `);
    setSlashDismissed(true);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const win = windows.find((w) => w.id === windowId && !w.archived);
  const messages = messagesByWindow[windowId] ?? [];
  const [, setTimeTick] = useState(0);

  useEffect(() => {
    setSelectedRole(null);
    setSelectedModel(null);
    setSelectedThinking(undefined);
    isAutoScrollPinnedRef.current = true;
  }, [windowId]);

  useEffect(() => {
    const timer = window.setInterval(() => setTimeTick((n) => n + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const handleMessagesScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAutoScrollPinnedRef.current = distanceFromBottom <= 80;
  };

  useEffect(() => {
    if (!isAutoScrollPinnedRef.current) return;
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [
    messages.length,
    messages[messages.length - 1]?.content,
    messages[messages.length - 1]?.activitySteps
  ]);

  if (!win) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-500">
        Window not found
      </div>
    );
  }

  const projectWindows = windows.filter((w) => w.projectId === win.projectId && !w.archived);
  const workers = projectWindows.filter((w) => w.role === 'worker');
  const reviewers: AliveWindow[] = [];
  const roleMeta = ROLE_BADGE_META[win.role];

  const activeRole = selectedRole ?? win.role;
  const activeModel = selectedModel ?? win.model;
  const effectiveThinking =
    selectedThinking !== undefined
      ? selectedThinking
      : roleModels[activeRole]?.entries?.find((e) => e.id === activeModel)?.thinkingLevel ??
        roleModels[activeRole]?.thinkingLevel ??
        providerConfig.thinkingLevel ??
        '';

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput('');
    isAutoScrollPinnedRef.current = true;
    await sendMessage(win.id, trimmed, {
      model: activeModel || undefined,
      thinkingLevel: !isGeminiModel(activeModel) && effectiveThinking ? effectiveThinking : undefined
    });
  };

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden">
      {/* Messages Stream */}
      <div
        ref={scrollContainerRef}
        onScroll={handleMessagesScroll}
        className="h-full overflow-y-auto px-6 pt-4 pb-48"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-2 rounded-full bg-white/[0.05] px-3 py-1 text-xs text-neutral-400">
              {roleMeta.full} Window Ready ({win.model})
            </div>
            <p className="max-w-sm text-xs text-neutral-500">
              {win.role === 'master'
                ? '描述你的需求，Master 会生成结构化计划，并支持直接派发给任意活跃的 Worker 窗口执行。'
                : '等待接收 Master 的计划，或直接在此输入编码任务。'}
            </p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-3">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                msg={m}
                workers={workers}
                reviewers={reviewers}
                onDispatchPlan={async (plan, targetWorkerId, targetReviewerId) => {
                  let resolvedWorkerId = targetWorkerId;
                  if (resolvedWorkerId === NEW_WORKER_OPTION) {
                    const newTitle = plan.title.trim().slice(0, 24) || 'Worker';
                    const created = await createWindow(
                      {
                        projectId: win.projectId,
                        title: newTitle,
                        role: 'worker'
                      },
                      { activate: false }
                    );
                    resolvedWorkerId = created.id;
                  }
                  await dispatchPlan({
                    plan,
                    targetWorkerId: resolvedWorkerId,
                    targetReviewerId,
                    autoReview: Boolean(targetReviewerId)
                  });
                }}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input Box or Master-controlled Info Bar */}
      {(() => {
        const activeMasterLink =
          masterWorkerLinks.find((l) => l.workerWindowId === windowId && l.locked) ??
          (masterWorkerLink?.workerWindowId === windowId && masterWorkerLink.locked
            ? masterWorkerLink
            : null);
        const masterWin = activeMasterLink
          ? windows.find((w) => w.id === activeMasterLink.masterWindowId)
          : undefined;

        if (activeMasterLink) {
          return (
            <div className="pointer-events-none absolute bottom-0 left-0 right-2 z-20 bg-gradient-to-t from-[#161616] from-55% via-[#161616]/80 via-80% to-transparent pl-6 pr-4 pb-4 pt-10">
              <div className="pointer-events-auto relative mx-auto flex w-full max-w-3xl justify-center">
                <TopGlowBox
                  className="w-fit min-w-[260px] max-w-[360px]"
                  innerClassName="flex flex-col gap-1.5 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-2 text-xs text-neutral-200">
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-400" />
                      </span>
                      <Sparks className="h-3.5 w-3.5 shrink-0 text-purple-300" />
                      <span className="truncate font-medium text-purple-200">
                        {masterWin?.title ?? 'Master'}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-md bg-purple-500/15 px-2 py-0.5 text-[10.5px] font-medium text-purple-300">
                      自动执行中
                    </span>
                  </div>
                  <div className="pl-4 text-[11px] text-neutral-400">
                    正在接管执行计划，完成后将自动恢复输入
                  </div>
                </TopGlowBox>
              </div>
            </div>
          );
        }

        return (
          <div className="pointer-events-none absolute bottom-0 left-0 right-2 z-20 bg-gradient-to-t from-[#161616] from-55% via-[#161616]/80 via-80% to-transparent pl-6 pr-4 pb-4 pt-10">
            <div className="pointer-events-auto relative mx-auto w-full max-w-3xl">
              {showSlashPanel && (
                <div className="absolute bottom-full left-0 right-0 z-40 mb-2">
                  <SlashCommandPanel
                    filter={slashFilter}
                    onSelect={handleSelectSlashCommand}
                    onClose={() => setSlashDismissed(true)}
                  />
                </div>
              )}
              <TopGlowBox
                className="w-full"
                innerClassName="flex flex-col gap-2.5 px-4 py-3"
              >
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setSlashDismissed(false);
              }}
              onKeyDown={(e) => {
                if (e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                  if (spaceRecordingRef.current) {
                    e.preventDefault();
                    return;
                  }
                  if (voiceConfig.enabled && userSettings.spaceToRecord !== false && !input) {
                    e.preventDefault();
                    spaceRecordingRef.current = true;
                    voiceRef.current?.startRecording();
                    return;
                  }
                }
                if (showSlashPanel) return;
                const useModEnter = userSettings.sendShortcut === 'mod_enter';
                const shouldSend = useModEnter
                  ? e.key === 'Enter' && (e.ctrlKey || e.metaKey)
                  : e.key === 'Enter' && !e.shiftKey;
                if (shouldSend) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              onKeyUp={(e) => {
                if (e.code === 'Space' && spaceRecordingRef.current) {
                  e.preventDefault();
                  spaceRecordingRef.current = false;
                  voiceRef.current?.stopRecording();
                }
              }}
              onBlur={() => {
                if (spaceRecordingRef.current) {
                  spaceRecordingRef.current = false;
                  voiceRef.current?.stopRecording();
                }
              }}
              placeholder={t.newWindow.promptPlaceholder}
              className="min-h-[52px] max-h-40 w-full resize-none bg-transparent text-[13px] leading-relaxed text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
            />

            <RoleModelThinkingBar
              voiceRef={voiceRef}
              role={selectedRole ?? win.role}
              model={selectedModel ?? win.model}
              thinking={
                selectedThinking !== undefined
                  ? selectedThinking
                  : roleModels[selectedRole ?? win.role]?.entries?.find(
                      (e) => e.id === (selectedModel ?? win.model)
                    )?.thinkingLevel ??
                    roleModels[selectedRole ?? win.role]?.thinkingLevel ??
                    providerConfig.thinkingLevel ??
                    ''
              }
              roleModels={roleModels}
              fallbackModels={Array.from(
                new Set(
                  [
                    ...(providerConfig.modelConfigs?.map((m) => m.id) ?? []),
                    ...(providerConfig.models ?? []),
                    ...(providerConfig.modelId ? [providerConfig.modelId] : []),
                    ...(win.model ? [win.model] : [])
                  ].filter(Boolean)
                )
              )}
              onSelectRoleModel={(nextRole, nextModel) => {
                setSelectedRole(nextRole);
                setSelectedModel(nextModel);
              }}
              onChangeThinking={setSelectedThinking}
              onTranscript={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))}
              canSend={Boolean(input.trim()) && win.status !== 'working'}
              sendTooltip={t.workspace.send}
              onSend={handleSend}
            />
              </TopGlowBox>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export const WorkspaceView: React.FC = () => {
  const {
    windows,
    activeProjectId,
    activeWindowId,
    splitSecondaryWindowId,
    masterWorkerLink,
    masterWorkerLinks
  } = useArchpiStore();

  const projectWindows = windows.filter(
    (w) => !w.archived && (!activeProjectId || w.projectId === activeProjectId)
  );

  const primaryId =
    (activeWindowId && projectWindows.some((w) => w.id === activeWindowId)
      ? activeWindowId
      : null) ??
    projectWindows[0]?.id ??
    null;

  if (!primaryId) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-500">
        No alive windows in this project. Click "New Window" to spawn one.
      </div>
    );
  }

  const isSplit = Boolean(splitSecondaryWindowId && splitSecondaryWindowId !== primaryId);
  const secondaryWin = isSplit
    ? projectWindows.find((w) => w.id === splitSecondaryWindowId)
    : undefined;
  const isWorkerGlow = Boolean(
    secondaryWin &&
      (masterWorkerLinks.some((l) => l.workerWindowId === secondaryWin.id && l.locked) ||
        (masterWorkerLink?.workerWindowId === secondaryWin.id && masterWorkerLink.locked))
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Single or Split Pane */}
      <div
        className={`flex flex-1 overflow-hidden bg-[#0e0e0e] ${
          isSplit ? 'gap-2.5 p-3' : ''
        }`}
      >
        <div
          className={`flex flex-1 overflow-hidden bg-[#161616] ${
            isSplit ? 'rounded-2xl' : ''
          }`}
        >
          <WindowPane windowId={primaryId} />
        </div>
        {isSplit && splitSecondaryWindowId && (
          <div
            className={
              isWorkerGlow
                ? 'animate-worker-glow relative flex flex-1 rounded-2xl bg-gradient-to-b from-white/[0.14] via-purple-400/[0.08] to-white/[0.015] p-[1px]'
                : 'flex flex-1 overflow-hidden rounded-2xl bg-[#161616]'
            }
          >
            {isWorkerGlow && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
              >
                <div className="animate-worker-border-drift h-full w-full bg-[radial-gradient(58%_48%_at_50%_0%,rgba(255,255,255,0.34),rgba(168,85,247,0.3)_38%,transparent_74%)]" />
              </div>
            )}
            <div
              className={`relative z-10 flex flex-1 overflow-hidden bg-[#161616] ${
                isWorkerGlow ? 'rounded-[15px]' : ''
              }`}
            >
              <WindowPane windowId={splitSecondaryWindowId} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
