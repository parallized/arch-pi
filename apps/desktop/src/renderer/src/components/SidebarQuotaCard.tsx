import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AgyAccountQuota, ProviderBalanceInfo, SavedProviderEntry } from '@archpi/shared';
import { useArchpiStore } from '../store/useArchpiStore';
import {
  AgyQuotaRing,
  MoneyAmount,
  getBalanceRingColor,
  getQuotaRingColor
} from './AgyQuotaRings';
import { TopGlowBox } from './TopGlowBox';

interface RoleQuotaAggregate {
  modelId: string;
  isAgyModel: boolean;
  targetGroup: 'argon' | 'claude' | 'gemini' | null;
  accountCount: number;
  combinedPct: number | null;
  weekly?: { percentage: number; resetTime?: string };
  fiveHour?: { percentage: number; resetTime?: string };
}

function pickEarliestResetTime(times: Array<string | undefined>): string | undefined {
  const valid = times
    .filter((t): t is string => Boolean(t))
    .map((t) => ({ raw: t, ts: Date.parse(t) }))
    .filter((x) => !Number.isNaN(x.ts));
  if (valid.length === 0) return undefined;
  valid.sort((a, b) => a.ts - b.ts);
  return valid[0].raw;
}

function providerSupportsModel(
  provider: SavedProviderEntry,
  quota: AgyAccountQuota | undefined,
  modelId: string
): boolean {
  const target = modelId.trim().toLowerCase();
  if (!target) return false;
  const knownModels =
    provider.config.models && provider.config.models.length > 0
      ? provider.config.models
      : quota?.availableModels && quota.availableModels.length > 0
        ? quota.availableModels
        : provider.config.modelId
          ? [provider.config.modelId]
          : [];
  if (knownModels.length === 0) return false;
  return knownModels.some((m) => m.trim().toLowerCase() === target);
}

function computeRoleQuotaAggregate(
  modelId: string | undefined,
  agyProviders: SavedProviderEntry[],
  agyQuotaByProviderId: Record<string, AgyAccountQuota>
): RoleQuotaAggregate {
  const cleanId = (modelId ?? '').trim();
  if (!cleanId) {
    return { modelId: '', isAgyModel: false, targetGroup: null, accountCount: 0, combinedPct: null };
  }

  const lower = cleanId.toLowerCase();
  const targetGroup: 'argon' | 'claude' | 'gemini' | null = lower.includes('argon')
    ? 'argon'
    : lower.startsWith('claude') || lower.startsWith('gpt')
      ? 'claude'
      : lower.includes('gemini')
        ? 'gemini'
        : null;

  if (!targetGroup) {
    return {
      modelId: cleanId,
      isAgyModel: false,
      targetGroup: null,
      accountCount: 0,
      combinedPct: null
    };
  }

  const weeklyList: Array<{ pct: number; resetTime?: string }> = [];
  const fiveHourList: Array<{ pct: number; resetTime?: string }> = [];
  let matchedAccounts = 0;

  for (const p of agyProviders) {
    const quota = agyQuotaByProviderId[p.id];
    if (!providerSupportsModel(p, quota, cleanId)) continue;
    const group = quota?.groups.find((g) => g.key === targetGroup);
    if (!group) continue;
    matchedAccounts += 1;
    if (group.weekly) {
      weeklyList.push({ pct: group.weekly.percentage, resetTime: group.weekly.resetTime });
    }
    if (group.fiveHour) {
      fiveHourList.push({ pct: group.fiveHour.percentage, resetTime: group.fiveHour.resetTime });
    }
  }

  const weekly =
    weeklyList.length > 0
      ? {
          percentage: Math.round(weeklyList.reduce((s, x) => s + x.pct, 0) / weeklyList.length),
          resetTime: pickEarliestResetTime(weeklyList.map((x) => x.resetTime))
        }
      : undefined;

  const fiveHour =
    fiveHourList.length > 0
      ? {
          percentage: Math.round(fiveHourList.reduce((s, x) => s + x.pct, 0) / fiveHourList.length),
          resetTime: pickEarliestResetTime(fiveHourList.map((x) => x.resetTime))
        }
      : undefined;

  const combinedPct =
    weekly && fiveHour
      ? Math.min(weekly.percentage, fiveHour.percentage)
      : weekly
        ? weekly.percentage
        : fiveHour
          ? fiveHour.percentage
          : null;

  return {
    modelId: cleanId,
    isAgyModel: true,
    targetGroup,
    accountCount: matchedAccounts,
    combinedPct,
    weekly,
    fiveHour
  };
}

