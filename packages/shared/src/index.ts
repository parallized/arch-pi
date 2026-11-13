export type WindowRole = 'master' | 'worker';

export type WindowStatus = 'idle' | 'working' | 'needs_you' | 'in_review' | 'ready';

export type TaskStatus = 'planning' | 'working' | 'in_review' | 'ready' | 'needs_you';

export interface ProjectInfo {
  id: string;
  name: string;
  rootPath: string;
  branch: string;
  createdAt: number;
}

export interface PlanStep {
  id: string;
  title: string;
  detail: string;
  done: boolean;
}

export interface PlanExecutionStats {
  workerTitle?: string;
  model?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  completedAt?: number;
}

export interface PlanSpec {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  steps: PlanStep[];
  acceptanceCriteria: string[];
  targetWorkerId?: string;
  targetReviewerId?: string;
  sourceOrchestratorId: string;
  status: 'draft' | 'dispatched' | 'completed' | 'changes_requested' | 'approved';
  createdAt: number;
  executionStats?: PlanExecutionStats;
}

export interface ReviewVerdict {
  id: string;
  planId: string;
  workerWindowId: string;
  reviewerWindowId: string;
  verdict: 'PASS' | 'CHANGES_REQUESTED';
  summary: string;
  comments: string[];
  createdAt: number;
}

export type ToolActivityCategory =
  | 'thinking'
  | 'read'
  | 'search'
  | 'run'
  | 'edit'
  | 'plan'
  | 'other';

export interface ToolActivityStep {
  id: string;
  kind?: 'tool' | 'thinking';
  toolName: string;
  category: ToolActivityCategory;
  verb: string;
  target: string;
  text?: string;
  detail?: string;
  addedLines?: number;
  removedLines?: number;
  status: 'running' | 'done' | 'error';
  startedAt: number;
  endedAt?: number;
}

export interface ChatMessageMeta {
  model?: string;
  thinkingLevel?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  ttftMs?: number;
  tokensPerSec?: number;
}

export interface ChatMessage {
  id: string;
  windowId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  meta?: ChatMessageMeta;
  activitySteps?: ToolActivityStep[];
  workDurationMs?: number;
  plan?: PlanSpec;
  review?: ReviewVerdict;
  dispatchedFrom?: {
    windowId: string;
    windowTitle: string;
  };
}

export interface QueuedTask {
  id: string;
  plan: PlanSpec;
  fromWindowId: string;
  fromWindowTitle: string;
  enqueuedAt: number;
}

export interface AliveWindow {
  id: string;
  projectId: string;
  title: string;
  titleManual?: boolean;
  role: WindowRole;
  status: WindowStatus;
  branch: string;
  model: string;
  providerId?: string;
  contextSummary: string;
  unreadCount: number;
  inboxQueue: QueuedTask[];
  updatedAt: number;
  archived?: boolean;
}

export interface TaskCard {
  id: string;
  projectId: string;
  planId?: string;
  title: string;
  branch: string;
  status: TaskStatus;
  assignedWindowId?: string;
  reviewerWindowId?: string;
  prLabel?: string;
  updatedAt: number;
}

export type CustomProviderProtocol =
  | 'openai-compatible'
  | 'openai-responses'
  | 'anthropic-compatible'
  | 'gemini-compatible'
  | 'system-one';

export type ThinkingLevel =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | 'ultra';

export interface ProviderModelConfig {
  id: string;
  contextWindow?: number;
  thinkingLevel?: ThinkingLevel;
  thinkingLevels?: ThinkingLevel[];
  apiKeyId?: string;
}

export interface ProviderApiKey {
  id: string;
  key: string;
  rate?: number;
}

