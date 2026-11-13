import type { ProviderBalanceInfo } from '@archpi/shared';

interface UsageSpendSnapshot {
  cost?: unknown;
  actual_cost?: unknown;
}

interface Sub2ApiUsageResponse {
  balance?: unknown;
  remaining?: unknown;
  unit?: unknown;
  planName?: unknown;
  usage?: {
    today?: UsageSpendSnapshot;
    total?: UsageSpendSnapshot;
  };
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function pickCost(snapshot?: UsageSpendSnapshot): number | undefined {
  if (!snapshot || typeof snapshot !== 'object') return undefined;
  return toFiniteNumber(snapshot.actual_cost) ?? toFiniteNumber(snapshot.cost);
}

/**
 * Normalize a provider base URL and resolve the Sub2API-compatible `/v1/usage` endpoint.
 */
function buildUsageEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  const root = trimmed.replace(/\/v1$/i, '');
  return `${root}/v1/usage`;
}

/**
 * Fetch remaining balance and historical spend from a Sub2API-compatible `/v1/usage` endpoint.
 */
export async function fetchProviderBalance(
  baseUrl: string,
  apiKey: string
): Promise<ProviderBalanceInfo> {
  if (!baseUrl.trim()) {
    throw new Error('未配置 Base URL');
  }
  if (!apiKey.trim()) {
    throw new Error('未配置 API Key');
  }

  const endpoint = buildUsageEndpoint(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`余额查询失败 (HTTP ${res.status})`);
    }

    const data = (await res.json()) as Sub2ApiUsageResponse;
    const balance = toFiniteNumber(data?.remaining) ?? toFiniteNumber(data?.balance);
    if (balance === undefined) {
      throw new Error('接口未返回有效的余额字段');
    }

    const unit = typeof data.unit === 'string' && data.unit.trim() ? data.unit.trim() : 'USD';
    const planName =
      typeof data.planName === 'string' && data.planName.trim() ? data.planName.trim() : undefined;

    return {
      fetchedAt: Date.now(),
      balance,
      unit,
      planName,
      todayCost: pickCost(data.usage?.today),
      totalCost: pickCost(data.usage?.total)
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('余额查询超时');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
