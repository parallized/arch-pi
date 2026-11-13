import React, { useEffect, useRef, useState } from 'react';
import { Check, Folder, Plus, Settings } from 'iconoir-react';
import {
  clampWindowTitle,
  isGeminiModel,
  type ProviderConfig,
  type SavedProviderEntry,
  type ThinkingLevel,
  type WindowRole
} from '@archpi/shared';
import archPiLogo from '../assets/logo.svg';
import { useArchpiStore } from '../store/useArchpiStore';
import { useT } from '../i18n';
import { TopGlowBox } from './TopGlowBox';
import { GlowSelect } from './GlowSelect';
import { SlashCommandPanel, type SlashCommandItem } from './SlashCommandPanel';
import { type VoiceInputHandle } from './VoiceInputButton';
import { RoleModelThinkingBar } from './RoleModelThinkingBar';

function hasProviderAuth(cfg?: ProviderConfig): boolean {
  if (!cfg) return false;
  return Boolean(
    cfg.apiKey?.trim() ||
      cfg.apiKeys?.some((k) => k.key?.trim()) ||
      cfg.antigravityAuth?.refreshToken?.trim() ||
      cfg.antigravityAuth?.email?.trim()
  );
}

function providerSupportsModel(
  entry: SavedProviderEntry,
  modelId: string,
  availableModels?: string[]
): boolean {
  if (!modelId) return false;
  if (
    entry.config.modelConfigs?.some((m) => m.id === modelId) ||
    entry.config.models?.includes(modelId) ||
    entry.config.modelId === modelId
  ) {
    return true;
  }
  return Boolean(availableModels?.includes(modelId));
}

