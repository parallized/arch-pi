import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, NavArrowDown, SendDiagonal, StarSolid } from 'iconoir-react';
import {
  isGeminiModel,
  type AgyAccountQuota,
  type SavedProviderEntry,
  type ThinkingLevel,
  type WindowRole
} from '@archpi/shared';
import { TopGlowBox } from './TopGlowBox';
import {
  PIXEL_THINKING_OPTIONS,
  PixelThinkingSlider
} from './PixelThinkingSlider';
import { VoiceInputButton, type VoiceInputHandle } from './VoiceInputButton';
import { ROLE_BADGE_META } from './statusTheme';
import type { RoleModelsMap } from '../utils/roleModels';
import { useArchpiStore } from '../store/useArchpiStore';
import { lookupModelThinkingLevels } from '../utils/modelsDev';

interface RoleModelThinkingBarProps {
  role: WindowRole;
  model: string;
  providerId?: string;
  thinking: ThinkingLevel | '';
  roleModels: RoleModelsMap;
  fallbackModels: string[];
  onSelectRoleModel: (role: WindowRole, modelId: string) => void;
  onSelectProvider?: (providerId: string | undefined) => void;
  onChangeThinking: (level: ThinkingLevel | '') => void;
  voiceRef?: React.RefObject<VoiceInputHandle | null>;
  onTranscript: (text: string) => void;
  canSend: boolean;
  sendTooltip: string;
  onSend: () => void;
}

function getProviderDisplayLabel(entry: SavedProviderEntry): string {
  const email = entry.config.antigravityAuth?.email?.trim();
  if (email) return email;
  const custom = entry.config.customName?.trim();
  if (custom) return custom;
  return entry.config.provider;
}

function isAgyEntry(entry: SavedProviderEntry): boolean {
  return Boolean(
    entry.config.antigravityAuth?.refreshToken?.trim() ||
      entry.config.antigravityAuth?.email?.trim() ||
      entry.config.icon === 'Antigravity'
  );
}

function entrySupportsModel(
  entry: SavedProviderEntry,
  modelId: string,
  quota?: AgyAccountQuota
): boolean {
  if (!modelId) return false;
  if (
    entry.config.modelConfigs?.some((m) => m.id === modelId) ||
    entry.config.models?.includes(modelId) ||
    entry.config.modelId === modelId
  ) {
    return true;
  }
  if (isAgyEntry(entry) && quota?.availableModels?.includes(modelId)) {
    return true;
  }
  return false;
}

function getAgyQuotaPctForModel(
  modelId: string,
  quota?: AgyAccountQuota
): number | null {
  if (!quota || !modelId) return null;
  const lower = modelId.trim().toLowerCase();
  const groupKey = lower.includes('argon')
    ? 'argon'
    : lower.startsWith('claude') || lower.startsWith('gpt')
      ? 'claude'
      : lower.includes('gemini')
        ? 'gemini'
        : null;
  if (!groupKey) return null;
  const group = quota.groups.find((g) => g.key === groupKey);
  if (!group) return null;
  if (group.weekly && group.fiveHour) {
    return Math.min(group.weekly.percentage, group.fiveHour.percentage);
  }
  return group.weekly?.percentage ?? group.fiveHour?.percentage ?? null;
}

