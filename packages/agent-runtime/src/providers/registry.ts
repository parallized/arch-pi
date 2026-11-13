import type { AgentProviderAdapter, ProviderKind } from './types.js';

export class ProviderRegistry {
  private readonly adapters = new Map<ProviderKind, AgentProviderAdapter>();

  register(adapter: AgentProviderAdapter): this {
    this.adapters.set(adapter.kind, adapter);
    return this;
  }

  get(kind: ProviderKind): AgentProviderAdapter {
    const adapter = this.adapters.get(kind);
    if (!adapter) {
      throw new Error(`Provider adapter not registered: ${kind}`);
    }
    return adapter;
  }

  has(kind: ProviderKind): boolean {
    return this.adapters.has(kind);
  }

  listKinds(): ProviderKind[] {
    return Array.from(this.adapters.keys());
  }
}
