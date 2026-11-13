import React from 'react';
import type {
  AgyAccountQuota,
  AgyGroupQuotaSummary,
  BalanceAlertThresholds
} from '@archpi/shared';

export interface AgyQuotaRingItem {
  key: string;
  label: string;
  title: string;
  percentage: number;
  resetTime?: string;
}

export function formatQuotaTimeRemaining(resetTime?: string): string {
  if (!resetTime) return '--';
  const target = Date.parse(resetTime);
  if (Number.isNaN(target)) return '--';
  const diffSec = Math.max(0, Math.floor((target - Date.now()) / 1000));
  if (diffSec <= 0) return '0m';
  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function getQuotaRingColor(pct: number): { stroke: string; text: string } {
  if (pct >= 50) return { stroke: '#34d399', text: 'text-emerald-400' };
  if (pct >= 20) return { stroke: '#fbbf24', text: 'text-amber-400' };
  return { stroke: '#fb7185', text: 'text-rose-400' };
}

export const DEFAULT_BALANCE_ALERT_THRESHOLDS: BalanceAlertThresholds = {
  low: 10,
  medium: 100
};

export function getBalanceRingColor(
  balance: number,
  thresholds?: BalanceAlertThresholds
): { stroke: string; strokeClass: string; text: string } {
  const low =
    typeof thresholds?.low === 'number' && Number.isFinite(thresholds.low)
      ? thresholds.low
      : DEFAULT_BALANCE_ALERT_THRESHOLDS.low;
  const mediumRaw =
    typeof thresholds?.medium === 'number' && Number.isFinite(thresholds.medium)
      ? thresholds.medium
      : DEFAULT_BALANCE_ALERT_THRESHOLDS.medium;
  const medium = Math.max(low, mediumRaw);

  if (balance < low) {
    return { stroke: '#fb7185', strokeClass: 'stroke-rose-400', text: 'text-rose-400' };
  }
  if (balance <= medium) {
    return { stroke: '#fbbf24', strokeClass: 'stroke-amber-400', text: 'text-amber-400' };
  }
  return { stroke: '#34d399', strokeClass: 'stroke-emerald-400', text: 'text-emerald-400' };
}

export const MoneyAmount: React.FC<{ value: number; unit?: string }> = ({ value, unit }) => {
  const symbol = unit === 'CNY' ? '¥' : '$';
  const formatted = value > 0 && value < 0.01 ? value.toFixed(4) : value.toFixed(2);
  return (
    <span className="inline-flex items-baseline">
      <span className="mr-[0.15em]">{symbol}</span>
      <span>{formatted}</span>
    </span>
  );
};

export function extractAgyQuotaRingItems(quota?: AgyAccountQuota): AgyQuotaRingItem[] {
  if (!quota) return [];
  const geminiGroup: AgyGroupQuotaSummary | undefined = quota.groups.find(
    (g) => g.key === 'gemini'
  );
  const claudeGroup: AgyGroupQuotaSummary | undefined = quota.groups.find(
    (g) => g.key === 'claude'
  );
  const argonGroup: AgyGroupQuotaSummary | undefined = quota.groups.find(
    (g) => g.key === 'argon'
  );

  const items: AgyQuotaRingItem[] = [];
  if (geminiGroup?.weekly) {
    items.push({
      key: 'gemini-weekly',
      label: 'Gemini 周',
      title: `${geminiGroup.label} 周配额`,
      percentage: geminiGroup.weekly.percentage,
      resetTime: geminiGroup.weekly.resetTime
    });
  }
  if (geminiGroup?.fiveHour) {
    items.push({
      key: 'gemini-5h',
      label: 'Gemini 5H',
      title: `${geminiGroup.label} 5H`,
      percentage: geminiGroup.fiveHour.percentage,
      resetTime: geminiGroup.fiveHour.resetTime
    });
  }
  if (claudeGroup?.weekly) {
    items.push({
      key: 'claude-weekly',
      label: 'Claude 周',
      title: 'Claude 周配额',
      percentage: claudeGroup.weekly.percentage,
      resetTime: claudeGroup.weekly.resetTime
    });
  }
  if (argonGroup?.weekly) {
    items.push({
      key: 'argon-weekly',
      label: 'Argon 周',
      title: 'Gemini 4 Argon 周配额',
      percentage: argonGroup.weekly.percentage,
      resetTime: argonGroup.weekly.resetTime
    });
  }
  return items;
}

export const AgyQuotaRing: React.FC<{
  label: string;
  title?: string;
  percentage: number;
  resetTime?: string;
  compact?: boolean;
}> = ({ label, title, percentage, resetTime, compact = false }) => {
  const clamped = Math.max(0, Math.min(100, percentage));
  const { stroke, text } = getQuotaRingColor(clamped);
  const svgSize = compact ? 38 : 44;
  const r = compact ? 15 : 18;
  const center = svgSize / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);

  return (
    <div
      className={`flex flex-col items-center gap-1 ${compact ? 'min-w-[48px]' : 'min-w-[56px]'}`}
      title={title ?? `${label}: ${clamped}% · 重置 ${formatQuotaTimeRemaining(resetTime)}`}
    >
      <div
        className={`relative flex items-center justify-center ${
          compact ? 'h-9 w-9' : 'h-11 w-11'
        }`}
      >
        <svg className="-rotate-90" width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
          <circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={compact ? 2.75 : 3}
          />
          <circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth={compact ? 2.75 : 3}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className="transition-all duration-500"
          />
        </svg>
        <span
          className={`absolute font-mono font-semibold tabular-nums ${
            compact ? 'text-[9px]' : 'text-[10px]'
          } ${text}`}
        >
          {clamped}%
        </span>
      </div>
      <span
        className={`font-medium leading-tight text-neutral-300 ${
          compact ? 'text-[9.5px]' : 'text-[10px]'
        }`}
      >
        {label}
      </span>
      <span className="font-mono text-[9px] leading-none text-neutral-500">
        {formatQuotaTimeRemaining(resetTime)}
      </span>
    </div>
  );
};
