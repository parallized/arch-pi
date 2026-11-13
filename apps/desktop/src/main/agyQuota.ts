import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { net } from 'electron';
import type { AgyAccountQuota, AgyGroupQuotaSummary, AgyQuotaItem } from '@archpi/shared';

const httpFetch = (url: string, init?: RequestInit) => net.fetch(url, init);

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface OAuthClientCredential {
  key: string;
  clientId: string;
  clientSecret: string;
}

function parseOAuthClientList(raw: unknown): OAuthClientCredential[] {
  const items = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  const out: OAuthClientCredential[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const entry = items[i] as Record<string, unknown> | null;
    if (!entry || typeof entry !== 'object') continue;
    const clientId = typeof entry.clientId === 'string' ? entry.clientId.trim() : '';
    const clientSecret = typeof entry.clientSecret === 'string' ? entry.clientSecret.trim() : '';
    if (!clientId || !clientSecret) continue;
    const key =
      typeof entry.key === 'string' && entry.key.trim() ? entry.key.trim() : `client_${i + 1}`;
    out.push({ key, clientId, clientSecret });
  }
  return out;
}

/**
 * Resolve OAuth client credentials from environment variables or optional
 * `~/.archpi/oauth-clients.json` so no secrets are hardcoded in source control.
 */
function resolveOAuthClients(): OAuthClientCredential[] {
  const clients: OAuthClientCredential[] = [];

  const jsonEnv = process.env.ARCHPI_AGY_OAUTH_CLIENTS?.trim();
  if (jsonEnv) {
    try {
      clients.push(...parseOAuthClientList(JSON.parse(jsonEnv)));
    } catch {
      // Ignore malformed env JSON and fall back to discrete env vars / file
    }
  }

  const envId = process.env.ARCHPI_AGY_CLIENT_ID?.trim();
  const envSecret = process.env.ARCHPI_AGY_CLIENT_SECRET?.trim();
  if (envId && envSecret) {
    clients.push({ key: 'env_default', clientId: envId, clientSecret: envSecret });
  }

  try {
    const filePath = join(homedir(), '.archpi', 'oauth-clients.json');
    if (existsSync(filePath)) {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      clients.push(...parseOAuthClientList(parsed));
    }
  } catch {
    // Optional local OAuth client config file
  }

  const seen = new Set<string>();
  return clients.filter((c) => {
    const dedupKey = `${c.clientId}:${c.clientSecret}`;
    if (seen.has(dedupKey)) return false;
    seen.add(dedupKey);
    return true;
  });
}

const CLOUDCODE_BASES = [
  'https://daily-cloudcode-pa.googleapis.com',
  'https://daily-cloudcode-pa.sandbox.googleapis.com',
  'https://cloudcode-pa.googleapis.com'
] as const;

const REQUEST_TIMEOUT_MS = 15000;
const USER_AGENT = 'antigravity/hub/2.28.0 (aidev_client; os_type=windows; arch=amd64; cl=1008300195)';

interface OfficialModelEntry {
  displayName?: string;
  model?: string;
  label?: string;
  quotaInfo?: {
    remainingFraction?: number;
    resetTime?: string;
    isExhausted?: boolean;
  };
}

interface QuotaSummaryBucket {
  bucketId?: string;
  window?: string;
  remainingFraction?: number;
  resetTime?: string;
  displayName?: string;
}

interface QuotaSummaryGroup {
  displayName?: string;
  buckets?: QuotaSummaryBucket[];
}

export function resolveAgyRefreshToken(explicitRefreshToken?: string): string | null {
  const trimmed = explicitRefreshToken?.trim();
  if (trimmed) return trimmed;

  try {
    const credsPath = join(homedir(), '.gemini', 'oauth_creds.json');
    if (existsSync(credsPath)) {
      const parsed = JSON.parse(readFileSync(credsPath, 'utf8')) as { refresh_token?: string };
      if (typeof parsed.refresh_token === 'string' && parsed.refresh_token.trim()) {
        return parsed.refresh_token.trim();
      }
    }
  } catch {
    // Optional local oauth creds file
  }
  return null;
}

