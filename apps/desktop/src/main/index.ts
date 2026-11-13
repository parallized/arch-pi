import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import { ArchpiRuntime, GeminiAgyAdapter, ProviderRegistry } from '@archpi/agent-runtime';
import { fetchAgyAccountQuota, warmupAgyAccount } from './agyQuota';
import { fetchProviderBalance } from './providerBalance';
import type {
  CreateWindowInput,
  DispatchPlanInput,
  ProviderConfig,
  UserSettings,
  VoiceInputConfig,
  WindowStatus
} from '@archpi/shared';

const resourcesDir = app.isPackaged
  ? join(process.resourcesPath)
  : join(__dirname, '../../resources');

let mainWindow: BrowserWindow | null = null;
const runtime = new ArchpiRuntime({
  defaultProjectPath: app.isPackaged ? homedir() : process.cwd(),
  resourcesDir
});

function createMainWindow(): void {
  const iconPath = join(resourcesDir, 'icon.png');
  const settings = runtime.getUserSettings();
  const savedBounds = settings.rememberWindowBounds !== false ? settings.windowBounds : undefined;
  const width = savedBounds?.width && savedBounds.width >= 600 ? savedBounds.width : 1380;
  const height = savedBounds?.height && savedBounds.height >= 400 ? savedBounds.height : 860;

  mainWindow = new BrowserWindow({
    width,
    height,
    ...(typeof savedBounds?.x === 'number' && typeof savedBounds?.y === 'number'
      ? { x: savedBounds.x, y: savedBounds.y }
      : {}),
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0e0e0e',
    frame: false,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (savedBounds?.maximized) {
    mainWindow.maximize();
  }

  let boundsSaveTimer: NodeJS.Timeout | null = null;
  const scheduleSaveBounds = () => {
    if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
    boundsSaveTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (runtime.getUserSettings().rememberWindowBounds === false) return;
      const maximized = mainWindow.isMaximized();
      const bounds = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
      void runtime.updateSettings({
        windowBounds: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          maximized
        }
      });
    }, 500);
  };

  mainWindow.on('resize', scheduleSaveBounds);
  mainWindow.on('move', scheduleSaveBounds);
  mainWindow.on('close', () => {
    if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (runtime.getUserSettings().rememberWindowBounds === false) return;
    const maximized = mainWindow.isMaximized();
    const bounds = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    void runtime.updateSettings({
      windowBounds: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        maximized
      }
    });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function registerIpcHandlers(): void {
  const prevWindowStatus = new Map<string, WindowStatus>();

  runtime.subscribe((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('archpi:event', event);
    }

    if (event.type === 'snapshot') {
      prevWindowStatus.clear();
      for (const w of event.snapshot.windows) {
        prevWindowStatus.set(w.id, w.status);
      }
    } else if (event.type === 'window_updated') {
      const prev = prevWindowStatus.get(event.window.id);
      const next = event.window.status;
      prevWindowStatus.set(event.window.id, next);

      const settings = runtime.getUserSettings();
      const shouldNotify =
        settings.desktopNotifications !== false &&
        Notification.isSupported() &&
        (settings.notifyOnlyWhenUnfocused === false || !mainWindow?.isFocused()) &&
        ((prev === 'working' && (next === 'ready' || next === 'idle' || next === 'in_review')) ||
          (prev !== 'needs_you' && next === 'needs_you'));

      if (shouldNotify) {
        const isZh = (settings.language ?? 'zh') === 'zh';
        const statusText =
          next === 'needs_you'
            ? isZh
              ? '需要你的确认或输入'
              : 'Needs your attention'
            : next === 'in_review'
              ? isZh
                ? '已进入待审阅状态'
                : 'Ready for review'
              : isZh
                ? '已完成当前任务'
                : 'Task completed';
        const notification = new Notification({
          title: event.window.title || 'Arch Pi',
          body: statusText
        });
        notification.on('click', () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        });
        notification.show();
      }
    }
  });

  ipcMain.handle('archpi:getSnapshot', () => runtime.getSnapshot());
  ipcMain.handle(
    'archpi:createProject',
    (_e, input: { name: string; rootPath: string; branch?: string }) =>
      runtime.createProject(input)
  );
  ipcMain.handle('archpi:createWindow', (_e, input: CreateWindowInput) =>
    runtime.createWindow(input)
  );
  ipcMain.handle('archpi:renameWindow', (_e, windowId: string, title: string) =>
    runtime.renameWindow(windowId, title)
  );
  ipcMain.handle('archpi:archiveWindow', (_e, windowId: string, archived?: boolean) =>
    runtime.archiveWindow(windowId, archived)
  );
  ipcMain.handle('archpi:closeWindow', (_e, windowId: string) =>
    runtime.closeWindow(windowId)
  );
  ipcMain.handle(
    'archpi:sendMessage',
    (
      _e,
      windowId: string,
      content: string,
      options?: { model?: string; providerId?: string; thinkingLevel?: any }
    ) => runtime.sendMessage(windowId, content, options)
  );
  ipcMain.handle('archpi:dispatchPlan', (_e, input: DispatchPlanInput) =>
    runtime.dispatchPlan(input)
  );
  ipcMain.handle(
    'archpi:requestReview',
    (
      _e,
      input: {
        planId: string;
        workerWindowId: string;
        reviewerWindowId: string;
        summary?: string;
      }
    ) => runtime.requestReview(input)
  );
  ipcMain.handle('archpi:updateProviderConfig', (_e, config: ProviderConfig) =>
    runtime.updateProviderConfig(config)
  );
  ipcMain.handle('archpi:syncProviderConfigs', (_e, configs: ProviderConfig[]) =>
    runtime.syncProviderConfigs(configs)
  );
  ipcMain.handle('archpi:updateVoiceConfig', (_e, config: VoiceInputConfig) =>
    runtime.updateVoiceConfig(config)
  );
  ipcMain.handle('archpi:updateSettings', (_e, patch: Partial<UserSettings>) =>
    runtime.updateSettings(patch)
  );
  ipcMain.handle('archpi:testAgyModels', async (_e, refreshToken?: string) => {
    const desktopModelsPath = join(homedir(), 'Desktop', 'models.txt');
    const resourcesDir = app.isPackaged
      ? join(process.resourcesPath)
      : join(__dirname, '../../resources');
    const registry = new ProviderRegistry().register(
      new GeminiAgyAdapter({ resourcesDir })
    );

    try {
      const { raw, models } = await registry.get('gemini-agy').listModels({
        refreshToken
      });
      writeFileSync(desktopModelsPath, raw, 'utf8');
      return { ok: true, output: raw, models, filePath: desktopModelsPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, output: '', models: [], filePath: desktopModelsPath, error: message };
    }
  });
  const getAgyExe = () =>
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe')
      : 'agy';

  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

  const parseAgyModelsOutput = (stdout: string): string[] =>
    Array.from(
      new Set(
        stripAnsi(stdout)
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#') && !line.startsWith('Fetching'))
          .map((line) => line.split(/\s+/)[0])
          .filter((id) => /^[a-z0-9][a-z0-9._-]+$/i.test(id))
      )
    );

  const readAgyLocalProfile = (): { email?: string; refreshToken?: string } => {
    let email: string | undefined;
    let refreshToken: string | undefined;
    try {
      const accountsPath = join(homedir(), '.gemini', 'google_accounts.json');
      if (existsSync(accountsPath)) {
        const parsed = JSON.parse(readFileSync(accountsPath, 'utf8')) as { active?: string };
        if (typeof parsed.active === 'string' && parsed.active.includes('@')) {
          email = parsed.active.trim();
        }
      }
    } catch {
      // Optional local accounts file
    }
    try {
      const credsPath = join(homedir(), '.gemini', 'oauth_creds.json');
      if (existsSync(credsPath)) {
        const parsed = JSON.parse(readFileSync(credsPath, 'utf8')) as { refresh_token?: string };
        if (typeof parsed.refresh_token === 'string' && parsed.refresh_token.trim()) {
          refreshToken = parsed.refresh_token.trim();
        }
      }
    } catch {
      // Optional local oauth creds file
    }
    return { email, refreshToken };
  };

  const agyResourcesDir = app.isPackaged
    ? join(process.resourcesPath)
    : join(__dirname, '../../resources');
  const agyAdapter = new GeminiAgyAdapter({ resourcesDir: agyResourcesDir });

  ipcMain.handle('archpi:fetchAgyModels', async (_e, refreshToken?: string) => {
    try {
      const { models } = await agyAdapter.listModels(
        refreshToken?.trim() ? { refreshToken: refreshToken.trim() } : undefined
      );
      return { ok: true, models: models.map((m) => m.id) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('archpi:importAgyFromCli', async () => {
    try {
      const { models } = await agyAdapter.listModels();
      const { email } = readAgyLocalProfile();
      return { ok: true, email, models: models.map((m) => m.id) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('archpi:startAgyOAuth', async () => {
    const agyExe = getAgyExe();
    return new Promise<{
      ok: boolean;
      email?: string;
      refreshToken?: string;
      models?: string[];
      error?: string;
    }>((resolve) => {
      let stdout = '';
      let stderr = '';
      let openedUrl = false;
      let settled = false;

      const child = spawn(agyExe, ['models'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        resolve({ ok: false, error: 'OAuth 授权超时，请重试' });
      }, 90000);

      const maybeOpenAuthUrl = (chunk: string) => {
        if (openedUrl) return;
        const match = stripAnsi(chunk).match(/https:\/\/accounts\.google\.com\/[^\s"'<>]+/);
        if (match) {
          openedUrl = true;
          void shell.openExternal(match[0]);
        }
      };

      child.stdout?.on('data', (d: Buffer) => {
        const text = d.toString('utf8');
        stdout += text;
        maybeOpenAuthUrl(text);
      });

      child.stderr?.on('data', (d: Buffer) => {
        const text = d.toString('utf8');
        stderr += text;
        maybeOpenAuthUrl(text);
      });

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, error: err.message });
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const models = parseAgyModelsOutput(stdout);
        if (code !== 0 && models.length === 0) {
          const msg = stripAnsi(stderr || stdout).trim() || `agy exited with code ${code}`;
          resolve({ ok: false, error: msg });
          return;
        }
        const { email, refreshToken } = readAgyLocalProfile();
        resolve({ ok: true, email, refreshToken, models });
      });
    });
  });
  ipcMain.handle('archpi:fetchAgyQuota', async (_e, refreshToken?: string) => {
    try {
      const quota = await fetchAgyAccountQuota(refreshToken);
      return { ok: true, quota };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });
  ipcMain.handle(
    'archpi:fetchProviderBalance',
    async (_e, input: { baseUrl: string; apiKey: string }) => {
      try {
        const info = await fetchProviderBalance(input?.baseUrl ?? '', input?.apiKey ?? '');
        return { ok: true, info };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    }
  );
  ipcMain.handle(
    'archpi:warmupAgyAccount',
    async (_e, refreshToken?: string, models?: string[]) => {
      try {
        const result = await warmupAgyAccount(refreshToken, models);
        return { ok: true, warmedModels: result.warmedModels };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    }
  );
  ipcMain.handle('archpi:selectDirectory', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    return res.canceled ? null : res.filePaths[0] ?? null;
  });
  ipcMain.handle('archpi:windowMinimize', () => {
    mainWindow?.minimize();
  });
  ipcMain.handle('archpi:windowToggleMaximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    }
    mainWindow.maximize();
    return true;
  });
  ipcMain.handle('archpi:windowClose', () => {
    mainWindow?.close();
  });
  ipcMain.handle('archpi:windowIsMaximized', () => {
    return mainWindow?.isMaximized() ?? false;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

let isFlushingBeforeQuit = false;
app.on('before-quit', (event) => {
  if (isFlushingBeforeQuit) return;
  event.preventDefault();
  isFlushingBeforeQuit = true;
  void runtime.flushPendingWrites().finally(() => {
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
