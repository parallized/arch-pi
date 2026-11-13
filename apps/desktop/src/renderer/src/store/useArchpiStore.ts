import { create } from 'zustand';
import type {
  AgyAccountQuota,
  AliveWindow,
  AppSnapshot,
  ArchpiEvent,
  BalanceAlertThresholds,
  ChatMessage,
  CreateWindowInput,
  DispatchPlanInput,
  ModelsDevCache,
  ProjectInfo,
  ProviderBalanceInfo,
  ProviderConfig,
  QuotaLimits,
  RoleModelsMap,
  SavedProviderEntry,
  TaskCard,
  ThinkingLevel,
  UserSettings,
  VoiceInputConfig
} from '@archpi/shared';
import { parseModelsDevCache } from '../utils/modelsDev';
import { DEFAULT_ROLE_MODELS, normalizeRoleModels } from '../utils/roleModels';

export type ActiveView = 'board' | 'workspace' | 'settings' | 'new_window';
export type SettingsTab = 'general' | 'provider' | 'voice';
export type AppLanguage = 'zh' | 'en';

export interface MasterWorkerLink {
  masterWindowId: string;
  workerWindowId: string;
  planId: string;
  locked: boolean;
}

const MASTER_WORKER_LINKS_STORAGE_KEY = 'archpi_master_worker_links_v1';

function loadPersistedMasterWorkerLinks(): MasterWorkerLink[] {
  try {
    const raw = localStorage.getItem(MASTER_WORKER_LINKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is MasterWorkerLink =>
        Boolean(item) &&
        typeof item.masterWindowId === 'string' &&
        typeof item.workerWindowId === 'string' &&
        typeof item.planId === 'string' &&
        typeof item.locked === 'boolean'
    );
  } catch {
    return [];
  }
}

function persistMasterWorkerLinks(links: MasterWorkerLink[]): void {
  try {
    localStorage.setItem(MASTER_WORKER_LINKS_STORAGE_KEY, JSON.stringify(links));
  } catch {
    // ignore storage write errors
  }
}

function pruneMasterWorkerLinks(
  links: MasterWorkerLink[],
  windows: AliveWindow[]
): MasterWorkerLink[] {
  const activeIds = new Set(windows.filter((w) => !w.archived).map((w) => w.id));
  return links.filter(
    (l) =>
      l.masterWindowId !== l.workerWindowId &&
      activeIds.has(l.masterWindowId) &&
      activeIds.has(l.workerWindowId)
  );
}

function upsertMasterWorkerLink(
  links: MasterWorkerLink[],
  nextLink: MasterWorkerLink
): MasterWorkerLink[] {
  const filtered = links.filter(
    (l) =>
      !(
        l.masterWindowId === nextLink.masterWindowId &&
        l.workerWindowId === nextLink.workerWindowId
      )
  );
  return [...filtered, nextLink];
}

function findLinkForWindow(
  links: MasterWorkerLink[],
  windowId: string | null
): MasterWorkerLink | null {
  if (!windowId) return null;
  for (let i = links.length - 1; i >= 0; i -= 1) {
    const link = links[i];
    if (link.masterWindowId === windowId || link.workerWindowId === windowId) {
      return link;
    }
  }
  return null;
}

const LEGACY_STORAGE_KEYS = {
  language: 'archpi.language',
  savedProviders: 'archpi_saved_providers_v1',
  activeProviderId: 'archpi_active_provider_id_v1',
  roleModels: 'archpi_role_models_v1',
  modelsDevCache: 'archpi:models-dev-cache-v1',
  voiceConfig: 'archpi_voice_config_v1',
  quotaLimits: 'archpi_quota_limits_v1'
} as const;

interface ArchpiState {
  initialized: boolean;
  initError: string | null;
  projects: ProjectInfo[];
  windows: AliveWindow[];
  tasks: TaskCard[];
  messagesByWindow: Record<string, ChatMessage[]>;
  providerConfig: ProviderConfig;
  voiceConfig: VoiceInputConfig;
  savedProviders: SavedProviderEntry[];
  activeProviderId: string | null;
  roleModels: RoleModelsMap;
  modelsDevCache: ModelsDevCache | null;
  quotaAutoRefreshEnabled: boolean;
  quotaAutoRefreshIntervalMinutes: number;
  agyQuotaByProviderId: Record<string, AgyAccountQuota>;
  providerBalanceByProviderId: Record<string, ProviderBalanceInfo>;
  balanceAlertThresholds: BalanceAlertThresholds;
  refreshingQuotaIds: Record<string, boolean>;
  warmingUpIds: Record<string, boolean>;
  quotaLimits?: QuotaLimits;
  userSettings: UserSettings;

  activeProjectId: string | null;
  activeWindowId: string | null;
  splitSecondaryWindowId: string | null;
  masterWorkerLink: MasterWorkerLink | null;
  masterWorkerLinks: MasterWorkerLink[];
  activeView: ActiveView;
  settingsTab: SettingsTab;
  language: AppLanguage;
  searchQuery: string;
  sidebarCollapsed: boolean;

