import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, NavArrowDown, SendDiagonal, StarSolid } from 'iconoir-react';
import { isGeminiModel, type ThinkingLevel, type WindowRole } from '@archpi/shared';
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
  thinking: ThinkingLevel | '';
  roleModels: RoleModelsMap;
  fallbackModels: string[];
  onSelectRoleModel: (role: WindowRole, modelId: string) => void;
  onChangeThinking: (level: ThinkingLevel | '') => void;
  voiceRef?: React.RefObject<VoiceInputHandle | null>;
  onTranscript: (text: string) => void;
  canSend: boolean;
  sendTooltip: string;
  onSend: () => void;
}

export const RoleModelThinkingBar: React.FC<RoleModelThinkingBarProps> = ({
  role,
  model,
  thinking,
  roleModels,
  fallbackModels,
  onSelectRoleModel,
  onChangeThinking,
  voiceRef,
  onTranscript,
  canSend,
  sendTooltip,
  onSend
}) => {
  const providerConfig = useArchpiStore((s) => s.providerConfig);
  const modelsDevCache = useArchpiStore((s) => s.modelsDevCache);
  const providerModelCfg = providerConfig.modelConfigs?.find((c) => c.id === model);
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
  const [thinkingMenuPos, setThinkingMenuPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);

  const roleGroupRef = useRef<HTMLDivElement | null>(null);
  const activeRoleBtnRef = useRef<HTMLButtonElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
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