export const NewWindowView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    providerConfig,
    savedProviders,
    agyQuotaByProviderId,
    roleModels,
    voiceConfig,
    userSettings,
    createProject,
    createWindow,
    sendMessage,
    setActiveView
  } = useArchpiStore();

  const t = useT();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    activeProjectId ?? projects[0]?.id ?? ''
  );
  const selectedProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0];

  const [role, setRole] = useState<WindowRole>(userSettings.defaultNewWindowRole ?? 'worker');
  const [modelByRole, setModelByRole] = useState<Partial<Record<WindowRole, string>>>({});
  const [providerByRole, setProviderByRole] = useState<
    Partial<Record<WindowRole, string | undefined>>
  >({});
  const [thinkingByRole, setThinkingByRole] = useState<
    Partial<Record<WindowRole, ThinkingLevel | ''>>
  >({});
  const [prompt, setPrompt] = useState('');
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const voiceRef = useRef<VoiceInputHandle | null>(null);
  const spaceRecordingRef = useRef(false);

  const fallbackModels = Array.from(
    new Set(
      [
        ...(providerConfig.modelConfigs?.map((m) => m.id) ?? []),
        ...(providerConfig.models ?? []),
        ...(providerConfig.modelId ? [providerConfig.modelId] : []),
        ...savedProviders.flatMap((p) => [
          ...(p.config.modelConfigs?.map((m) => m.id) ?? []),
          ...(p.config.models ?? []),
          ...(p.config.modelId ? [p.config.modelId] : []),
          ...(agyQuotaByProviderId[p.id]?.availableModels ?? [])
        ])
      ].filter(Boolean)
    )
  );

  const getModelsForRole = (r: WindowRole): string[] => {
    const configured = roleModels[r]?.models ?? [];
    return configured.length > 0 ? configured : fallbackModels;
  };

  const getModelForRole = (r: WindowRole): string =>
    modelByRole[r] ||
    roleModels[r]?.defaultModel ||
    getModelsForRole(r)[0] ||
    providerConfig.modelId;

  const getThinkingForRole = (r: WindowRole): ThinkingLevel | '' => {
    if (thinkingByRole[r] !== undefined) return thinkingByRole[r]!;
    const m = getModelForRole(r);
    const entry = roleModels[r]?.entries?.find((e) => e.id === m);
    return entry?.thinkingLevel ?? roleModels[r]?.thinkingLevel ?? providerConfig.thinkingLevel ?? '';
  };

  const currentModel = getModelForRole(role);
  const currentProviderId =
    providerByRole[role] !== undefined
      ? providerByRole[role]
      : roleModels[role]?.entries?.find((e) => e.id === currentModel)?.providerId;
  const currentThinking = getThinkingForRole(role);

  const hasProject = projects.length > 0;
  const hasAuthenticatedProvider =
    savedProviders.some((p) => hasProviderAuth(p.config)) || hasProviderAuth(providerConfig);
  const hasConfiguredRoleModels =
    (roleModels.master?.models?.length ?? 0) > 0 ||
    (roleModels.worker?.models?.length ?? 0) > 0;
  const showOnboardingChecklist =
    !hasProject || !hasAuthenticatedProvider || !hasConfiguredRoleModels;

  const hasAuthForCurrentModel = (() => {
    if (savedProviders.length > 0) {
      const matching = savedProviders.filter((p) =>
        providerSupportsModel(p, currentModel, agyQuotaByProviderId[p.id]?.availableModels)
      );
      if (currentProviderId) {
        const pinned = matching.find((p) => p.id === currentProviderId);
        return Boolean(pinned && hasProviderAuth(pinned.config));
      }
      if (matching.length > 0) {
        return matching.some((p) => hasProviderAuth(p.config));
      }
      return false;
    }
    return hasProviderAuth(providerConfig);
  })();

  const slashMatch = prompt.match(/^\/([^\s]*)$/);
  const showSlashPanel = Boolean(slashMatch) && !slashDismissed;
  const slashFilter = slashMatch ? slashMatch[1] : '';

  const handleSelectSlashCommand = (cmd: SlashCommandItem) => {
    setPrompt(`/${cmd.name} `);
    setSlashDismissed(true);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  useEffect(() => {
    if (activeProjectId && projects.some((p) => p.id === activeProjectId)) {
      setSelectedProjectId(activeProjectId);
    }
  }, [activeProjectId, projects]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const buildWindowTitle = (text: string): string => {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    return clampWindowTitle(cleaned);
  };

  const handleAddProject = async () => {
    const dir = await window.archpi.selectDirectory();
    if (!dir) return;
    const baseName = dir.split(/[\\/]/).filter(Boolean).pop() || 'workspace';
    await createProject({
      name: baseName,
      rootPath: dir,
      branch: 'main'
    });
    setSendError(null);
  };

  const handleSend = async () => {
    const targetProjectId = selectedProject?.id;
    const trimmed = prompt.trim();
    if (!trimmed || submitting) return;

    if (!targetProjectId) {
      setSendError('请先添加一个工作区项目目录，再发送任务。');
      return;
    }

    if (!hasAuthForCurrentModel) {
      setSendError(
        hasAuthenticatedProvider
          ? `当前模型「${currentModel || '未指定'}」未绑定到已鉴权的供应商，请前往 Settings 将其加入供应商模型列表或切换模型。`
          : '尚未配置有效的模型供应商鉴权（API Key 或 Antigravity 授权），请先前往 Settings 完成配置。'
      );
      return;
    }

    setSendError(null);
    setSubmitting(true);
    try {
      const title = buildWindowTitle(trimmed);
      const created = await createWindow({
        projectId: targetProjectId,
        title,
        role,
        branch: selectedProject?.branch || 'main',
        model: currentModel,
        providerId: currentProviderId
      });

      await sendMessage(created.id, trimmed, {
        model: currentModel,
        providerId: currentProviderId,
        thinkingLevel:
          !isGeminiModel(currentModel) && currentThinking ? currentThinking : undefined
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col justify-between overflow-hidden">
      {/* Center Greeting & Onboarding Checklist */}
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-4 text-center">
        <img
          src={archPiLogo}
          alt="Arch Pi"
          className="mb-4 h-10 w-auto opacity-30 grayscale select-none [image-rendering:pixelated]"
        />
        <h2 className="text-xl font-medium tracking-tight text-neutral-200">
          {t.newWindow.heading}
        </h2>
        <p className="mt-1.5 max-w-md text-xs text-neutral-500">
          {t.newWindow.subheading}
        </p>

        {showOnboardingChecklist && (
          <div className="mt-6 w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 text-left">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-200">
                快速开始检查清单
              </span>
              <span className="text-[11px] text-neutral-500">
                {[hasProject, hasAuthenticatedProvider, hasConfiguredRoleModels].filter(Boolean).length}/3 已完成
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.025] px-3 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                      hasProject
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                        : 'border-white/[0.14] text-neutral-500'
                    }`}
                  >
                    {hasProject ? <Check className="h-3 w-3" /> : '1'}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-neutral-200">添加工作区项目</div>
                    <div className="truncate text-[11px] text-neutral-500">
                      {hasProject
                        ? `已添加 ${projects.length} 个项目（${selectedProject?.name}）`
                        : '选择一个本地代码仓库目录作为工作区'}
                    </div>
                  </div>
                </div>
                {!hasProject && (
                  <button
                    type="button"
                    onClick={() => void handleAddProject()}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-white/[0.08] px-2.5 py-1 text-[11px] font-medium text-neutral-100 transition-colors hover:bg-white/[0.14]"
                  >
                    <Plus className="h-3 w-3" />
                    <span>选择目录</span>
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.025] px-3 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                      hasAuthenticatedProvider
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                        : 'border-white/[0.14] text-neutral-500'
                    }`}
                  >
                    {hasAuthenticatedProvider ? <Check className="h-3 w-3" /> : '2'}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-neutral-200">配置供应商与鉴权</div>
                    <div className="truncate text-[11px] text-neutral-500">
                      {hasAuthenticatedProvider
                        ? '已配置可用的 API Key 或 Antigravity 账号'
                        : '填入 API Key 或导入 Antigravity 账号'}
                    </div>
                  </div>
                </div>
                {!hasAuthenticatedProvider && (
                  <button
                    type="button"
                    onClick={() => setActiveView('settings')}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-white/[0.08] px-2.5 py-1 text-[11px] font-medium text-neutral-100 transition-colors hover:bg-white/[0.14]"
                  >
                    <Settings className="h-3 w-3" />
                    <span>去配置</span>
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.025] px-3 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                      hasConfiguredRoleModels
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                        : 'border-white/[0.14] text-neutral-500'
                    }`}
                  >
                    {hasConfiguredRoleModels ? <Check className="h-3 w-3" /> : '3'}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-neutral-200">
                      配置 Master / Worker 候选模型
                    </div>
                    <div className="truncate text-[11px] text-neutral-500">
                      {hasConfiguredRoleModels
                        ? '已配置角色默认与候选模型'
                        : '为规划(Master)和执行(Worker)指定默认模型'}
                    </div>
                  </div>
                </div>
                {!hasConfiguredRoleModels && (
                  <button
                    type="button"
                    onClick={() => setActiveView('settings')}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-white/[0.08] px-2.5 py-1 text-[11px] font-medium text-neutral-100 transition-colors hover:bg-white/[0.14]"
                  >
                    <Settings className="h-3 w-3" />
                    <span>去设置</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom AGY-style Composer */}
      <div className="relative mx-auto w-full max-w-3xl px-6 pb-6">
        {sendError && (
          <div className="mb-2.5 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200">
            <span>{sendError}</span>
            <div className="flex shrink-0 items-center gap-2">
              {!selectedProject ? (
                <button
                  type="button"
                  onClick={() => void handleAddProject()}
                  className="cursor-pointer rounded-md bg-amber-400/20 px-2 py-1 text-[11px] font-medium text-amber-100 hover:bg-amber-400/30"
                >
                  选择目录
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveView('settings')}
                  className="cursor-pointer rounded-md bg-amber-400/20 px-2 py-1 text-[11px] font-medium text-amber-100 hover:bg-amber-400/30"
                >
                  打开 Settings
                </button>
              )}
            </div>
          </div>
        )}
        {showSlashPanel && (
          <div className="absolute bottom-full left-6 right-6 z-40 mb-2">
            <SlashCommandPanel
              filter={slashFilter}
              onSelect={handleSelectSlashCommand}
              onClose={() => setSlashDismissed(true)}
            />
          </div>
        )}
        <TopGlowBox className="w-full" innerClassName="flex flex-col gap-2.5 px-4 py-3">
          {/* Top Metadata Row: Project */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
            {projects.length > 1 ? (
              <GlowSelect
                value={selectedProject?.id ?? ''}
                onChange={setSelectedProjectId}
                options={projects.map((p) => ({
                  value: p.id,
                  label: p.name
                }))}
              />
            ) : selectedProject ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-neutral-300">
                <Folder className="h-3 w-3 text-neutral-500" />
                <span>{selectedProject.name}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void handleAddProject()}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-200 transition-colors hover:bg-amber-500/20"
              >
                <Plus className="h-3 w-3" />
                <span>请先添加工作区项目</span>
              </button>
            )}
          </div>

          {/* Prompt Input */}
          <textarea
            ref={textareaRef}
            rows={2}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setSlashDismissed(false);
            }}
            onKeyDown={(e) => {
              if (e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (spaceRecordingRef.current) {
                  e.preventDefault();
                  return;
                }
                if (voiceConfig.enabled && userSettings.spaceToRecord !== false && !prompt) {
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
                void handleSend();
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

          {/* Bottom Toolbar: Aggregated Role/Model/Thinking Picker + Actions */}
          <RoleModelThinkingBar
            role={role}
            model={currentModel}
            providerId={currentProviderId}
            thinking={currentThinking}
            roleModels={roleModels}
            fallbackModels={fallbackModels}
            onSelectRoleModel={(nextRole, nextModel) => {
              setRole(nextRole);
              setModelByRole((prev) => ({
                ...prev,
                [nextRole]: nextModel
              }));
              setSendError(null);
            }}
            onSelectProvider={(nextProviderId) => {
              setProviderByRole((prev) => ({
                ...prev,
                [role]: nextProviderId
              }));
              setSendError(null);
            }}
            onChangeThinking={(val) =>
              setThinkingByRole((prev) => ({
                ...prev,
                [role]: val
              }))
            }
            voiceRef={voiceRef}
            onTranscript={(text) => setPrompt((prev) => (prev ? `${prev} ${text}` : text))}
            canSend={Boolean(prompt.trim() && !submitting)}
            sendTooltip={t.workspace.send}
            onSend={() => void handleSend()}
          />
        </TopGlowBox>
      </div>
    </div>
  );
};