const MiniRoleRing: React.FC<{
  pct: number | null;
  baseStrokeClass: string;
  balanceBadge?: {
    symbol: string;
    strokeClass: string;
    textClass: string;
  } | null;
  size?: number;
}> = ({ pct, baseStrokeClass, balanceBadge, size = 18 }) => {
  const strokeWidth = 2.25;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const isBalanceMode = Boolean(balanceBadge);
  const clamped = isBalanceMode ? 100 : pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const offset = circumference * (1 - clamped / 100);

  const strokeClass = balanceBadge
    ? balanceBadge.strokeClass
    : pct === null
      ? 'stroke-white/20'
      : pct <= 10
        ? 'stroke-neutral-500'
        : pct <= 30
          ? 'stroke-neutral-400'
          : baseStrokeClass;

  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-white/[0.1]"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`transition-all duration-300 ${strokeClass}`}
        />
      </svg>
      {balanceBadge && (
        <span
          className={`pointer-events-none absolute text-[9px] font-bold leading-none ${balanceBadge.textClass}`}
        >
          {balanceBadge.symbol}
        </span>
      )}
    </div>
  );
};

function findBalanceProviderForModel(
  modelId: string | undefined,
  savedProviders: SavedProviderEntry[],
  providerBalanceByProviderId: Record<string, ProviderBalanceInfo>
): { providerName: string; info: ProviderBalanceInfo } | null {
  const target = modelId?.trim().toLowerCase();
  if (!target) return null;
  for (const p of savedProviders) {
    if (p.config.provider === 'google') continue;
    const info = providerBalanceByProviderId[p.id];
    if (!info || info.balance === undefined) continue;
    const matches =
      p.config.modelId?.trim().toLowerCase() === target ||
      p.config.models?.some((m) => m.trim().toLowerCase() === target) ||
      p.config.modelConfigs?.some((mc) => mc.id.trim().toLowerCase() === target);
    if (matches) {
      return {
        providerName: p.config.customName?.trim() || p.config.baseUrl || p.config.provider,
        info
      };
    }
  }
  return null;
}

