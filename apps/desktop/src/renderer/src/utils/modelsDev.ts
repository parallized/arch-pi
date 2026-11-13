import type { ThinkingLevel } from '@archpi/shared';

export interface ModelsDevCache {
  syncedAt: number;
  modelCount: number;
  contextByModel: Record<string, number>;
  thinkingLevelsByModel?: Record<string, ThinkingLevel[]>;
}

const THINKING_ORDER: ThinkingLevel[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra'
];

const VALID_THINKING_LEVELS = new Set<ThinkingLevel>(THINKING_ORDER);

const STORAGE_KEY = 'archpi:models-dev-cache-v1';
export const MODELS_DEV_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function parseModelsDevCache(raw: string | null | undefined): ModelsDevCache | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ModelsDevCache>;
    if (
      typeof parsed.syncedAt !== 'number' ||
      typeof parsed.modelCount !== 'number' ||
      !parsed.contextByModel ||
      typeof parsed.contextByModel !== 'object'
    ) {
      return null;
    }
    return parsed as ModelsDevCache;
  } catch {
    return null;
  }
}

export function isModelsDevStale(cache: ModelsDevCache | null): boolean {
  if (!cache) return true;
  return Date.now() - cache.syncedAt >= MODELS_DEV_SYNC_INTERVAL_MS;
}

interface RawReasoningOption {
  type?: string;
  values?: unknown[];
}

interface RawModelsDevProvider {
  models?: Record<
    string,
    {
      id?: string;
      reasoning?: boolean;
      reasoning_options?: RawReasoningOption[];
      limit?: {
        context?: number;
      };
    }
  >;
}

function extractThinkingLevels(
  reasoning?: boolean,
  options?: RawReasoningOption[]
): ThinkingLevel[] | undefined {
  if (reasoning === false) {
    return ['none'];
  }
  if (!Array.isArray(options) || options.length === 0) {
    return undefined;
  }

  const levels: ThinkingLevel[] = [];
  let hasToggle = false;
  for (const opt of options) {
    if (opt?.type === 'toggle') {
      hasToggle = true;
    }
    if (Array.isArray(opt?.values)) {
      for (const raw of opt.values) {
        if (typeof raw !== 'string') continue;
        const normalized = raw.trim().toLowerCase() as ThinkingLevel;
        if (VALID_THINKING_LEVELS.has(normalized) && !levels.includes(normalized)) {
          levels.push(normalized);
        }
      }
    }
  }

  if (hasToggle && !levels.includes('none')) {
    levels.unshift('none');
  }

  return levels.length > 0 ? levels : undefined;
}

function mergeThinkingLevels(
  existing: ThinkingLevel[] | undefined,
  incoming: ThinkingLevel[]
): ThinkingLevel[] {
  const merged = new Set<ThinkingLevel>([...(existing ?? []), ...incoming]);
  return THINKING_ORDER.filter((lvl) => merged.has(lvl));
}

function indexModelValue<T>(
  map: Record<string, T>,
  providerKey: string,
  idLower: string,
  val: T,
  merge?: (existing: T | undefined, incoming: T) => T
): void {
  const put = (key: string) => {
    if (merge) {
      map[key] = merge(map[key], val);
    } else if (!(key in map)) {
      map[key] = val;
    }
  };

  put(idLower);
  put(`${providerKey.toLowerCase()}/${idLower}`);
  const slashIdx = idLower.lastIndexOf('/');
  if (slashIdx !== -1) {
    const shortId = idLower.slice(slashIdx + 1);
    if (shortId) put(shortId);
  }
}

export async function syncModelsDev(): Promise<ModelsDevCache> {
  const res = await fetch('https://models.dev/api.json');
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = (await res.json()) as Record<string, RawModelsDevProvider>;
  const contextByModel: Record<string, number> = {};
  const thinkingLevelsByModel: Record<string, ThinkingLevel[]> = {};
  let modelCount = 0;

  for (const [providerKey, providerVal] of Object.entries(data)) {
    const models = providerVal?.models;
    if (!models || typeof models !== 'object') continue;

    for (const [modelKey, modelVal] of Object.entries(models)) {
      const ctx = modelVal?.limit?.context;
      const levels = extractThinkingLevels(modelVal?.reasoning, modelVal?.reasoning_options);
      const hasCtx = typeof ctx === 'number' && ctx > 0;
      if (!hasCtx && !levels) continue;

      const idLower = (modelVal.id || modelKey).trim().toLowerCase();
      if (!idLower) continue;

      if (hasCtx) {
        modelCount += 1;
        indexModelValue(contextByModel, providerKey, idLower, ctx);
      }
      if (levels) {
        indexModelValue(
          thinkingLevelsByModel,
          providerKey,
          idLower,
          levels,
          mergeThinkingLevels
        );
      }
    }
  }

  const cache: ModelsDevCache = {
    syncedAt: Date.now(),
    modelCount,
    contextByModel,
    thinkingLevelsByModel
  };

  return cache;
}

function lookupByModelId<T>(
  map: Record<string, T> | undefined,
  modelId: string
): T | undefined {
  if (!map) return undefined;
  const raw = modelId.trim().toLowerCase();
  if (!raw) return undefined;

  if (raw in map) {
    return map[raw];
  }

  const slashIdx = raw.lastIndexOf('/');
  if (slashIdx !== -1) {
    const shortId = raw.slice(slashIdx + 1);
    if (shortId in map) {
      return map[shortId];
    }
  }

  if (raw.includes(':')) {
    const hyphenated = raw.replace(':', '-');
    if (hyphenated in map) {
      return map[hyphenated];
    }
  }

  return undefined;
}

export function lookupModelContextWindow(
  cache: ModelsDevCache | null,
  modelId: string
): number | undefined {
  return lookupByModelId(cache?.contextByModel, modelId);
}

export function lookupModelThinkingLevels(
  cache: ModelsDevCache | null,
  modelId: string
): ThinkingLevel[] | undefined {
  return lookupByModelId(cache?.thinkingLevelsByModel, modelId);
}
