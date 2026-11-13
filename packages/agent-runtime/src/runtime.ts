import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { Agent } from '@mariozechner/pi-agent-core';
import {
  completeSimple,
  getModel,
  type AssistantMessage,
  type Message as PiMessage,
  type Model,
  type UserMessage
} from '@mariozechner/pi-ai';
import {
  clampWindowTitle,
  isGeminiModel,
  measureTitleUnits,
  type AliveWindow,
  type AppSnapshot,
  ChatMessage,
  CreateWindowInput,
  DispatchPlanInput,
  ArchpiEvent,
  PlanSpec,
  ProjectInfo,
  ProviderConfig,
  ReviewVerdict,
  TaskCard,
  ThinkingLevel as ArchpiThinkingLevel,
  ToolActivityStep,
  UserSettings,
  VoiceInputConfig,
  WindowRole
} from '@archpi/shared';
import {
  createOrchestratorTools,
  createWorkerTools
} from './tools.js';
import { GeminiAgyAdapter, ProviderRegistry } from './providers/index.js';

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function countTextLines(text: unknown): number {
  if (typeof text !== 'string' || text.length === 0) return 0;
  return text.split(/\r?\n/).length;
}

function buildToolActivityStep(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown> | undefined
): ToolActivityStep {
  const safeArgs = args && typeof args === 'object' ? args : {};
  const startedAt = Date.now();
  const pathArg = typeof safeArgs.path === 'string' ? safeArgs.path : '';
  const fileName = pathArg ? basename(pathArg.replace(/\\/g, '/')) : '';

  switch (toolName) {
    case 'read_file':
      return {
        id: toolCallId,
        toolName,
        category: 'read',
        verb: 'Analyzed',
        target: fileName || pathArg || 'file',
        status: 'running',
        startedAt
      };
    case 'list_dir':
      return {
        id: toolCallId,
        toolName,
        category: 'read',
        verb: 'Listed',
        target: pathArg || '.',
        status: 'running',
        startedAt
      };
    case 'grep_search': {
      const query = typeof safeArgs.query === 'string' ? safeArgs.query : '';
      return {
        id: toolCallId,
        toolName,
        category: 'search',
        verb: 'Searched',
        target: query || 'pattern',
        detail: pathArg && pathArg !== '.' ? `in ${pathArg}` : undefined,
        status: 'running',
        startedAt
      };
    }
    case 'bash': {
      const cmd = typeof safeArgs.command === 'string' ? safeArgs.command.trim() : '';
      const compactCmd = cmd.replace(/\s+/g, ' ');
      return {
        id: toolCallId,
        toolName,
        category: 'run',
        verb: 'Ran',
        target: compactCmd.length > 72 ? `${compactCmd.slice(0, 72)}...` : compactCmd || 'command',
        status: 'running',
        startedAt
      };
    }
    case 'edit_file':
      return {
        id: toolCallId,
        toolName,
        category: 'edit',
        verb: 'Edited',
        target: fileName || pathArg || 'file',
        addedLines: countTextLines(safeArgs.replacement),
        removedLines: countTextLines(safeArgs.target),
        status: 'running',
        startedAt
      };
    case 'write_file':
      return {
        id: toolCallId,
        toolName,
        category: 'edit',
        verb: 'Wrote',
        target: fileName || pathArg || 'file',
        addedLines: countTextLines(safeArgs.content),
        status: 'running',
        startedAt
      };
    case 'create_plan':
      return {
        id: toolCallId,
        toolName,
        category: 'plan',
        verb: 'Planned',
        target: typeof safeArgs.title === 'string' ? safeArgs.title : 'execution plan',
        status: 'running',
        startedAt
      };
    case 'dispatch_plan':
      return {
        id: toolCallId,
        toolName,
        category: 'plan',
        verb: 'Dispatched',
        target: typeof safeArgs.targetWorkerId === 'string' ? safeArgs.targetWorkerId : 'worker',
        status: 'running',
        startedAt
      };
    case 'create_worker':
      return {
        id: toolCallId,
        toolName,
        category: 'plan',
        verb: 'Spawned',
        target: typeof safeArgs.title === 'string' ? safeArgs.title : 'worker',
        status: 'running',
        startedAt
      };
    case 'update_plan_step':
      return {
        id: toolCallId,
        toolName,
        category: 'plan',
        verb: 'Updated',
        target: typeof safeArgs.stepId === 'string' ? safeArgs.stepId : 'plan step',
        status: 'running',
        startedAt
      };
    default:
      return {
        id: toolCallId,
        toolName,
        category: 'other',
        verb: 'Executed',
        target: toolName,
        status: 'running',
        startedAt
      };
  }
}

const IMPLICIT_TITLE_INSTRUCTION =
  'At the very end of your final response, append a single line `<archpi-title>TITLE</archpi-title>` summarizing the current task or topic (12-24 display units: 6-12 Chinese characters or 12-24 ASCII characters; no quotes or trailing punctuation). Only change it when the topic or phase meaningfully progresses; otherwise keep it consistent with the user language.';