export const RoleModelThinkingBar: React.FC<RoleModelThinkingBarProps> = ({
  role,
  model,
  providerId,
  thinking,
  roleModels,
  fallbackModels,
  onSelectRoleModel,
  onSelectProvider,
  onChangeThinking,
  voiceRef,
  onTranscript,
  canSend,
  sendTooltip,
  onSend
}) => {
  const providerConfig = useArchpiStore((s) => s.providerConfig);
  const savedProviders = useArchpiStore((s) => s.savedProviders);
  const agyQuotaByProviderId = useArchpiStore((s) => s.agyQuotaByProviderId);
  const modelsDevCache = useArchpiStore((s) => s.modelsDevCache);

  const matchingProviders = savedProviders.filter((p) =>
    entrySupportsModel(p, model, agyQuotaByProviderId[p.id])
  );
  const selectedProviderEntry = providerId
    ? matchingProviders.find((p) => p.id === providerId)
    : undefined;
  const effectiveProviderCfg =
    selectedProviderEntry?.config ?? matchingProviders[0]?.config ?? providerConfig;

  const providerModelCfg = effectiveProviderCfg.modelConfigs?.find((c) => c.id === model);
  const allowedLevels: ThinkingLevel[] | undefined =
    (providerModelCfg?.thinkingLevels && providerModelCfg.thinkingLevels.length > 0
      ? providerModelCfg.thinkingLevels
      : undefined) ??
    lookupModelThinkingLevels(modelsDevCache, model);

  const effectiveThinking: ThinkingLevel | '' =
    thinking && allowedLevels && allowedLevels.length > 0 && !allowedLevels.includes(thinking)
      ? ''
      : thinking;

  const supportsThinking = !isGeminiModel(model);

  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);

  useEffect(() => {
    if (!supportsThinking && thinkingMenuOpen) {
      setThinkingMenuOpen(false);
    }
  }, [supportsThinking, thinkingMenuOpen]);
  const [menuPos, setMenuPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    minWidth: number;
  } | null>(null);
  const [providerMenuPos, setProviderMenuPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    minWidth: number;
  } | null>(null);
  const [thinkingMenuPos, setThinkingMenuPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);

  const roleGroupRef = useRef<HTMLDivElement | null>(null);
  const activeRoleBtnRef = useRef<HTMLButtonElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const providerBtnRef = useRef<HTMLButtonElement | null>(null);
  const providerMenuRef = useRef<HTMLDivElement | null>(null);
  const thinkingBtnRef = useRef<HTMLButtonElement | null>(null);
  const thinkingMenuRef = useRef<HTMLDivElement | null>(null);

  const getModelsForRole = (r: WindowRole): string[] => {
    const configured = roleModels[r]?.models ?? [];
    return configured.length > 0 ? configured : fallbackModels;
  };

  const updateModelMenuPos = () => {
    const rect = activeRoleBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 260 && rect.top > spaceBelow;
    setMenuPos({
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      left: rect.left,
      minWidth: Math.max(rect.width, 180)
    });
  };

  const updateThinkingMenuPos = () => {
    const rect = thinkingBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 200 && rect.top > spaceBelow;
    setThinkingMenuPos({
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      right: Math.max(12, window.innerWidth - rect.right)
    });
  };

  const updateProviderMenuPos = () => {
    const rect = providerBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 240 && rect.top > spaceBelow;
    setProviderMenuPos({
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      left: rect.left,
      minWidth: Math.max(rect.width, 220)
    });
  };

  useLayoutEffect(() => {
    if (!modelMenuOpen) {
      setMenuPos(null);
      return;
    }
    updateModelMenuPos();
  }, [modelMenuOpen, role]);

  useLayoutEffect(() => {
    if (!thinkingMenuOpen) {
      setThinkingMenuPos(null);
      return;
    }
    updateThinkingMenuPos();
  }, [thinkingMenuOpen]);

  useLayoutEffect(() => {
    if (!providerMenuOpen) {
      setProviderMenuPos(null);
      return;
    }
    updateProviderMenuPos();
  }, [providerMenuOpen]);

  useEffect(() => {
    if (!providerMenuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        providerBtnRef.current &&
        !providerBtnRef.current.contains(target) &&
        (!providerMenuRef.current || !providerMenuRef.current.contains(target))
      ) {
        setProviderMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProviderMenuOpen(false);
    };
    const handleReposition = () => updateProviderMenuPos();

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [providerMenuOpen]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        roleGroupRef.current &&
        !roleGroupRef.current.contains(target) &&
        (!modelMenuRef.current || !modelMenuRef.current.contains(target))
      ) {
        setModelMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModelMenuOpen(false);
    };
    const handleReposition = () => updateModelMenuPos();

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [modelMenuOpen]);

  useEffect(() => {
    if (!thinkingMenuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        thinkingBtnRef.current &&
        !thinkingBtnRef.current.contains(target) &&
        (!thinkingMenuRef.current || !thinkingMenuRef.current.contains(target))
      ) {
        setThinkingMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setThinkingMenuOpen(false);
    };
    const handleReposition = () => updateThinkingMenuPos();

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [thinkingMenuOpen]);

  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      {/* Left: Separate Role Pill + Model Picker Pill & 2-Column Popover */}
      <div ref={roleGroupRef} className="flex min-w-0 items-center gap-1.5">
        {/* Role Badge (matches Sidebar ROLE_BADGE_META, non-interactive) */}
        <span
          className={`h-5 shrink-0 select-none text-[11px] font-medium leading-none ${ROLE_BADGE_META[role].badgeClass}`}
        >
          {ROLE_BADGE_META[role].short}
        </span>

        {/* Model Selector Card */}
        <button
          ref={activeRoleBtnRef}
          type="button"
          aria-expanded={modelMenuOpen}
          onClick={() => setModelMenuOpen((prev) => !prev)}
          className="inline-flex h-5 min-w-0 cursor-pointer items-center gap-1.5 rounded-md bg-[#101010] px-2 text-[11px] leading-none text-neutral-300 transition-colors hover:bg-white/[0.1] hover:text-neutral-100"
        >
          <span className="truncate">{model}</span>

          <NavArrowDown
            className={`h-3 w-3 shrink-0 text-neutral-500 transition-transform duration-150 ${
              modelMenuOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {modelMenuOpen &&
          menuPos &&
          createPortal(
            <div
              ref={modelMenuRef}
              style={{
                position: 'fixed',
                left: menuPos.left,
                top: menuPos.top,
                bottom: menuPos.bottom,
                minWidth: Math.max(menuPos.minWidth, 420),
                maxWidth: 'min(92vw, 520px)'
              }}
              className="animate-menu-pop z-[9999]"
            >
              <TopGlowBox
                roundedClassName="rounded-xl"
                innerRoundedClassName="rounded-[11px]"
                innerClassName="p-2 shadow-xl shadow-black/60"
              >
                <div className="grid grid-cols-[1fr_1px_1fr] items-stretch">
                  {(['master', 'worker'] as WindowRole[]).map((colRole, colIdx) => {
                    const isColActive = role === colRole;
                    const isMaster = colRole === 'master';
                    const colModels = getModelsForRole(colRole);

                    return (
                      <React.Fragment key={colRole}>
                        {colIdx === 1 && (
                          <div className="my-1 w-px bg-gradient-to-b from-transparent via-white/[0.14] to-transparent" />
                        )}
                        <div
                          className={`flex flex-col py-1 ${
                            colIdx === 0 ? 'pr-2 pl-1' : 'pl-2 pr-1'
                          }`}
                        >
                          <div className="mb-1.5 px-2 py-0.5 text-left">
                            <span
                              className={`text-[11px] font-medium ${
                                isMaster ? 'text-purple-300' : 'text-neutral-400'
                              }`}
                            >
                              {isMaster ? 'Master' : 'Worker'}
                            </span>
                          </div>

                          <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                            {colModels.map((modelId) => {
                              const isSelected = isColActive && modelId === model;
                              const isDefault = roleModels[colRole]?.defaultModel === modelId;
                              return (
                                <button
                                  key={modelId}
                                  type="button"
                                  onClick={() => {
                                    onSelectRoleModel(colRole, modelId);
                                    setModelMenuOpen(false);
                                  }}
                                  className={`flex w-full items-center justify-between gap-2 rounded-[7px] px-2 py-1.5 text-left text-[11px] transition-colors ${
                                    isSelected
                                      ? isMaster
                                        ? 'bg-purple-500/15 text-purple-100'
                                        : 'bg-white/[0.1] text-neutral-100'
                                      : 'text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100'
                                  }`}
                                >
                                  <span className="truncate">{modelId}</span>
                                  {(isDefault || isSelected) && (
                                    <span className="flex shrink-0 items-center gap-1.5">
                                      {isDefault && (
                                        <StarSolid className="h-3 w-3 text-amber-300" />
                                      )}
                                      {isSelected && (
                                        <Check className="h-3 w-3 text-neutral-200" />
                                      )}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                            {colModels.length === 0 && (
                              <div className="px-2 py-2 text-center text-[11px] text-neutral-500">
                                暂无可用模型
                              </div>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </TopGlowBox>
            </div>,
            document.body
          )}

        {onSelectProvider && (matchingProviders.length > 1 || selectedProviderEntry) && (
          <>
            <button
              ref={providerBtnRef}
              type="button"
              aria-expanded={providerMenuOpen}
              onClick={() => setProviderMenuOpen((prev) => !prev)}
              title="选择账号 / 供应商（支持配额耗尽自动切号）"
              className="inline-flex h-5 max-w-[160px] shrink-0 cursor-pointer items-center gap-1 rounded-md bg-[#101010] px-2 text-[11px] leading-none text-neutral-400 transition-colors hover:bg-white/[0.1] hover:text-neutral-100"
            >
              <span className="truncate">
                {selectedProviderEntry
                  ? getProviderDisplayLabel(selectedProviderEntry)
                  : `Auto (${matchingProviders.length})`}
              </span>
              {selectedProviderEntry &&
                (() => {
                  const pct = getAgyQuotaPctForModel(
                    model,
                    agyQuotaByProviderId[selectedProviderEntry.id]
                  );
                  if (pct === null) return null;
                  const color =
                    pct <= 0
                      ? 'text-red-400'
                      : pct <= 20
                        ? 'text-amber-300'
                        : 'text-emerald-400';
                  return <span className={`shrink-0 font-mono text-[10px] ${color}`}>{pct}%</span>;
                })()}
              <NavArrowDown
                className={`h-3 w-3 shrink-0 text-neutral-500 transition-transform duration-150 ${
                  providerMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {providerMenuOpen &&
              providerMenuPos &&
              createPortal(
                <div
                  ref={providerMenuRef}
                  style={{
                    position: 'fixed',
                    left: providerMenuPos.left,
                    top: providerMenuPos.top,
                    bottom: providerMenuPos.bottom,
                    minWidth: providerMenuPos.minWidth,
                    maxWidth: 'min(90vw, 300px)'
                  }}
                  className="animate-menu-pop z-[9999]"
                >
                  <TopGlowBox
                    roundedClassName="rounded-xl"
                    innerRoundedClassName="rounded-[11px]"
                    innerClassName="p-1.5 shadow-xl shadow-black/60"
                  >
                    <div className="mb-1 px-2 py-0.5 text-[10.5px] font-medium text-neutral-500">
                      账号 / 供应商路由
                    </div>
                    <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProvider(undefined);
                          setProviderMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-[7px] px-2 py-1.5 text-left text-[11px] transition-colors ${
                          !providerId
                            ? 'bg-white/[0.1] text-neutral-100'
                            : 'text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100'
                        }`}
                      >
                        <span className="truncate">Auto（自动路由 / 耗尽切号）</span>
                        {!providerId && <Check className="h-3 w-3 shrink-0 text-neutral-200" />}
                      </button>

                      {matchingProviders.map((entry) => {
                        const isSelected = providerId === entry.id;
                        const label = getProviderDisplayLabel(entry);
                        const pct = getAgyQuotaPctForModel(
                          model,
                          agyQuotaByProviderId[entry.id]
                        );
                        const pctColor =
                          pct === null
                            ? ''
                            : pct <= 0
                              ? 'text-red-400'
                              : pct <= 20
                                ? 'text-amber-300'
                                : 'text-emerald-400';
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => {
                              onSelectProvider(entry.id);
                              setProviderMenuOpen(false);
                            }}
                            className={`flex w-full items-center justify-between gap-2 rounded-[7px] px-2 py-1.5 text-left text-[11px] transition-colors ${
                              isSelected
                                ? 'bg-white/[0.1] text-neutral-100'
                                : 'text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100'
                            }`}
                          >
                            <span className="truncate">{label}</span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              {pct !== null && (
                                <span className={`font-mono text-[10px] ${pctColor}`}>
                                  {pct}%
                                </span>
                              )}
                              {isSelected && (
                                <Check className="h-3 w-3 shrink-0 text-neutral-200" />
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </TopGlowBox>
                </div>,
                document.body
              )}
          </>
        )}
      </div>

      {/* Right: Thinking Slider + Voice Input + Send */}
      <div className="flex shrink-0 items-center gap-2">
        {supportsThinking && (
          <>
            <button
              ref={thinkingBtnRef}
              type="button"
              aria-expanded={thinkingMenuOpen}
              onClick={() => setThinkingMenuOpen((prev) => !prev)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#101010] px-2.5 py-1.5 text-[11px] text-neutral-300 transition-colors hover:bg-white/[0.1] hover:text-neutral-100"
            >
              <span>
                {PIXEL_THINKING_OPTIONS.find((o) => o.value === effectiveThinking)?.label ?? '默认'}
              </span>
              <NavArrowDown
                className={`h-3 w-3 text-neutral-500 transition-transform duration-150 ${
                  thinkingMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {thinkingMenuOpen &&
              thinkingMenuPos &&
              createPortal(
                <div
                  ref={thinkingMenuRef}
                  style={{
                    position: 'fixed',
                    right: thinkingMenuPos.right,
                    top: thinkingMenuPos.top,
                    bottom: thinkingMenuPos.bottom,
                    width: 316
                  }}
                  className="animate-menu-pop z-[9999]"
                >
                  <TopGlowBox
                    roundedClassName="rounded-2xl"
                    innerRoundedClassName="rounded-[15px]"
                    innerClassName="p-0.5 shadow-2xl shadow-black/70"
                  >
                    <PixelThinkingSlider
                      value={effectiveThinking}
                      modelName={model}
                      allowedLevels={allowedLevels}
                      onChange={onChangeThinking}
                      onReset={() => onChangeThinking('')}
                    />
                  </TopGlowBox>
                </div>,
                document.body
              )}
          </>
        )}

        <VoiceInputButton ref={voiceRef} onTranscript={onTranscript} />

        <button
          type="button"
          disabled={!canSend}
          onClick={onSend}
          data-tooltip={sendTooltip}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-900 transition-colors hover:bg-white disabled:opacity-40"
        >
          <SendDiagonal className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