  init: () => Promise<() => void>;
  setActiveProject: (projectId: string) => void;
  setActiveWindow: (windowId: string) => void;
  setSplitSecondaryWindow: (windowId: string | null) => void;
  setActiveView: (view: ActiveView) => void;
  openNewWindow: (projectId?: string) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setLanguage: (lang: AppLanguage) => void;
  setSearchQuery: (q: string) => void;
  toggleSidebar: () => void;

  createProject: (input: { name: string; rootPath: string; branch?: string }) => Promise<void>;
  createWindow: (
    input: CreateWindowInput,
    options?: { activate?: boolean }
  ) => Promise<AliveWindow>;
  renameWindow: (windowId: string, title: string) => Promise<void>;
  archiveWindow: (windowId: string) => Promise<void>;
  closeWindow: (windowId: string) => Promise<void>;
  sendMessage: (
    windowId: string,
    content: string,
    options?: { model?: string; providerId?: string; thinkingLevel?: ThinkingLevel }
  ) => Promise<void>;
  dispatchPlan: (input: DispatchPlanInput) => Promise<void>;
  requestReview: (input: {
    planId: string;
    workerWindowId: string;
    reviewerWindowId: string;
    summary?: string;
  }) => Promise<void>;
  updateProviderConfig: (config: ProviderConfig) => Promise<void>;
  updateVoiceConfig: (config: VoiceInputConfig) => Promise<void>;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
  refreshAgyQuota: (providerId: string) => Promise<void>;
  refreshProviderBalance: (
    providerId: string,
    options?: { silentError?: boolean }
  ) => Promise<void>;
  refreshAllAgyQuotas: () => Promise<void>;
  warmupAgyProvider: (
    providerId: string
  ) => Promise<{ ok: boolean; warmedModels?: string[]; error?: string }>;
}

const DEFAULT_PROVIDER: ProviderConfig = {
  provider: 'anthropic',
  modelId: 'claude-3-7-sonnet-20250219',
  apiKey: ''
};

const DEFAULT_VOICE_CONFIG: VoiceInputConfig = {
  enabled: false,
  provider: 'siliconflow',
  endpoint: 'https://api.siliconflow.cn/v1/audio/transcriptions',
  modelId: 'FunAudioLLM/SenseVoiceSmall',
  apiKey: '',
  mode: 'click'
};