async function exchangeRefreshToken(refreshToken: string): Promise<string> {
  const oauthClients = resolveOAuthClients();
  if (oauthClients.length === 0) {
    throw new Error(
      '未配置 Antigravity OAuth Client 凭据（请设置 ARCHPI_AGY_OAUTH_CLIENTS / ARCHPI_AGY_CLIENT_ID+SECRET 或 ~/.archpi/oauth-clients.json）'
    );
  }

  const errors: string[] = [];

  for (const client of oauthClients) {
    const body = new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    const res = await httpFetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (res.ok) {
      const data = (await res.json()) as { access_token?: string };
      if (data.access_token) {
        return data.access_token;
      }
      errors.push(`${client.key}: missing access_token`);
      continue;
    }

    const errText = await res.text().catch(() => '');
    errors.push(`${client.key}: HTTP ${res.status} ${errText.slice(0, 120)}`);

    const isClientMismatch =
      res.status === 400 ||
      res.status === 401 ||
      /unauthorized_client|invalid_client/i.test(errText);
    if (!isClientMismatch) {
      break;
    }
  }

  throw new Error(`OAuth token 刷新失败: ${errors.join(' | ')}`);
}

async function postCloudCode<T>(
  path: string,
  accessToken: string,
  payload: Record<string, unknown>,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<T> {
  let lastError = '';
  for (const base of CLOUDCODE_BASES) {
    try {
      const res = await httpFetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        lastError = `${base} HTTP ${res.status}: ${text.slice(0, 150)}`;
        continue;
      }

      return (await res.json()) as T;
    } catch (err) {
      lastError = `${base}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  throw new Error(lastError || `请求 ${path} 失败`);
}

function parseTier(
  data: {
    paidTier?: { id?: string; name?: string };
    currentTier?: { id?: string; name?: string };
  } | null
): AgyAccountQuota['tier'] {
  const raw = `${data?.paidTier?.id ?? ''} ${data?.paidTier?.name ?? ''} ${data?.currentTier?.id ?? ''} ${data?.currentTier?.name ?? ''}`.toLowerCase();
  if (raw.includes('ultra')) return 'ultra';
  if (raw.includes('enterprise')) return 'enterprise';
  if (raw.includes('pro')) return 'pro';
  if (raw.includes('free')) return 'free';
  return undefined;
}

function isSupportedDisplayModel(name: string): boolean {
  const m = name.trim().toLowerCase();
  return !(
    m.includes('-disabled') ||
    m.endsWith('_disabled') ||
    m.startsWith('chat_') ||
    m.startsWith('tab_') ||
    m.includes('internal') ||
    m.includes('-exp') ||
    m.endsWith('-agent') ||
    m === 'gemini-3-flash' ||
    m.includes('2.5') ||
    m.includes('2-5') ||
    m.includes('3.5-flash-low') ||
    m.includes('3.5-flash-extra-low') ||
    m.includes('3.6-flash') ||
    m.includes('3.7-flash')
  );
}

function buildDynamicGeminiLabel(modelIds: string[]): string {
  const versions = new Set<string>();
  for (const id of modelIds) {
    const match = id.toLowerCase().match(/gemini-(\d+(?:\.\d+)?)/);
    if (match) versions.add(match[1]);
  }
  const sorted = Array.from(versions).sort((a, b) => parseFloat(b) - parseFloat(a));
  if (sorted.length > 0) {
    return `Gemini ${sorted.slice(0, 2).join(' / ')}`;
  }
  return 'Gemini';
}

function pickBucket(
  buckets: QuotaSummaryBucket[],
  pattern: RegExp
): AgyQuotaItem | undefined {
  const matched = buckets.filter(
    (b) =>
      (typeof b.remainingFraction === 'number' || Boolean(b.resetTime)) &&
      pattern.test(`${b.window ?? ''} ${b.bucketId ?? ''}`)
  );
  if (matched.length === 0) return undefined;

  const getFraction = (b: QuotaSummaryBucket) =>
    typeof b.remainingFraction === 'number' ? b.remainingFraction : 0;

  const minBucket = matched.reduce((prev, curr) =>
    getFraction(curr) < getFraction(prev) ? curr : prev
  );
  return {
    percentage: Math.max(0, Math.min(100, Math.round(getFraction(minBucket) * 100))),
    resetTime: minBucket.resetTime || undefined
  };
}

function buildFallbackFromModels(
  entries: Array<{ id: string; info: OfficialModelEntry }>,
  isWeeklyOnlyGroup: boolean
): { fiveHour?: AgyQuotaItem; weekly?: AgyQuotaItem } {
  const withQuota = entries.filter(
    (e) =>
      typeof e.info.quotaInfo?.remainingFraction === 'number' ||
      e.info.quotaInfo?.isExhausted === true ||
      Boolean(e.info.quotaInfo?.resetTime)
  );
  if (withQuota.length === 0) return {};

  const getFraction = (e: { info: OfficialModelEntry }) =>
    typeof e.info.quotaInfo?.remainingFraction === 'number'
      ? e.info.quotaInfo.remainingFraction
      : 0;

  const now = Date.now();
  const sixHoursMs = 6 * 3600 * 1000;

  const fiveHourCandidates = withQuota.filter((e) => {
    const rt = e.info.quotaInfo?.resetTime;
    if (!rt) return false;
    const diff = Date.parse(rt) - now;
    return diff > 0 && diff <= sixHoursMs;
  });

  const weeklyCandidates = withQuota.filter((e) => {
    const rt = e.info.quotaInfo?.resetTime;
    if (!rt) return false;
    return Date.parse(rt) - now > sixHoursMs;
  });

  const toItem = (e: { info: OfficialModelEntry }): AgyQuotaItem => ({
    percentage: Math.max(0, Math.min(100, Math.round(getFraction(e) * 100))),
    resetTime: e.info.quotaInfo?.resetTime || undefined
  });

  const minEntry = (list: typeof withQuota) =>
    list.reduce((prev, curr) => (getFraction(curr) < getFraction(prev) ? curr : prev));

  let fiveHour = fiveHourCandidates.length > 0 ? toItem(minEntry(fiveHourCandidates)) : undefined;
  let weekly = weeklyCandidates.length > 0 ? toItem(minEntry(weeklyCandidates)) : undefined;

  if (!fiveHour && !weekly) {
    const min = toItem(minEntry(withQuota));
    if (isWeeklyOnlyGroup) {
      weekly = min;
    } else {
      fiveHour = min;
    }
  }

  if (isWeeklyOnlyGroup && !weekly && fiveHour) {
    weekly = fiveHour;
    fiveHour = undefined;
  }

  return { fiveHour, weekly };
}

function pickWarmupModel(ids: string[], preferred: RegExp[]): string | undefined {
  for (const re of preferred) {
    const found = ids.find((id) => re.test(id));
    if (found) return found;
  }
  return ids[0];
}

export async function fetchAgyAccountQuota(explicitRefreshToken?: string): Promise<AgyAccountQuota> {
  const refreshToken = resolveAgyRefreshToken(explicitRefreshToken);
  if (!refreshToken) {
    throw new Error('未找到有效的 Antigravity Refresh Token');
  }

  const accessToken = await exchangeRefreshToken(refreshToken);

  let projectId: string | undefined;
  let tier: AgyAccountQuota['tier'];
  try {
    const assist = await postCloudCode<{
      cloudaicompanionProject?: string;
      paidTier?: { id?: string; name?: string };
      currentTier?: { id?: string; name?: string };
    }>('/v1internal:loadCodeAssist', accessToken, {
      metadata: {
        ideType: 'ANTIGRAVITY',
        platform: 'PLATFORM_UNSPECIFIED',
        pluginType: 'GEMINI'
      }
    });
    projectId = assist.cloudaicompanionProject || undefined;
    tier = parseTier(assist);
  } catch {
    // Some accounts still respond to fetchAvailableModels without projectId
  }

  const payload = projectId ? { project: projectId } : {};

  const [modelsResp, summaryResp] = await Promise.all([
    postCloudCode<{ models?: Record<string, OfficialModelEntry> }>(
      '/v1internal:fetchAvailableModels',
      accessToken,
      payload
    ),
    postCloudCode<{ groups?: QuotaSummaryGroup[] }>(
      '/v1internal:retrieveUserQuotaSummary',
      accessToken,
      payload
    ).catch(() => ({ groups: [] as QuotaSummaryGroup[] }))
  ]);

  const rawModels = modelsResp.models ?? {};
  const activeEntries = Object.entries(rawModels)
    .filter(([id]) => isSupportedDisplayModel(id))
    .map(([id, info]) => ({ id, info }));

  const geminiEntries = activeEntries.filter(({ id }) => {
    const lower = id.toLowerCase();
    return lower.startsWith('gemini-') && !lower.includes('argon');
  });
  const claudeEntries = activeEntries.filter(({ id }) => {
    const lower = id.toLowerCase();
    return lower.startsWith('claude') || lower.startsWith('gpt');
  });
  const argonEntries = activeEntries.filter(({ id }) => id.toLowerCase().includes('argon'));

  const summaryGroups = summaryResp.groups ?? [];
  const findBuckets = (target: 'gemini' | 'claude' | 'argon'): QuotaSummaryBucket[] => {
    const direct = summaryGroups
      .filter((group) => {
        const gName = (group.displayName ?? '').toLowerCase();
        const hasArgon = (group.buckets ?? []).some((b) =>
          /argon/i.test(`${b.bucketId ?? ''} ${b.displayName ?? ''}`)
        );
        const isArgon = gName.includes('argon') || hasArgon;
        if (target === 'argon') return isArgon;
        if (isArgon) return false;

        const isThirdParty =
          /claude|gpt|3p/.test(gName) ||
          (group.buckets ?? []).some((b) => (b.bucketId ?? '').toLowerCase().includes('3p'));
        return target === 'claude' ? isThirdParty : !isThirdParty;
      })
      .flatMap((g) => g.buckets ?? []);

    if (target === 'argon' && direct.length === 0 && tier === 'ultra') {
      return summaryGroups
        .filter((group) => {
          const gName = (group.displayName ?? '').toLowerCase();
          const isThirdParty =
            /claude|gpt|3p/.test(gName) ||
            (group.buckets ?? []).some((b) => (b.bucketId ?? '').toLowerCase().includes('3p'));
          return !isThirdParty;
        })
        .flatMap((g) => g.buckets ?? []);
    }

    return direct;
  };

  const isFreeTier = tier === 'free';
  const groups: AgyGroupQuotaSummary[] = [];

  if (geminiEntries.length > 0) {
    const buckets = findBuckets('gemini');
    const fallback = buildFallbackFromModels(geminiEntries, isFreeTier);
    const fiveHour = isFreeTier ? undefined : pickBucket(buckets, /5h|hour/i) ?? fallback.fiveHour;
    const weekly = pickBucket(buckets, /week|7d/i) ?? fallback.weekly;

    if (fiveHour || weekly) {
      groups.push({
        key: 'gemini',
        label: buildDynamicGeminiLabel(geminiEntries.map((e) => e.id)),
        fiveHour,
        weekly,
        isWeeklyExhausted: weekly !== undefined && weekly.percentage <= 1
      });
    }
  }

  if (claudeEntries.length > 0) {
    const buckets = findBuckets('claude');
    const fallback = buildFallbackFromModels(claudeEntries, isFreeTier);
    const weekly = pickBucket(buckets, /week|7d/i) ?? fallback.weekly;

    if (weekly) {
      groups.push({
        key: 'claude',
        label: 'Claude',
        weekly,
        isWeeklyExhausted: weekly.percentage <= 1
      });
    }
  }

  const hasArgonInGroups = summaryGroups.some((group) => {
    const gName = (group.displayName ?? '').toLowerCase();
    return (
      gName.includes('argon') ||
      (group.buckets ?? []).some((b) =>
        /argon/i.test(`${b.bucketId ?? ''} ${b.displayName ?? ''}`)
      )
    );
  });
  const hasExplicitDisabledArgon = Object.keys(rawModels).some((id) => {
    const lower = id.toLowerCase();
    return lower.includes('argon') && (lower.includes('-disabled') || lower.endsWith('_disabled'));
  });
  const isArgonEligible =
    ((tier === 'ultra' || tier === 'enterprise') && !hasExplicitDisabledArgon) ||
    hasArgonInGroups ||
    (summaryGroups.length === 0 && argonEntries.length > 0);

  if (isArgonEligible) {
    const buckets = findBuckets('argon');
    const fallback = buildFallbackFromModels(argonEntries, true);
    const weekly = pickBucket(buckets, /week|7d/i) ?? fallback.weekly;

    if (weekly) {
      groups.push({
        key: 'argon',
        label: 'Gemini 4 Argon',
        weekly,
        isWeeklyExhausted: weekly.percentage <= 1
      });
    }
  }

  const warmupTargets: AgyAccountQuota['warmupTargets'] = {
    gemini: pickWarmupModel(
      geminiEntries.map((e) => e.id),
      [/flash/i, /low/i, /medium/i]
    ),
    claude: pickWarmupModel(
      claudeEntries.map((e) => e.id),
      [/sonnet/i, /haiku/i]
    ),
    argon: isArgonEligible
      ? pickWarmupModel(
          argonEntries.map((e) => e.id),
          [/low/i, /medium/i]
        )
      : undefined
  };

  return {
    fetchedAt: Date.now(),
    tier,
    groups,
    availableModels: activeEntries.map((e) => e.id),
    warmupTargets
  };
}

export async function warmupAgyAccount(
  explicitRefreshToken?: string,
  explicitModels?: string[]
): Promise<{ warmedModels: string[] }> {
  const refreshToken = resolveAgyRefreshToken(explicitRefreshToken);
  if (!refreshToken) {
    throw new Error('未找到有效的 Antigravity Refresh Token');
  }

  const accessToken = await exchangeRefreshToken(refreshToken);

  let projectId: string | undefined;
  try {
    const assist = await postCloudCode<{ cloudaicompanionProject?: string }>(
      '/v1internal:loadCodeAssist',
      accessToken,
      {
        metadata: {
          ideType: 'ANTIGRAVITY',
          platform: 'PLATFORM_UNSPECIFIED',
          pluginType: 'GEMINI'
        }
      }
    );
    projectId = assist.cloudaicompanionProject || undefined;
  } catch {
    // Optional projectId
  }

  let targetModels = (explicitModels ?? []).filter(Boolean);
  if (targetModels.length === 0) {
    const quota = await fetchAgyAccountQuota(refreshToken);
    targetModels = [
      quota.warmupTargets?.gemini,
      quota.warmupTargets?.claude,
      quota.warmupTargets?.argon
    ].filter((m): m is string => Boolean(m));
  }

  if (targetModels.length === 0) {
    throw new Error('该账号下没有可预热的模型');
  }

  const warmedModels: string[] = [];
  let lastError = '';

  for (const model of targetModels) {
    try {
      await postCloudCode(
        '/v1internal:generateContent',
        accessToken,
        {
          ...(projectId ? { project: projectId } : {}),
          model,
          request: {
            contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
            generationConfig: { maxOutputTokens: 1 }
          }
        },
        30000
      );
      warmedModels.push(model);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (warmedModels.length === 0) {
    throw new Error(lastError || '预热请求失败');
  }

  return { warmedModels };
}
