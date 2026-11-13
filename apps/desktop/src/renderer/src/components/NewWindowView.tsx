import React, { useEffect, useRef, useState } from 'react';
import { Folder } from 'iconoir-react';
import { clampWindowTitle, type ThinkingLevel, type WindowRole } from '@archpi/shared';
import archPiLogo from '../assets/logo.svg';
import { useArchpiStore } from '../store/useArchpiStore';
import { useT } from '../i18n';
import { TopGlowBox } from './TopGlowBox';
import { GlowSelect } from './GlowSelect';
import { SlashCommandPanel, type SlashCommandItem } from './SlashCommandPanel';
import { type VoiceInputHandle } from './VoiceInputButton';
import { RoleModelThinkingBar } from './RoleModelThinkingBar';

export const NewWindowView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    providerConfig,
    roleModels,
    voiceConfig,
    userSettings,
    createWindow,
    sendMessage
  } = useArchpiStore();

  const t = useT();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    activeProjectId ?? projects[0]?.id ?? ''
  );
  const selectedProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0];

  const [role, setRole] = useState<WindowRole>(userSettings.defaultNewWindowRole ?? 'worker');
  const [modelByRole, setModelByRole] = useState<Partial<Record<WindowRole, string>>>({});
  const [thinkingByRole, setThinkingByRole] = useState<
    Partial<Record<WindowRole, ThinkingLevel | ''>>
  >({});
  const [prompt, setPrompt] = useState('');
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const voiceRef = useRef<VoiceInputHandle | null>(null);
  const spaceRecordingRef = useRef(false);

  const fallbackModels = Array.from(
    new Set(
      [
        ...(providerConfig.modelConfigs?.map((m) => m.id) ?? []),
        ...(providerConfig.models ?? []),
        ...(providerConfig.modelId ? [providerConfig.modelId] : [])
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
  const currentThinking = getThinkingForRole(role);

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

  const handleSend = async () => {
    const targetProjectId = selectedProject?.id;
    const trimmed = prompt.trim();
    if (!targetProjectId || !trimmed || submitting) return;

    setSubmitting(true);
    try {
      const title = buildWindowTitle(trimmed);
      const created = await createWindow({
        projectId: targetProjectId,
        title,
        role,
        branch: selectedProject?.branch || 'main',
        model: currentModel
      });

      await sendMessage(created.id, trimmed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col justify-between overflow-hidden">
      {/* Center Greeting */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <img
          src={archPiLogo}
          alt="Arch Pi"
          className="mb-5 h-11 w-auto opacity-30 grayscale select-none [image-rendering:pixelated]"
        />
        <h2 className="text-xl font-medium tracking-tight text-neutral-200">
          {t.newWindow.heading}
        </h2>
        <p className="mt-2 max-w-md text-xs text-neutral-500">
          {t.newWindow.subheading}
        </p>
      </div>

      {/* Bottom AGY-style Composer */}
      <div className="relative mx-auto w-full max-w-3xl px-6 pb-6">
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
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-neutral-300">
                <Folder className="h-3 w-3 text-neutral-500" />
                <span>{selectedProject?.name ?? 'Arch Pi'}</span>
              </span>
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
            thinking={currentThinking}
            roleModels={roleModels}
            fallbackModels={fallbackModels}
            onSelectRoleModel={(nextRole, nextModel) => {
              setRole(nextRole);
              setModelByRole((prev) => ({
                ...prev,
                [nextRole]: nextModel
              }));
            }}
            onChangeThinking={(val) =>
              setThinkingByRole((prev) => ({
                ...prev,
                [role]: val
              }))
            }
            voiceRef={voiceRef}
            onTranscript={(text) => setPrompt((prev) => (prev ? `${prev} ${text}` : text))}
            canSend={Boolean(selectedProject && prompt.trim() && !submitting)}
            sendTooltip={t.workspace.send}
            onSend={() => void handleSend()}
          />
        </TopGlowBox>
      </div>
    </div>
  );
};
