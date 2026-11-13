export type ProviderKind = 'gemini-agy' | 'codex' | 'glm-zcode' | (string & {});

export interface ProviderModelInfo {
  id: string;
  label: string;
}

export interface ProviderAuthOptions {
  refreshToken?: string;
  apiKey?: string;
  executablePath?: string;
}

export type ProviderStreamEvent =
  | { type: 'init'; conversationId: string; model: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'text_delta'; text: string }
  | {
      type: 'done';
      conversationId?: string;
      response: string;
      durationSeconds?: number;
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
        thinkingTokens?: number;
        cacheReadTokens?: number;
        totalTokens?: number;
      };
    }
  | { type: 'error'; message: string };

export interface ProviderChatTurnInput {
  prompt: string;
  model: string;
  conversationId?: string;
  cwd?: string;
  auth?: ProviderAuthOptions;
}

export interface ProviderChatTurnResult {
  conversationId?: string;
  response: string;
  thinking: string;
}

export interface AgentProviderAdapter {
  readonly kind: ProviderKind;
  listModels(auth?: ProviderAuthOptions): Promise<{
    raw: string;
    models: ProviderModelInfo[];
  }>;
  streamChat(
    input: ProviderChatTurnInput,
    onEvent: (event: ProviderStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<ProviderChatTurnResult>;
}
