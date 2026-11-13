import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Check,
  Eye,
  EyeClosed,
  Flash,
  Globe,
  HardDrive,
  Key,
  NavArrowDown,
  Plus,
  Refresh,
  Star,
  StarSolid,
  Xmark
} from 'iconoir-react';
import type {
  ChatFontSize,
  CustomProviderProtocol,
  ProviderApiKey,
  ProviderConfig,
  ProviderModelConfig,
  SavedProviderEntry,
  SendShortcutMode,
  StartupViewPreference,
  ThinkingLevel,
  VoiceInputConfig,
  WindowRole
} from '@archpi/shared';
import { useArchpiStore, type AppLanguage } from '../store/useArchpiStore';
import {
  AgyQuotaRing,
  MoneyAmount,
  extractAgyQuotaRingItems,
  getBalanceRingColor
} from './AgyQuotaRings';
import { GlowSelect, type GlowSelectOption } from './GlowSelect';
import { ProviderIcon, ProviderIconPicker } from './ProviderIconPicker';
import {
  isModelsDevStale,
  lookupModelContextWindow,
  lookupModelThinkingLevels,
  syncModelsDev
} from '../utils/modelsDev';
import type { RoleModelConfig, RoleModelsMap } from '../utils/roleModels';
import { useT } from '../i18n';

const THINKING_LEVEL_OPTIONS: GlowSelectOption[] = [
  { value: '', label: '置空' },
  { value: 'none', label: 'none' },
  { value: 'minimal', label: 'minimal' },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' },
  { value: 'xhigh', label: 'xhigh' },
  { value: 'max', label: 'max' },
  { value: 'ultra', label: 'ultra' }
];

const QUOTA_REFRESH_INTERVAL_OPTIONS: GlowSelectOption[] = [
  { value: '5', label: '5 分钟' },
  { value: '10', label: '10 分钟' },
  { value: '15', label: '15 分钟' },
  { value: '30', label: '30 分钟' },
  { value: '60', label: '60 分钟' }
];

interface ProviderCardMeta {
  id: ProviderConfig['provider'];
  name: string;
  subtitle: string;
  defaultModel: string;
  modelPlaceholder: string;
  accentDot: string;
}

const PROVIDER_CARDS: ProviderCardMeta[] = [
  {
    id: 'google',
    name: 'Gemini',
    subtitle: 'AntigravityCLI 本地授权 · 超长上下文与多模态',
    defaultModel: 'gemini-4-hydrogen-medium',
    modelPlaceholder: 'gemini-4-hydrogen-medium',
    accentDot: 'bg-sky-400'
  },
  {
    id: 'openai-compatible',
    name: '自定义供应商',
    subtitle: 'OneAPI / NewAPI / Ollama / 自定义网关',
    defaultModel: 'qwen2.5-coder:32b',
    modelPlaceholder: 'e.g. Qwen/Qwen2.5-Coder-32B-Instruct',
    accentDot: 'bg-amber-400'
  }
];

function createBlankProviderForm(
  provider: ProviderConfig['provider'] = 'google'
): ProviderConfig {
  return {
    provider,
    modelId: '',
    apiKey: '',
    customName: '',
    baseUrl: '',
    icon: provider === 'google' ? 'Antigravity' : undefined,
    models: [],
    modelConfigs: [],
    apiKeys: [],
    antigravityAuth: undefined,
    protocol: provider === 'openai-compatible' ? 'openai-compatible' : undefined
  };
}

const VOICE_PRESETS: Record<
  VoiceInputConfig['provider'],
  { label: string; endpoint: string; modelId: string }
> = {
  siliconflow: {
    label: 'SiliconFlow (推荐 · 免费 SenseVoiceSmall)',
    endpoint: 'https://api.siliconflow.cn/v1/audio/transcriptions',
    modelId: 'FunAudioLLM/SenseVoiceSmall'
  },
  groq: {
    label: 'Groq (Whisper Large v3 Turbo)',
    endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
    modelId: 'whisper-large-v3-turbo'
  },
  'openai-compatible': {
    label: 'OpenAI-Compatible (自定义)',
    endpoint: '',
    modelId: ''
  }
};

function createSilentTestWavBlob(): Blob {
  const sampleRate = 16000;
  const numSamples = 3200; // 0.2s
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  return new Blob([buffer], { type: 'audio/wav' });
}

interface BatchImportParsedItem {
  index: number;
  email?: string;
  token: string;
  customName: string;
  matchedProvider: 'google' | null;
  status: 'ready' | 'duplicate' | 'unmatched';
  reason?: string;
}

interface BatchImportParseResult {
  items: BatchImportParsedItem[];
  error: string | null;
}

function maskTokenPreview(token: string): string {
  if (token.length <= 16) return token;
  return `${token.slice(0, 10)}...${token.slice(-6)}`;
}

function parseBatchImportEntries(
  rawInput: string,
  existingProviders: SavedProviderEntry[]
): BatchImportParseResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { items: [], error: null };
  }

  const existingTokens = new Set<string>();
  for (const entry of existingProviders) {
    const rt = entry.config.antigravityAuth?.refreshToken?.trim();
    if (rt) existingTokens.add(rt);
    const key = entry.config.apiKey?.trim();
    if (key) existingTokens.add(key);
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(trimmed);
    if (typeof parsedRaw === 'string') {
      parsedRaw = JSON.parse(parsedRaw);
    }
  } catch {
    const lines = trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 0 && lines.some((l) => l.startsWith('1//'))) {
      parsedRaw = lines.map((line) => ({ refresh_token: line }));
    } else {
      return { items: [], error: 'JSON 解析失败，请检查格式' };
    }
  }

  const records: Array<Record<string, unknown>> = Array.isArray(parsedRaw)
    ? parsedRaw.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
    : parsedRaw && typeof parsedRaw === 'object'
    ? [parsedRaw as Record<string, unknown>]
    : [];

  if (records.length === 0) {
    return { items: [], error: '未识别到有效的 JSON 对象或数组' };
  }

  const seenInBatch = new Set<string>();
  const items: BatchImportParsedItem[] = records.map((rec, index) => {
    const rawEmail = typeof rec.email === 'string' ? rec.email.trim() : '';
    const rawToken =
      typeof rec.refresh_token === 'string'
        ? rec.refresh_token.trim()
        : typeof rec.refreshToken === 'string'
        ? rec.refreshToken.trim()
        : typeof rec.token === 'string'
        ? rec.token.trim()
        : '';

    if (!rawToken) {
      return {
        index,
        email: rawEmail || undefined,
        token: '',
        customName: (rawEmail || `item_${index + 1}`).slice(0, 10),
        matchedProvider: null,
        status: 'unmatched',
        reason: '缺少 refresh_token 字段'
      };
    }

    const customName = (rawEmail || rawToken).slice(0, 10);

    if (!rawToken.startsWith('1//')) {
      return {
        index,
        email: rawEmail || undefined,
        token: rawToken,
        customName,
        matchedProvider: null,
        status: 'unmatched',
        reason: '非 1// 开头的反重力 Token'
      };
    }

    if (existingTokens.has(rawToken) || seenInBatch.has(rawToken)) {
      return {
        index,
        email: rawEmail || undefined,
        token: rawToken,
        customName,
        matchedProvider: 'google',
        status: 'duplicate',
        reason: existingTokens.has(rawToken) ? '已存在相同凭证' : '导入列表中重复'
      };
    }

    seenInBatch.add(rawToken);
    return {
      index,
      email: rawEmail || undefined,
      token: rawToken,
      customName,
      matchedProvider: 'google',
      status: 'ready'
    };
  });

  return { items, error: null };
}