export interface ProviderConfig {
  provider: 'anthropic' | 'openai' | 'google' | 'openai-compatible';
  modelId: string;
  models?: string[];
  modelConfigs?: ProviderModelConfig[];
  contextWindow?: number;
  thinkingLevel?: ThinkingLevel;
  rate?: number;
  apiKey: string;
  apiKeys?: ProviderApiKey[];
  antigravityAuth?: {
    mode: 'cli' | 'oauth' | 'token' | 'json';
    email?: string;
    refreshToken?: string;
  };
  baseUrl?: string;
  customName?: string;
  protocol?: CustomProviderProtocol;
  icon?: string;
  advanced?: {
    timeoutMs?: number;
    customHeaders?: string;
    extraEndpoints?: string;
  };
}

export interface VoiceInputConfig {
  enabled: boolean;
  provider: 'siliconflow' | 'groq' | 'openai-compatible';
  endpoint: string;
  modelId: string;
  apiKey: string;
  mode: 'click' | 'hold';
}

export interface SavedProviderEntry {
  id: string;
  config: ProviderConfig;
}

export interface RoleModelEntry {
  id: string;
  providerId?: string;
  thinkingLevel?: ThinkingLevel;
}

export interface RoleModelConfig {
  models: string[];
  entries: RoleModelEntry[];
  defaultModel?: string;
  thinkingLevel?: ThinkingLevel;
}

export type RoleModelsMap = Record<WindowRole, RoleModelConfig>;

export interface ModelsDevCache {
  syncedAt: number;
  modelCount: number;
  contextByModel: Record<string, number>;
  thinkingLevelsByModel?: Record<string, ThinkingLevel[]>;
}

export interface AgyQuotaItem {
  percentage: number;
  resetTime?: string;
}

export interface AgyGroupQuotaSummary {
  key: 'gemini' | 'claude' | 'argon';
  label: string;
  fiveHour?: AgyQuotaItem;
  weekly?: AgyQuotaItem;
  isWeeklyExhausted?: boolean;
}

export interface AgyAccountQuota {
  fetchedAt: number;
  tier?: 'free' | 'pro' | 'ultra' | 'enterprise';
  groups: AgyGroupQuotaSummary[];
  availableModels?: string[];
  warmupTargets?: {
    gemini?: string;
    claude?: string;
    argon?: string;
  };
  error?: string;
}

export interface ProviderBalanceInfo {
  fetchedAt: number;
  balance?: number;
  unit?: string;
  planName?: string;
  todayCost?: number;
  totalCost?: number;
  error?: string;
}

export interface BalanceAlertThresholds {
  low: number;
  medium: number;
}

export interface QuotaLimits {
  limit5h: number;
  limit7d: number;
  resetAt?: number;
}

export type SendShortcutMode = 'enter' | 'mod_enter';
export type ChatFontSize = 'sm' | 'md' | 'lg';
export type StartupViewPreference = 'board' | 'workspace';

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

export interface UserSettings {
  language?: 'zh' | 'en';
  savedProviders?: SavedProviderEntry[];
  activeProviderId?: string | null;
  roleModels?: RoleModelsMap;
  modelsDevCache?: ModelsDevCache | null;
  quotaLimits?: QuotaLimits;
  quotaAutoRefreshEnabled?: boolean;
  quotaAutoRefreshIntervalMinutes?: number;
  agyQuotaByProviderId?: Record<string, AgyAccountQuota>;
  providerBalanceByProviderId?: Record<string, ProviderBalanceInfo>;
  balanceAlertThresholds?: BalanceAlertThresholds;

  // General preferences
  sendShortcut?: SendShortcutMode;
  spaceToRecord?: boolean;
  defaultExpandThinking?: boolean;
  defaultExpandToolSteps?: boolean;
  desktopNotifications?: boolean;
  notifyOnlyWhenUnfocused?: boolean;
  rememberWindowBounds?: boolean;
  windowBounds?: WindowBounds;
  defaultStartupView?: StartupViewPreference;
  defaultNewWindowRole?: WindowRole;
  chatFontSize?: ChatFontSize;
  useSystemFont?: boolean;
  autoGenerateTitle?: boolean;
  defaultAutoReview?: boolean;
  bashTimeoutSeconds?: number;
}

