import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type {
  AgentProviderAdapter,
  ProviderAuthOptions,
  ProviderChatTurnInput,
  ProviderChatTurnResult,
  ProviderModelInfo,
  ProviderStreamEvent
} from './types.js';

const execFileAsync = promisify(execFile);

export interface GeminiAgyAdapterOptions {
  resourcesDir: string;
  agyExecutable?: string;
}

export class GeminiAgyAdapter implements AgentProviderAdapter {
  readonly kind = 'gemini-agy' as const;
  private readonly resourcesDir: string;
  private readonly defaultAgyExe: string;

  constructor(options: GeminiAgyAdapterOptions) {
    this.resourcesDir = options.resourcesDir;
    this.defaultAgyExe =
      options.agyExecutable ??
      (process.env.LOCALAPPDATA
        ? join(process.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe')
        : 'agy');
  }

  private buildLaunchSpec(
    agyArgs: string[],
    auth?: ProviderAuthOptions
  ): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
    const agyExe = auth?.executablePath || this.defaultAgyExe;
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.JETSKI_OAUTH_TOKEN;

    const refreshToken = auth?.refreshToken?.trim();
    if (refreshToken) {
      const runnerExe = join(this.resourcesDir, 'agy_hook_runner.exe');
      const hookDll = join(this.resourcesDir, 'agy_rt_hook.dll');
      return {
        command: runnerExe,
        args: [hookDll, agyExe, ...agyArgs],
        env: { ...env, ARCHPI_HOOK_REFRESH_TOKEN: refreshToken }
      };
    }

    return { command: agyExe, args: agyArgs, env };
  }

  async listModels(auth?: ProviderAuthOptions): Promise<{
    raw: string;
    models: ProviderModelInfo[];
  }> {
    const spec = this.buildLaunchSpec(['models'], auth);
    const { stdout } = await execFileAsync(spec.command, spec.args, {
      encoding: 'utf8',
      timeout: 20000,
      env: spec.env,
      windowsHide: true
    });

    const models: ProviderModelInfo[] = [];
    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('Fetching ')) continue;
      const [id, ...rest] = trimmed.split('\t');
      if (id) {
        models.push({ id: id.trim(), label: rest.join('\t').trim() || id.trim() });
      }
    }
    return { raw: stdout, models };
  }

  async streamChat(
    input: ProviderChatTurnInput,
    onEvent: (event: ProviderStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<ProviderChatTurnResult> {
    const agyArgs = [
      '--model',
      input.model,
      '--output-format',
      'stream-json'
    ];
    if (input.conversationId) {
      agyArgs.push('--conversation', input.conversationId);
    }

    const spec = this.buildLaunchSpec(agyArgs, input.auth);

    return await new Promise<ProviderChatTurnResult>((resolve, reject) => {
      const child = spawn(spec.command, spec.args, {
        cwd: input.cwd,
        env: spec.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      // Pass prompt via stdin instead of `-p=...` to avoid Windows cmdline quoting
      // issues (e.g. unescaped `"` in agy_hook_runner.c) and command-line length limits.
      child.stdin.on('error', () => {});
      child.stdin.end(input.prompt, 'utf8');

      let conversationId = input.conversationId;
      let response = '';
      let thinking = '';
      let buffer = '';
      let stderrBuf = '';
      let aborted = false;

      const killProcessTree = () => {
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/T', '/F', '/PID', String(child.pid)], {
            stdio: 'ignore',
            windowsHide: true
          });
        }
        try {
          child.kill();
        } catch {
          // ignore
        }
      };

      const onAbort = () => {
        aborted = true;
        killProcessTree();
      };
      if (signal?.aborted) {
        aborted = true;
        killProcessTree();
      } else {
        signal?.addEventListener('abort', onAbort, { once: true });
      }

      const processLine = (rawLine: string) => {
        const line = rawLine.trim();
        if (!line) return;
        let evt: Record<string, unknown>;
        try {
          evt = JSON.parse(line) as Record<string, unknown>;
        } catch {
          return;
        }

        if (typeof evt.conversation_id === 'string' && evt.conversation_id) {
          conversationId = evt.conversation_id;
        }

        if (evt.event === 'init') {
          const initObj = (evt.init ?? {}) as Record<string, unknown>;
          onEvent({
            type: 'init',
            conversationId: conversationId ?? '',
            model: typeof initObj.model === 'string' ? initObj.model : input.model
          });
          return;
        }

        if (evt.event === 'step_update') {
          const su = (evt.step_update ?? {}) as Record<string, unknown>;
          const thinkingDelta =
            typeof su.thinking_delta === 'string'
              ? su.thinking_delta
              : typeof su.thinking === 'string'
                ? su.thinking
                : '';
          if (thinkingDelta) {
            thinking += thinkingDelta;
            onEvent({ type: 'thinking_delta', text: thinkingDelta });
          }
          if (typeof su.text_delta === 'string' && su.text_delta) {
            response += su.text_delta;
            onEvent({ type: 'text_delta', text: su.text_delta });
          }
          return;
        }

        if (evt.event === 'result') {
          const resObj = (evt.result ?? {}) as Record<string, unknown>;
          const finalText =
            typeof resObj.response === 'string' ? resObj.response : response;
          const usage = (resObj.usage ?? undefined) as Record<string, number> | undefined;
          onEvent({
            type: 'done',
            conversationId,
            response: finalText,
            durationSeconds:
              typeof resObj.duration_seconds === 'number'
                ? resObj.duration_seconds
                : undefined,
            usage: usage
              ? {
                  inputTokens: usage.input_tokens,
                  outputTokens: usage.output_tokens,
                  thinkingTokens: usage.thinking_tokens,
                  cacheReadTokens: usage.cache_read_tokens,
                  totalTokens: usage.total_tokens
                }
              : undefined
          });
        }
      };

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        buffer += chunk;
        let nl = buffer.indexOf('\n');
        while (nl !== -1) {
          processLine(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
          nl = buffer.indexOf('\n');
        }
      });

      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderrBuf += chunk;
      });

      child.on('error', (err) => {
        signal?.removeEventListener('abort', onAbort);
        onEvent({ type: 'error', message: err.message });
        reject(err);
      });

      child.on('close', (code) => {
        signal?.removeEventListener('abort', onAbort);
        if (buffer.trim()) {
          processLine(buffer);
        }
        if (code === 0) {
          resolve({ conversationId, response, thinking });
        } else if (aborted || signal?.aborted) {
          const reason =
            signal?.reason instanceof Error
              ? signal.reason
              : new Error(typeof signal?.reason === 'string' ? signal.reason : 'agy aborted');
          onEvent({ type: 'error', message: reason.message });
          reject(reason);
        } else {
          const msg = stderrBuf.trim() || `agy exited with code ${code ?? 'unknown'}`;
          onEvent({ type: 'error', message: msg });
          reject(new Error(msg));
        }
      });
    });
  }
}