export const SettingsView: React.FC = () => {
  const {
    providerConfig,
    voiceConfig,
    savedProviders,
    activeProviderId: activeSavedProviderId,
    roleModels,
    modelsDevCache,
    settingsTab,
    language,
    setLanguage,
    userSettings,
    updateProviderConfig,
    updateVoiceConfig,
    updateSettings,
    quotaAutoRefreshEnabled,
    quotaAutoRefreshIntervalMinutes,
    agyQuotaByProviderId,
    providerBalanceByProviderId,
    balanceAlertThresholds,
    refreshingQuotaIds,
    warmingUpIds,
    refreshAgyQuota,
    refreshProviderBalance,
    refreshAllAgyQuotas,
    warmupAgyProvider
  } = useArchpiStore();
  const t = useT();

  const updateRoleModelConfig = (role: WindowRole, patch: Partial<RoleModelConfig>) => {
    const cur = roleModels[role] ?? { models: [], entries: [] };
    const next: RoleModelsMap = {
      ...roleModels,
      [role]: { ...cur, ...patch }
    };
    void updateSettings({ roleModels: next });
  };

  const { allConfiguredModelOptions, modelMetaById } = React.useMemo(() => {
    const seen = new Set<string>();
    const options: GlowSelectOption[] = [];
    const metaMap: Record<
      string,
      { providerName: string; rate?: number; thinkingLevels?: ThinkingLevel[] }
    > = {};

    for (const item of savedProviders) {
      const cardMeta = PROVIDER_CARDS.find((c) => c.id === item.config.provider);
      const providerName =
        item.config.customName?.trim() ||
        item.config.antigravityAuth?.email ||
        cardMeta?.name ||
        item.config.provider;

      const ids = [
        ...(item.config.models ?? []),
        ...(item.config.modelId ? [item.config.modelId] : [])
      ];

      for (const rawId of ids) {
        const id = rawId.trim();
        if (!id) continue;

        const modelCfg = item.config.modelConfigs?.find((c) => c.id === id);
        const matchedKey =
          modelCfg?.apiKeyId && item.config.apiKeys
            ? item.config.apiKeys.find((k) => k.id === modelCfg.apiKeyId)
            : item.config.apiKeys?.[0];
        const rate = matchedKey?.rate ?? item.config.rate;

        if (!seen.has(id)) {
          seen.add(id);
          metaMap[id] = {
            providerName,
            rate,
            thinkingLevels:
              modelCfg?.thinkingLevels && modelCfg.thinkingLevels.length > 0
                ? modelCfg.thinkingLevels
                : undefined
          };
          const rateText = rate !== undefined ? ` x${rate}` : '';
          options.push({
            value: id,
            label: id,
            badge:
              rate !== undefined ? (
                <span className="shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                  x{rate}
                </span>
              ) : undefined,
            rightLabel: (
              <span className="text-[11px] text-neutral-500">{providerName}</span>
            ),
            searchText: `${id}${rateText} ${providerName}`
          });
        }
      }
    }

    if (providerConfig.modelId?.trim() && !seen.has(providerConfig.modelId.trim())) {
      const id = providerConfig.modelId.trim();
      const cardMeta = PROVIDER_CARDS.find((c) => c.id === providerConfig.provider);
      const providerName =
        providerConfig.customName?.trim() ||
        providerConfig.antigravityAuth?.email ||
        cardMeta?.name ||
        providerConfig.provider;
      const rate = providerConfig.apiKeys?.[0]?.rate ?? providerConfig.rate;
      seen.add(id);
      metaMap[id] = { providerName, rate };
      const rateText = rate !== undefined ? ` x${rate}` : '';
      options.push({
        value: id,
        label: id,
        badge:
          rate !== undefined ? (
            <span className="shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
              x{rate}
            </span>
          ) : undefined,
        rightLabel: (
          <span className="text-[11px] text-neutral-500">{providerName}</span>
        ),
        searchText: `${id}${rateText} ${providerName}`
      });
    }

    return { allConfiguredModelOptions: options, modelMetaById: metaMap };
  }, [savedProviders, providerConfig]);
  const [editingSavedId, setEditingSavedId] = useState<string | 'new' | null>(null);
  const [providerForm, setProviderForm] = useState<ProviderConfig>(() =>
    createBlankProviderForm('google')
  );
  const [providerSaved, setProviderSaved] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig['provider'] | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [addingModel, setAddingModel] = useState(false);
  const [newModelId, setNewModelId] = useState('');
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const [agyImportInput, setAgyImportInput] = useState('');
  const [showAgyTokenInput, setShowAgyTokenInput] = useState(false);
  const [agyImportStatus, setAgyImportStatus] = useState<{
    text: string;
    tone: 'error' | 'success' | 'info';
  } | null>(null);
  const [importingAgy, setImportingAgy] = useState(false);
  const [probeMessage, setProbeMessage] = useState<{
    text: string;
    tone: 'error' | 'success' | 'info';
  } | null>(null);
  const [iconFetchMessage, setIconFetchMessage] = useState<{
    text: string;
    tone: 'error' | 'success';
  } | null>(null);
  const [syncingModelsDev, setSyncingModelsDev] = useState(false);
  const [modelsDevError, setModelsDevError] = useState<string | null>(null);
  const [autoFillNotice, setAutoFillNotice] = useState<string | null>(null);
  const [batchImportMode, setBatchImportMode] = useState(false);
  const [batchImportRaw, setBatchImportRaw] = useState('');
  const [batchImporting, setBatchImporting] = useState(false);
  const [batchImportStatus, setBatchImportStatus] = useState<{
    text: string;
    tone: 'error' | 'success' | 'info';
  } | null>(null);

  const batchImportPreview = React.useMemo(
    () => parseBatchImportEntries(batchImportRaw, savedProviders),
    [batchImportRaw, savedProviders]
  );

  const handleSyncModelsDev = async () => {
    if (syncingModelsDev) return;
    setSyncingModelsDev(true);
    setModelsDevError(null);
    try {
      const next = await syncModelsDev();
      await updateSettings({ modelsDevCache: next });
    } catch {
      setModelsDevError('同步 models.dev 失败，请检查网络');
    } finally {
      setSyncingModelsDev(false);
    }
  };

  useEffect(() => {
    if (settingsTab !== 'provider') return;
    if (isModelsDevStale(modelsDevCache)) {
      void handleSyncModelsDev();
    }
  }, [settingsTab]);

  const [voiceForm, setVoiceForm] = useState<VoiceInputConfig>(voiceConfig);
  const [voiceSaved, setVoiceSaved] = useState(false);
  const [testingVoice, setTestingVoice] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // FLIP animation for provider cards grid transitions
  const cardElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    if (settingsTab !== 'provider') return;

    const prevRects = prevRectsRef.current;
    if (prevRects.size === 0) {
      // First layout measurement
      cardElementsRef.current.forEach((el, id) => {
        prevRects.set(id, el.getBoundingClientRect());
      });
      return;
    }

    const currentRects = new Map<string, DOMRect>();
    cardElementsRef.current.forEach((el, id) => {
      currentRects.set(id, el.getBoundingClientRect());
    });

    currentRects.forEach((nextRect, id) => {
      const prevRect = prevRects.get(id);
      const el = cardElementsRef.current.get(id);
      if (!prevRect || !el) return;

      const deltaX = prevRect.left - nextRect.left;
      const deltaY = prevRect.top - nextRect.top;
      const scaleX = prevRect.width / Math.max(1, nextRect.width);
      const scaleY = prevRect.height / Math.max(1, nextRect.height);

      if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5 || Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01) {
        // Invert
        el.style.transformOrigin = 'top left';
        el.style.transition = 'none';
        el.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`;

        // Force reflow
        el.getBoundingClientRect();

        // Play
        requestAnimationFrame(() => {
          el.style.transition = 'transform 380ms cubic-bezier(0.16, 1, 0.3, 1)';
          el.style.transform = '';
        });
      }
    });

    // Record new rects for next update
    prevRectsRef.current = currentRects;
  }, [providerForm.provider, settingsTab]);

  useEffect(() => {
    setVoiceForm(voiceConfig);
  }, [voiceConfig]);

  const resetModalTransientState = () => {
    setProviderSaved(false);
    setShowApiKey(false);
    setShowAdvanced(false);
    setAddingModel(false);
    setNewModelId('');
    setRateDrafts({});
    setAgyImportInput('');
    setShowAgyTokenInput(false);
    setAgyImportStatus(null);
    setImportingAgy(false);
    setProbeMessage(null);
    setIconFetchMessage(null);
    setAutoFillNotice(null);
    setBatchImportMode(false);
    setBatchImportRaw('');
    setBatchImporting(false);
    setBatchImportStatus(null);
  };

  const closeProviderModal = () => {
    setEditingProvider(null);
    setEditingSavedId(null);
    resetModalTransientState();
  };

  const handleOpenAddProvider = () => {
    resetModalTransientState();
    setProviderForm(createBlankProviderForm('google'));
    setEditingSavedId('new');
    setEditingProvider('google');
  };

  const handleOpenEditSavedProvider = (item: SavedProviderEntry) => {
    resetModalTransientState();
    setProviderForm({ ...item.config });
    setEditingSavedId(item.id);
    setEditingProvider(item.config.provider);
  };

  const [pendingDeleteProvider, setPendingDeleteProvider] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const handleRequestDeleteProvider = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteProvider({ id, title });
  };

  const handleConfirmDeleteProvider = () => {
    if (!pendingDeleteProvider) return;
    const { id } = pendingDeleteProvider;
    setPendingDeleteProvider(null);
    const next = savedProviders.filter((item) => item.id !== id);
    const nextActive = activeSavedProviderId === id ? (next[0]?.id ?? null) : activeSavedProviderId;
    const nextQuotaMap = { ...agyQuotaByProviderId };
    delete nextQuotaMap[id];
    const nextBalanceMap = { ...providerBalanceByProviderId };
    delete nextBalanceMap[id];
    void updateSettings({
      savedProviders: next,
      activeProviderId: nextActive,
      agyQuotaByProviderId: nextQuotaMap,
      providerBalanceByProviderId: nextBalanceMap
    });
    void window.archpi?.syncProviderConfigs(next.map((item) => item.config));
    if (activeSavedProviderId === id && next[0]) {
      void updateProviderConfig(next[0].config);
    }
  };

  const handleSelectProvider = (nextProvider: ProviderConfig['provider']) => {
    if (editingSavedId && editingSavedId !== 'new') {
      return;
    }

    if (editingSavedId === 'new') {
      resetModalTransientState();
      setProviderForm(createBlankProviderForm(nextProvider));
      setEditingProvider(nextProvider);
      return;
    }

    if (providerForm.provider !== nextProvider) {
      const prevMeta = PROVIDER_CARDS.find((p) => p.id === providerForm.provider);
      const nextMeta = PROVIDER_CARDS.find((p) => p.id === nextProvider);
      const shouldReplaceModel =
        !providerForm.modelId.trim() || providerForm.modelId === prevMeta?.defaultModel;

      setProviderForm({
        ...providerForm,
        provider: nextProvider,
        modelId: shouldReplaceModel && nextMeta ? nextMeta.defaultModel : providerForm.modelId
      });
    }
    setProviderSaved(false);
    setShowApiKey(false);
    setProbeMessage(null);
    setIconFetchMessage(null);
    setEditingProvider(nextProvider);
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    const savedConfig: ProviderConfig = { ...providerForm };
    let targetId = editingSavedId && editingSavedId !== 'new' ? editingSavedId : `prov_${Date.now()}`;
    const nextList: SavedProviderEntry[] =
      editingSavedId && editingSavedId !== 'new'
        ? savedProviders.map((item) =>
            item.id === targetId ? { id: targetId, config: savedConfig } : item
          )
        : [...savedProviders, { id: targetId, config: savedConfig }];

    await updateSettings({
      savedProviders: nextList,
      activeProviderId: targetId
    });
    void window.archpi?.syncProviderConfigs(nextList.map((item) => item.config));

    await updateProviderConfig(savedConfig);
    setProviderSaved(true);
    closeProviderModal();
    setTimeout(() => setProviderSaved(false), 2000);
  };

  const handleBatchImport = async () => {
    if (batchImporting) return;
    const readyItems = batchImportPreview.items.filter((item) => item.status === 'ready');
    if (readyItems.length === 0) return;

    setBatchImporting(true);
    setBatchImportStatus({
      text: `正在导入 ${readyItems.length} 个反重力账号并获取模型列表...`,
      tone: 'info'
    });

    try {
      const baseTs = Date.now();
      const queue = [...readyItems];
      const results = new Map<number, { models: string[] }>();

      const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) break;
          let models: string[] = [];
          try {
            if (typeof window.archpi?.fetchAgyModels === 'function') {
              const res = await window.archpi.fetchAgyModels(item.token);
              if (res.ok && Array.isArray(res.models)) {
                models = res.models;
              }
            }
          } catch {
            // Keep empty models if fetching fails; user can refresh later
          }
          results.set(item.index, { models });
        }
      });

      await Promise.all(workers);

      const newEntries: SavedProviderEntry[] = readyItems.map((item, i) => {
        const models = results.get(item.index)?.models ?? [];
        const id = `prov_${baseTs}_${i}`;
        const config: ProviderConfig = {
          provider: 'google',
          icon: 'Antigravity',
          apiKey: item.token,
          customName: item.customName,
          models,
          modelId: models[0] ?? '',
          modelConfigs: [],
          apiKeys: [],
          antigravityAuth: {
            mode: 'json',
            email: item.email,
            refreshToken: item.token
          }
        };
        return { id, config };
      });

      const nextList = [...savedProviders, ...newEntries];
      const nextActiveId = activeSavedProviderId || newEntries[0]?.id || null;

      await updateSettings({
        savedProviders: nextList,
        activeProviderId: nextActiveId
      });
      void window.archpi?.syncProviderConfigs(nextList.map((entry) => entry.config));
      if (!activeSavedProviderId && newEntries[0]) {
        await updateProviderConfig(newEntries[0].config);
      }

      for (const entry of newEntries) {
        void refreshAgyQuota(entry.id);
      }

      setProviderSaved(true);
      closeProviderModal();
      setTimeout(() => setProviderSaved(false), 2000);
    } catch (err) {
      setBatchImportStatus({
        text: err instanceof Error ? `批量导入失败：${err.message}` : '批量导入失败',
        tone: 'error'
      });
    } finally {
      setBatchImporting(false);
    }
  };

  const handleVoiceProviderChange = (nextProvider: VoiceInputConfig['provider']) => {
    const preset = VOICE_PRESETS[nextProvider];
    setVoiceForm((prev) => ({
      ...prev,
      provider: nextProvider,
      endpoint: preset.endpoint || prev.endpoint,
      modelId: preset.modelId || prev.modelId
    }));
    setTestResult(null);
  };

  const handleSaveVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateVoiceConfig(voiceForm);
    setVoiceSaved(true);
    setTimeout(() => setVoiceSaved(false), 2000);
  };

  const handleTestVoiceConnection = async () => {
    if (!voiceForm.endpoint.trim() || !voiceForm.apiKey.trim()) {
      setTestResult({ ok: false, message: '请先填写 Endpoint 和 API Key' });
      return;
    }

    setTestingVoice(true);
    setTestResult(null);
    const t0 = performance.now();

    try {
      const formData = new FormData();
      formData.append('file', createSilentTestWavBlob(), 'test.wav');
      if (voiceForm.modelId.trim()) {
        formData.append('model', voiceForm.modelId.trim());
      }

      const res = await fetch(voiceForm.endpoint.trim(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${voiceForm.apiKey.trim()}`
        },
        body: formData
      });

      const elapsed = Math.round(performance.now() - t0);
      if (res.ok) {
        setTestResult({ ok: true, message: `连接成功 (${elapsed} ms)` });
      } else {
        const errText = await res.text().catch(() => '');
        setTestResult({
          ok: false,
          message: `HTTP ${res.status}${errText ? `: ${errText.slice(0, 80)}` : ''}`
        });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : '请求失败'
      });
    } finally {
      setTestingVoice(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      {/* Tab 0: 基础设置 */}
      {settingsTab === 'general' && (() => {
        const renderToggle = (
          label: string,
          desc: string,
          checked: boolean,
          onToggle: (next: boolean) => void,
          disabled = false
        ) => (
          <div className={`flex items-center justify-between gap-4 py-3 ${disabled ? 'opacity-45' : ''}`}>
            <div className="min-w-0">
              <div className="font-medium text-neutral-200">{label}</div>
              <p className="mt-0.5 text-[11px] text-neutral-400">{desc}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={checked}
              disabled={disabled}
              onClick={() => onToggle(!checked)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed ${
                checked ? 'bg-emerald-500/80' : 'bg-white/15'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}
              />
            </button>
          </div>
        );

        const renderSelect = (
          label: string,
          desc: string,
          value: string,
          options: GlowSelectOption[],
          onChange: (val: string) => void,
          icon?: React.ReactNode
        ) => (
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-medium text-neutral-200">
                {icon}
                <span>{label}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-neutral-400">{desc}</p>
            </div>
            <div className="shrink-0">
              <GlowSelect value={value} onChange={onChange} options={options} />
            </div>
          </div>
        );

        return (
          <div className="grid grid-cols-1 items-start gap-4 text-xs lg:grid-cols-2">
            {/* Left Column: 界面与排版 + 窗口与通知 */}
            <div className="space-y-4">
              {/* 1. 界面与排版 */}
              <div className="rounded-2xl bg-[#1a1a1a] px-5 py-2">
                <div className="border-b border-white/[0.06] py-2.5 text-[11px] font-semibold tracking-wide text-neutral-400">
                  {t.settings.generalGroups.appearance}
                </div>
                <div className="divide-y divide-white/[0.05]">
                  {renderSelect(
                    t.settings.languageLabel,
                    t.settings.languageDesc,
                    language,
                    [
                      { value: 'zh', label: '中文' },
                      { value: 'en', label: 'English' }
                    ],
                    (val) => setLanguage(val as AppLanguage),
                    <Globe className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  {renderSelect(
                    t.settings.chatFontSizeLabel,
                    t.settings.chatFontSizeDesc,
                    userSettings.chatFontSize ?? 'md',
                    [
                      { value: 'sm', label: t.settings.chatFontSizeSm },
                      { value: 'md', label: t.settings.chatFontSizeMd },
                      { value: 'lg', label: t.settings.chatFontSizeLg }
                    ],
                    (val) => void updateSettings({ chatFontSize: val as ChatFontSize })
                  )}
                  {renderToggle(
                    t.settings.useSystemFontLabel,
                    t.settings.useSystemFontDesc,
                    Boolean(userSettings.useSystemFont),
                    (next) => void updateSettings({ useSystemFont: next })
                  )}
                </div>
              </div>

              {/* 3. 窗口与通知 */}
              <div className="rounded-2xl bg-[#1a1a1a] px-5 py-2">
                <div className="border-b border-white/[0.06] py-2.5 text-[11px] font-semibold tracking-wide text-neutral-400">
                  {t.settings.generalGroups.windowAndNotify}
                </div>
                <div className="divide-y divide-white/[0.05]">
                  {renderSelect(
                    t.settings.defaultStartupViewLabel,
                    t.settings.defaultStartupViewDesc,
                    userSettings.defaultStartupView ?? 'board',
                    [
                      { value: 'board', label: t.settings.startupViewBoard },
                      { value: 'workspace', label: t.settings.startupViewWorkspace }
                    ],
                    (val) => void updateSettings({ defaultStartupView: val as StartupViewPreference })
                  )}
                  {renderSelect(
                    t.settings.defaultNewWindowRoleLabel,
                    t.settings.defaultNewWindowRoleDesc,
                    userSettings.defaultNewWindowRole ?? 'worker',
                    [
                      { value: 'worker', label: 'Worker' },
                      { value: 'master', label: 'Master' }
                    ],
                    (val) => void updateSettings({ defaultNewWindowRole: val as WindowRole })
                  )}
                  {renderToggle(
                    t.settings.rememberWindowBoundsLabel,
                    t.settings.rememberWindowBoundsDesc,
                    userSettings.rememberWindowBounds !== false,
                    (next) => void updateSettings({ rememberWindowBounds: next })
                  )}
                  {renderToggle(
                    t.settings.desktopNotificationsLabel,
                    t.settings.desktopNotificationsDesc,
                    userSettings.desktopNotifications !== false,
                    (next) => void updateSettings({ desktopNotifications: next })
                  )}
                  {renderToggle(
                    t.settings.notifyOnlyWhenUnfocusedLabel,
                    t.settings.notifyOnlyWhenUnfocusedDesc,
                    userSettings.notifyOnlyWhenUnfocused !== false,
                    (next) => void updateSettings({ notifyOnlyWhenUnfocused: next }),
                    userSettings.desktopNotifications === false
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: 输入与交互 + Agent 与工具 */}
            <div className="space-y-4">
              {/* 2. 输入与交互 */}
              <div className="rounded-2xl bg-[#1a1a1a] px-5 py-2">
                <div className="border-b border-white/[0.06] py-2.5 text-[11px] font-semibold tracking-wide text-neutral-400">
                  {t.settings.generalGroups.interaction}
                </div>
                <div className="divide-y divide-white/[0.05]">
                  {renderSelect(
                    t.settings.sendShortcutLabel,
                    t.settings.sendShortcutDesc,
                    userSettings.sendShortcut ?? 'enter',
                    [
                      { value: 'enter', label: t.settings.sendShortcutEnter },
                      { value: 'mod_enter', label: t.settings.sendShortcutModEnter }
                    ],
                    (val) => void updateSettings({ sendShortcut: val as SendShortcutMode })
                  )}
                  {renderToggle(
                    t.settings.spaceToRecordLabel,
                    t.settings.spaceToRecordDesc,
                    userSettings.spaceToRecord !== false,
                    (next) => void updateSettings({ spaceToRecord: next })
                  )}
                  {renderToggle(
                    t.settings.defaultExpandThinkingLabel,
                    t.settings.defaultExpandThinkingDesc,
                    Boolean(userSettings.defaultExpandThinking),
                    (next) => void updateSettings({ defaultExpandThinking: next })
                  )}
                  {renderToggle(
                    t.settings.defaultExpandToolStepsLabel,
                    t.settings.defaultExpandToolStepsDesc,
                    Boolean(userSettings.defaultExpandToolSteps),
                    (next) => void updateSettings({ defaultExpandToolSteps: next })
                  )}
                </div>
              </div>

              {/* 4. Agent 与工具 */}
              <div className="rounded-2xl bg-[#1a1a1a] px-5 py-2">
                <div className="border-b border-white/[0.06] py-2.5 text-[11px] font-semibold tracking-wide text-neutral-400">
                  {t.settings.generalGroups.agentAndTools}
                </div>
                <div className="divide-y divide-white/[0.05]">
                  {renderToggle(
                    t.settings.autoGenerateTitleLabel,
                    t.settings.autoGenerateTitleDesc,
                    userSettings.autoGenerateTitle !== false,
                    (next) => void updateSettings({ autoGenerateTitle: next })
                  )}
                  {renderToggle(
                    t.settings.defaultAutoReviewLabel,
                    t.settings.defaultAutoReviewDesc,
                    Boolean(userSettings.defaultAutoReview),
                    (next) => void updateSettings({ defaultAutoReview: next })
                  )}
                  {renderSelect(
                    t.settings.bashTimeoutLabel,
                    t.settings.bashTimeoutDesc,
                    String(userSettings.bashTimeoutSeconds ?? 30),
                    [
                      { value: '30', label: '30s' },
                      { value: '60', label: '60s' },
                      { value: '120', label: '120s' },
                      { value: '300', label: '300s' }
                    ],
                    (val) => void updateSettings({ bashTimeoutSeconds: Number(val) })
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Tab 1: 模型和供应商 */}
      {settingsTab === 'provider' && (
        <>
          {/* Master & Worker Available Models (2 Columns) */}
          <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {(['master', 'worker'] as WindowRole[]).map((role) => {
              const cfg = roleModels[role];
              const isMaster = role === 'master';
              const entries = cfg.entries;
              const remainingOptions = allConfiguredModelOptions.filter(
                (opt) => !entries.some((e) => e.id === opt.value)
              );

              const commitEntries = (
                nextEntries: typeof entries,
                nextDefault?: string
              ) => {
                const nextModels = nextEntries.map((e) => e.id);
                const resolvedDefault =
                  nextDefault !== undefined
                    ? nextDefault
                    : cfg.defaultModel && nextModels.includes(cfg.defaultModel)
                    ? cfg.defaultModel
                    : undefined;
                const defaultEntry = resolvedDefault
                  ? nextEntries.find((e) => e.id === resolvedDefault)
                  : undefined;

                updateRoleModelConfig(role, {
                  entries: nextEntries,
                  models: nextModels,
                  defaultModel: resolvedDefault,
                  thinkingLevel: defaultEntry?.thinkingLevel
                });
              };

              return (
                <div
                  key={role}
                  className="flex flex-col gap-3 rounded-2xl bg-[#141414] p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          isMaster
                            ? 'bg-purple-500/15 text-purple-300'
                            : 'bg-white/[0.08] text-neutral-300'
                        }`}
                      >
                        {isMaster ? 'Master' : 'Worker'}
                      </span>
                      <h3 className="text-xs font-medium text-neutral-200">
                        {t.settings.candidateModelsTitle}
                      </h3>
                    </div>
                    <span className="text-[11px] text-neutral-500">
                      {entries.length}
                    </span>
                  </div>

                  {/* Model List (Default pinned on top) */}
                  <div className="flex flex-col gap-1.5">
                    {[...entries]
                      .sort((a, b) => {
                        if (a.id === cfg.defaultModel) return -1;
                        if (b.id === cfg.defaultModel) return 1;
                        return 0;
                      })
                      .map((entry) => {
                      const isDefault = cfg.defaultModel === entry.id;
                      const meta = modelMetaById[entry.id];
                      const allowedLevels =
                        (meta?.thinkingLevels && meta.thinkingLevels.length > 0
                          ? meta.thinkingLevels
                          : undefined) ??
                        lookupModelThinkingLevels(modelsDevCache, entry.id);
                      const entryThinkingOptions =
                        allowedLevels && allowedLevels.length > 0
                          ? THINKING_LEVEL_OPTIONS.filter(
                              (o) =>
                                !o.value ||
                                allowedLevels.includes(o.value as ThinkingLevel)
                            )
                          : THINKING_LEVEL_OPTIONS;
                      return (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between gap-2 rounded-xl bg-[#101010] px-3 py-1.5"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span
                              title={entry.id}
                              className="truncate text-xs text-neutral-100"
                            >
                              {entry.id}
                            </span>
                            {meta?.rate !== undefined && (
                              <span className="shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                                x{meta.rate}
                              </span>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            {meta?.providerName && (
                              <span
                                title={meta.providerName}
                                className="hidden max-w-[100px] truncate text-right text-[11px] text-neutral-500 sm:inline"
                              >
                                {meta.providerName}
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                commitEntries(
                                  entries,
                                  isDefault ? '' : entry.id
                                )
                              }
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                                isDefault
                                  ? isMaster
                                    ? 'bg-purple-500/20 text-purple-200'
                                    : 'bg-white/[0.14] text-neutral-100'
                                  : 'bg-white/[0.04] text-neutral-500 hover:bg-white/[0.08] hover:text-neutral-300'
                              }`}
                            >
                              {isDefault ? (
                                <StarSolid className="h-3 w-3 text-amber-300" />
                              ) : (
                                <Star className="h-3 w-3" />
                              )}
                              <span>{t.settings.defaultBadge}</span>
                            </button>

                            <GlowSelect
                              size="sm"
                              value={entry.thinkingLevel ?? ''}
                              onChange={(val) => {
                                const nextLevel = val ? (val as ThinkingLevel) : undefined;
                                const nextEntries = entries.map((e) =>
                                  e.id === entry.id
                                    ? { ...e, thinkingLevel: nextLevel }
                                    : e
                                );
                                commitEntries(nextEntries);
                              }}
                              options={entryThinkingOptions}
                              placeholder={t.settings.selectThinking}
                            />

                            <button
                              type="button"
                              data-tooltip="移除模型"
                              onClick={() => {
                                const nextEntries = entries.filter((e) => e.id !== entry.id);
                                commitEntries(nextEntries);
                              }}
                              className="rounded p-1 text-neutral-600 transition-colors hover:bg-white/5 hover:text-rose-400"
                            >
                              <Xmark className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Bottom Row: Add Model (Searchable) */}
                    <div className="pt-0.5">
                      <GlowSelect
                        fullWidth
                        searchable
                        searchPlaceholder="搜索模型或供应商..."
                        size="sm"
                        value=""
                        onChange={(val) => {
                          if (!val) return;
                          if (entries.some((e) => e.id === val)) return;
                          const nextEntries = [...entries, { id: val }];
                          commitEntries(nextEntries);
                        }}
                        options={remainingOptions}
                        placeholder={
                          allConfiguredModelOptions.length === 0
                            ? t.settings.noConfiguredModels
                            : remainingOptions.length === 0
                            ? '已添加全部可用模型'
                            : '+ 新增模型'
                        }
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {savedProviders.map((item) => {
              const meta = PROVIDER_CARDS.find((c) => c.id === item.config.provider);
              const title =
                item.config.customName?.trim() ||
                item.config.antigravityAuth?.email ||
                meta?.name ||
                item.config.provider;
              const subtitle =
                item.config.antigravityAuth?.email && item.config.customName?.trim()
                  ? `${item.config.antigravityAuth.email}${
                      item.config.models?.length ? ` · ${item.config.models.length} 个模型` : ''
                    }`
                  : item.config.modelId ||
                    (item.config.models?.length ? `${item.config.models.length} 个模型` : '') ||
                    item.config.baseUrl ||
                    meta?.subtitle ||
                    '';
              const isAgy = item.config.provider === 'google';
              const hasBalanceSupport =
                !isAgy &&
                Boolean(item.config.baseUrl?.trim()) &&
                Boolean(
                  item.config.apiKey?.trim() || item.config.apiKeys?.some((k) => k.key?.trim())
                );
              const quota = isAgy ? agyQuotaByProviderId[item.id] : undefined;
              const balanceInfo = hasBalanceSupport
                ? providerBalanceByProviderId[item.id]
                : undefined;
              const isRefreshingQuota = Boolean(refreshingQuotaIds[item.id]);
              const isWarmingUp = Boolean(warmingUpIds[item.id]);
              const quotaRows = isAgy ? extractAgyQuotaRingItems(quota) : [];

              return (
                <div
                  key={item.id}
                  ref={(el) => {
                    if (el) cardElementsRef.current.set(item.id, el);
                    else cardElementsRef.current.delete(item.id);
                  }}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenEditSavedProvider(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleOpenEditSavedProvider(item);
                    }
                  }}
                  className="group relative flex min-h-[220px] cursor-pointer flex-col items-start justify-between gap-3 overflow-hidden rounded-2xl bg-[#141414] p-5 text-left transition-colors will-change-transform hover:bg-[#1a1a1a]"
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-4 -right-4 select-none opacity-[0.06] transition-all duration-300 group-hover:scale-105 group-hover:opacity-[0.1]"
                  >
                    <ProviderIcon
                      icon={item.config.icon}
                      provider={item.config.provider}
                      size={128}
                    />
                  </div>

                  <div className="relative z-10 flex w-full items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5">
                        <ProviderIcon
                          icon={item.config.icon}
                          provider={item.config.provider}
                          size={18}
                        />
                      </div>
                      <span className="truncate text-xs font-semibold text-neutral-200">
                        {title}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {(isAgy || hasBalanceSupport) && (
                        <>
                          {isAgy && (
                            <button
                              type="button"
                              disabled={isWarmingUp}
                              onClick={(e) => {
                                e.stopPropagation();
                                void warmupAgyProvider(item.id);
                              }}
                              title="预热账号模型"
                              className={`rounded-lg p-1 transition-all hover:bg-white/10 disabled:opacity-60 ${
                                isWarmingUp
                                  ? 'animate-pulse text-amber-400 opacity-100'
                                  : 'text-neutral-500 opacity-0 hover:text-amber-400 group-hover:opacity-100'
                              }`}
                            >
                              <Flash className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isRefreshingQuota}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isAgy) {
                                void refreshAgyQuota(item.id);
                              } else {
                                void refreshProviderBalance(item.id);
                              }
                            }}
                            title={isAgy ? '刷新配额' : '刷新余额'}
                            className={`rounded-lg p-1 transition-all hover:bg-white/10 disabled:opacity-60 ${
                              isRefreshingQuota
                                ? 'text-sky-400 opacity-100'
                                : 'text-neutral-500 opacity-0 hover:text-neutral-200 group-hover:opacity-100'
                            }`}
                          >
                            <Refresh
                              className={`h-3.5 w-3.5 ${isRefreshingQuota ? 'animate-spin' : ''}`}
                            />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleRequestDeleteProvider(item.id, title, e)}
                        title="删除供应商"
                        className="rounded-lg p-1 text-neutral-600 opacity-0 transition-all hover:bg-white/10 hover:text-neutral-200 group-hover:opacity-100"
                      >
                        <Xmark className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {isAgy && (quotaRows.length > 0 || quota?.error) && (
                    <div className="relative z-10 flex w-full flex-col gap-2 py-1">
                      {quotaRows.length > 0 && (
                        <div className="flex flex-wrap items-center gap-4">
                          {quotaRows.map((row) => (
                            <AgyQuotaRing
                              key={row.key}
                              label={row.label}
                              title={row.title}
                              percentage={row.percentage}
                              resetTime={row.resetTime}
                            />
                          ))}
                        </div>
                      )}
                      {quota?.error && (
                        <p className="truncate text-[10px] text-rose-400" title={quota.error}>
                          {quota.error}
                        </p>
                      )}
                    </div>
                  )}

                  {hasBalanceSupport && (balanceInfo?.balance !== undefined || balanceInfo?.error) && (
                    <div className="relative z-10 flex w-full flex-col gap-1.5 py-1">
                      {balanceInfo?.balance !== undefined && (
                        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                          <div className="flex flex-col">
                            <span className="text-[10px] text-neutral-500">余额</span>
                            <span
                              className={`text-sm font-semibold tabular-nums ${
                                getBalanceRingColor(balanceInfo.balance, balanceAlertThresholds)
                                  .text
                              }`}
                              title={`${balanceInfo.balance} ${balanceInfo.unit || 'USD'}`}
                            >
                              <MoneyAmount value={balanceInfo.balance} unit={balanceInfo.unit} />
                            </span>
                          </div>
                          {balanceInfo.totalCost !== undefined && (
                            <div className="flex flex-col">
                              <span className="text-[10px] text-neutral-500">历史消耗</span>
                              <span
                                className="text-sm font-medium tabular-nums text-neutral-300"
                                title={`${balanceInfo.totalCost} ${balanceInfo.unit || 'USD'}`}
                              >
                                <MoneyAmount
                                  value={balanceInfo.totalCost}
                                  unit={balanceInfo.unit}
                                />
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      {balanceInfo?.error && (
                        <p
                          className="truncate text-[10px] text-rose-400"
                          title={balanceInfo.error}
                        >
                          {balanceInfo.error}
                        </p>
                      )}
                    </div>
                  )}

                  <p className="relative z-10 w-full truncate text-[11px] leading-relaxed text-neutral-500">
                    {subtitle}
                  </p>
                </div>
              );
            })}

            {/* 添加新配置卡片 */}
            <button
              type="button"
              onClick={handleOpenAddProvider}
              className="flex min-h-[220px] flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-white/10 bg-[#141414]/60 p-5 text-neutral-400 transition-colors hover:border-white/20 hover:bg-[#1a1a1a] hover:text-neutral-200"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5">
                <Plus className="h-4 w-4" />
              </div>
              <span>添加供应商</span>
            </button>
          </div>

          {providerSaved && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              <span>供应商配置已保存</span>
            </div>
          )}

          {/* models.dev 模型元数据同步 + 账号配额自动刷新 */}
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#141414] px-4 py-3 text-xs">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-neutral-200">models.dev 模型数据库</span>
                  <span className="text-[11px] text-neutral-500">每天自动同步</span>
                </div>
                <p className="truncate text-[11px] text-neutral-500">
                  {syncingModelsDev
                    ? '正在从 models.dev 同步模型上下文窗口数据...'
                    : modelsDevError
                    ? <span className="text-rose-400">{modelsDevError}</span>
                    : modelsDevCache
                    ? `已缓存 ${modelsDevCache.modelCount} 个模型 · 上次同步 ${new Date(modelsDevCache.syncedAt).toLocaleString()}`
                    : '尚未同步，同步后可在模型列表中自动获取上下文窗口'}
                </p>
              </div>
              <button
                type="button"
                disabled={syncingModelsDev}
                onClick={() => void handleSyncModelsDev()}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/5 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                <Refresh className={`h-3.5 w-3.5 ${syncingModelsDev ? 'animate-spin' : ''}`} />
                <span>{syncingModelsDev ? '同步中...' : '手动同步'}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#141414] px-4 py-3 text-xs">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-neutral-200">配额自动刷新</span>
                  <span className="text-[11px] text-neutral-500">
                    {quotaAutoRefreshEnabled
                      ? `每 ${quotaAutoRefreshIntervalMinutes} 分钟`
                      : '已关闭'}
                  </span>
                </div>
                <p className="truncate text-[11px] text-neutral-500">
                  后台定时刷新 Antigravity 账号配额与重置时间
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={quotaAutoRefreshEnabled}
                  onClick={() =>
                    void updateSettings({
                      quotaAutoRefreshEnabled: !quotaAutoRefreshEnabled
                    })
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                    quotaAutoRefreshEnabled ? 'bg-emerald-500/80' : 'bg-white/10'
                  }`}
                  title={quotaAutoRefreshEnabled ? '关闭自动刷新' : '开启自动刷新'}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      quotaAutoRefreshEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                    }`}
                  />
                </button>
                <div className="w-[92px]">
                  <GlowSelect
                    value={String(quotaAutoRefreshIntervalMinutes)}
                    options={QUOTA_REFRESH_INTERVAL_OPTIONS}
                    onChange={(val) => {
                      const mins = Number(val);
                      if (Number.isFinite(mins) && mins > 0) {
                        void updateSettings({ quotaAutoRefreshIntervalMinutes: mins });
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  disabled={Object.values(refreshingQuotaIds).some(Boolean)}
                  onClick={() => void refreshAllAgyQuotas()}
                  className="flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  <Refresh
                    className={`h-3.5 w-3.5 ${
                      Object.values(refreshingQuotaIds).some(Boolean) ? 'animate-spin' : ''
                    }`}
                  />
                  <span>刷新</span>
                </button>
              </div>
            </div>

            {/* 余额预警阈值设置 */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#141414] px-4 py-3 text-xs">
              <div className="min-w-0 space-y-0.5">
                <span className="font-medium text-neutral-200">余额预警阈值</span>
                <p className="truncate text-[11px] text-neutral-500">
                  控制侧边栏余额徽标环与供应商卡片的余额状态颜色
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <label className="flex items-center gap-1.5 text-[11px] text-rose-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-rose-400" />
                  <span>红色预警</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={balanceAlertThresholds.low}
                    onChange={(e) => {
                      const nextLow = Number(e.target.value);
                      if (!Number.isFinite(nextLow) || nextLow < 0) return;
                      const nextMedium = Math.max(nextLow, balanceAlertThresholds.medium);
                      void updateSettings({
                        balanceAlertThresholds: { low: nextLow, medium: nextMedium }
                      });
                    }}
                    className="w-12 rounded-lg border border-white/10 bg-black/40 px-1.5 py-1 text-center text-xs tabular-nums text-neutral-200 outline-none focus:border-white/25 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-amber-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                  <span>黄色预警</span>
                  <input
                    type="number"
                    min={balanceAlertThresholds.low}
                    step="any"
                    value={balanceAlertThresholds.medium}
                    onChange={(e) => {
                      const nextMedium = Number(e.target.value);
                      if (!Number.isFinite(nextMedium) || nextMedium < 0) return;
                      void updateSettings({
                        balanceAlertThresholds: {
                          low: Math.min(balanceAlertThresholds.low, nextMedium),
                          medium: nextMedium
                        }
                      });
                    }}
                    className="w-12 rounded-lg border border-white/10 bg-black/40 px-1.5 py-1 text-center text-xs tabular-nums text-neutral-200 outline-none focus:border-white/25 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* 删除供应商确认弹窗 */}
          {pendingDeleteProvider && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
              onClick={() => setPendingDeleteProvider(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1a1a1a] p-5 text-xs shadow-2xl"
              >
                <div className="text-sm font-semibold text-neutral-100">删除供应商</div>
                <p className="mt-2 leading-relaxed text-neutral-400">
                  确定要删除「
                  <span className="font-medium text-neutral-200">
                    {pendingDeleteProvider.title}
                  </span>
                  」吗？删除后将移除该供应商的凭证与模型配置，此操作不可撤销。
                </p>
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingDeleteProvider(null)}
                    className="rounded-xl bg-white/5 px-3.5 py-1.5 font-medium text-neutral-300 transition-colors hover:bg-white/10 hover:text-neutral-100"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteProvider}
                    className="rounded-xl bg-rose-500/85 px-3.5 py-1.5 font-medium text-white transition-colors hover:bg-rose-500"
                  >
                    确认删除
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 供应商配置弹窗 */}
          {editingProvider && (() => {
            const activeCard = PROVIDER_CARDS.find((c) => c.id === editingProvider);
            if (!activeCard) return null;

            return (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
                onClick={closeProviderModal}
              >
                <form
                  onSubmit={handleSaveProvider}
                  onClick={(e) => e.stopPropagation()}
                  className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-[#1a1a1a] text-xs shadow-2xl md:flex-row ${
                    editingSavedId === 'new' ? 'max-w-4xl' : 'max-w-3xl'
                  }`}
                >
                  {/* 左侧：仅新建时允许选择供应商类型 */}
                  {editingSavedId === 'new' && (
                    <aside className="w-full shrink-0 border-b border-white/5 bg-[#141414] p-4 md:w-56 md:border-b-0 md:border-r">
                      <div className="mb-3 px-1 text-[11px] font-medium text-neutral-400">
                        选择供应商类型
                      </div>
                      <div className="space-y-1.5">
                        {[
                          {
                            id: 'google' as const,
                            name: 'Gemini',
                            subtitle: 'AntigravityCLI 本地授权',
                            icon: 'Antigravity'
                          },
                          {
                            id: 'openai-compatible' as const,
                            name: '自定义供应商',
                            subtitle: 'OneAPI / NewAPI / Ollama',
                            icon: 'cpu'
                          }
                        ].map((item) => {
                          const selected = !batchImportMode && editingProvider === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelectProvider(item.id)}
                              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
                                selected
                                  ? 'bg-white/10 text-neutral-100'
                                  : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
                              }`}
                            >
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5">
                                <ProviderIcon icon={item.icon} provider={item.id} size={16} />
                              </div>
                              <div className="min-w-0">
                                <div className="truncate font-medium text-neutral-200">
                                  {item.name}
                                </div>
                                <div className="truncate text-[10px] text-neutral-500">
                                  {item.subtitle}
                                </div>
                              </div>
                            </button>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => {
                            resetModalTransientState();
                            setBatchImportMode(true);
                          }}
                          className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
                            batchImportMode
                              ? 'bg-white/10 text-neutral-100'
                              : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
                          }`}
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-sky-400">
                            <Plus className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-neutral-200">
                              批量导入
                            </div>
                            <div className="truncate text-[10px] text-neutral-500">
                              JSON 批量匹配导入
                            </div>
                          </div>
                        </button>
                      </div>
                    </aside>
                  )}

                  {/* 右侧：供应商配置表单 */}
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5">
                          {batchImportMode ? (
                            <Plus className="h-5 w-5 text-sky-400" />
                          ) : (
                            <ProviderIcon
                              icon={
                                providerForm.icon ??
                                (activeCard.id === 'google' ? 'Antigravity' : undefined)
                              }
                              provider={activeCard.id}
                              size={22}
                            />
                          )}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-neutral-100">
                            {batchImportMode
                              ? '批量导入'
                              : activeCard.id === 'google'
                              ? 'Gemini'
                              : activeCard.name}
                          </h3>
                          <p className="mt-0.5 text-[11px] text-neutral-400">
                            {batchImportMode
                              ? '粘贴 JSON 数组 · 自动识别 1// 开头的反重力凭证，供应商名称取前 10 字'
                              : activeCard.id === 'google'
                              ? 'AntigravityCLI 本地授权 · 超长上下文与多模态'
                              : activeCard.subtitle}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={closeProviderModal}
                        className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100"
                      >
                        <Xmark className="h-4 w-4" />
                      </button>
                    </div>

                  {batchImportMode ? (
                    <div className="space-y-4">
                      <div>
                        <label className="mb-1.5 block font-medium text-neutral-300">
                          粘贴 JSON 数据
                        </label>
                        <textarea
                          rows={7}
                          autoFocus
                          value={batchImportRaw}
                          onChange={(e) => {
                            setBatchImportRaw(e.target.value);
                            if (batchImportStatus) setBatchImportStatus(null);
                          }}
                          placeholder={`[\n  {\n    "email": "example@gmail.com",\n    "refresh_token": "1//..."\n  }\n]`}
                          className="w-full resize-y rounded-xl bg-[#111111] px-3.5 py-2.5 text-xs leading-relaxed text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                        />
                        <p className="mt-1.5 text-[11px] text-neutral-500">
                          支持包含 email 与 refresh_token / refreshToken 字段的 JSON 数组或对象。
                        </p>
                      </div>

                      {batchImportPreview.error && (
                        <div className="rounded-xl bg-rose-500/10 px-3.5 py-2.5 text-[11px] text-rose-400">
                          {batchImportPreview.error}
                        </div>
                      )}

                      {batchImportPreview.items.length > 0 && (() => {
                        const readyCount = batchImportPreview.items.filter(
                          (item) => item.status === 'ready'
                        ).length;
                        const duplicateCount = batchImportPreview.items.filter(
                          (item) => item.status === 'duplicate'
                        ).length;
                        const unmatchedCount = batchImportPreview.items.filter(
                          (item) => item.status === 'unmatched'
                        ).length;

                        return (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                              <span className="font-medium text-neutral-300">
                                识别预览（共 {batchImportPreview.items.length} 条）
                              </span>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-emerald-400">
                                  可导入 {readyCount} 条
                                </span>
                                {duplicateCount > 0 && (
                                  <span className="text-amber-400">
                                    · 已存在跳过 {duplicateCount} 条
                                  </span>
                                )}
                                {unmatchedCount > 0 && (
                                  <span className="text-rose-400">
                                    · 未匹配 {unmatchedCount} 条
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="max-h-56 divide-y divide-white/5 overflow-y-auto rounded-xl bg-[#111111]">
                              {batchImportPreview.items.map((item) => (
                                <div
                                  key={`${item.index}-${item.token}`}
                                  className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                                >
                                  <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5">
                                      <ProviderIcon
                                        icon={item.matchedProvider === 'google' ? 'Antigravity' : undefined}
                                        provider={item.matchedProvider ?? 'openai-compatible'}
                                        size={15}
                                      />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="truncate text-xs font-medium text-neutral-200">
                                          {item.customName}
                                        </span>
                                        {item.email && (
                                          <span className="truncate text-[10px] text-neutral-500">
                                            {item.email}
                                          </span>
                                        )}
                                      </div>
                                      <div className="truncate font-mono text-[10px] text-neutral-500">
                                        {item.token ? maskTokenPreview(item.token) : '无 Token'}
                                      </div>
                                    </div>
                                  </div>

                                  <span
                                    className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium ${
                                      item.status === 'ready'
                                        ? 'bg-emerald-500/15 text-emerald-400'
                                        : item.status === 'duplicate'
                                        ? 'bg-amber-500/15 text-amber-400'
                                        : 'bg-rose-500/15 text-rose-400'
                                    }`}
                                  >
                                    {item.status === 'ready'
                                      ? '反重力 · 待导入'
                                      : item.reason || '已跳过'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {batchImportStatus && (
                        <div
                          className={`rounded-xl px-3.5 py-2.5 text-[11px] ${
                            batchImportStatus.tone === 'error'
                              ? 'bg-rose-500/10 text-rose-400'
                              : batchImportStatus.tone === 'success'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-sky-500/10 text-sky-300'
                          }`}
                        >
                          {batchImportStatus.text}
                        </div>
                      )}
                    </div>
                  ) : activeCard.id === 'openai-compatible' ? (
                    <div className="space-y-4">
                      {/* 核心必填区 */}
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-[minmax(0,1fr)_auto]">
                          <div className="min-w-0">
                            <label className="mb-1.5 block font-medium text-neutral-300">
                              供应商名称
                            </label>
                            <input
                              type="text"
                              value={providerForm.customName ?? ''}
                              onChange={(e) =>
                                setProviderForm({ ...providerForm, customName: e.target.value })
                              }
                              placeholder="例如 My Relay"
                              className="w-full rounded-xl bg-[#111111] px-3.5 py-2.5 text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                            />
                          </div>

                          <div className="shrink-0">
                            <label className="mb-1.5 block font-medium text-neutral-300">
                              图标
                            </label>
                            <ProviderIconPicker
                              value={providerForm.icon}
                              provider={activeCard.id}
                              baseUrl={providerForm.baseUrl}
                              onChange={(icon) => setProviderForm({ ...providerForm, icon })}
                              dropdownAlign="right"
                              onStatusChange={setIconFetchMessage}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-3">
                          <div className="md:col-span-2">
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              <label className="font-medium text-neutral-300">
                                Base URL
                              </label>
                              {iconFetchMessage && (
                                <span
                                  className={`text-[11px] ${
                                    iconFetchMessage.tone === 'error'
                                      ? 'text-rose-300'
                                      : 'text-emerald-400'
                                  }`}
                                >
                                  {iconFetchMessage.text}
                                </span>
                              )}
                            </div>
                            <input
                              type="text"
                              value={providerForm.baseUrl ?? ''}
                              onChange={(e) => {
                                if (iconFetchMessage) setIconFetchMessage(null);
                                setProviderForm({ ...providerForm, baseUrl: e.target.value });
                              }}
                              placeholder="https://.../v1"
                              className="w-full rounded-xl bg-[#111111] px-3.5 py-2.5 text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="mb-1.5 block font-medium text-neutral-300">
                              接口协议
                            </label>
                            <GlowSelect
                              size="md"
                              fullWidth
                              value={providerForm.protocol ?? 'openai-compatible'}
                              onChange={(val) =>
                                setProviderForm({
                                  ...providerForm,
                                  protocol: val as CustomProviderProtocol
                                })
                              }
                              options={[
                                { value: 'openai-compatible', label: 'OpenAI 兼容' },
                                { value: 'openai-responses', label: 'OpenAI Responses' },
                                { value: 'anthropic-compatible', label: 'Anthropic 兼容' },
                                { value: 'gemini-compatible', label: 'Gemini 兼容' },
                                { value: 'system-one', label: 'System One' }
                              ]}
                            />
                          </div>
                        </div>

                        {(() => {
                          const apiKeyList: ProviderApiKey[] =
                            providerForm.apiKeys && providerForm.apiKeys.length > 0
                              ? providerForm.apiKeys
                              : [
                                  {
                                    id: 'key-1',
                                    key: providerForm.apiKey,
                                    rate: providerForm.rate
                                  }
                                ];

                          const commitKeys = (nextList: ProviderApiKey[]) => {
                            setProviderForm({
                              ...providerForm,
                              apiKeys: nextList,
                              apiKey: nextList[0]?.key ?? '',
                              rate: nextList[0]?.rate
                            });
                          };

                          const handleTestKey = async (entry: ProviderApiKey, index: number) => {
                            const url = providerForm.baseUrl?.trim().replace(/\/+$/, '');
                            if (!url) {
                              setProbeMessage({ text: '请先填写 Base URL', tone: 'error' });
                              return;
                            }
                            const prefix = apiKeyList.length > 1 ? `密钥 ${index + 1}` : '接口';
                            setProbeMessage({ text: `正在检测${prefix}...`, tone: 'info' });
                            try {
                              const res = await fetch(`${url}/models`, {
                                headers: entry.key.trim()
                                  ? { Authorization: `Bearer ${entry.key.trim()}` }
                                  : undefined
                              });
                              if (!res.ok) {
                                setProbeMessage({
                                  text: `${prefix}检测失败 (HTTP ${res.status})`,
                                  tone: 'error'
                                });
                                return;
                              }
                              setProbeMessage({
                                text: `${prefix}可用 · 连接正常`,
                                tone: 'success'
                              });
                              setTimeout(() => setProbeMessage(null), 2500);
                            } catch {
                              setProbeMessage({
                                text: `${prefix}检测失败，请检查 Base URL`,
                                tone: 'error'
                              });
                            }
                          };

                          return (
                            <div className="space-y-2 md:col-span-2">
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                <div className="flex items-center justify-between md:col-span-2">
                                  <div className="flex items-center gap-2">
                                    <label className="font-medium text-neutral-300">API 密钥</label>
                                    {probeMessage && (
                                      <span
                                        className={`text-[11px] ${
                                          probeMessage.tone === 'error'
                                            ? 'text-rose-300'
                                            : probeMessage.tone === 'info'
                                            ? 'text-neutral-400'
                                            : 'text-emerald-400'
                                        }`}
                                      >
                                        {probeMessage.text}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      commitKeys([
                                        ...apiKeyList,
                                        { id: `key-${Date.now().toString(36)}`, key: '' }
                                      ])
                                    }
                                    className="flex items-center gap-1 text-[11px] font-medium text-neutral-400 transition-colors hover:text-neutral-100"
                                  >
                                    <Plus className="h-3 w-3" />
                                    <span>添加更多密钥</span>
                                  </button>
                                </div>
                                <label
                                  className="hidden font-medium text-neutral-300 md:block"
                                  data-tooltip="1￥ 对应的美元倍率，默认 1x"
                                >
                                  倍率 <span className="font-normal text-neutral-500">(1￥ = $)</span>
                                </label>
                              </div>

                              <div className="space-y-2">
                                {apiKeyList.map((entry, index) => {
                                  const draftVal =
                                    rateDrafts[entry.id] ??
                                    (entry.rate !== undefined ? String(entry.rate) : '');

                                  return (
                                    <div
                                      key={entry.id}
                                      className="grid grid-cols-1 items-center gap-4 md:grid-cols-3"
                                    >
                                      <div className="relative flex items-center md:col-span-2">
                                        <input
                                          type={showApiKey ? 'text' : 'password'}
                                          value={entry.key}
                                          onChange={(e) => {
                                            const next = apiKeyList.map((k) =>
                                              k.id === entry.id ? { ...k, key: e.target.value } : k
                                            );
                                            commitKeys(next);
                                          }}
                                          placeholder={
                                            apiKeyList.length > 1
                                              ? `密钥 ${index + 1}（sk-...）`
                                              : '粘贴 API 密钥（sk-...）'
                                          }
                                          className="w-full rounded-xl bg-[#111111] py-2.5 pl-3.5 pr-10 text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => setShowApiKey((v) => !v)}
                                          className="absolute right-3 text-neutral-500 transition-colors hover:text-neutral-200"
                                          data-tooltip={showApiKey ? '隐藏密钥' : '显示密钥'}
                                        >
                                          {showApiKey ? (
                                            <EyeClosed className="h-4 w-4" />
                                          ) : (
                                            <Eye className="h-4 w-4" />
                                          )}
                                        </button>
                                      </div>

                                      <div className="flex items-center gap-1.5">
                                        <div className="relative flex flex-1 items-center">
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={draftVal}
                                            onChange={(e) => {
                                              const raw = e.target.value;
                                              if (!/^\d*\.?\d*$/.test(raw)) return;
                                              setRateDrafts((prev) => ({
                                                ...prev,
                                                [entry.id]: raw
                                              }));
                                              const parsed = raw ? Number(raw) : undefined;
                                              const nextRate =
                                                parsed !== undefined && Number.isFinite(parsed)
                                                  ? parsed
                                                  : undefined;
                                              const next = apiKeyList.map((k) =>
                                                k.id === entry.id ? { ...k, rate: nextRate } : k
                                              );
                                              commitKeys(next);
                                            }}
                                            placeholder="1"
                                            className="w-full rounded-xl bg-[#111111] py-2.5 pl-3.5 pr-7 text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                                          />
                                          <span className="pointer-events-none absolute right-3 text-xs text-neutral-500">
                                            x
                                          </span>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => void handleTestKey(entry, index)}
                                          className="shrink-0 rounded-xl bg-[#111111] px-3 py-2.5 text-[11px] font-medium text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
                                        >
                                          检测
                                        </button>

                                        {apiKeyList.length > 1 && (
                                          <button
                                            type="button"
                                            data-tooltip="移除密钥"
                                            onClick={() => {
                                              const next = apiKeyList.filter(
                                                (k) => k.id !== entry.id
                                              );
                                              commitKeys(next);
                                            }}
                                            className="rounded-lg p-1.5 text-neutral-600 transition-colors hover:bg-white/5 hover:text-rose-400"
                                          >
                                            <Xmark className="h-3.5 w-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* 模型配置区 */}
                      {(() => {
                        const modelList =
                          providerForm.models ??
                          (providerForm.modelId
                            ? providerForm.modelId
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean)
                            : []);

                        const handleAddManualModel = () => {
                          const trimmed = newModelId.trim();
                          if (!trimmed) return;
                          const nextList = modelList.includes(trimmed)
                            ? modelList
                            : [...modelList, trimmed];
                          setProviderForm({
                            ...providerForm,
                            models: nextList,
                            modelId: providerForm.modelId.trim() || trimmed
                          });
                          setNewModelId('');
                          setAddingModel(false);
                        };

                        const handleRemoveModel = (id: string) => {
                          const nextList = modelList.filter((m) => m !== id);
                          const nextActive =
                            providerForm.modelId === id
                              ? (nextList[0] ?? '')
                              : providerForm.modelId;
                          setProviderForm({
                            ...providerForm,
                            models: nextList,
                            modelId: nextActive
                          });
                        };

                        return (
                          <div>
                            <div className="mb-1.5 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <label className="font-medium text-neutral-300">模型列表</label>
                                {modelList.length > 0 && (
                                  <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-neutral-400">
                                    {modelList.length}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => setAddingModel((v) => !v)}
                                  className="flex items-center gap-1 text-[11px] font-medium text-neutral-400 transition-colors hover:text-neutral-100"
                                >
                                  <Plus className="h-3 w-3" />
                                  <span>手动添加</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const url = providerForm.baseUrl?.trim().replace(/\/+$/, '');
                                    if (!url) {
                                      setProbeMessage({ text: '请先填写 Base URL', tone: 'error' });
                                      return;
                                    }
                                    const activeKeys: ProviderApiKey[] =
                                      providerForm.apiKeys && providerForm.apiKeys.length > 0
                                        ? providerForm.apiKeys.filter((k) => k.key.trim())
                                        : providerForm.apiKey.trim()
                                        ? [{ id: 'key-1', key: providerForm.apiKey.trim(), rate: providerForm.rate }]
                                        : [];

                                    const targets =
                                      activeKeys.length > 0
                                        ? activeKeys
                                        : [{ id: 'key-1', key: '', rate: providerForm.rate }];

                                    setProbeMessage({ text: '正在获取模型...', tone: 'info' });
                                    try {
                                      const ownerByModel = new Map<string, { keyId: string; rate: number }>();
                                      const fetchedIds: string[] = [];
                                      let successCount = 0;
                                      let lastHttpError: number | null = null;

                                      await Promise.all(
                                        targets.map(async (entry) => {
                                          try {
                                            const res = await fetch(`${url}/models`, {
                                              headers: entry.key.trim()
                                                ? { Authorization: `Bearer ${entry.key.trim()}` }
                                                : undefined
                                            });
                                            if (!res.ok) {
                                              lastHttpError = res.status;
                                              return;
                                            }
                                            successCount += 1;
                                            const data = (await res.json()) as {
                                              data?: Array<{ id?: string }>;
                                            };
                                            const rateVal = entry.rate ?? 1;
                                            for (const m of data.data ?? []) {
                                              const mid = m.id?.trim();
                                              if (!mid) continue;
                                              fetchedIds.push(mid);
                                              const prevOwner = ownerByModel.get(mid);
                                              if (!prevOwner || rateVal < prevOwner.rate) {
                                                ownerByModel.set(mid, { keyId: entry.id, rate: rateVal });
                                              }
                                            }
                                          } catch {
                                            // Individual key request failed
                                          }
                                        })
                                      );

                                      if (successCount === 0) {
                                        setProbeMessage({
                                          text: lastHttpError
                                            ? `获取失败 (HTTP ${lastHttpError})`
                                            : '获取模型失败，请检查 Base URL',
                                          tone: 'error'
                                        });
                                        return;
                                      }

                                      const uniqueFetched = Array.from(new Set(fetchedIds));
                                      if (uniqueFetched.length === 0) {
                                        setProbeMessage({
                                          text: '接口未返回可用模型',
                                          tone: 'error'
                                        });
                                        return;
                                      }

                                      const merged = Array.from(new Set([...modelList, ...uniqueFetched]));
                                      const existingConfigs = providerForm.modelConfigs ?? [];
                                      const nextConfigs: ProviderModelConfig[] = merged.map((mid) => {
                                        const prev = existingConfigs.find((c) => c.id === mid);
                                        const owner = ownerByModel.get(mid);
                                        const autoCtx =
                                          prev?.contextWindow ??
                                          lookupModelContextWindow(modelsDevCache, mid);
                                        const autoLevels =
                                          prev?.thinkingLevels && prev.thinkingLevels.length > 0
                                            ? prev.thinkingLevels
                                            : lookupModelThinkingLevels(modelsDevCache, mid);
                                        return {
                                          ...prev,
                                          id: mid,
                                          apiKeyId: owner?.keyId ?? prev?.apiKeyId,
                                          ...(autoCtx ? { contextWindow: autoCtx } : {}),
                                          ...(autoLevels && autoLevels.length > 0
                                            ? {
                                                thinkingLevels: autoLevels,
                                                thinkingLevel: prev?.thinkingLevel ?? autoLevels[0]
                                              }
                                            : {})
                                        };
                                      });

                                      setProviderForm({
                                        ...providerForm,
                                        models: merged,
                                        modelConfigs: nextConfigs,
                                        modelId: merged.includes(providerForm.modelId)
                                          ? providerForm.modelId
                                          : uniqueFetched[0]
                                      });
                                      setProbeMessage({
                                        text:
                                          targets.length > 1
                                            ? `已从 ${successCount} 个密钥获取 ${uniqueFetched.length} 个模型`
                                            : `已获取 ${uniqueFetched.length} 个模型`,
                                        tone: 'success'
                                      });
                                    } catch {
                                      setProbeMessage({
                                        text: '获取模型失败，请检查 Base URL',
                                        tone: 'error'
                                      });
                                    }
                                  }}
                                  className="flex items-center gap-1 text-[11px] font-medium text-neutral-400 transition-colors hover:text-neutral-100"
                                >
                                  <Refresh className="h-3 w-3" />
                                  <span>获取模型</span>
                                </button>
                              </div>
                            </div>

                            {addingModel && (
                              <div className="mb-2 flex items-center gap-2">
                                <input
                                  type="text"
                                  autoFocus
                                  value={newModelId}
                                  onChange={(e) => setNewModelId(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleAddManualModel();
                                    } else if (e.key === 'Escape') {
                                      setAddingModel(false);
                                      setNewModelId('');
                                    }
                                  }}
                                  placeholder="输入模型 ID，例如 gpt-4o"
                                  className="flex-1 rounded-xl border border-white/10 bg-[#111111] px-3 py-2 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-white/20 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={handleAddManualModel}
                                  className="rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-neutral-100 transition-colors hover:bg-white/20"
                                >
                                  添加
                                </button>
                              </div>
                            )}

                            <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/5 bg-[#111111]">
                              {modelList.length > 0 ? (
                                modelList.map((id) => {
                                  const cfg: ProviderModelConfig =
                                    providerForm.modelConfigs?.find((m) => m.id === id) ?? { id };

                                  const updateModelConfig = (
                                    patch: Partial<ProviderModelConfig>
                                  ) => {
                                    const existing = providerForm.modelConfigs ?? [];
                                    const hasEntry = existing.some((m) => m.id === id);
                                    const nextConfigs = hasEntry
                                      ? existing.map((m) =>
                                          m.id === id ? { ...m, ...patch } : m
                                        )
                                      : [...existing, { id, ...patch }];
                                    setProviderForm({
                                      ...providerForm,
                                      models: modelList,
                                      modelConfigs: nextConfigs
                                    });
                                  };

                                  const matchedKeyIdx =
                                    cfg.apiKeyId && providerForm.apiKeys && providerForm.apiKeys.length > 1
                                      ? providerForm.apiKeys.findIndex((k) => k.id === cfg.apiKeyId)
                                      : -1;
                                  const matchedKey =
                                    matchedKeyIdx >= 0 && providerForm.apiKeys
                                      ? providerForm.apiKeys[matchedKeyIdx]
                                      : undefined;

                                  return (
                                    <div
                                      key={id}
                                      className="flex flex-wrap items-center gap-2 px-3 py-2"
                                    >
                                      <div className="flex min-w-0 flex-1 items-center gap-2">
                                        <span className="truncate text-[11px] text-neutral-200">
                                          {id}
                                        </span>
                                        {matchedKey && (
                                          <span
                                            data-tooltip={`使用密钥 ${matchedKeyIdx + 1}（倍率 ${matchedKey.rate ?? 1}x）`}
                                            className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-neutral-400"
                                          >
                                            密钥{matchedKeyIdx + 1} · {matchedKey.rate ?? 1}x
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          disabled={!modelsDevCache}
                                          data-tooltip={
                                            modelsDevCache
                                              ? '从 models.dev 自动获取上下文窗口与思考档位'
                                              : '需先同步 models.dev 数据'
                                          }
                                          onClick={() => {
                                            const ctx = lookupModelContextWindow(
                                              modelsDevCache,
                                              id
                                            );
                                            const levels = lookupModelThinkingLevels(
                                              modelsDevCache,
                                              id
                                            );
                                            if (ctx || levels) {
                                              updateModelConfig({
                                                ...(ctx ? { contextWindow: ctx } : {}),
                                                ...(levels
                                                  ? {
                                                      thinkingLevels: levels,
                                                      thinkingLevel: levels[0]
                                                    }
                                                  : {})
                                              });
                                              setAutoFillNotice(null);
                                            } else {
                                              setAutoFillNotice(
                                                `models.dev 中未找到 ${id} 的上下文窗口或思考档位`
                                              );
                                              setTimeout(() => setAutoFillNotice(null), 2500);
                                            }
                                          }}
                                          className="rounded-lg bg-[#181818] px-2 py-1.5 text-[11px] text-neutral-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                          自动获取
                                        </button>

                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          title="上下文窗口"
                                          value={cfg.contextWindow ?? ''}
                                          onChange={(e) => {
                                            const digits = e.target.value.replace(/\D/g, '');
                                            updateModelConfig({
                                              contextWindow: digits ? Number(digits) : undefined
                                            });
                                          }}
                                          placeholder="上下文窗口"
                                          className="w-24 rounded-lg bg-[#181818] px-2.5 py-1.5 text-[11px] text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                                        />

                                        <GlowSelect
                                          multiple
                                          values={
                                            cfg.thinkingLevels ??
                                            (cfg.thinkingLevel ? [cfg.thinkingLevel] : [])
                                          }
                                          onChangeValues={(vals) => {
                                            const levels = vals as ThinkingLevel[];
                                            updateModelConfig({
                                              thinkingLevels:
                                                levels.length > 0 ? levels : undefined,
                                              thinkingLevel: levels[0]
                                            });
                                          }}
                                          options={THINKING_LEVEL_OPTIONS}
                                          placeholder="未设置"
                                        />

                                        <button
                                          type="button"
                                          data-tooltip="移除模型"
                                          onClick={() => handleRemoveModel(id)}
                                          className="rounded p-1 text-neutral-600 transition-colors hover:bg-white/5 hover:text-rose-400"
                                        >
                                          <Xmark className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="px-3 py-4 text-center text-[11px] text-neutral-500">
                                  暂无模型，点击右上角「获取模型」或「手动添加」
                                </div>
                              )}
                            </div>
                            {autoFillNotice && (
                              <p className="mt-1.5 text-[11px] text-amber-400">{autoFillNotice}</p>
                            )}
                          </div>
                        );
                      })()}

                      {/* 低频项折叠区：高级、更多端点 */}
                      <div className="border-t border-white/5 pt-3">
                        <button
                          type="button"
                          onClick={() => setShowAdvanced((v) => !v)}
                          className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-400 transition-colors hover:text-neutral-200"
                        >
                          <NavArrowDown
                            className={`h-3.5 w-3.5 transition-transform ${
                              showAdvanced ? 'rotate-180' : ''
                            }`}
                          />
                          <span>高级设置</span>
                        </button>

                        {showAdvanced && (
                          <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl bg-[#111111]/70 p-3.5 md:grid-cols-2">
                            <div>
                              <label className="mb-1.5 block font-medium text-neutral-400">
                                请求超时 (ms)
                              </label>
                              <input
                                type="number"
                                value={providerForm.advanced?.timeoutMs ?? ''}
                                onChange={(e) =>
                                  setProviderForm({
                                    ...providerForm,
                                    advanced: {
                                      ...providerForm.advanced,
                                      timeoutMs: e.target.value
                                        ? Number(e.target.value)
                                        : undefined
                                    }
                                  })
                                }
                                placeholder="例如 30000"
                                className="w-full rounded-lg bg-[#111111] px-3 py-2 text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                              />
                            </div>

                            <div>
                              <label className="mb-1.5 block font-medium text-neutral-400">
                                更多端点 / 自定义 Headers (JSON)
                              </label>
                              <input
                                type="text"
                                value={providerForm.advanced?.extraEndpoints ?? ''}
                                onChange={(e) =>
                                  setProviderForm({
                                    ...providerForm,
                                    advanced: {
                                      ...providerForm.advanced,
                                      extraEndpoints: e.target.value
                                    }
                                  })
                                }
                                placeholder='例如 {"chat": "/v1/chat/completions"}'
                                className="w-full rounded-lg bg-[#111111] px-3 py-2 text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="min-w-0">
                          <label className="mb-1.5 block font-medium text-neutral-300">
                            供应商名称
                          </label>
                          <input
                            type="text"
                            value={providerForm.customName ?? ''}
                            onChange={(e) =>
                              setProviderForm({ ...providerForm, customName: e.target.value })
                            }
                            placeholder={
                              activeCard.id === 'google'
                                ? '例如 Gemini (AntigravityCLI)'
                                : activeCard.name
                            }
                            className="w-full rounded-xl bg-[#111111] px-3.5 py-2.5 text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                          />
                        </div>

                        <div className="shrink-0">
                          <label className="mb-1.5 block font-medium text-neutral-300">
                            图标
                          </label>
                          <ProviderIconPicker
                            value={
                              providerForm.icon ??
                              (activeCard.id === 'google' ? 'Antigravity' : undefined)
                            }
                            provider={activeCard.id}
                            baseUrl={providerForm.baseUrl}
                            onChange={(icon) => setProviderForm({ ...providerForm, icon })}
                            dropdownAlign="right"
                            onStatusChange={setIconFetchMessage}
                          />
                        </div>
                      </div>

                      {activeCard.id === 'google' && (
                        <div className="space-y-2.5">
                          <label className="block font-medium text-neutral-300">授权与导入</label>

                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                            <button
                              type="button"
                              onClick={() => setShowAgyTokenInput((v) => !v)}
                              className={`group flex min-h-[100px] flex-col justify-between gap-3 rounded-xl p-3.5 text-left transition-colors ${
                                showAgyTokenInput
                                  ? 'bg-white/10 text-neutral-100'
                                  : 'bg-[#111111] text-neutral-300 hover:bg-white/[0.06] hover:text-white'
                              }`}
                            >
                              <div
                                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                                  showAgyTokenInput
                                    ? 'bg-white/15 text-white'
                                    : 'bg-white/5 text-neutral-400 group-hover:text-neutral-200'
                                }`}
                              >
                                <Key className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="text-xs font-medium text-neutral-200">
                                  导入 Refresh Token
                                </div>
                                <div className="mt-0.5 text-[11px] text-neutral-500">
                                  粘贴 Token 或 JSON
                                </div>
                              </div>
                            </button>

                            <button
                              type="button"
                              disabled={importingAgy}
                              onClick={async () => {
                                setImportingAgy(true);
                                setAgyImportStatus({
                                  text: '请在浏览器中完成 Google OAuth 授权...',
                                  tone: 'info'
                                });
                                try {
                                  const res = await window.archpi.startAgyOAuth();
                                  if (!res.ok) {
                                    setAgyImportStatus({
                                      text: res.error || 'OAuth 授权失败',
                                      tone: 'error'
                                    });
                                    return;
                                  }
                                  const fetchedModels = res.models ?? [];
                                  setProviderForm((prev) => ({
                                    ...prev,
                                    icon: prev.icon || 'Antigravity',
                                    apiKey: res.refreshToken || prev.apiKey,
                                    customName: prev.customName?.trim()
                                      ? prev.customName
                                      : res.email || 'Gemini (AntigravityCLI)',
                                    models:
                                      fetchedModels.length > 0 ? fetchedModels : prev.models,
                                    modelId: fetchedModels[0] || prev.modelId,
                                    antigravityAuth: {
                                      mode: 'oauth',
                                      email: res.email,
                                      refreshToken: res.refreshToken
                                    }
                                  }));
                                  setAgyImportStatus({
                                    text: `OAuth 授权成功${res.email ? ` (${res.email})` : ''}${
                                      fetchedModels.length > 0
                                        ? ` · 获取 ${fetchedModels.length} 个模型`
                                        : ''
                                    }`,
                                    tone: 'success'
                                  });
                                } catch {
                                  setAgyImportStatus({
                                    text: 'OAuth 授权失败',
                                    tone: 'error'
                                  });
                                } finally {
                                  setImportingAgy(false);
                                }
                              }}
                              className="group flex min-h-[100px] flex-col justify-between gap-3 rounded-xl bg-[#111111] p-3.5 text-left text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-neutral-400 transition-colors group-hover:text-neutral-200">
                                <Globe className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="text-xs font-medium text-neutral-200">
                                  OAuth 鉴权登陆
                                </div>
                                <div className="mt-0.5 text-[11px] text-neutral-500">
                                  浏览器完成 Google 授权
                                </div>
                              </div>
                            </button>

                            <button
                              type="button"
                              disabled={importingAgy}
                              onClick={async () => {
                                setImportingAgy(true);
                                setAgyImportStatus({
                                  text: '正在从本地 Keyring / CLI 读取...',
                                  tone: 'info'
                                });
                                try {
                                  const res = await window.archpi.importAgyFromCli();
                                  if (!res.ok) {
                                    setAgyImportStatus({
                                      text: res.error || '未检测到本地 Keyring 或 agy CLI 凭证',
                                      tone: 'error'
                                    });
                                    return;
                                  }
                                  const fetchedModels = res.models ?? [];
                                  setProviderForm((prev) => ({
                                    ...prev,
                                    icon: prev.icon || 'Antigravity',
                                    customName: prev.customName?.trim()
                                      ? prev.customName
                                      : res.email || 'Gemini (AntigravityCLI)',
                                    models:
                                      fetchedModels.length > 0 ? fetchedModels : prev.models,
                                    modelId: fetchedModels[0] || prev.modelId,
                                    antigravityAuth: {
                                      mode: 'cli',
                                      email: res.email
                                    }
                                  }));
                                  setAgyImportStatus({
                                    text: `已导入${res.email ? ` ${res.email}` : ''}${
                                      fetchedModels.length > 0
                                        ? ` · 获取 ${fetchedModels.length} 个模型`
                                        : ''
                                    }`,
                                    tone: 'success'
                                  });
                                } catch {
                                  setAgyImportStatus({
                                    text: '读取本地 Keyring 失败',
                                    tone: 'error'
                                  });
                                } finally {
                                  setImportingAgy(false);
                                }
                              }}
                              className="group flex min-h-[100px] flex-col justify-between gap-3 rounded-xl bg-[#111111] p-3.5 text-left text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-neutral-400 transition-colors group-hover:text-neutral-200">
                                <HardDrive className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="text-xs font-medium text-neutral-200">
                                  从本地 Keyring 导入
                                </div>
                                <div className="mt-0.5 text-[11px] text-neutral-500">
                                  读取本地 CLI 凭证
                                </div>
                              </div>
                            </button>
                          </div>

                          {showAgyTokenInput && (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                autoFocus
                                value={agyImportInput}
                                onChange={(e) => setAgyImportInput(e.target.value)}
                                placeholder='粘贴 Refresh Token (1//...) 或 Antigravity-Manager JSON'
                                className="flex-1 rounded-xl bg-[#111111] px-3.5 py-2.5 text-xs text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                              />
                              <button
                                type="button"
                                disabled={importingAgy}
                                onClick={async () => {
                                  const raw = agyImportInput.trim();
                                  if (!raw) return;
                                  try {
                                    let token = raw;
                                    let importedEmail: string | undefined;
                                    let mode: 'json' | 'token' = 'token';

                                    if (raw.startsWith('{') || raw.startsWith('[')) {
                                      const parsed = JSON.parse(raw) as
                                        | {
                                            email?: string;
                                            refresh_token?: string;
                                            refreshToken?: string;
                                          }
                                        | Array<{
                                            email?: string;
                                            refresh_token?: string;
                                            refreshToken?: string;
                                          }>;
                                      const item = Array.isArray(parsed) ? parsed[0] : parsed;
                                      const parsedToken = item?.refresh_token || item?.refreshToken;
                                      if (!parsedToken) {
                                        setAgyImportStatus({
                                          text: 'JSON 中未找到 refresh_token 字段',
                                          tone: 'error'
                                        });
                                        return;
                                      }
                                      token = parsedToken;
                                      importedEmail = item?.email;
                                      mode = 'json';
                                    }

                                    setProviderForm((prev) => ({
                                      ...prev,
                                      icon: prev.icon || 'Antigravity',
                                      apiKey: token,
                                      customName: prev.customName?.trim()
                                        ? prev.customName
                                        : importedEmail || prev.customName,
                                      antigravityAuth: {
                                        mode,
                                        email: importedEmail,
                                        refreshToken: token
                                      }
                                    }));
                                    setAgyImportInput('');
                                    setShowAgyTokenInput(false);
                                    setImportingAgy(true);
                                    setAgyImportStatus({
                                      text: `已导入凭证${
                                        importedEmail ? ` (${importedEmail})` : ''
                                      }，正在通过 agy models 获取模型列表...`,
                                      tone: 'info'
                                    });

                                    const modelsRes = await window.archpi.fetchAgyModels(token);
                                    const fetchedModels = modelsRes.models ?? [];
                                    if (modelsRes.ok && fetchedModels.length > 0) {
                                      setProviderForm((prev) => ({
                                        ...prev,
                                        models: fetchedModels,
                                        modelId: fetchedModels.includes(prev.modelId)
                                          ? prev.modelId
                                          : fetchedModels[0]
                                      }));
                                      setAgyImportStatus({
                                        text: `已导入凭证${
                                          importedEmail ? ` (${importedEmail})` : ''
                                        } · 获取 ${fetchedModels.length} 个模型`,
                                        tone: 'success'
                                      });
                                    } else {
                                      setAgyImportStatus({
                                        text: modelsRes.error
                                          ? `已导入凭证，获取模型失败：${modelsRes.error}`
                                          : `已导入凭证${
                                              importedEmail ? ` (${importedEmail})` : ''
                                            }`,
                                        tone: modelsRes.error ? 'error' : 'success'
                                      });
                                    }
                                  } catch {
                                    setAgyImportStatus({
                                      text: 'JSON 解析失败，请检查格式',
                                      tone: 'error'
                                    });
                                  } finally {
                                    setImportingAgy(false);
                                  }
                                }}
                                className="shrink-0 rounded-xl bg-white/10 px-3.5 py-2.5 text-xs font-medium text-neutral-100 transition-colors hover:bg-white/20 disabled:opacity-50"
                              >
                                解析导入
                              </button>
                            </div>
                          )}

                          {providerForm.antigravityAuth && (
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#111111] px-3.5 py-2.5 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                                <span className="text-neutral-300">
                                  {providerForm.antigravityAuth.email
                                    ? `已授权邮箱：${providerForm.antigravityAuth.email}`
                                    : '已导入凭证'}
                                </span>
                              </div>
                              <span className="text-[11px] text-neutral-500">
                                {providerForm.antigravityAuth.mode === 'oauth'
                                  ? 'OAuth'
                                  : providerForm.antigravityAuth.mode === 'cli'
                                  ? '本地 Keyring'
                                  : providerForm.antigravityAuth.mode === 'json'
                                  ? 'JSON 凭证'
                                  : 'Refresh Token'}
                              </span>
                            </div>
                          )}

                          {/* 模型列表 */}
                          {(() => {
                            const agyModels = providerForm.models ?? [];
                            return (
                              <div className="pt-1">
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                  <div className="flex shrink-0 items-center gap-2">
                                    <label className="font-medium text-neutral-300">模型列表</label>
                                    {agyModels.length > 0 && (
                                      <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-neutral-400">
                                        {agyModels.length}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex min-w-0 items-center gap-3">
                                    {agyImportStatus && (
                                      <span
                                        className={`truncate text-[11px] ${
                                          agyImportStatus.tone === 'error'
                                            ? 'text-rose-400'
                                            : agyImportStatus.tone === 'info'
                                            ? 'text-neutral-400'
                                            : 'text-emerald-400'
                                        }`}
                                      >
                                        {agyImportStatus.text}
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      disabled={importingAgy}
                                      onClick={async () => {
                                        setImportingAgy(true);
                                        setAgyImportStatus({
                                          text: '正在通过 agy models 获取模型列表...',
                                          tone: 'info'
                                        });
                                        try {
                                          const token =
                                            providerForm.antigravityAuth?.refreshToken ||
                                            providerForm.apiKey ||
                                            undefined;
                                          const res = await window.archpi.fetchAgyModels(token);
                                          if (!res.ok) {
                                            setAgyImportStatus({
                                              text: res.error || '获取模型列表失败',
                                              tone: 'error'
                                            });
                                            return;
                                          }
                                          const fetched = res.models ?? [];
                                          setProviderForm((prev) => ({
                                            ...prev,
                                            models: fetched,
                                            modelId:
                                              fetched.includes(prev.modelId)
                                                ? prev.modelId
                                                : fetched[0] || prev.modelId
                                          }));
                                          setAgyImportStatus({
                                            text:
                                              fetched.length > 0
                                                ? `已通过 agy models 获取 ${fetched.length} 个模型`
                                                : '未获取到可用模型',
                                            tone: fetched.length > 0 ? 'success' : 'error'
                                          });
                                        } catch {
                                          setAgyImportStatus({
                                            text: '获取模型列表失败',
                                            tone: 'error'
                                          });
                                        } finally {
                                          setImportingAgy(false);
                                        }
                                      }}
                                      className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-neutral-400 transition-colors hover:text-neutral-100 disabled:opacity-50"
                                    >
                                      <Refresh
                                        className={`h-3 w-3 ${importingAgy ? 'animate-spin' : ''}`}
                                      />
                                      <span>获取模型</span>
                                    </button>
                                  </div>
                                </div>

                                <div className="overflow-hidden rounded-xl bg-[#111111]">
                                  <div className="max-h-48 divide-y divide-white/5 overflow-y-auto">
                                    {agyModels.length > 0 ? (
                                      agyModels.map((id) => {
                                        const isDefault = providerForm.modelId === id;
                                        return (
                                          <div
                                            key={id}
                                            onClick={() =>
                                              setProviderForm((prev) => ({ ...prev, modelId: id }))
                                            }
                                            className="flex cursor-pointer items-center justify-between gap-2 px-3.5 py-2 transition-colors hover:bg-white/5"
                                          >
                                            <span className="truncate text-[11px] text-neutral-200">
                                              {id}
                                            </span>
                                            <div className="flex shrink-0 items-center gap-2">
                                              {isDefault && (
                                                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">
                                                  默认
                                                </span>
                                              )}
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const nextList = agyModels.filter((m) => m !== id);
                                                  setProviderForm((prev) => ({
                                                    ...prev,
                                                    models: nextList,
                                                    modelId:
                                                      prev.modelId === id
                                                        ? nextList[0] ?? ''
                                                        : prev.modelId
                                                  }));
                                                }}
                                                className="rounded p-0.5 text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200"
                                              >
                                                <Xmark className="h-3 w-3" />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <div className="px-3.5 py-4 text-center text-[11px] text-neutral-500">
                                        暂无模型，请先完成授权或点击「获取模型」
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {activeCard.id !== 'google' && (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block font-medium text-neutral-300">Model ID</label>
                            <input
                              type="text"
                              value={providerForm.modelId}
                              onChange={(e) =>
                                setProviderForm({ ...providerForm, modelId: e.target.value })
                              }
                              placeholder={activeCard.modelPlaceholder}
                              className="w-full rounded-xl bg-[#111111] px-3.5 py-2.5 text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="mb-1.5 block font-medium text-neutral-300">
                              API Key
                            </label>
                            <input
                              type="password"
                              value={providerForm.apiKey}
                              onChange={(e) =>
                                setProviderForm({ ...providerForm, apiKey: e.target.value })
                              }
                              placeholder="sk-..."
                              className="w-full rounded-xl bg-[#111111] px-3.5 py-2.5 text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="mb-1.5 block font-medium text-neutral-300">
                              上下文窗口
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={!modelsDevCache}
                                data-tooltip={
                                  modelsDevCache
                                    ? '从 models.dev 自动获取上下文窗口与思考档位'
                                    : '需先同步 models.dev 数据'
                                }
                                onClick={() => {
                                  const ctx = lookupModelContextWindow(
                                    modelsDevCache,
                                    providerForm.modelId
                                  );
                                  const levels = lookupModelThinkingLevels(
                                    modelsDevCache,
                                    providerForm.modelId
                                  );
                                  if (ctx || levels) {
                                    setProviderForm({
                                      ...providerForm,
                                      ...(ctx ? { contextWindow: ctx } : {}),
                                      ...(levels ? { thinkingLevel: levels[0] } : {})
                                    });
                                    setAutoFillNotice(null);
                                  } else {
                                    setAutoFillNotice(
                                      `models.dev 中未找到 ${providerForm.modelId || '该模型'} 的上下文窗口或思考档位`
                                    );
                                    setTimeout(() => setAutoFillNotice(null), 2500);
                                  }
                                }}
                                className="shrink-0 rounded-xl bg-[#111111] px-3 py-2.5 text-xs text-neutral-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                自动获取
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={providerForm.contextWindow ?? ''}
                                onChange={(e) => {
                                  const digits = e.target.value.replace(/\D/g, '');
                                  setProviderForm({
                                    ...providerForm,
                                    contextWindow: digits ? Number(digits) : undefined
                                  });
                                }}
                                placeholder="例如 200000"
                                className="w-full rounded-xl bg-[#111111] px-3.5 py-2.5 text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                              />
                            </div>
                            {autoFillNotice && (
                              <p className="mt-1.5 text-[11px] text-amber-400">{autoFillNotice}</p>
                            )}
                          </div>

                          <div>
                            <label className="mb-1.5 block font-medium text-neutral-300">
                              思考等级
                            </label>
                            <GlowSelect
                              size="md"
                              fullWidth
                              value={providerForm.thinkingLevel ?? ''}
                              onChange={(val) =>
                                setProviderForm({
                                  ...providerForm,
                                  thinkingLevel: val ? (val as ThinkingLevel) : undefined
                                })
                              }
                              options={THINKING_LEVEL_OPTIONS}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-5 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={closeProviderModal}
                      disabled={batchImporting}
                      className="rounded-xl px-4 py-2 font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-200 disabled:opacity-50"
                    >
                      取消
                    </button>
                    {batchImportMode ? (() => {
                      const readyCount = batchImportPreview.items.filter(
                        (item) => item.status === 'ready'
                      ).length;
                      return (
                        <button
                          type="button"
                          disabled={batchImporting || readyCount === 0}
                          onClick={() => void handleBatchImport()}
                          className="rounded-xl bg-neutral-100 px-5 py-2 font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {batchImporting
                            ? '导入中...'
                            : readyCount > 0
                            ? `确认导入 (${readyCount})`
                            : '确认导入'}
                        </button>
                      );
                    })() : (
                      <button
                        type="submit"
                        className="rounded-xl bg-neutral-100 px-5 py-2 font-medium text-neutral-900 transition-colors hover:bg-white"
                      >
                        保存配置
                      </button>
                    )}
                  </div>
                  </div>
                </form>
              </div>
            );
          })()}
        </>
      )}

      {/* Tab 2: 语音输入 */}
      {settingsTab === 'voice' && (
        <form onSubmit={handleSaveVoice} className="max-w-xl space-y-5 text-xs">
          <div className="flex items-center justify-between rounded-xl bg-[#101010] px-4 py-3">
            <div>
              <div className="font-medium text-neutral-200">启用语音输入</div>
              <div className="mt-0.5 text-[11px] text-neutral-500">
                在消息输入框旁显示麦克风按钮，通过云端 ASR 将语音实时转为文字
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={voiceForm.enabled}
              onClick={() => {
                const next = { ...voiceForm, enabled: !voiceForm.enabled };
                setVoiceForm(next);
                void updateVoiceConfig(next);
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                voiceForm.enabled ? 'bg-emerald-500' : 'bg-[#262626]'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  voiceForm.enabled ? 'translate-x-4.5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div>
              <label className="mb-1.5 block font-medium text-neutral-400">API Key（留空则走模拟测试）</label>
            <GlowSelect
              value={voiceForm.provider}
              onChange={(val) =>
                handleVoiceProviderChange(val as VoiceInputConfig['provider'])
              }
              options={(Object.keys(VOICE_PRESETS) as VoiceInputConfig['provider'][]).map(
                (key) => ({
                  value: key,
                  label: VOICE_PRESETS[key].label
                })
              )}
            />
          </div>

          <div>
            <label className="mb-1.5 block font-medium text-neutral-300">API Endpoint</label>
            <input
              type="text"
              value={voiceForm.endpoint}
              onChange={(e) => setVoiceForm({ ...voiceForm, endpoint: e.target.value })}
              placeholder="https://api.siliconflow.cn/v1/audio/transcriptions"
              className="w-full rounded-xl bg-[#101010] px-3.5 py-2.5 text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block font-medium text-neutral-300">Model ID</label>
            <input
              type="text"
              value={voiceForm.modelId}
              onChange={(e) => setVoiceForm({ ...voiceForm, modelId: e.target.value })}
              placeholder="FunAudioLLM/SenseVoiceSmall"
              className="w-full rounded-xl bg-[#101010] px-3.5 py-2.5 text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block font-medium text-neutral-300">API Key</label>
            <input
              type="password"
              value={voiceForm.apiKey}
              onChange={(e) => setVoiceForm({ ...voiceForm, apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full rounded-xl bg-[#101010] px-3.5 py-2.5 text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
            />
            <p className="mt-1.5 text-[11px] text-neutral-500">
              兼容 OpenAI Audio Transcriptions 接口；SiliconFlow 的 `FunAudioLLM/SenseVoiceSmall`
              当前可免费调用。
            </p>
          </div>

          <div>
            <label className="mb-1.5 block font-medium text-neutral-300">触发方式</label>
            <div className="inline-flex items-center gap-1 rounded-xl bg-[#101010] p-1">
              <button
                type="button"
                onClick={() => setVoiceForm({ ...voiceForm, mode: 'click' })}
                className={`rounded-lg px-3.5 py-1.5 font-medium transition-colors ${
                  voiceForm.mode === 'click'
                    ? 'bg-[#202229] text-neutral-100'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                点击开始 / 停止
              </button>
              <button
                type="button"
                onClick={() => setVoiceForm({ ...voiceForm, mode: 'hold' })}
                className={`rounded-lg px-3.5 py-1.5 font-medium transition-colors ${
                  voiceForm.mode === 'hold'
                    ? 'bg-[#202229] text-neutral-100'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                按住说话
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              className="rounded-xl bg-neutral-100 px-5 py-2 font-medium text-neutral-900 transition-colors hover:bg-white"
            >
              Save Configuration
            </button>
            <button
              type="button"
              onClick={handleTestVoiceConnection}
              disabled={testingVoice}
              className="rounded-xl bg-[#181a20] px-4 py-2 font-medium text-neutral-200 transition-colors hover:bg-[#22252e] disabled:opacity-50"
            >
              {testingVoice ? '测试中...' : '测试连接'}
            </button>
            {voiceSaved && (
              <span className="flex items-center gap-1 text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                <span>Saved</span>
              </span>
            )}
            {testResult && (
              <span className={testResult.ok ? 'text-emerald-400' : 'text-rose-400'}>
                {testResult.message}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
};