export const useArchpiStore = create<ArchpiState>((set, get) => ({
  initialized: false,
  initError: null,
  projects: [],
  windows: [],
  tasks: [],
  messagesByWindow: {},
  providerConfig: DEFAULT_PROVIDER,
  voiceConfig: DEFAULT_VOICE_CONFIG,
  savedProviders: [],
  activeProviderId: null,
  roleModels: DEFAULT_ROLE_MODELS,
  modelsDevCache: null,
  quotaAutoRefreshEnabled: true,
  quotaAutoRefreshIntervalMinutes: 15,
  agyQuotaByProviderId: {},
  providerBalanceByProviderId: {},
  balanceAlertThresholds: { low: 10, medium: 100 },
  refreshingQuotaIds: {},
  warmingUpIds: {},
  quotaLimits: undefined,
  userSettings: {},

  activeProjectId: null,
  activeWindowId: null,
  splitSecondaryWindowId: null,
  masterWorkerLink: null,
  masterWorkerLinks: [],
  activeView: 'board',
  settingsTab: 'general',
  language: 'zh',
  searchQuery: '',
  sidebarCollapsed: false,

  init: async () => {
    if (!window.archpi) {
      set({ initError: 'window.archpi preload bridge not found' });
      return () => {};
    }
    try {
      const snapshot: AppSnapshot = await window.archpi.getSnapshot();
      const serverSettings: UserSettings = snapshot.settings ?? {};
      const migratedPatch: Partial<UserSettings> = {};
      let effectiveProviderConfig = snapshot.providerConfig;
      let effectiveVoiceConfig = snapshot.voiceConfig ?? DEFAULT_VOICE_CONFIG;

      // One-time migration from legacy localStorage keys into ~/.archpi/
      try {
        if (!serverSettings.language) {
          const legacyLang = localStorage.getItem(LEGACY_STORAGE_KEYS.language);
          if (legacyLang === 'zh' || legacyLang === 'en') {
            migratedPatch.language = legacyLang;
          }
        }
        if (serverSettings.savedProviders === undefined) {
          const rawProviders = localStorage.getItem(LEGACY_STORAGE_KEYS.savedProviders);
          if (rawProviders) {
            const parsed = JSON.parse(rawProviders) as SavedProviderEntry[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              migratedPatch.savedProviders = parsed;
              const configs = parsed.map((p) => p.config).filter(Boolean);
              if (configs.length > 0) {
                await window.archpi.syncProviderConfigs(configs);
              }
            }
          }
        }
        if (serverSettings.activeProviderId === undefined) {
          const legacyActiveId = localStorage.getItem(LEGACY_STORAGE_KEYS.activeProviderId);
          if (legacyActiveId) {
            migratedPatch.activeProviderId = legacyActiveId;
          }
        }
        if (serverSettings.roleModels === undefined) {
          const rawRoleModels = localStorage.getItem(LEGACY_STORAGE_KEYS.roleModels);
          if (rawRoleModels) {
            migratedPatch.roleModels = normalizeRoleModels(
              JSON.parse(rawRoleModels) as Partial<RoleModelsMap>
            );
          }
        }
        if (serverSettings.modelsDevCache === undefined) {
          const parsedCache = parseModelsDevCache(
            localStorage.getItem(LEGACY_STORAGE_KEYS.modelsDevCache)
          );
          if (parsedCache) {
            migratedPatch.modelsDevCache = parsedCache;
          }
        }
        if (serverSettings.quotaLimits === undefined) {
          const rawQuota = localStorage.getItem(LEGACY_STORAGE_KEYS.quotaLimits);
          if (rawQuota) {
            const parsedQuota = JSON.parse(rawQuota) as Partial<QuotaLimits>;
            if (parsedQuota && typeof parsedQuota === 'object') {
              migratedPatch.quotaLimits = {
                limit5h:
                  typeof parsedQuota.limit5h === 'number' && parsedQuota.limit5h > 0
                    ? parsedQuota.limit5h
                    : 2_000_000,
                limit7d:
                  typeof parsedQuota.limit7d === 'number' && parsedQuota.limit7d > 0
                    ? parsedQuota.limit7d
                    : 15_000_000,
                resetAt: typeof parsedQuota.resetAt === 'number' ? parsedQuota.resetAt : undefined
              };
            }
          }
        }
        if (!snapshot.voiceConfig?.apiKey && !snapshot.voiceConfig?.enabled) {
          const rawVoice = localStorage.getItem(LEGACY_STORAGE_KEYS.voiceConfig);
          if (rawVoice) {
            const parsedVoice = JSON.parse(rawVoice) as Partial<VoiceInputConfig>;
            if (parsedVoice && typeof parsedVoice === 'object') {
              effectiveVoiceConfig = { ...DEFAULT_VOICE_CONFIG, ...parsedVoice };
              await window.archpi.updateVoiceConfig(effectiveVoiceConfig);
            }
          }
        }
        for (const key of Object.values(LEGACY_STORAGE_KEYS)) {
          localStorage.removeItem(key);
        }
      } catch {
        // ignore storage access/parse errors during legacy cleanup
      }

      const persistedSettings =
        Object.keys(migratedPatch).length > 0
          ? await window.archpi.updateSettings(migratedPatch)
          : serverSettings;

      const savedProviders = persistedSettings.savedProviders ?? [];
      const activeProviderId = persistedSettings.activeProviderId ?? savedProviders[0]?.id ?? null;

      if (!effectiveProviderConfig.apiKey && savedProviders.length > 0) {
        const activeEntry =
          savedProviders.find((p) => p.id === activeProviderId) ?? savedProviders[0];
        if (activeEntry?.config) {
          effectiveProviderConfig = activeEntry.config;
          await window.archpi.updateProviderConfig(activeEntry.config);
        }
      } else if (savedProviders.length > 0) {
        const configs = savedProviders.map((p) => p.config).filter(Boolean);
        if (configs.length > 0) {
          await window.archpi.syncProviderConfigs(configs);
        }
      }

      const firstProject = snapshot.projects[0]?.id ?? null;
      const firstWindow =
        snapshot.windows.find((w) => w.projectId === firstProject && !w.archived)?.id ??
        snapshot.windows.find((w) => !w.archived)?.id ??
        null;

      const windowStatusById = new Map(snapshot.windows.map((w) => [w.id, w.status]));
      const restoredLinks = pruneMasterWorkerLinks(
        loadPersistedMasterWorkerLinks(),
        snapshot.windows
      ).map((link) => {
        const masterStatus = windowStatusById.get(link.masterWindowId);
        const workerStatus = windowStatusById.get(link.workerWindowId);
        const stillWorking = masterStatus === 'working' || workerStatus === 'working';
        return link.locked && !stillWorking ? { ...link, locked: false } : link;
      });
      persistMasterWorkerLinks(restoredLinks);
      const initialLink = findLinkForWindow(restoredLinks, firstWindow);

      const initialStartupView: ActiveView =
        persistedSettings.defaultStartupView === 'workspace' && (initialLink || firstWindow)
          ? 'workspace'
          : 'board';

      set({
        initialized: true,
        projects: snapshot.projects,
        windows: snapshot.windows,
        tasks: snapshot.tasks,
        messagesByWindow: snapshot.messagesByWindow,
        providerConfig: effectiveProviderConfig,
        voiceConfig: effectiveVoiceConfig,
        language: persistedSettings.language ?? 'zh',
        userSettings: persistedSettings,
        savedProviders,
        activeProviderId,
        roleModels: normalizeRoleModels(persistedSettings.roleModels),
        modelsDevCache: persistedSettings.modelsDevCache ?? null,
        quotaLimits: persistedSettings.quotaLimits,
        quotaAutoRefreshEnabled: persistedSettings.quotaAutoRefreshEnabled ?? true,
        quotaAutoRefreshIntervalMinutes:
          persistedSettings.quotaAutoRefreshIntervalMinutes ?? 15,
        agyQuotaByProviderId: persistedSettings.agyQuotaByProviderId ?? {},
        providerBalanceByProviderId: persistedSettings.providerBalanceByProviderId ?? {},
        balanceAlertThresholds: persistedSettings.balanceAlertThresholds ?? {
          low: 10,
          medium: 100
        },
        activeView: initialStartupView,
        activeProjectId: firstProject,
        activeWindowId: initialLink ? initialLink.masterWindowId : firstWindow,
        splitSecondaryWindowId: initialLink ? initialLink.workerWindowId : null,
        masterWorkerLink: initialLink,
        masterWorkerLinks: restoredLinks
      });

    const unsub = window.archpi.onEvent((event: ArchpiEvent) => {
      switch (event.type) {
        case 'snapshot': {
          const nextSettings = event.snapshot.settings ?? {};
          set((state) => ({
            projects: event.snapshot.projects,
            windows: event.snapshot.windows,
            tasks: event.snapshot.tasks,
            messagesByWindow: event.snapshot.messagesByWindow,
            providerConfig: event.snapshot.providerConfig,
            voiceConfig: event.snapshot.voiceConfig ?? DEFAULT_VOICE_CONFIG,
            language: nextSettings.language ?? state.language,
            userSettings: { ...state.userSettings, ...nextSettings },
            savedProviders: nextSettings.savedProviders ?? state.savedProviders,
            activeProviderId:
              nextSettings.activeProviderId !== undefined
                ? nextSettings.activeProviderId
                : state.activeProviderId,
            roleModels: nextSettings.roleModels
              ? normalizeRoleModels(nextSettings.roleModels)
              : state.roleModels,
            modelsDevCache:
              nextSettings.modelsDevCache !== undefined
                ? nextSettings.modelsDevCache
                : state.modelsDevCache,
            quotaLimits:
              nextSettings.quotaLimits !== undefined
                ? nextSettings.quotaLimits
                : state.quotaLimits,
            quotaAutoRefreshEnabled:
              nextSettings.quotaAutoRefreshEnabled !== undefined
                ? nextSettings.quotaAutoRefreshEnabled
                : state.quotaAutoRefreshEnabled,
            quotaAutoRefreshIntervalMinutes:
              nextSettings.quotaAutoRefreshIntervalMinutes !== undefined
                ? nextSettings.quotaAutoRefreshIntervalMinutes
                : state.quotaAutoRefreshIntervalMinutes,
            agyQuotaByProviderId:
              nextSettings.agyQuotaByProviderId !== undefined
                ? nextSettings.agyQuotaByProviderId
                : state.agyQuotaByProviderId,
            providerBalanceByProviderId:
              nextSettings.providerBalanceByProviderId !== undefined
                ? nextSettings.providerBalanceByProviderId
                : state.providerBalanceByProviderId,
            balanceAlertThresholds:
              nextSettings.balanceAlertThresholds !== undefined
                ? nextSettings.balanceAlertThresholds
                : state.balanceAlertThresholds
          }));
          break;
        }
        case 'window_updated': {
          set((state) => {
            const exists = state.windows.some((w) => w.id === event.window.id);
            return {
              windows: exists
                ? state.windows.map((w) => (w.id === event.window.id ? event.window : w))
                : [...state.windows, event.window]
            };
          });
          break;
        }
        case 'message_added': {
          set((state) => {
            const prev = state.messagesByWindow[event.windowId] ?? [];
            if (prev.some((m) => m.id === event.message.id)) {
              return state;
            }
            return {
              messagesByWindow: {
                ...state.messagesByWindow,
                [event.windowId]: [...prev, event.message]
              }
            };
          });
          break;
        }
        case 'message_delta': {
          set((state) => {
            const prev = state.messagesByWindow[event.windowId] ?? [];
            return {
              messagesByWindow: {
                ...state.messagesByWindow,
                [event.windowId]: prev.map((m) =>
                  m.id === event.messageId ? { ...m, content: m.content + event.delta } : m
                )
              }
            };
          });
          break;
        }
        case 'message_activity': {
          set((state) => {
            const prev = state.messagesByWindow[event.windowId] ?? [];
            return {
              messagesByWindow: {
                ...state.messagesByWindow,
                [event.windowId]: prev.map((m) => {
                  if (m.id !== event.messageId) return m;
                  const existing = m.activitySteps ?? [];
                  const idx = existing.findIndex((s) => s.id === event.step.id);
                  const nextSteps =
                    idx === -1
                      ? [...existing, event.step]
                      : existing.map((s, i) => (i === idx ? event.step : s));
                  return { ...m, activitySteps: nextSteps };
                })
              }
            };
          });
          break;
        }
        case 'message_done': {
          set((state) => {
            const prev = state.messagesByWindow[event.windowId] ?? [];
            return {
              messagesByWindow: {
                ...state.messagesByWindow,
                [event.windowId]: prev.map((m) =>
                  m.id === event.messageId ? event.message : m
                )
              }
            };
          });
          break;
        }
        case 'task_updated': {
          set((state) => {
            const exists = state.tasks.some((t) => t.id === event.task.id);
            return {
              tasks: exists
                ? state.tasks.map((t) => (t.id === event.task.id ? event.task : t))
                : [event.task, ...state.tasks]
            };
          });
          break;
        }
        case 'plan_updated': {
          set((state) => {
            const nextMessagesByWindow: Record<string, ChatMessage[]> = {};
            let changed = false;
            for (const [winId, msgs] of Object.entries(state.messagesByWindow)) {
              const updatedMsgs = msgs.map((m) => {
                if (m.plan?.id === event.plan.id) {
                  changed = true;
                  return { ...m, plan: event.plan };
                }
                return m;
              });
              nextMessagesByWindow[winId] = updatedMsgs;
            }

            const patch: Partial<ArchpiState> = changed
              ? { messagesByWindow: nextMessagesByWindow }
              : {};

            if (
              event.plan.status === 'dispatched' &&
              event.plan.targetWorkerId &&
              event.plan.sourceOrchestratorId !== event.plan.targetWorkerId
            ) {
              const nextLink: MasterWorkerLink = {
                masterWindowId: event.plan.sourceOrchestratorId,
                workerWindowId: event.plan.targetWorkerId,
                planId: event.plan.id,
                locked: true
              };
              const nextLinks = upsertMasterWorkerLink(state.masterWorkerLinks, nextLink);
              persistMasterWorkerLinks(nextLinks);
              patch.masterWorkerLink = nextLink;
              patch.masterWorkerLinks = nextLinks;
              patch.activeProjectId = event.plan.projectId;
              patch.activeWindowId = event.plan.sourceOrchestratorId;
              patch.splitSecondaryWindowId = event.plan.targetWorkerId;
              patch.activeView = 'workspace';
            } else if (
              event.plan.status === 'completed' ||
              event.plan.status === 'approved' ||
              event.plan.status === 'changes_requested'
            ) {
              const hasLockedMatch = state.masterWorkerLinks.some(
                (l) => l.planId === event.plan.id && l.locked
              );
              if (hasLockedMatch) {
                const nextLinks = state.masterWorkerLinks.map((l) =>
                  l.planId === event.plan.id ? { ...l, locked: false } : l
                );
                persistMasterWorkerLinks(nextLinks);
                patch.masterWorkerLinks = nextLinks;
              }
              if (state.masterWorkerLink?.planId === event.plan.id) {
                patch.masterWorkerLink = {
                  ...state.masterWorkerLink,
                  locked: false
                };
              }
            }

            return Object.keys(patch).length > 0 ? patch : state;
          });
          break;
        }
      }
    });

    return unsub;
    } catch (err) {
      set({ initError: err instanceof Error ? err.message : String(err) });
      return () => {};
    }
  },

  setActiveProject: (projectId) => {
    const { windows, masterWorkerLink } = get();
    if (masterWorkerLink?.locked) return;
    const projectWindow = windows.find((w) => w.projectId === projectId && !w.archived);
    set({
      activeProjectId: projectId,
      activeWindowId: projectWindow?.id ?? null,
      splitSecondaryWindowId: null,
      masterWorkerLink: null,
      activeView: 'board'
    });
  },

  setActiveWindow: (windowId) => {
    const { windows, masterWorkerLink, masterWorkerLinks, activeProjectId } = get();
    if (masterWorkerLink?.locked) {
      set({
        activeWindowId: masterWorkerLink.masterWindowId,
        splitSecondaryWindowId: masterWorkerLink.workerWindowId,
        activeView: 'workspace'
      });
      return;
    }
    const win = windows.find((w) => w.id === windowId);
    const activeIds = new Set(windows.filter((w) => !w.archived).map((w) => w.id));
    const matchedLink = findLinkForWindow(masterWorkerLinks, windowId);
    const canRestoreLink =
      matchedLink &&
      activeIds.has(matchedLink.masterWindowId) &&
      activeIds.has(matchedLink.workerWindowId);
    if (canRestoreLink && matchedLink) {
      set({
        activeWindowId: matchedLink.masterWindowId,
        splitSecondaryWindowId: matchedLink.workerWindowId,
        masterWorkerLink: matchedLink,
        activeProjectId: win?.projectId ?? activeProjectId,
        activeView: 'workspace'
      });
      return;
    }
    set({
      activeWindowId: windowId,
      activeProjectId: win?.projectId ?? activeProjectId,
      activeView: 'workspace',
      masterWorkerLink: null,
      splitSecondaryWindowId: null
    });
  },

  setSplitSecondaryWindow: (windowId) => {
    const { masterWorkerLink, masterWorkerLinks } = get();
    if (masterWorkerLink?.locked) return;
    if (windowId === null && masterWorkerLink) {
      const nextLinks = masterWorkerLinks.filter(
        (l) =>
          !(
            l.masterWindowId === masterWorkerLink.masterWindowId &&
            l.workerWindowId === masterWorkerLink.workerWindowId
          )
      );
      persistMasterWorkerLinks(nextLinks);
      set({
        splitSecondaryWindowId: null,
        masterWorkerLink: null,
        masterWorkerLinks: nextLinks
      });
      return;
    }
    set({
      splitSecondaryWindowId: windowId,
      ...(windowId === null ? { masterWorkerLink: null } : {})
    });
  },
  setActiveView: (view) => set({ activeView: view }),
  openNewWindow: (projectId) =>
    set((s) => {
      if (s.masterWorkerLink?.locked) return s;
      return {
        activeProjectId: projectId ?? s.activeProjectId,
        activeView: 'new_window'
      };
    }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  setLanguage: (lang) => {
    set({ language: lang });
    void window.archpi?.updateSettings({ language: lang });
  },
  setSearchQuery: (q) => set({ searchQuery: q }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  createProject: async (input) => {
    const project = await window.archpi.createProject(input);
    set((s) => ({
      projects: [...s.projects, project],
      activeProjectId: project.id
    }));
  },

  createWindow: async (input, options) => {
    const win = await window.archpi.createWindow(input);
    const shouldActivate = options?.activate ?? true;
    set((s) => ({
      windows: [...s.windows.filter((w) => w.id !== win.id), win],
      ...(shouldActivate
        ? {
            activeWindowId: win.id,
            activeProjectId: win.projectId,
            activeView: 'workspace' as const
          }
        : {})
    }));
    return win;
  },

  renameWindow: async (windowId, title) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    const updated = await window.archpi.renameWindow(windowId, nextTitle);
    if (!updated) return;
    set((s) => ({
      windows: s.windows.map((w) => (w.id === windowId ? updated : w))
    }));
  },

  archiveWindow: async (windowId) => {
    const link = get().masterWorkerLink;
    if (
      link?.locked &&
      (windowId === link.masterWindowId || windowId === link.workerWindowId)
    ) {
      return;
    }
    const updated = await window.archpi.archiveWindow(windowId, true);
    if (!updated) return;
    set((s) => {
      const nextWindows = s.windows.map((w) => (w.id === windowId ? updated : w));
      const activePool = nextWindows.filter((w) => !w.archived);
      const nextActive =
        s.activeWindowId === windowId
          ? activePool.find((w) => w.projectId === s.activeProjectId)?.id ??
            activePool[0]?.id ??
            null
          : s.activeWindowId;
      const clearLink =
        s.masterWorkerLink &&
        (s.masterWorkerLink.masterWindowId === windowId ||
          s.masterWorkerLink.workerWindowId === windowId);
      const nextLinks = s.masterWorkerLinks.filter(
        (l) => l.masterWindowId !== windowId && l.workerWindowId !== windowId
      );
      if (nextLinks.length !== s.masterWorkerLinks.length) {
        persistMasterWorkerLinks(nextLinks);
      }
      return {
        windows: nextWindows,
        activeWindowId: nextActive,
        splitSecondaryWindowId:
          s.splitSecondaryWindowId === windowId ? null : s.splitSecondaryWindowId,
        masterWorkerLink: clearLink ? null : s.masterWorkerLink,
        masterWorkerLinks: nextLinks
      };
    });
  },

  closeWindow: async (windowId) => {
    const link = get().masterWorkerLink;
    if (
      link?.locked &&
      (windowId === link.masterWindowId || windowId === link.workerWindowId)
    ) {
      return;
    }
    await window.archpi.closeWindow(windowId);
    set((s) => {
      const remaining = s.windows.filter((w) => w.id !== windowId);
      const activePool = remaining.filter((w) => !w.archived);
      const nextActive =
        s.activeWindowId === windowId
          ? activePool.find((w) => w.projectId === s.activeProjectId)?.id ??
            activePool[0]?.id ??
            null
          : s.activeWindowId;
      const { [windowId]: _removed, ...restMessages } = s.messagesByWindow;
      const clearLink =
        s.masterWorkerLink &&
        (s.masterWorkerLink.masterWindowId === windowId ||
          s.masterWorkerLink.workerWindowId === windowId);
      const nextLinks = s.masterWorkerLinks.filter(
        (l) => l.masterWindowId !== windowId && l.workerWindowId !== windowId
      );
      if (nextLinks.length !== s.masterWorkerLinks.length) {
        persistMasterWorkerLinks(nextLinks);
      }
      return {
        windows: remaining,
        messagesByWindow: restMessages,
        activeWindowId: nextActive,
        splitSecondaryWindowId:
          s.splitSecondaryWindowId === windowId ? null : s.splitSecondaryWindowId,
        masterWorkerLink: clearLink ? null : s.masterWorkerLink,
        masterWorkerLinks: nextLinks
      };
    });
  },

  sendMessage: async (windowId, content, options) => {
    await window.archpi.sendMessage(windowId, content, options);
  },

  dispatchPlan: async (input) => {
    await window.archpi.dispatchPlan(input);
  },

  requestReview: async (input) => {
    await window.archpi.requestReview(input);
  },

  updateProviderConfig: async (config) => {
    await window.archpi.updateProviderConfig(config);
    set({ providerConfig: config });
  },

  updateVoiceConfig: async (config) => {
    await window.archpi.updateVoiceConfig(config);
    set({ voiceConfig: config });
  },

  updateSettings: async (patch) => {
    set((state) => ({
      userSettings: { ...state.userSettings, ...patch },
      ...(patch.language !== undefined ? { language: patch.language } : {}),
      ...(patch.savedProviders !== undefined ? { savedProviders: patch.savedProviders } : {}),
      ...(patch.activeProviderId !== undefined ? { activeProviderId: patch.activeProviderId } : {}),
      ...(patch.roleModels !== undefined
        ? { roleModels: normalizeRoleModels(patch.roleModels) }
        : {}),
      ...(patch.modelsDevCache !== undefined ? { modelsDevCache: patch.modelsDevCache } : {}),
      ...(patch.quotaLimits !== undefined ? { quotaLimits: patch.quotaLimits } : {}),
      ...(patch.quotaAutoRefreshEnabled !== undefined
        ? { quotaAutoRefreshEnabled: patch.quotaAutoRefreshEnabled }
        : {}),
      ...(patch.quotaAutoRefreshIntervalMinutes !== undefined
        ? { quotaAutoRefreshIntervalMinutes: patch.quotaAutoRefreshIntervalMinutes }
        : {}),
      ...(patch.agyQuotaByProviderId !== undefined
        ? { agyQuotaByProviderId: patch.agyQuotaByProviderId }
        : {}),
      ...(patch.providerBalanceByProviderId !== undefined
        ? { providerBalanceByProviderId: patch.providerBalanceByProviderId }
        : {}),
      ...(patch.balanceAlertThresholds !== undefined
        ? { balanceAlertThresholds: patch.balanceAlertThresholds }
        : {})
    }));
    const updated = await window.archpi.updateSettings(patch);
    set((state) => ({
      userSettings: updated,
      language: updated.language ?? state.language,
      savedProviders: updated.savedProviders ?? state.savedProviders,
      activeProviderId:
        updated.activeProviderId !== undefined ? updated.activeProviderId : state.activeProviderId,
      roleModels: updated.roleModels ? normalizeRoleModels(updated.roleModels) : state.roleModels,
      modelsDevCache:
        updated.modelsDevCache !== undefined ? updated.modelsDevCache : state.modelsDevCache,
      quotaLimits: updated.quotaLimits !== undefined ? updated.quotaLimits : state.quotaLimits,
      quotaAutoRefreshEnabled:
        updated.quotaAutoRefreshEnabled !== undefined
          ? updated.quotaAutoRefreshEnabled
          : state.quotaAutoRefreshEnabled,
      quotaAutoRefreshIntervalMinutes:
        updated.quotaAutoRefreshIntervalMinutes !== undefined
          ? updated.quotaAutoRefreshIntervalMinutes
          : state.quotaAutoRefreshIntervalMinutes,
      agyQuotaByProviderId:
        updated.agyQuotaByProviderId !== undefined
          ? updated.agyQuotaByProviderId
          : state.agyQuotaByProviderId,
      providerBalanceByProviderId:
        updated.providerBalanceByProviderId !== undefined
          ? updated.providerBalanceByProviderId
          : state.providerBalanceByProviderId,
      balanceAlertThresholds:
        updated.balanceAlertThresholds !== undefined
          ? updated.balanceAlertThresholds
          : state.balanceAlertThresholds
    }));
  },

  refreshAgyQuota: async (providerId) => {
    const entry = get().savedProviders.find((p) => p.id === providerId);
    if (!entry || entry.config.provider !== 'google') return;
    if (get().refreshingQuotaIds[providerId]) return;

    set((state) => ({
      refreshingQuotaIds: { ...state.refreshingQuotaIds, [providerId]: true }
    }));

    try {
      if (typeof window.archpi?.fetchAgyQuota !== 'function') {
        throw new Error('请重启应用以加载新版配额接口');
      }
      const res = await window.archpi.fetchAgyQuota(entry.config.antigravityAuth?.refreshToken);
      const prev = get().agyQuotaByProviderId;
      const nextQuota: AgyAccountQuota =
        res.ok && res.quota
          ? res.quota
          : {
              ...(prev[providerId] ?? { fetchedAt: Date.now(), groups: [] }),
              fetchedAt: Date.now(),
              error: res.error || '获取配额失败'
            };
      const merged = { ...get().agyQuotaByProviderId, [providerId]: nextQuota };
      await get().updateSettings({ agyQuotaByProviderId: merged });
    } catch (err) {
      const prev = get().agyQuotaByProviderId;
      const message = err instanceof Error ? err.message : String(err);
      const merged = {
        ...prev,
        [providerId]: {
          ...(prev[providerId] ?? { fetchedAt: Date.now(), groups: [] }),
          fetchedAt: Date.now(),
          error: message
        }
      };
      await get().updateSettings({ agyQuotaByProviderId: merged }).catch(() => {});
    } finally {
      set((state) => ({
        refreshingQuotaIds: { ...state.refreshingQuotaIds, [providerId]: false }
      }));
    }
  },

  refreshProviderBalance: async (providerId, options) => {
    const entry = get().savedProviders.find((p) => p.id === providerId);
    if (!entry || entry.config.provider === 'google') return;
    const baseUrl = entry.config.baseUrl?.trim() || '';
    const apiKey =
      entry.config.apiKey?.trim() ||
      entry.config.apiKeys?.find((k) => k.key?.trim())?.key?.trim() ||
      '';
    if (!baseUrl || !apiKey) return;
    if (get().refreshingQuotaIds[providerId]) return;

    set((state) => ({
      refreshingQuotaIds: { ...state.refreshingQuotaIds, [providerId]: true }
    }));

    try {
      if (typeof window.archpi?.fetchProviderBalance !== 'function') {
        throw new Error('请重启应用以加载新版余额接口');
      }
      const res = await window.archpi.fetchProviderBalance({ baseUrl, apiKey });
      const prev = get().providerBalanceByProviderId;
      if (res.ok && res.info) {
        const merged = { ...prev, [providerId]: res.info };
        await get().updateSettings({ providerBalanceByProviderId: merged });
      } else if (!options?.silentError || prev[providerId]?.balance !== undefined) {
        const nextInfo: ProviderBalanceInfo = {
          ...(prev[providerId] ?? { fetchedAt: Date.now() }),
          fetchedAt: Date.now(),
          error: res.error || '获取余额失败'
        };
        const merged = { ...prev, [providerId]: nextInfo };
        await get().updateSettings({ providerBalanceByProviderId: merged });
      }
    } catch (err) {
      const prev = get().providerBalanceByProviderId;
      if (!options?.silentError || prev[providerId]?.balance !== undefined) {
        const message = err instanceof Error ? err.message : String(err);
        const merged = {
          ...prev,
          [providerId]: {
            ...(prev[providerId] ?? { fetchedAt: Date.now() }),
            fetchedAt: Date.now(),
            error: message
          }
        };
        await get().updateSettings({ providerBalanceByProviderId: merged }).catch(() => {});
      }
    } finally {
      set((state) => ({
        refreshingQuotaIds: { ...state.refreshingQuotaIds, [providerId]: false }
      }));
    }
  },

  refreshAllAgyQuotas: async () => {
    const providers = get().savedProviders;
    const agyProviders = providers.filter((p) => p.config.provider === 'google');
    const balanceProviders = providers.filter((p) => {
      if (p.config.provider === 'google') return false;
      const hasUrl = Boolean(p.config.baseUrl?.trim());
      const hasKey = Boolean(
        p.config.apiKey?.trim() || p.config.apiKeys?.some((k) => k.key?.trim())
      );
      return hasUrl && hasKey;
    });
    await Promise.allSettled([
      ...agyProviders.map((p) => get().refreshAgyQuota(p.id)),
      ...balanceProviders.map((p) => get().refreshProviderBalance(p.id, { silentError: true }))
    ]);
  },

  warmupAgyProvider: async (providerId) => {
    const entry = get().savedProviders.find((p) => p.id === providerId);
    if (!entry || entry.config.provider !== 'google') {
      return { ok: false, error: '仅支持 Antigravity 账号预热' };
    }
    if (get().warmingUpIds[providerId]) {
      return { ok: false, error: '正在预热中' };
    }

    set((state) => ({
      warmingUpIds: { ...state.warmingUpIds, [providerId]: true }
    }));

    try {
      if (typeof window.archpi?.warmupAgyAccount !== 'function') {
        throw new Error('请重启应用以加载新版预热接口');
      }
      const cached = get().agyQuotaByProviderId[providerId];
      const explicitModels = cached?.warmupTargets
        ? [
            cached.warmupTargets.gemini,
            cached.warmupTargets.claude,
            cached.warmupTargets.argon
          ].filter((m): m is string => Boolean(m))
        : undefined;

      const res = await window.archpi.warmupAgyAccount(
        entry.config.antigravityAuth?.refreshToken,
        explicitModels && explicitModels.length > 0 ? explicitModels : undefined
      );

      if (res.ok) {
        await get().refreshAgyQuota(providerId);
      } else {
        const prev = get().agyQuotaByProviderId;
        await get()
          .updateSettings({
            agyQuotaByProviderId: {
              ...prev,
              [providerId]: {
                ...(prev[providerId] ?? { fetchedAt: Date.now(), groups: [] }),
                fetchedAt: Date.now(),
                error: res.error || '预热失败'
              }
            }
          })
          .catch(() => {});
      }
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const prev = get().agyQuotaByProviderId;
      await get()
        .updateSettings({
          agyQuotaByProviderId: {
            ...prev,
            [providerId]: {
              ...(prev[providerId] ?? { fetchedAt: Date.now(), groups: [] }),
              fetchedAt: Date.now(),
              error: message
            }
          }
        })
        .catch(() => {});
      return { ok: false, error: message };
    } finally {
      set((state) => ({
        warmingUpIds: { ...state.warmingUpIds, [providerId]: false }
      }));
    }
  }
}));