export interface AppSnapshot {
  projects: ProjectInfo[];
  windows: AliveWindow[];
  tasks: TaskCard[];
  messagesByWindow: Record<string, ChatMessage[]>;
  providerConfig: ProviderConfig;
  voiceConfig: VoiceInputConfig;
  settings?: UserSettings;
}

export interface CreateWindowInput {
  projectId: string;
  title: string;
  role: WindowRole;
  branch?: string;
  model?: string;
  providerId?: string;
}

export interface DispatchPlanInput {
  plan: PlanSpec;
  targetWorkerId: string;
  targetReviewerId?: string;
  autoReview?: boolean;
}

export type ArchpiEvent =
  | { type: 'snapshot'; snapshot: AppSnapshot }
  | { type: 'window_updated'; window: AliveWindow }
  | { type: 'message_added'; windowId: string; message: ChatMessage }
  | { type: 'message_delta'; windowId: string; messageId: string; delta: string }
  | { type: 'message_activity'; windowId: string; messageId: string; step: ToolActivityStep }
  | { type: 'message_done'; windowId: string; messageId: string; message: ChatMessage }
  | { type: 'task_updated'; task: TaskCard }
  | { type: 'plan_updated'; plan: PlanSpec };

export interface ArchpiApi {
  getSnapshot: () => Promise<AppSnapshot>;
  createProject: (input: { name: string; rootPath: string; branch?: string }) => Promise<ProjectInfo>;
  createWindow: (input: CreateWindowInput) => Promise<AliveWindow>;
  renameWindow: (windowId: string, title: string) => Promise<AliveWindow | null>;
  archiveWindow: (windowId: string, archived?: boolean) => Promise<AliveWindow | null>;
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
  syncProviderConfigs: (configs: ProviderConfig[]) => Promise<void>;
  updateVoiceConfig: (config: VoiceInputConfig) => Promise<void>;
  updateSettings: (patch: Partial<UserSettings>) => Promise<UserSettings>;
  testAgyModels: (
    refreshToken?: string
  ) => Promise<{ ok: boolean; output?: string; filePath: string; error?: string }>;
  fetchAgyModels: (
    refreshToken?: string
  ) => Promise<{ ok: boolean; models?: string[]; error?: string }>;
  importAgyFromCli: () => Promise<{
    ok: boolean;
    email?: string;
    models?: string[];
    error?: string;
  }>;
  startAgyOAuth: () => Promise<{
    ok: boolean;
    email?: string;
    refreshToken?: string;
    models?: string[];
    error?: string;
  }>;
  fetchAgyQuota: (refreshToken?: string) => Promise<{
    ok: boolean;
    quota?: AgyAccountQuota;
    error?: string;
  }>;
  fetchProviderBalance: (input: { baseUrl: string; apiKey: string }) => Promise<{
    ok: boolean;
    info?: ProviderBalanceInfo;
    error?: string;
  }>;
  warmupAgyAccount: (
    refreshToken?: string,
    models?: string[]
  ) => Promise<{
    ok: boolean;
    warmedModels?: string[];
    error?: string;
  }>;
  selectDirectory: () => Promise<string | null>;
  windowMinimize: () => Promise<void>;
  windowToggleMaximize: () => Promise<boolean>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  onEvent: (callback: (event: ArchpiEvent) => void) => () => void;
}

export const WINDOW_TITLE_MAX_UNITS = 24; // ~12 CJK chars or ~24 English chars
export const WINDOW_TITLE_MIN_UNITS = 12; // 50% of max (~6 CJK chars or ~12 English chars)

export function measureTitleUnits(text: string): number {
  let units = 0;
  for (const ch of text) {
    units += (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1;
  }
  return units;
}

export function clampWindowTitle(
  text: string,
  maxUnits = WINDOW_TITLE_MAX_UNITS
): string {
  let units = 0;
  let result = '';
  for (const ch of text) {
    const chUnits = (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1;
    if (units + chUnits > maxUnits) break;
    result += ch;
    units += chUnits;
  }
  return result.trim();
}

export function isGeminiModel(modelId?: string): boolean {
  return Boolean(modelId && /gemini/i.test(modelId));
}