function normalizeAutoTitle(raw: string): string {
  const cleaned = raw
    .replace(/<archpi-title>/gi, '')
    .replace(/<\/archpi-title>/gi, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(
      /^[`"'“”‘’「」『』【】\[\]()（）*\s#-]+|[`"'“”‘’「」『』【】\[\]()（）*。，,！!？?：:;\s-]+$/g,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();
  return clampWindowTitle(cleaned);
}

function extractAndStripImplicitTitle(raw: string): { content: string; title?: string } {
  let latestTitle: string | undefined;
  const stripped = raw
    .replace(
      /(```[\s\S]*?```|`[^`\n]*`|<think>[\s\S]*?<\/think>)|(<archpi-title>\s*([\s\S]*?)\s*<\/archpi-title>)/gi,
      (_full, preserved, _tag, inner) => {
        if (preserved) return preserved;
        const candidate = normalizeAutoTitle(String(inner ?? ''));
        if (measureTitleUnits(candidate) >= 4) {
          latestTitle = candidate;
        }
        return '';
      }
    )
    .trimEnd();

  return {
    content: stripped,
    title: latestTitle
  };
}

let sseFetchPatched = false;

/**
 * Normalize SSE streams from relays that omit blank lines between consecutive `data:` events.
 * Without an empty line separator, the OpenAI SDK concatenates multiple JSON payloads into one
 * event and throws `Unexpected non-whitespace character after JSON`.
 */
function installSseFetchNormalizer(): void {
  if (sseFetchPatched || typeof globalThis.fetch !== 'function') return;
  sseFetchPatched = true;
  const origFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await origFetch(input, init);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('text/event-stream') || !res.body) {
      return res;
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = '';
    let prevWasData = false;

    const normalized = res.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          let out = '';
          for (const rawLine of lines) {
            const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
            if (line.startsWith('data:')) {
              if (prevWasData) out += '\n';
              prevWasData = true;
            } else if (line === '') {
              prevWasData = false;
            } else {
              prevWasData = false;
            }
            out += `${line}\n`;
          }
          if (out) controller.enqueue(encoder.encode(out));
        },
        flush(controller) {
          const rest = buffer + decoder.decode();
          if (rest) {
            const line = rest.endsWith('\r') ? rest.slice(0, -1) : rest;
            const prefix = line.startsWith('data:') && prevWasData ? '\n' : '';
            controller.enqueue(encoder.encode(`${prefix}${line}\n\n`));
          }
        }
      })
    );

    return new Response(normalized, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers
    });
  };
}

export interface ArchpiRuntimeOptions {
  defaultProjectPath: string;
  resourcesDir?: string;
}

interface PersistedStateFile {
  version: 1;
  projects: ProjectInfo[];
  windows: AliveWindow[];
  tasks: TaskCard[];
  agyConversations: Record<string, string>;
}

interface PersistedSettingsFile extends UserSettings {
  providerConfig?: ProviderConfig;
  providerConfigs?: ProviderConfig[];
  voiceConfig?: VoiceInputConfig;
}

export class ArchpiRuntime {
  private emitter = new EventEmitter();
  private readonly archpiHome = join(homedir(), '.archpi');
  private readonly stateFile = join(this.archpiHome, 'state.json');
  private readonly settingsFile = join(this.archpiHome, 'settings.json');
  private readonly messagesDir = join(this.archpiHome, 'messages');
  private readonly plansDir = join(this.archpiHome, 'plans');
  private writeQueues = new Map<string, Promise<void>>();
  private projects: ProjectInfo[] = [];
  private windows = new Map<string, AliveWindow>();
  private agents = new Map<string, Agent>();
  private agyConversations = new Map<string, string>();
  private titleGenerationSeq = new Map<string, number>();
  private providerRegistry: ProviderRegistry;
  private plans = new Map<string, PlanSpec>();
  private tasks = new Map<string, TaskCard>();
  private messagesByWindow = new Map<string, ChatMessage[]>();
  private userSettings: UserSettings = {};
  private providerConfig: ProviderConfig = {
    provider: 'anthropic',
    modelId: 'claude-3-7-sonnet-20250219',
    apiKey: process.env.ANTHROPIC_API_KEY || ''
  };
  private providerConfigs: ProviderConfig[] = [];
  private voiceConfig: VoiceInputConfig = {
    enabled: false,
    provider: 'siliconflow',
    endpoint: 'https://api.siliconflow.cn/v1/audio/transcriptions',
    modelId: 'FunAudioLLM/SenseVoiceSmall',
    apiKey: '',
    mode: 'click'
  };

  constructor(options: ArchpiRuntimeOptions) {
    installSseFetchNormalizer();
    this.providerRegistry = new ProviderRegistry().register(
      new GeminiAgyAdapter({ resourcesDir: options.resourcesDir ?? '' })
    );
    this.loadAllPersisted(options.defaultProjectPath);
  }

  private enqueueWrite(key: string, fn: () => Promise<void>): void {
    const prev = this.writeQueues.get(key) ?? Promise.resolve();
    const next = prev
      .then(fn)
      .catch((err) => {
        console.error(`[archpi/runtime] persist failed (${key}):`, err);
      });
    this.writeQueues.set(key, next);
  }

  private persistState(): void {
    const payload: PersistedStateFile = {
      version: 1,
      projects: this.projects,
      windows: Array.from(this.windows.values()),
      tasks: Array.from(this.tasks.values()),
      agyConversations: Object.fromEntries(this.agyConversations.entries())
    };
    this.enqueueWrite('state', async () => {
      await mkdir(this.archpiHome, { recursive: true });
      await writeFile(this.stateFile, JSON.stringify(payload, null, 2), 'utf8');
    });
  }

  private persistSettings(): void {
    const payload: PersistedSettingsFile = {
      ...this.userSettings,
      providerConfig: this.providerConfig,
      providerConfigs: this.providerConfigs,
      voiceConfig: this.voiceConfig
    };
    this.enqueueWrite('settings', async () => {
      await mkdir(this.archpiHome, { recursive: true });
      await writeFile(this.settingsFile, JSON.stringify(payload, null, 2), 'utf8');
    });
  }

  private persistWindowMessages(windowId: string): void {
    const msgs = (this.messagesByWindow.get(windowId) ?? []).map((m) =>
      m.isStreaming ? { ...m, isStreaming: false } : m
    );
    this.enqueueWrite(`messages:${windowId}`, async () => {
      await mkdir(this.messagesDir, { recursive: true });
      await writeFile(join(this.messagesDir, `${windowId}.json`), JSON.stringify(msgs, null, 2), 'utf8');
    });
  }

  private deleteWindowMessages(windowId: string): void {
    this.enqueueWrite(`messages:${windowId}`, async () => {
      await rm(join(this.messagesDir, `${windowId}.json`), { force: true });
    });
  }

  private loadAllPersisted(defaultProjectPath: string): void {
    try {
      mkdirSync(this.archpiHome, { recursive: true });
      mkdirSync(this.messagesDir, { recursive: true });
      mkdirSync(this.plansDir, { recursive: true });
    } catch (err) {
      console.error('[archpi/runtime] failed to ensure ~/.archpi dirs:', err);
    }

    if (existsSync(this.settingsFile)) {
      try {
        const raw = JSON.parse(readFileSync(this.settingsFile, 'utf8')) as PersistedSettingsFile;
        if (raw.providerConfig && typeof raw.providerConfig === 'object') {
          this.providerConfig = raw.providerConfig;
        }
        if (Array.isArray(raw.providerConfigs)) {
          this.providerConfigs = raw.providerConfigs;
        }
        if (raw.voiceConfig && typeof raw.voiceConfig === 'object') {
          this.voiceConfig = { ...this.voiceConfig, ...raw.voiceConfig };
        }
        const settings: UserSettings = {};
        if (raw.language === 'zh' || raw.language === 'en') settings.language = raw.language;
        if (Array.isArray(raw.savedProviders)) settings.savedProviders = raw.savedProviders;
        if (raw.activeProviderId !== undefined) settings.activeProviderId = raw.activeProviderId;
        if (raw.roleModels && typeof raw.roleModels === 'object') settings.roleModels = raw.roleModels;
        if (raw.modelsDevCache !== undefined) settings.modelsDevCache = raw.modelsDevCache;
        if (raw.quotaLimits && typeof raw.quotaLimits === 'object') settings.quotaLimits = raw.quotaLimits;
        if (typeof raw.quotaAutoRefreshEnabled === 'boolean') {
          settings.quotaAutoRefreshEnabled = raw.quotaAutoRefreshEnabled;
        }
        if (typeof raw.quotaAutoRefreshIntervalMinutes === 'number') {
          settings.quotaAutoRefreshIntervalMinutes = raw.quotaAutoRefreshIntervalMinutes;
        }
        if (raw.agyQuotaByProviderId && typeof raw.agyQuotaByProviderId === 'object') {
          settings.agyQuotaByProviderId = raw.agyQuotaByProviderId;
        }
        if (raw.providerBalanceByProviderId && typeof raw.providerBalanceByProviderId === 'object') {
          settings.providerBalanceByProviderId = raw.providerBalanceByProviderId;
        }
        if (raw.balanceAlertThresholds && typeof raw.balanceAlertThresholds === 'object') {
          settings.balanceAlertThresholds = raw.balanceAlertThresholds;
        }
        this.userSettings = settings;
      } catch (err) {
        console.error('[archpi/runtime] failed to load settings.json:', err);
      }
    }

    if (existsSync(this.stateFile)) {
      try {
        const raw = JSON.parse(readFileSync(this.stateFile, 'utf8')) as Partial<PersistedStateFile>;
        if (Array.isArray(raw.projects)) {
          this.projects = raw.projects;
        }
        if (Array.isArray(raw.windows)) {
          for (const win of raw.windows) {
            const normalized: AliveWindow =
              win.status === 'working' ? { ...win, status: 'idle', unreadCount: win.unreadCount ?? 0 } : win;
            this.windows.set(normalized.id, normalized);
          }
        }
        if (Array.isArray(raw.tasks)) {
          for (const task of raw.tasks) {
            this.tasks.set(task.id, task);
          }
        }
        if (raw.agyConversations && typeof raw.agyConversations === 'object') {
          for (const [k, v] of Object.entries(raw.agyConversations)) {
            if (typeof v === 'string' && v.trim()) {
              this.agyConversations.set(k, v);
            }
          }
        }
      } catch (err) {
        console.error('[archpi/runtime] failed to load state.json:', err);
      }
    }

    if (this.projects.length === 0) {
      this.seedInitialWorkspace(defaultProjectPath);
      this.persistState();
      for (const winId of this.windows.keys()) {
        this.persistWindowMessages(winId);
      }
    } else {
      for (const win of this.windows.values()) {
        const msgFile = join(this.messagesDir, `${win.id}.json`);
        if (existsSync(msgFile)) {
          try {
            const parsed = JSON.parse(readFileSync(msgFile, 'utf8')) as ChatMessage[];
            if (Array.isArray(parsed)) {
              this.messagesByWindow.set(
                win.id,
                parsed.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
              );
              continue;
            }
          } catch (err) {
            console.error(`[archpi/runtime] failed to load messages for ${win.id}:`, err);
          }
        }
        this.messagesByWindow.set(win.id, []);
      }
    }

    if (existsSync(this.plansDir)) {
      try {
        const files = readdirSync(this.plansDir).filter((f) => f.endsWith('.json'));
        for (const file of files) {
          try {
            const plan = JSON.parse(readFileSync(join(this.plansDir, file), 'utf8')) as PlanSpec;
            if (plan && plan.id) {
              this.plans.set(plan.id, plan);
            }
          } catch {
            // ignore corrupted plan file
          }
        }
      } catch (err) {
        console.error('[archpi/runtime] failed to load plans:', err);
      }
    }
  }

  private seedInitialWorkspace(defaultPath: string): void {
    const projectId = 'proj-archpi';
    const project: ProjectInfo = {
      id: projectId,
      name: 'archpi',
      rootPath: defaultPath,
      branch: 'main',
      createdAt: Date.now()
    };
    this.projects.push(project);
  }

  subscribe(listener: (event: ArchpiEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => {
      this.emitter.off('event', listener);
    };
  }

  private emit(event: ArchpiEvent): void {
    this.emitter.emit('event', event);
  }

  private syncPlanInMessages(plan: PlanSpec): void {
    for (const [winId, msgs] of this.messagesByWindow.entries()) {
      let changed = false;
      const next = msgs.map((m) => {
        if (m.plan?.id === plan.id) {
          changed = true;
          return { ...m, plan };
        }
        return m;
      });
      if (changed) {
        this.messagesByWindow.set(winId, next);
      }
    }
  }

  private persistPlan(plan: PlanSpec): void {
    this.plans.set(plan.id, plan);
    this.syncPlanInMessages(plan);
    this.enqueueWrite(`plan:${plan.id}`, async () => {
      await mkdir(this.plansDir, { recursive: true });
      await writeFile(join(this.plansDir, `${plan.id}.json`), JSON.stringify(plan, null, 2), 'utf8');
    });
  }

  updatePlanStep(planId: string, stepId: string, done: boolean): PlanSpec | undefined {
    const existing = this.plans.get(planId);
    if (!existing) return undefined;
    let found = false;
    const updated: PlanSpec = {
      ...existing,
      steps: existing.steps.map((s) => {
        if (s.id === stepId) {
          found = true;
          return { ...s, done };
        }
        return s;
      })
    };
    if (!found) return undefined;
    this.persistPlan(updated);
    this.emit({ type: 'plan_updated', plan: updated });
    return updated;
  }

  getSnapshot(): AppSnapshot {
    const messagesObj: Record<string, ChatMessage[]> = {};
    for (const [k, v] of this.messagesByWindow.entries()) {
      messagesObj[k] = v;
    }
    return {
      projects: [...this.projects],
      windows: Array.from(this.windows.values()),
      tasks: Array.from(this.tasks.values()),
      messagesByWindow: messagesObj,
      providerConfig: { ...this.providerConfig },
      voiceConfig: { ...this.voiceConfig },
      settings: { ...this.userSettings }
    };
  }

  getUserSettings(): UserSettings {
    return { ...this.userSettings };
  }

  async updateSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
    this.userSettings = {
      ...this.userSettings,
      ...patch
    };
    this.persistSettings();
    return { ...this.userSettings };
  }

  async createProject(input: {
    name: string;
    rootPath: string;
    branch?: string;
  }): Promise<ProjectInfo> {
    const project: ProjectInfo = {
      id: uid('proj'),
      name: input.name,
      rootPath: input.rootPath,
      branch: input.branch || 'main',
      createdAt: Date.now()
    };
    this.projects.push(project);

    this.persistState();
    this.emit({ type: 'snapshot', snapshot: this.getSnapshot() });
    return project;
  }

  private resolveDefaultModelForRole(role: WindowRole): string {
    const roleCfg = this.userSettings.roleModels?.[role];
    const configuredDefault = roleCfg?.defaultModel?.trim();
    if (configuredDefault) return configuredDefault;
    const firstEntry = roleCfg?.entries?.[0]?.id?.trim();
    if (firstEntry) return firstEntry;
    const firstModel = roleCfg?.models?.[0]?.trim();
    if (firstModel) return firstModel;
    return this.providerConfig.modelId;
  }

  private resolveDefaultThinkingForRole(
    role: WindowRole,
    modelId: string
  ): ArchpiThinkingLevel | undefined {
    const roleCfg = this.userSettings.roleModels?.[role];
    if (!roleCfg) return undefined;
    const entry = roleCfg.entries?.find((e) => e.id === modelId);
    return entry?.thinkingLevel ?? roleCfg.thinkingLevel;
  }

  private createWindowSync(input: CreateWindowInput): AliveWindow {
    const win: AliveWindow = {
      id: uid('win'),
      projectId: input.projectId,
      title: input.title,
      role: input.role,
      status: 'idle',
      branch: input.branch || 'main',
      model: input.model?.trim() || this.resolveDefaultModelForRole(input.role),
      contextSummary: 'Ready',
      unreadCount: 0,
      inboxQueue: [],
      updatedAt: Date.now()
    };
    this.windows.set(win.id, win);
    this.messagesByWindow.set(win.id, []);
    return win;
  }

  async createWindow(input: CreateWindowInput): Promise<AliveWindow> {
    const win = this.createWindowSync(input);
    this.persistState();
    this.persistWindowMessages(win.id);
    this.emit({ type: 'window_updated', window: win });
    return win;
  }

  async closeWindow(windowId: string): Promise<void> {
    const agent = this.agents.get(windowId);
    if (agent) {
      agent.abort();
      this.agents.delete(windowId);
    }
    this.windows.delete(windowId);
    this.messagesByWindow.delete(windowId);
    this.agyConversations.delete(windowId);
    this.titleGenerationSeq.delete(windowId);
    this.persistState();
    this.deleteWindowMessages(windowId);
  }

  async renameWindow(windowId: string, title: string): Promise<AliveWindow | null> {
    const win = this.windows.get(windowId);
    if (!win) return null;
    const nextTitle = title.trim();
    if (!nextTitle) return win;
    win.title = nextTitle;
    win.titleManual = true;
    this.bumpTitleSeq(windowId);
    win.updatedAt = Date.now();
    this.persistState();
    this.emit({ type: 'window_updated', window: win });
    return win;
  }

  async archiveWindow(windowId: string, archived = true): Promise<AliveWindow | null> {
    const win = this.windows.get(windowId);
    if (!win) return null;
    if (archived) {
      const agent = this.agents.get(windowId);
      if (agent) {
        agent.abort();
        this.agents.delete(windowId);
      }
    }
    win.archived = archived;
    win.updatedAt = Date.now();
    this.persistState();
    this.emit({ type: 'window_updated', window: { ...win } });
    return win;
  }

  async updateProviderConfig(config: ProviderConfig): Promise<void> {
    this.providerConfig = { ...config };
    let windowsChanged = false;
    for (const win of this.windows.values()) {
      if (!win.model) {
        win.model = this.resolveDefaultModelForRole(win.role);
        windowsChanged = true;
        this.emit({ type: 'window_updated', window: win });
      }
    }
    this.agents.clear();
    this.persistSettings();
    if (windowsChanged) {
      this.persistState();
    }
  }

  async syncProviderConfigs(configs: ProviderConfig[]): Promise<void> {
    this.providerConfigs = configs.map((c) => ({ ...c }));
    this.agents.clear();
    this.persistSettings();
  }

  async updateVoiceConfig(config: VoiceInputConfig): Promise<void> {
    this.voiceConfig = { ...config };
    this.persistSettings();
  }

  private appendMessage(windowId: string, msg: ChatMessage): void {
    const list = this.messagesByWindow.get(windowId) ?? [];
    list.push(msg);
    this.messagesByWindow.set(windowId, list);
    if (!msg.isStreaming) {
      this.persistWindowMessages(windowId);
    }
    this.emit({ type: 'message_added', windowId, message: msg });
  }

  private setWindowStatus(windowId: string, status: AliveWindow['status'], summary?: string): void {
    const win = this.windows.get(windowId);
    if (!win) return;
    win.status = status;
    if (summary !== undefined) win.contextSummary = summary;
    win.updatedAt = Date.now();
    if (status !== 'working') {
      this.persistState();
    }
    this.emit({ type: 'window_updated', window: { ...win } });
  }

  private resolveProviderForModel(targetModelId?: string): ProviderConfig {
    const modelId = targetModelId || this.providerConfig.modelId;
    if (modelId && this.providerConfigs.length > 0) {
      const matched = this.providerConfigs.find(
        (cfg) =>
          cfg.modelConfigs?.some((m) => m.id === modelId) ||
          cfg.models?.includes(modelId) ||
          cfg.modelId === modelId
      );
      if (matched) return matched;
    }
    return this.providerConfig;
  }

  private resolveActiveModelSettings(
    targetModelId?: string,
    overrideThinking?: ArchpiThinkingLevel
  ): {
    modelId: string;
    providerConfig: ProviderConfig;
    contextWindow?: number;
    thinkingLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  } {
    const cfg = this.resolveProviderForModel(targetModelId);
    const modelId = targetModelId || cfg.modelId;
    const matched = cfg.modelConfigs?.find((m) => m.id === modelId);
    const contextWindow = matched?.contextWindow ?? cfg.contextWindow;
    const rawThinking: ArchpiThinkingLevel | undefined =
      overrideThinking ?? matched?.thinkingLevel ?? matched?.thinkingLevels?.[0] ?? cfg.thinkingLevel;

    let thinkingLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' = 'off';
    if (!isGeminiModel(modelId)) {
      if (rawThinking === 'minimal' || rawThinking === 'low' || rawThinking === 'medium' || rawThinking === 'high') {
        thinkingLevel = rawThinking;
      } else if (rawThinking === 'xhigh' || rawThinking === 'max' || rawThinking === 'ultra') {
        thinkingLevel = 'xhigh';
      }
    }

    return { modelId, providerConfig: cfg, contextWindow, thinkingLevel };
  }

  private resolvePiModel(
    targetModelId?: string,
    overrideThinking?: ArchpiThinkingLevel
  ): Model<any> {
    const { modelId, providerConfig: cfg, contextWindow, thinkingLevel } =
      this.resolveActiveModelSettings(targetModelId, overrideThinking);
    const { provider, protocol, baseUrl } = cfg;

    let piApi: 'openai-completions' | 'openai-responses' | 'anthropic-messages' | 'google-generative-ai' =
      'openai-completions';
    let piProvider: 'openai' | 'anthropic' | 'google' = 'openai';

    if (protocol === 'anthropic-compatible' || (provider === 'anthropic' && !protocol)) {
      piApi = 'anthropic-messages';
      piProvider = 'anthropic';
    } else if (protocol === 'openai-responses') {
      piApi = 'openai-responses';
      piProvider = 'openai';
    } else if (protocol === 'gemini-compatible' || (provider === 'google' && !protocol)) {
      piApi = 'google-generative-ai';
      piProvider = 'google';
    }

    const customBaseUrl = baseUrl?.trim();
    const effectiveContextWindow = contextWindow && contextWindow > 0 ? contextWindow : 128000;

    if (provider !== 'openai-compatible' && !customBaseUrl) {
      try {
        const model = getModel(piProvider as any, modelId as any);
        return {
          ...model,
          api: piApi,
          contextWindow: contextWindow && contextWindow > 0 ? contextWindow : model.contextWindow
        };
      } catch {
        // Model ID not in built-in registry; construct descriptor directly below
      }
    }

    const defaultBaseUrl =
      piProvider === 'anthropic'
        ? 'https://api.anthropic.com'
        : piProvider === 'google'
          ? 'https://generativelanguage.googleapis.com/v1beta'
          : 'http://localhost:11434/v1';

    return {
      id: modelId,
      name: modelId,
      api: piApi,
      provider: piProvider,
      baseUrl: customBaseUrl || defaultBaseUrl,
      reasoning: thinkingLevel !== 'off',
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: effectiveContextWindow,
      maxTokens: 8192
    };
  }

  private buildSeedMessages(windowId: string, model: Model<any>): PiMessage[] {
    const raw = (this.messagesByWindow.get(windowId) ?? []).filter(
      (m) =>
        !m.isStreaming &&
        m.content.trim().length > 0 &&
        (m.role === 'user' || m.role === 'assistant') &&
        !(m.role === 'assistant' && m.content.startsWith('Error:'))
    );
    const firstUserIdx = raw.findIndex((m) => m.role === 'user');
    if (firstUserIdx === -1) return [];
    return raw.slice(firstUserIdx).map((m): PiMessage => {
      if (m.role === 'user') {
        const userMsg: UserMessage = {
          role: 'user',
          content: m.content,
          timestamp: m.timestamp
        };
        return userMsg;
      }
      const assistantMsg: AssistantMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: m.content }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
        },
        stopReason: 'stop',
        timestamp: m.timestamp
      };
      return assistantMsg;
    });
  }

  private getOrCreatePiAgent(
    win: AliveWindow,
    overrideThinking?: ArchpiThinkingLevel
  ): Agent {
    const { modelId: effectiveModelId, thinkingLevel } = this.resolveActiveModelSettings(
      win.model,
      overrideThinking
    );
    const model = this.resolvePiModel(effectiveModelId, overrideThinking);

    const existing = this.agents.get(win.id);
    if (existing) {
      existing.state.model = model;
      existing.state.thinkingLevel = thinkingLevel;
      existing.getApiKey = () => this.resolveApiKey(effectiveModelId);
      return existing;
    }

    const project = this.projects.find((p) => p.id === win.projectId);
    const projectRoot = project?.rootPath || process.cwd();

    const titleSuffix =
      this.userSettings.autoGenerateTitle !== false ? `\n\n${IMPLICIT_TITLE_INSTRUCTION}` : '';
    const systemPrompt =
      win.role === 'master'
        ? `You are Arch Pi Master working in ${projectRoot}. Always inspect the actual codebase first using list_dir, grep_search, and read_file before designing a plan. Break user requirements into grounded, actionable plans using create_plan. Inspect existing windows using list_alive_windows: reuse an idle/suitable existing Worker window when appropriate, or spawn a new Worker window with create_worker (or newWorkerTitle in dispatch_plan) when a fresh Worker is needed, then dispatch the plan using dispatch_plan.${titleSuffix}`
        : `You are a coding assistant working in ${projectRoot}. Use read_file, list_dir, grep_search, write_file, edit_file, and bash when needed. Be concise and helpful.${titleSuffix}`;

    const tools =
      win.role === 'master'
        ? createOrchestratorTools(projectRoot, win.projectId, win.id, {
            listAliveWindows: (pid) =>
              Array.from(this.windows.values())
                .filter((w) => w.projectId === pid && !w.archived)
                .map((w) => ({
                  id: w.id,
                  title: w.title,
                  role: w.role,
                  status: w.status,
                  branch: w.branch,
                  inboxCount: w.inboxQueue.length
                })),
            createWorker: async (input) => {
              const created = await this.createWindow({
                projectId: input.projectId,
                title: input.title,
                role: 'worker',
                branch: input.branch
              });
              return {
                id: created.id,
                title: created.title,
                role: created.role,
                status: created.status,
                branch: created.branch
              };
            },
            createPlan: (orchId, partial) => {
              const plan: PlanSpec = {
                ...partial,
                id: uid('plan'),
                projectId: win.projectId,
                sourceOrchestratorId: orchId,
                status: 'draft',
                createdAt: Date.now()
              };
              this.persistPlan(plan);
              return plan;
            },
            dispatchPlanById: async (planId, targetWorkerId, targetReviewerId) => {
              const plan = this.plans.get(planId);
              if (!plan) throw new Error(`Plan ${planId} not found`);
              await this.dispatchPlan({
                plan,
                targetWorkerId,
                targetReviewerId,
                autoReview: Boolean(targetReviewerId)
              });
            },
            requestReview: (input) => this.requestReview(input)
          })
        : createWorkerTools(
            projectRoot,
            {
              updatePlanStep: (planId, stepId, done) => this.updatePlanStep(planId, stepId, done)
            },
            () => Math.max(5, this.userSettings.bashTimeoutSeconds ?? 30) * 1000
          );

    const seedMessages = this.buildSeedMessages(win.id, model);
    const agent = new Agent({
      initialState: {
        systemPrompt,
        model,
        thinkingLevel,
        tools,
        ...(seedMessages.length > 0 ? { messages: seedMessages } : {})
      },
      getApiKey: () => this.resolveApiKey(effectiveModelId)
    });

    this.agents.set(win.id, agent);
    return agent;
  }

  private resolveApiKey(modelId?: string, providerCfg?: ProviderConfig): string | undefined {
    const cfg = providerCfg ?? this.resolveProviderForModel(modelId);
    const targetModelId = modelId || cfg.modelId;
    const matchedModel = cfg.modelConfigs?.find((m) => m.id === targetModelId);
    if (matchedModel?.apiKeyId && cfg.apiKeys) {
      const matchedKey = cfg.apiKeys.find((k) => k.id === matchedModel.apiKeyId);
      if (matchedKey?.key?.trim()) return matchedKey.key.trim();
    }
    const defaultProviderKey = cfg.apiKeys?.find((k) => k.key?.trim())?.key?.trim();
    if (defaultProviderKey) return defaultProviderKey;
    if (cfg.apiKey?.trim()) return cfg.apiKey.trim();
    return undefined;
  }

  private isAgyProvider(cfg: ProviderConfig): boolean {
    return Boolean(
      cfg.antigravityAuth?.refreshToken?.trim() ||
        cfg.antigravityAuth?.email?.trim() ||
        cfg.icon === 'Antigravity'
    );
  }

  private bumpTitleSeq(windowId: string): number {
    const next = (this.titleGenerationSeq.get(windowId) ?? 0) + 1;
    this.titleGenerationSeq.set(windowId, next);
    return next;
  }

  private applyAutoTitle(
    windowId: string,
    rawTitle: string,
    options?: { expectedSeq?: number }
  ): boolean {
    const win = this.windows.get(windowId);
    if (!win || win.archived || win.titleManual) return false;
    if (
      options?.expectedSeq !== undefined &&
      this.titleGenerationSeq.get(windowId) !== options.expectedSeq
    ) {
      return false;
    }

    const nextTitle = normalizeAutoTitle(rawTitle);
    if (measureTitleUnits(nextTitle) < 4) return false;

    // Invalidate any slower in-flight sidecar before committing.
    this.bumpTitleSeq(windowId);
    if (win.title === nextTitle) return false;

    win.title = nextTitle;
    win.updatedAt = Date.now();
    this.persistState();
    this.emit({ type: 'window_updated', window: { ...win } });
    return true;
  }

  private async generateInitialTitleSidecar(
    windowId: string,
    promptText: string,
    seq: number
  ): Promise<void> {
    try {
      const win = this.windows.get(windowId);
      if (!win || win.archived || win.titleManual) return;

      const targetCfg = this.resolveProviderForModel(win.model);
      const apiKey = this.resolveApiKey(win.model, targetCfg);
      const isAgy = this.isAgyProvider(targetCfg);
      const hasAuth = Boolean(
        apiKey ||
          targetCfg.antigravityAuth?.refreshToken?.trim() ||
          targetCfg.antigravityAuth?.email?.trim()
      );
      if (!hasAuth) return;

      const snippet = promptText.trim().slice(0, 800);
      if (!snippet) return;

      let rawTitle = '';
      if (isAgy) {
        const project = this.projects.find((p) => p.id === win.projectId);
        const refreshToken =
          targetCfg.antigravityAuth?.refreshToken?.trim() ||
          targetCfg.apiKey?.trim() ||
          undefined;
        const agyPrompt = [
          '[System Task: Session Title Only]',
          'Do NOT use any tools, do NOT inspect files, and do NOT explain.',
          'Generate ONE concise session title in the user language summarizing the request below.',
          'Length MUST be 12-24 display units (6-12 Chinese characters or 12-24 ASCII characters).',
          'Output ONLY the title text itself, with no quotes, tags, or trailing punctuation.',
          '',
          '[User Input]',
          snippet
        ].join('\n');
        const res = await this.providerRegistry.get('gemini-agy').streamChat(
          {
            prompt: agyPrompt,
            model: win.model || targetCfg.modelId,
            cwd: project?.rootPath || process.cwd(),
            auth: { refreshToken }
          },
          () => {},
          AbortSignal.timeout(15000)
        );
        rawTitle = res.response;
      } else {
        const baseModel = this.resolvePiModel(win.model, 'none');
        const model = { ...baseModel, reasoning: false };
        const res = await completeSimple(
          model,
          {
            systemPrompt:
              '你是会话标题生成器。根据用户的首条输入提炼一个简洁准确的会话标题，长度控制在12~24个显示宽度单位（约6~12个汉字，或12~24个英文字符），使用用户输入的语言。只输出标题文本本身，不要引号、标签、句号或任何解释。',
            messages: [
              {
                role: 'user',
                content: snippet,
                timestamp: Date.now()
              }
            ]
          },
          {
            apiKey,
            maxTokens: 64,
            temperature: 0.2,
            signal: AbortSignal.timeout(10000)
          }
        );
        if (res.stopReason === 'error' || res.stopReason === 'aborted') return;
        rawTitle = res.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('');
      }

      if (rawTitle) {
        this.applyAutoTitle(windowId, rawTitle, { expectedSeq: seq });
      }
    } catch (err) {
      console.debug('[ArchpiRuntime] initial title sidecar skipped:', err);
    }
  }

  async sendMessage(
    windowId: string,
    content: string,
    options?: { model?: string; thinkingLevel?: ArchpiThinkingLevel }
  ): Promise<void> {
    const win = this.windows.get(windowId);
    if (!win) throw new Error(`Window ${windowId} not found`);

    if (options?.model?.trim() && options.model.trim() !== win.model) {
      win.model = options.model.trim();
      win.updatedAt = Date.now();
      this.persistState();
      this.emit({ type: 'window_updated', window: { ...win } });
    }

    const isFirstUserMessage = !(this.messagesByWindow.get(windowId) ?? []).some(
      (m) => m.role === 'user'
    );
    const turnSeq = this.bumpTitleSeq(windowId);

    this.appendMessage(windowId, {
      id: uid('msg'),
      windowId,
      role: 'user',
      content,
      timestamp: Date.now()
    });

    if (isFirstUserMessage && !win.titleManual) {
      void this.generateInitialTitleSidecar(win.id, content, turnSeq);
    }

    await this.runWindowTurn(win, content, options?.thinkingLevel);
  }

  private async runAgyTurn(
    win: AliveWindow,
    promptText: string,
    assistantMsgId: string,
    cfg: ProviderConfig
  ): Promise<void> {
    const project = this.projects.find((p) => p.id === win.projectId);
    const turnStartedAt = Date.now();
    let firstTokenAt: number | null = null;
    let accumulated = '';
    let inThinking = false;
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;

    const refreshToken =
      cfg.antigravityAuth?.refreshToken?.trim() || cfg.apiKey?.trim() || undefined;

    let effectivePrompt = promptText;
    if (win.role === 'master') {
      const aliveWorkers = Array.from(this.windows.values())
        .filter((w) => w.projectId === win.projectId && !w.archived && w.role === 'worker')
        .map((w) => ({
          id: w.id,
          title: w.title,
          status: w.status,
          branch: w.branch
        }));

      effectivePrompt = [
        '[Arch Pi Master Context]',
        `You are the Master orchestrator inside the Arch Pi desktop app (project root: ${project?.rootPath || process.cwd()}).`,
        'IMPORTANT: Do NOT use internal swarm / invoke_subagent / message board tools to spawn hidden agents. Arch Pi manages its own visible Worker windows in the UI.',
        `Currently alive Worker windows in this project: ${
          aliveWorkers.length > 0 ? JSON.stringify(aliveWorkers) : '[] (none)'
        }`,
        'When you create a plan or need a Worker to execute a task (including testing or waking up a Worker), output a JSON block wrapped in ```archpi-plan and ``` with this exact schema:',
        '```archpi-plan',
        '{',
        '  "title": "Short plan title",',
        '  "summary": "Brief overview of what the Worker should do",',
        '  "steps": [{ "title": "Step 1", "detail": "Concrete action" }],',
        '  "acceptanceCriteria": ["Criterion 1"],',
        '  "workerAction": "reuse" | "new",',
        '  "targetWorkerId": "existing worker id when workerAction is reuse",',
        '  "newWorkerTitle": "short window title when workerAction is new",',
        '  "autoDispatch": true',
        '}',
        '```',
        'If an idle/suitable Worker already exists and should be reused, set "workerAction": "reuse" and "targetWorkerId" to its id. If no suitable Worker exists or a fresh Worker is needed, set "workerAction": "new" and provide "newWorkerTitle". Set "autoDispatch": true whenever you want Arch Pi to immediately open/split the Worker window and start executing.',
        ...(this.userSettings.autoGenerateTitle !== false ? [IMPLICIT_TITLE_INSTRUCTION] : []),
        '',
        promptText.startsWith('[Worker Completion Report]') ? '[System Event]' : '[User Request]',
        promptText
      ].join('\n');
    } else {
      effectivePrompt = [
        '[Arch Pi Worker Context]',
        `You are a coding Worker inside the Arch Pi desktop app (project root: ${project?.rootPath || process.cwd()}).`,
        ...(this.userSettings.autoGenerateTitle !== false ? [IMPLICIT_TITLE_INSTRUCTION] : []),
        '',
        '[Task]',
        promptText
      ].join('\n');
    }

    const result = await this.providerRegistry.get('gemini-agy').streamChat(
      {
        prompt: effectivePrompt,
        model: win.model || cfg.modelId,
        conversationId: this.agyConversations.get(win.id),
        cwd: project?.rootPath || process.cwd(),
        auth: { refreshToken }
      },
      (evt) => {
        if (evt.type === 'init' && evt.conversationId) {
          this.agyConversations.set(win.id, evt.conversationId);
          this.persistState();
        } else if (evt.type === 'thinking_delta') {
          if (firstTokenAt === null) firstTokenAt = Date.now();
          const prefix = inThinking ? '' : '<think>\n';
          inThinking = true;
          const delta = `${prefix}${evt.text}`;
          accumulated += delta;
          this.emit({
            type: 'message_delta',
            windowId: win.id,
            messageId: assistantMsgId,
            delta
          });
        } else if (evt.type === 'text_delta') {
          if (firstTokenAt === null) firstTokenAt = Date.now();
          const prefix = inThinking ? '\n</think>\n\n' : '';
          inThinking = false;
          const delta = `${prefix}${evt.text}`;
          accumulated += delta;
          this.emit({
            type: 'message_delta',
            windowId: win.id,
            messageId: assistantMsgId,
            delta
          });
        } else if (evt.type === 'done' && evt.usage) {
          totalInput = evt.usage.inputTokens ?? 0;
          totalOutput = evt.usage.outputTokens ?? 0;
          totalCacheRead = evt.usage.cacheReadTokens ?? 0;
        }
      }
    );

    if (inThinking) {
      const closeTag = '\n</think>\n';
      accumulated += closeTag;
      this.emit({
        type: 'message_delta',
        windowId: win.id,
        messageId: assistantMsgId,
        delta: closeTag
      });
    }

    if (result.conversationId) {
      this.agyConversations.set(win.id, result.conversationId);
    }

    const endedAt = Date.now();
    const ttftMs = firstTokenAt !== null ? Math.max(0, firstTokenAt - turnStartedAt) : undefined;
    const genMs =
      firstTokenAt !== null
        ? Math.max(1, endedAt - firstTokenAt)
        : Math.max(1, endedAt - turnStartedAt);
    const tokensPerSec =
      totalOutput > 0 ? Number(((totalOutput / genMs) * 1000).toFixed(1)) : undefined;

    const rawContent = accumulated || result.response || '(Done)';
    const extracted = extractAndStripImplicitTitle(rawContent);
    if (extracted.title) {
      this.applyAutoTitle(win.id, extracted.title);
    }

    let displayContent = extracted.content || '(Done)';
    let parsedPlan: PlanSpec | undefined;
    let agyDispatchTarget: {
      workerAction?: 'reuse' | 'new';
      targetWorkerId?: string;
      newWorkerTitle?: string;
      autoDispatch?: boolean;
    } | null = null;

    if (win.role === 'master') {
      const planBlockMatch = displayContent.match(/```archpi-plan\s*([\s\S]*?)```/i);
      if (planBlockMatch) {
        try {
          const rawJson = JSON.parse(planBlockMatch[1].trim()) as {
            title?: string;
            summary?: string;
            steps?: Array<{ title?: string; detail?: string }>;
            acceptanceCriteria?: string[];
            workerAction?: 'reuse' | 'new';
            targetWorkerId?: string;
            newWorkerTitle?: string;
            autoDispatch?: boolean;
          };
          if (rawJson && typeof rawJson === 'object') {
            parsedPlan = {
              id: uid('plan'),
              projectId: win.projectId,
              title: rawJson.title?.trim() || 'Execution Plan',
              summary: rawJson.summary?.trim() || '',
              steps: Array.isArray(rawJson.steps)
                ? rawJson.steps.map((s, idx) => ({
                    id: `step-${idx + 1}`,
                    title: s.title?.trim() || `Step ${idx + 1}`,
                    detail: s.detail?.trim() || '',
                    done: false
                  }))
                : [],
              acceptanceCriteria: Array.isArray(rawJson.acceptanceCriteria)
                ? rawJson.acceptanceCriteria.map((c) => String(c))
                : [],
              targetWorkerId: rawJson.targetWorkerId,
              sourceOrchestratorId: win.id,
              status: 'draft',
              createdAt: Date.now()
            };
            this.persistPlan(parsedPlan);
            agyDispatchTarget = {
              workerAction: rawJson.workerAction,
              targetWorkerId: rawJson.targetWorkerId,
              newWorkerTitle: rawJson.newWorkerTitle,
              autoDispatch: rawJson.autoDispatch
            };
            const stripped = displayContent.replace(planBlockMatch[0], '').trim();
            displayContent = stripped || parsedPlan.summary || `已生成执行计划 **${parsedPlan.title}**。`;
          }
        } catch {
          // Ignore malformed archpi-plan JSON block
        }
      }
    }

    const finalMsg: ChatMessage = {
      id: assistantMsgId,
      windowId: win.id,
      role: 'assistant',
      content: displayContent,
      timestamp: endedAt,
      isStreaming: false,
      plan: parsedPlan,
      meta: {
        model: win.model || cfg.modelId,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        cacheReadTokens: totalCacheRead,
        ttftMs,
        tokensPerSec
      }
    };
    this.replaceMessage(win.id, assistantMsgId, finalMsg);
    this.emit({
      type: 'message_done',
      windowId: win.id,
      messageId: assistantMsgId,
      message: finalMsg
    });
    this.setWindowStatus(win.id, 'idle', 'Idle');

    if (parsedPlan && agyDispatchTarget?.autoDispatch) {
      let resolvedWorkerId = agyDispatchTarget.targetWorkerId?.trim();
      const existingWorker = resolvedWorkerId
        ? this.windows.get(resolvedWorkerId)
        : undefined;
      if (
        agyDispatchTarget.workerAction === 'new' ||
        !existingWorker ||
        existingWorker.archived ||
        existingWorker.role !== 'worker'
      ) {
        const created = await this.createWindow({
          projectId: win.projectId,
          title:
            clampWindowTitle(
              agyDispatchTarget.newWorkerTitle?.trim() || parsedPlan.title
            ) || 'Worker',
          role: 'worker'
        });
        resolvedWorkerId = created.id;
      }
      if (resolvedWorkerId) {
        void this.dispatchPlan({
          plan: parsedPlan,
          targetWorkerId: resolvedWorkerId
        });
      }
    }
  }

  private async runWindowTurn(
    win: AliveWindow,
    promptText: string,
    overrideThinking?: ArchpiThinkingLevel
  ): Promise<void> {
    this.setWindowStatus(win.id, 'working', promptText.slice(0, 48));

    const assistantMsgId = uid('msg');
    const streamingMsg: ChatMessage = {
      id: assistantMsgId,
      windowId: win.id,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true
    };
    this.appendMessage(win.id, streamingMsg);

    // If no API key / auth is set for the target model's provider, run local simulation
    const targetCfg = this.resolveProviderForModel(win.model);
    const hasAuth = Boolean(
      this.resolveApiKey(win.model, targetCfg) ||
        targetCfg.antigravityAuth?.refreshToken?.trim() ||
        targetCfg.antigravityAuth?.email?.trim()
    );
    if (!hasAuth) {
      await this.runSimulatedTurn(win, promptText, assistantMsgId);
      await this.drainInboxQueue(win);
      return;
    }

    if (this.isAgyProvider(targetCfg)) {
      try {
        await this.runAgyTurn(win, promptText, assistantMsgId, targetCfg);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const errMsg: ChatMessage = {
          id: assistantMsgId,
          windowId: win.id,
          role: 'assistant',
          content: `Error: ${msg}`,
          timestamp: Date.now(),
          isStreaming: false
        };
        this.replaceMessage(win.id, assistantMsgId, errMsg);
        this.emit({
          type: 'message_done',
          windowId: win.id,
          messageId: assistantMsgId,
          message: errMsg
        });
        this.setWindowStatus(win.id, 'idle', 'Error');
      }
      await this.drainInboxQueue(win);
      return;
    }

    try {
      const effectiveThinking =
        overrideThinking ?? this.resolveDefaultThinkingForRole(win.role, win.model);
      const agent = this.getOrCreatePiAgent(win, effectiveThinking);
      const turnStartedAt = Date.now();
      let firstTokenAt: number | null = null;
      let totalInput = 0;
      let totalOutput = 0;
      let totalCacheRead = 0;
      let totalCacheWrite = 0;
      let accumulated = '';
      let needsParagraphBreakAfterTool = false;
      let activeThinkingStepId: string | null = null;
      let thinkingSeq = 0;
      let createdPlan: PlanSpec | undefined;
      const activitySteps: ToolActivityStep[] = [];

      const closeActiveThinkingStep = () => {
        if (!activeThinkingStepId) return;
        const idx = activitySteps.findIndex((s) => s.id === activeThinkingStepId);
        if (idx !== -1 && activitySteps[idx].status === 'running') {
          const updated: ToolActivityStep = {
            ...activitySteps[idx],
            status: 'done',
            endedAt: Date.now()
          };
          activitySteps[idx] = updated;
          this.emit({
            type: 'message_activity',
            windowId: win.id,
            messageId: assistantMsgId,
            step: updated
          });
        }
        activeThinkingStepId = null;
      };

      const unsub = agent.subscribe((event) => {
        if (event.type === 'message_update') {
          const evType = event.assistantMessageEvent.type;
          if (
            firstTokenAt === null &&
            (evType === 'text_delta' || evType === 'thinking_delta')
          ) {
            firstTokenAt = Date.now();
          }
          if (evType === 'thinking_delta') {
            const rawDelta = event.assistantMessageEvent.delta;
            if (!activeThinkingStepId) {
              thinkingSeq += 1;
              const step: ToolActivityStep = {
                id: `${assistantMsgId}-think-${thinkingSeq}`,
                kind: 'thinking',
                toolName: 'thinking',
                category: 'thinking',
                verb: '思考',
                target: '',
                text: rawDelta,
                status: 'running',
                startedAt: Date.now()
              };
              activeThinkingStepId = step.id;
              activitySteps.push(step);
              this.emit({
                type: 'message_activity',
                windowId: win.id,
                messageId: assistantMsgId,
                step
              });
            } else {
              const idx = activitySteps.findIndex((s) => s.id === activeThinkingStepId);
              if (idx !== -1) {
                const prev = activitySteps[idx];
                const updated: ToolActivityStep = {
                  ...prev,
                  text: `${prev.text ?? ''}${rawDelta}`
                };
                activitySteps[idx] = updated;
                this.emit({
                  type: 'message_activity',
                  windowId: win.id,
                  messageId: assistantMsgId,
                  step: updated
                });
              }
            }
          } else if (evType === 'text_delta') {
            closeActiveThinkingStep();
            const rawDelta = event.assistantMessageEvent.delta;
            let prefix = '';
            if (needsParagraphBreakAfterTool && rawDelta.length > 0) {
              needsParagraphBreakAfterTool = false;
              const trailingNewlines = accumulated.match(/\n*$/)?.[0].length ?? 0;
              const leadingNewlines = rawDelta.match(/^\n*/)?.[0].length ?? 0;
              const missing = Math.max(0, 2 - (trailingNewlines + leadingNewlines));
              if (missing > 0) {
                prefix = '\n'.repeat(missing);
              }
            }
            const delta = `${prefix}${rawDelta}`;
            accumulated += delta;
            this.emit({
              type: 'message_delta',
              windowId: win.id,
              messageId: assistantMsgId,
              delta
            });
          }
        } else if (
          event.type === 'message_end' &&
          event.message.role === 'assistant' &&
          'usage' in event.message &&
          event.message.usage
        ) {
          totalInput += event.message.usage.input || 0;
          totalOutput += event.message.usage.output || 0;
          totalCacheRead += event.message.usage.cacheRead || 0;
          totalCacheWrite += event.message.usage.cacheWrite || 0;
        } else if (event.type === 'tool_execution_start') {
          closeActiveThinkingStep();
          if (accumulated.length > 0) {
            needsParagraphBreakAfterTool = true;
          }
          const step = buildToolActivityStep(
            event.toolCallId,
            event.toolName,
            event.args as Record<string, unknown> | undefined
          );
          activitySteps.push(step);
          this.emit({
            type: 'message_activity',
            windowId: win.id,
            messageId: assistantMsgId,
            step
          });
        } else if (event.type === 'tool_execution_end') {
          const existingIdx = activitySteps.findIndex((s) => s.id === event.toolCallId);
          if (existingIdx !== -1) {
            const prev = activitySteps[existingIdx];
            let nextDetail = prev.detail;
            if (event.toolName === 'read_file' && !event.isError) {
              const firstText = event.result?.content?.[0]?.text;
              if (typeof firstText === 'string' && firstText.length > 0) {
                nextDetail = `#L1-${countTextLines(firstText)}`;
              }
            }
            const updated: ToolActivityStep = {
              ...prev,
              detail: nextDetail,
              status: event.isError ? 'error' : 'done',
              endedAt: Date.now()
            };
            activitySteps[existingIdx] = updated;
            this.emit({
              type: 'message_activity',
              windowId: win.id,
              messageId: assistantMsgId,
              step: updated
            });
          }
          if (event.toolName === 'create_plan' && !event.isError) {
            createdPlan = event.result?.details as PlanSpec | undefined;
          }
        }
      });

      await agent.prompt(promptText);
      unsub();
      closeActiveThinkingStep();

      if (agent.state.errorMessage) {
        throw new Error(agent.state.errorMessage);
      }

      const endedAt = Date.now();
      const ttftMs = firstTokenAt !== null ? Math.max(0, firstTokenAt - turnStartedAt) : undefined;
      const genMs = firstTokenAt !== null ? Math.max(1, endedAt - firstTokenAt) : Math.max(1, endedAt - turnStartedAt);
      const tokensPerSec =
        totalOutput > 0 ? Number(((totalOutput / genMs) * 1000).toFixed(1)) : undefined;

      const extracted = extractAndStripImplicitTitle(accumulated || '(Done)');
      if (extracted.title) {
        this.applyAutoTitle(win.id, extracted.title);
      }

      const finalMsg: ChatMessage = {
        id: assistantMsgId,
        windowId: win.id,
        role: 'assistant',
        content: extracted.content || '(Done)',
        timestamp: endedAt,
        isStreaming: false,
        meta: {
          model: agent.state.model?.id || win.model,
          thinkingLevel: agent.state.thinkingLevel,
          inputTokens: totalInput,
          outputTokens: totalOutput,
          cacheReadTokens: totalCacheRead,
          cacheWriteTokens: totalCacheWrite,
          ttftMs,
          tokensPerSec
        },
        activitySteps: activitySteps.length > 0 ? activitySteps : undefined,
        workDurationMs: Math.max(0, endedAt - turnStartedAt),
        plan: createdPlan
      };
      this.replaceMessage(win.id, assistantMsgId, finalMsg);
      this.emit({
        type: 'message_done',
        windowId: win.id,
        messageId: assistantMsgId,
        message: finalMsg
      });
      this.setWindowStatus(win.id, 'idle', 'Idle');
    } catch (err) {
      console.error('[ArchpiRuntime] runWindowTurn error:', err);
      const errText = err instanceof Error ? err.message : String(err);
      const finalMsg: ChatMessage = {
        id: assistantMsgId,
        windowId: win.id,
        role: 'assistant',
        content: `Error: ${errText}`,
        timestamp: Date.now(),
        isStreaming: false
      };
      this.replaceMessage(win.id, assistantMsgId, finalMsg);
      this.emit({
        type: 'message_done',
        windowId: win.id,
        messageId: assistantMsgId,
        message: finalMsg
      });
      this.setWindowStatus(win.id, 'needs_you', 'Error');
    }

    await this.drainInboxQueue(win);
  }

  private async runSimulatedTurn(
    win: AliveWindow,
    promptText: string,
    assistantMsgId: string
  ): Promise<void> {
    await new Promise((r) => setTimeout(r, 450));

    let content = '';
    let plan: PlanSpec | undefined;
    let review: ReviewVerdict | undefined;

    if (win.role === 'master') {
      const workers = Array.from(this.windows.values()).filter(
        (w) => w.projectId === win.projectId && w.role === 'worker'
      );
      const cleanTitle = promptText.replace(/^\/plan\s*/i, '').slice(0, 40) || '新任务计划';
      plan = {
        id: uid('plan'),
        projectId: win.projectId,
        title: cleanTitle,
        summary: `根据需求「${promptText}」拆解的执行计划（未配置 API Key，当前为本地演示模式）。`,
        steps: [
          {
            id: 'step-1',
            title: '定位相关模块与接口',
            detail: '检查现有代码结构与类型定义',
            done: false
          },
          {
            id: 'step-2',
            title: '实现核心逻辑与自测',
            detail: '完成编码并运行 typecheck / 单元测试',
            done: false
          }
        ],
        acceptanceCriteria: ['TypeScript 类型检查通过', '功能符合预期'],
        targetWorkerId: workers[0]?.id,
        sourceOrchestratorId: win.id,
        status: 'draft',
        createdAt: Date.now()
      };
      this.persistPlan(plan);
      content = `已为你生成结构化执行计划 **${plan.title}**。你可以在下方选择任意活着的 Worker 窗口直接派发执行：`;
    } else {
      content = `已完成任务执行：\n- 读取并检查目标工作区\n- 按计划步骤完成修改与验证\n\n（提示：在左下角 Settings 填入 API Key 即可切换为真实 Pi Agent 工具执行）`;
    }

    const finalMsg: ChatMessage = {
      id: assistantMsgId,
      windowId: win.id,
      role: 'assistant',
      content,
      timestamp: Date.now(),
      isStreaming: false,
      plan,
      review
    };
    this.replaceMessage(win.id, assistantMsgId, finalMsg);
    this.emit({
      type: 'message_done',
      windowId: win.id,
      messageId: assistantMsgId,
      message: finalMsg
    });
    this.setWindowStatus(win.id, 'idle', 'Done');
  }

  private replaceMessage(windowId: string, msgId: string, updated: ChatMessage): void {
    const list = this.messagesByWindow.get(windowId) ?? [];
    this.messagesByWindow.set(
      windowId,
      list.map((m) => (m.id === msgId ? updated : m))
    );
    if (!updated.isStreaming) {
      this.persistWindowMessages(windowId);
    }
  }

  async dispatchPlan(input: DispatchPlanInput): Promise<void> {
    const worker = this.windows.get(input.targetWorkerId);
    if (!worker) throw new Error(`Target worker window ${input.targetWorkerId} not found`);

    if (input.plan.title?.trim() && !worker.titleManual) {
      this.applyAutoTitle(worker.id, input.plan.title);
    }

    const sourceOrch = this.windows.get(input.plan.sourceOrchestratorId);
    const updatedPlan: PlanSpec = {
      ...input.plan,
      targetWorkerId: input.targetWorkerId,
      targetReviewerId: input.targetReviewerId,
      status: 'dispatched'
    };
    this.persistPlan(updatedPlan);
    this.emit({ type: 'plan_updated', plan: updatedPlan });

    // Update or create Board TaskCard
    const existingTask = Array.from(this.tasks.values()).find(
      (t) => t.planId === updatedPlan.id
    );
    const task: TaskCard = existingTask
      ? {
          ...existingTask,
          status: 'working',
          assignedWindowId: worker.id,
          reviewerWindowId: input.targetReviewerId,
          branch: worker.branch,
          updatedAt: Date.now()
        }
      : {
          id: uid('task'),
          projectId: worker.projectId,
          planId: updatedPlan.id,
          title: updatedPlan.title,
          branch: worker.branch,
          status: 'working',
          assignedWindowId: worker.id,
          reviewerWindowId: input.targetReviewerId,
          updatedAt: Date.now()
        };
    this.tasks.set(task.id, task);
    this.persistState();
    this.emit({ type: 'task_updated', task });

    if (worker.status === 'working') {
      worker.inboxQueue.push({
        id: uid('q'),
        plan: updatedPlan,
        fromWindowId: updatedPlan.sourceOrchestratorId,
        fromWindowTitle: sourceOrch?.title || 'Master',
        enqueuedAt: Date.now()
      });
      this.persistState();
      this.emit({ type: 'window_updated', window: { ...worker } });
      this.appendMessage(worker.id, {
        id: uid('msg'),
        windowId: worker.id,
        role: 'system',
        content: `Plan "${updatedPlan.title}" queued from ${sourceOrch?.title || 'Master'}`,
        timestamp: Date.now()
      });
      return;
    }

    await this.executeDispatchedPlan(worker, updatedPlan, sourceOrch?.title || 'Master', input.autoReview);
  }

  private async executeDispatchedPlan(
    worker: AliveWindow,
    plan: PlanSpec,
    fromTitle: string,
    autoReview?: boolean
  ): Promise<void> {
    const stepsText = plan.steps
      .map((s, i) => `${i + 1}. [${s.id}] ${s.title}${s.detail ? `: ${s.detail}` : ''}`)
      .join('\n');
    const prompt = `[Plan from ${fromTitle}: ${plan.title}] (planId: ${plan.id})\n${plan.summary}\n\nSteps:\n${stepsText}\n\nAs you complete each step, call update_plan_step(planId="${plan.id}", stepId, true) to report progress.`;

    this.appendMessage(worker.id, {
      id: uid('msg'),
      windowId: worker.id,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      plan,
      dispatchedFrom: {
        windowId: plan.sourceOrchestratorId,
        windowTitle: fromTitle
      }
    });

    const execStartedAt = Date.now();
    await this.runWindowTurn(worker, prompt);
    const execCompletedAt = Date.now();

    const workerMessages = this.messagesByWindow.get(worker.id) ?? [];
    const lastAssistantMsg = [...workerMessages]
      .reverse()
      .find((m) => m.role === 'assistant');

    const latestPlan = this.plans.get(plan.id) ?? plan;
    const completedPlan: PlanSpec = {
      ...latestPlan,
      status: 'completed',
      executionStats: {
        workerTitle: worker.title,
        model: lastAssistantMsg?.meta?.model || worker.model,
        durationMs: lastAssistantMsg?.workDurationMs ?? Math.max(0, execCompletedAt - execStartedAt),
        inputTokens: lastAssistantMsg?.meta?.inputTokens,
        outputTokens: lastAssistantMsg?.meta?.outputTokens,
        cacheReadTokens: lastAssistantMsg?.meta?.cacheReadTokens,
        completedAt: execCompletedAt
      }
    };
    this.persistPlan(completedPlan);
    this.emit({ type: 'plan_updated', plan: completedPlan });

    if (autoReview && plan.targetReviewerId) {
      await this.requestReview({
        planId: plan.id,
        workerWindowId: worker.id,
        reviewerWindowId: plan.targetReviewerId,
        summary: `Worker "${worker.title}" finished executing plan "${plan.title}".`
      });
    } else {
      const task = Array.from(this.tasks.values()).find((t) => t.planId === plan.id);
      if (task) {
        task.status = 'ready';
        task.updatedAt = Date.now();
        this.persistState();
        this.emit({ type: 'task_updated', task: { ...task } });
      }
      void this.notifyMasterPlanCompleted(completedPlan, worker).catch((err) => {
        console.error('[archpi] Failed to notify master on plan completion:', err);
      });
    }
  }

  private async notifyMasterPlanCompleted(plan: PlanSpec, worker: AliveWindow): Promise<void> {
    const sourceOrch = this.windows.get(plan.sourceOrchestratorId);
    if (!sourceOrch || sourceOrch.archived || sourceOrch.id === worker.id) return;

    if (sourceOrch.status === 'working') return;

    const workerMsgs = this.messagesByWindow.get(worker.id) ?? [];
    const lastAssistant = [...workerMsgs]
      .reverse()
      .find((m) => m.role === 'assistant' && m.content.trim().length > 0);
    const workerOutput = lastAssistant
      ? lastAssistant.content.trim().slice(0, 1800)
      : '(No text output)';

    const latestPlan = this.plans.get(plan.id) ?? plan;
    const doneSteps = latestPlan.steps.filter((s) => s.done).length;
    const totalSteps = latestPlan.steps.length;

    const reportPrompt = [
      '[Worker Completion Report]',
      `Worker "${worker.title}" finished plan "${latestPlan.title}" (steps ${doneSteps}/${totalSteps}).`,
      '',
      'Worker final output:',
      workerOutput,
      '',
      'Briefly summarize the result for the user in 1-3 concise sentences (do not repeat internal window/plan IDs or raw step counters unless a step failed). Only create a new ```archpi-plan``` if further follow-up work is actually required.'
    ].join('\n');

    await this.runWindowTurn(sourceOrch, reportPrompt);
  }

  private async drainInboxQueue(win: AliveWindow): Promise<void> {
    if (win.inboxQueue.length === 0) return;
    const next = win.inboxQueue.shift()!;
    this.persistState();
    this.emit({ type: 'window_updated', window: { ...win } });
    await this.executeDispatchedPlan(
      win,
      next.plan,
      next.fromWindowTitle,
      Boolean(next.plan.targetReviewerId)
    );
  }

  async requestReview(input: {
    planId: string;
    workerWindowId: string;
    reviewerWindowId: string;
    summary?: string;
  }): Promise<void> {
    const worker = this.windows.get(input.workerWindowId);
    const reviewer = this.windows.get(input.reviewerWindowId);
    if (!reviewer) throw new Error(`Reviewer window ${input.reviewerWindowId} not found`);

    const task = Array.from(this.tasks.values()).find((t) => t.planId === input.planId);
    if (task) {
      task.status = 'in_review';
      task.reviewerWindowId = reviewer.id;
      task.updatedAt = Date.now();
      this.persistState();
      this.emit({ type: 'task_updated', task: { ...task } });
    }

    const reviewPrompt = `[Review Request for ${worker?.title || input.workerWindowId}]\n${
      input.summary || 'Please inspect the latest changes and verify acceptance criteria.'
    }`;

    this.appendMessage(reviewer.id, {
      id: uid('msg'),
      windowId: reviewer.id,
      role: 'user',
      content: reviewPrompt,
      timestamp: Date.now(),
      dispatchedFrom: {
        windowId: input.workerWindowId,
        windowTitle: worker?.title || 'Worker'
      }
    });

    await this.runWindowTurn(reviewer, reviewPrompt);

    if (task) {
      task.status = 'ready';
      task.updatedAt = Date.now();
      this.persistState();
      this.emit({ type: 'task_updated', task: { ...task } });
    }
  }
}