export const SidebarQuotaCard: React.FC = () => {
  const {
    savedProviders,
    agyQuotaByProviderId,
    providerBalanceByProviderId,
    balanceAlertThresholds,
    roleModels
  } = useArchpiStore();

  const [popoverPos, setPopoverPos] = useState<{ left: number; bottom: number } | null>(null);
  const [pinned, setPinned] = useState(false);
  const [, setTick] = useState(0);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const agyProviders = useMemo(
    () => savedProviders.filter((p) => p.config.provider === 'google'),
    [savedProviders]
  );

  const masterModelId = roleModels.master?.defaultModel || roleModels.master?.models?.[0];
  const workerModelId = roleModels.worker?.defaultModel || roleModels.worker?.models?.[0];

  const masterAgg = useMemo(
    () => computeRoleQuotaAggregate(masterModelId, agyProviders, agyQuotaByProviderId),
    [masterModelId, agyProviders, agyQuotaByProviderId]
  );

  const workerAgg = useMemo(
    () => computeRoleQuotaAggregate(workerModelId, agyProviders, agyQuotaByProviderId),
    [workerModelId, agyProviders, agyQuotaByProviderId]
  );

  const masterBalance = useMemo(
    () => findBalanceProviderForModel(masterModelId, savedProviders, providerBalanceByProviderId),
    [masterModelId, savedProviders, providerBalanceByProviderId]
  );

  const workerBalance = useMemo(
    () => findBalanceProviderForModel(workerModelId, savedProviders, providerBalanceByProviderId),
    [workerModelId, savedProviders, providerBalanceByProviderId]
  );

  useEffect(() => {
    if (!popoverPos) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, [popoverPos]);

  useEffect(() => {
    if (!popoverPos) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setPinned(false);
      setPopoverPos(null);
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [popoverPos]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const cancelCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openPopover = () => {
    cancelCloseTimer();
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPopoverPos({
      left: rect.left,
      bottom: window.innerHeight - rect.top + 8
    });
  };

  const scheduleClosePopover = () => {
    cancelCloseTimer();
    if (pinned) return;
    closeTimerRef.current = window.setTimeout(() => {
      setPopoverPos(null);
    }, 160);
  };

  const handleCardClick = () => {
    if (popoverPos && pinned) {
      setPinned(false);
      setPopoverPos(null);
    } else {
      setPinned(true);
      openPopover();
    }
  };

  const renderRoleSection = (
    roleTitle: string,
    roleColorClass: string,
    agg: RoleQuotaAggregate,
    balanceMatch: { providerName: string; info: ProviderBalanceInfo } | null
  ) => (
    <div className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-semibold ${roleColorClass}`}>{roleTitle}</span>
        <span className="truncate text-[10px] text-neutral-500" title={agg.modelId}>
          {agg.modelId || '未设置默认模型'}
          {agg.isAgyModel && agg.accountCount > 0 ? ` · ${agg.accountCount} 账号汇总` : ''}
          {!agg.isAgyModel && balanceMatch ? ` · ${balanceMatch.providerName}` : ''}
        </span>
      </div>

      {!agg.modelId ? (
        <p className="text-[10px] text-neutral-500">未设置默认模型</p>
      ) : !agg.isAgyModel ? (
        balanceMatch && balanceMatch.info.balance !== undefined ? (
          (() => {
            const balColor = getBalanceRingColor(balanceMatch.info.balance, balanceAlertThresholds);
            const symbol = balanceMatch.info.unit === 'CNY' ? '¥' : '$';
            return (
              <div className="flex items-center gap-3.5">
                <MiniRoleRing
                  pct={null}
                  baseStrokeClass="stroke-emerald-400"
                  size={34}
                  balanceBadge={{
                    symbol,
                    strokeClass: balColor.strokeClass,
                    textClass: balColor.text
                  }}
                />
                <div className="flex items-baseline gap-5">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-neutral-500">余额</span>
                    <span
                      className={`text-xs font-semibold tabular-nums ${balColor.text}`}
                      title={`${balanceMatch.info.balance} ${balanceMatch.info.unit || 'USD'}`}
                    >
                      <MoneyAmount
                        value={balanceMatch.info.balance}
                        unit={balanceMatch.info.unit}
                      />
                    </span>
                  </div>
                  {balanceMatch.info.totalCost !== undefined && (
                    <div className="flex flex-col">
                      <span className="text-[10px] text-neutral-500">历史消耗</span>
                      <span
                        className="text-xs font-medium tabular-nums text-neutral-300"
                        title={`${balanceMatch.info.totalCost} ${balanceMatch.info.unit || 'USD'}`}
                      >
                        <MoneyAmount
                          value={balanceMatch.info.totalCost}
                          unit={balanceMatch.info.unit}
                        />
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()
        ) : (
          <p className="text-[10px] text-neutral-500">非 Antigravity 模型，无周期配额限制</p>
        )
      ) : !agg.weekly && !agg.fiveHour ? (
        <p className="text-[10px] text-neutral-500">暂无可用配额数据</p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          {agg.weekly && (
            <AgyQuotaRing
              compact
              label="周限汇总"
              percentage={agg.weekly.percentage}
              resetTime={agg.weekly.resetTime}
            />
          )}
          {agg.fiveHour && (
            <AgyQuotaRing
              compact
              label="5H 汇总"
              percentage={agg.fiveHour.percentage}
              resetTime={agg.fiveHour.resetTime}
            />
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={openPopover}
        onMouseLeave={scheduleClosePopover}
        onClick={handleCardClick}
        className="group grid w-full grid-cols-2 gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
      >
        <div className="flex items-center gap-2">
          {(() => {
            const bal =
              masterAgg.combinedPct === null ? masterBalance?.info.balance : undefined;
            const balColor =
              bal !== undefined ? getBalanceRingColor(bal, balanceAlertThresholds) : null;
            return (
              <>
                <MiniRoleRing
                  pct={masterAgg.combinedPct}
                  baseStrokeClass="stroke-purple-400"
                  balanceBadge={
                    balColor
                      ? {
                          symbol: masterBalance?.info.unit === 'CNY' ? '¥' : '$',
                          strokeClass: balColor.strokeClass,
                          textClass: balColor.text
                        }
                      : null
                  }
                />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium leading-tight text-purple-300/90">
                    Master
                  </div>
                  <div
                    className={`text-[10px] leading-tight tabular-nums ${
                      masterAgg.combinedPct !== null
                        ? getQuotaRingColor(masterAgg.combinedPct).text
                        : balColor
                          ? balColor.text
                          : 'text-neutral-500'
                    }`}
                  >
                    {masterAgg.combinedPct !== null ? (
                      `${masterAgg.combinedPct}%`
                    ) : bal !== undefined ? (
                      <MoneyAmount value={bal} unit={masterBalance?.info.unit} />
                    ) : (
                      '--'
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        <div className="flex items-center gap-2">
          {(() => {
            const bal =
              workerAgg.combinedPct === null ? workerBalance?.info.balance : undefined;
            const balColor =
              bal !== undefined ? getBalanceRingColor(bal, balanceAlertThresholds) : null;
            return (
              <>
                <MiniRoleRing
                  pct={workerAgg.combinedPct}
                  baseStrokeClass="stroke-[#7a9e8c]"
                  balanceBadge={
                    balColor
                      ? {
                          symbol: workerBalance?.info.unit === 'CNY' ? '¥' : '$',
                          strokeClass: balColor.strokeClass,
                          textClass: balColor.text
                        }
                      : null
                  }
                />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium leading-tight text-[#8eb3a0]">
                    Worker
                  </div>
                  <div
                    className={`text-[10px] leading-tight tabular-nums ${
                      workerAgg.combinedPct !== null
                        ? getQuotaRingColor(workerAgg.combinedPct).text
                        : balColor
                          ? balColor.text
                          : 'text-neutral-500'
                    }`}
                  >
                    {workerAgg.combinedPct !== null ? (
                      `${workerAgg.combinedPct}%`
                    ) : bal !== undefined ? (
                      <MoneyAmount value={bal} unit={workerBalance?.info.unit} />
                    ) : (
                      '--'
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </button>

      {popoverPos &&
        createPortal(
          <div
            ref={popoverRef}
            onMouseEnter={cancelCloseTimer}
            onMouseLeave={scheduleClosePopover}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              left: popoverPos.left,
              bottom: popoverPos.bottom
            }}
            className="animate-menu-pop z-[9999] w-80 origin-bottom-left"
          >
            <TopGlowBox
              roundedClassName="rounded-xl"
              innerRoundedClassName="rounded-[11px]"
              innerClassName="p-3.5 shadow-2xl shadow-black/70"
            >
              <div className="space-y-3">
                <div className="text-xs font-semibold text-neutral-100">默认模型综合配额</div>

                <div className="divide-y divide-white/[0.06]">
                  {renderRoleSection('Master', 'text-purple-300', masterAgg, masterBalance)}
                  {renderRoleSection('Worker', 'text-[#8eb3a0]', workerAgg, workerBalance)}
                </div>
              </div>
            </TopGlowBox>
          </div>,
          document.body
        )}
    </>
  );
};
