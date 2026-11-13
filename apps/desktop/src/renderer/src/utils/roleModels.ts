import type { RoleModelConfig, RoleModelEntry, RoleModelsMap } from '@archpi/shared';

export type { RoleModelEntry, RoleModelConfig, RoleModelsMap };

export const DEFAULT_ROLE_MODELS: RoleModelsMap = {
  master: { models: [], entries: [] },
  worker: { models: [], entries: [] }
};

function normalizeRoleConfig(raw?: Partial<RoleModelConfig>): RoleModelConfig {
  const rawEntries = Array.isArray(raw?.entries) ? raw!.entries : [];
  const rawModels = Array.isArray(raw?.models) ? raw!.models : [];

  const entries: RoleModelEntry[] =
    rawEntries.length > 0
      ? rawEntries.filter((e): e is RoleModelEntry => Boolean(e && typeof e.id === 'string' && e.id.trim()))
      : rawModels
          .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
          .map((id) => ({ id, thinkingLevel: raw?.thinkingLevel }));

  const models = entries.map((e) => e.id);
  const defaultModel =
    raw?.defaultModel && models.includes(raw.defaultModel) ? raw.defaultModel : undefined;

  return {
    models,
    entries,
    defaultModel,
    thinkingLevel: raw?.thinkingLevel
  };
}

export function normalizeRoleModels(parsed?: Partial<RoleModelsMap> | null): RoleModelsMap {
  if (!parsed || typeof parsed !== 'object') {
    return {
      master: { ...DEFAULT_ROLE_MODELS.master, entries: [] },
      worker: { ...DEFAULT_ROLE_MODELS.worker, entries: [] }
    };
  }
  return {
    master: normalizeRoleConfig(parsed.master),
    worker: normalizeRoleConfig(parsed.worker)
  };
}
