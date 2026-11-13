import type { TaskStatus, WindowRole, WindowStatus } from '@archpi/shared';

export const WINDOW_STATUS_META: Record<
  WindowStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  idle: {
    label: 'Idle',
    dotClass: 'bg-zinc-400',
    textClass: 'text-zinc-400'
  },
  working: {
    label: 'Working',
    dotClass: 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.65)]',
    textClass: 'text-blue-400'
  },
  needs_you: {
    label: 'Needs you',
    dotClass: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.65)]',
    textClass: 'text-amber-400'
  },
  in_review: {
    label: 'In review',
    dotClass: 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.55)]',
    textClass: 'text-yellow-400'
  },
  ready: {
    label: 'Ready',
    dotClass: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
    textClass: 'text-emerald-400'
  }
};

export const TASK_COLUMN_META: Record<
  TaskStatus,
  { label: string; dotClass: string }
> = {
  planning: { label: 'Planning', dotClass: 'bg-violet-400' },
  working: { label: 'Working', dotClass: 'bg-blue-400' },
  needs_you: { label: 'Needs you', dotClass: 'bg-amber-500' },
  in_review: { label: 'In review', dotClass: 'bg-yellow-400' },
  ready: { label: 'Ready to merge', dotClass: 'bg-emerald-400' }
};

export const ROLE_BADGE_META: Record<
  WindowRole,
  { short: string; full: string; badgeClass: string }
> = {
  master: {
    short: 'Master',
    full: 'Master',
    badgeClass: 'inline-flex items-center rounded-md bg-purple-500/15 px-1.5 py-1 text-purple-300'
  },
  worker: {
    short: 'Worker',
    full: 'Worker',
    badgeClass: 'inline-flex items-center rounded-md bg-white/[0.07] px-1.5 py-1 text-neutral-300'
  }
};

export function formatRelativeTime(
  ts: number,
  labels: { secondsAgo: string; minutesAgo: string; hoursAgo: string } = {
    secondsAgo: '{n}s ago',
    minutesAgo: '{n}m ago',
    hoursAgo: '{n}h ago'
  }
): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return labels.secondsAgo.replace('{n}', String(diffSec));
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return labels.minutesAgo.replace('{n}', String(diffMin));
  const diffHr = Math.floor(diffMin / 60);
  return labels.hoursAgo.replace('{n}', String(diffHr));
}
