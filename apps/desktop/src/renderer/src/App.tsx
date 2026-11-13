import React, { useEffect } from 'react';
import { useArchpiStore } from './store/useArchpiStore';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { BoardView } from './components/BoardView';
import { WorkspaceView } from './components/WorkspaceView';
import { SettingsView } from './components/SettingsView';
import { NewWindowView } from './components/NewWindowView';
import { CursorTooltip } from './components/CursorTooltip';

export const App: React.FC = () => {
  const {
    initialized,
    initError,
    activeView,
    init,
    quotaAutoRefreshEnabled,
    quotaAutoRefreshIntervalMinutes,
    refreshAllAgyQuotas,
    userSettings
  } = useArchpiStore();

  useEffect(() => {
    document.documentElement.classList.toggle('use-system-font', Boolean(userSettings.useSystemFont));
  }, [userSettings.useSystemFont]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    init().then((unsub) => {
      if (disposed) {
        unsub();
      } else {
        cleanup = unsub;
      }
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [init]);

  useEffect(() => {
    if (!initialized || !quotaAutoRefreshEnabled) return;
    const intervalMinutes = Math.max(1, quotaAutoRefreshIntervalMinutes || 15);
    const intervalMs = intervalMinutes * 60_000;

    // Initial background check if any Antigravity account lacks fresh quota
    const state = useArchpiStore.getState();
    const now = Date.now();
    const needsInitial = state.savedProviders.some((p) => {
      if (p.config.provider === 'google') {
        const cached = state.agyQuotaByProviderId[p.id];
        return !cached || now - cached.fetchedAt >= intervalMs;
      }
      const hasUrl = Boolean(p.config.baseUrl?.trim());
      const hasKey = Boolean(
        p.config.apiKey?.trim() || p.config.apiKeys?.some((k) => k.key?.trim())
      );
      if (!hasUrl || !hasKey) return false;
      const cached = state.providerBalanceByProviderId[p.id];
      return !cached || now - cached.fetchedAt >= intervalMs;
    });
    if (needsInitial) {
      void refreshAllAgyQuotas();
    }

    const timer = window.setInterval(() => {
      void refreshAllAgyQuotas();
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [initialized, quotaAutoRefreshEnabled, quotaAutoRefreshIntervalMinutes, refreshAllAgyQuotas]);

  if (initError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#0e0e0e] text-xs text-rose-400">
        <div>Failed to initialize Arch Pi Runtime:</div>
        <div className="rounded bg-white/5 px-3 py-1.5 font-mono text-neutral-300">{initError}</div>
      </div>
    );
  }

  if (!initialized) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0e0e0e] text-xs text-neutral-400">
        Initializing Arch Pi Runtime...
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#0e0e0e] text-neutral-100">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Right Column: Top Project Details Bar + Rounded Main Container */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden pr-3 pb-3">
        <TopBar />

        <main className="flex-1 overflow-hidden rounded-2xl bg-[#161616]">
          {activeView === 'board' ? (
            <BoardView />
          ) : activeView === 'workspace' ? (
            <WorkspaceView />
          ) : activeView === 'new_window' ? (
            <NewWindowView />
          ) : (
            <SettingsView />
          )}
        </main>
      </div>

      <CursorTooltip />
    </div>
  );
};

export default App;
