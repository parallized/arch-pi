import React, { useEffect, useState } from 'react';
import {
  ViewColumns2,
  Copy,
  Cpu,
  GitBranch,
  Lock,
  Microphone,
  Minus,
  Settings,
  SidebarExpand,
  Square,
  Xmark
} from 'iconoir-react';
import { useArchpiStore } from '../store/useArchpiStore';
import { useT } from '../i18n';

export const TopBar: React.FC = () => {
  const {
    projects,
    windows,
    activeProjectId,
    activeWindowId,
    activeView,
    settingsTab,
    sidebarCollapsed,
    splitSecondaryWindowId,
    masterWorkerLink,
    toggleSidebar,
    setSettingsTab,
    setSplitSecondaryWindow
  } = useArchpiStore();

  const t = useT();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    window.archpi.windowIsMaximized().then(setIsMaximized).catch(() => {});
  }, []);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? projects[0];
  const activeWindow = windows.find((w) => w.id === activeWindowId);
  const isSplitLocked = Boolean(masterWorkerLink?.locked && splitSecondaryWindowId);

  return (
    <header className="titlebar-drag flex h-12 shrink-0 items-center justify-between pl-4 pr-1 pt-1">
      {/* Left: Project Details or Settings Bookmark Tabs */}
      <div
        className={`titlebar-no-drag flex min-w-0 gap-3 ${
          activeView === 'settings' ? 'h-full items-end' : 'items-center'
        }`}
      >
        {sidebarCollapsed && (
          <button
            onClick={toggleSidebar}
            data-tooltip={t.sidebar.expandSidebar}
            className={`rounded-md p-1.5 text-neutral-400 hover:bg-white/5 hover:text-neutral-200 ${
              activeView === 'settings' ? 'mb-1.5' : ''
            }`}
          >
            <SidebarExpand className="h-4 w-4" />
          </button>
        )}

        {activeView === 'settings' ? (
          <nav aria-label="Settings navigation" className="flex items-end gap-1.5">
            <button
              type="button"
              onClick={() => setSettingsTab('general')}
              className={`flex items-center justify-center gap-1.5 rounded-t-xl px-4 text-xs font-medium transition-all ${
                settingsTab === 'general'
                  ? 'bg-emerald-500/25 py-2.5 text-emerald-200'
                  : 'bg-emerald-500/[0.08] py-2 text-emerald-300/60 hover:bg-emerald-500/15 hover:text-emerald-200'
              }`}
            >
              <Settings className="h-3.5 w-3.5 text-emerald-400" />
              <span>{t.topbar.tabGeneral}</span>
            </button>

            <button
              type="button"
              onClick={() => setSettingsTab('provider')}
              className={`flex items-center justify-center gap-1.5 rounded-t-xl px-4 text-xs font-medium transition-all ${
                settingsTab === 'provider'
                  ? 'bg-violet-500/25 py-2.5 text-violet-200'
                  : 'bg-violet-500/[0.08] py-2 text-violet-300/60 hover:bg-violet-500/15 hover:text-violet-200'
              }`}
            >
              <Cpu className="h-3.5 w-3.5 text-violet-400" />
              <span>{t.topbar.tabProvider}</span>
            </button>

            <button
              type="button"
              onClick={() => setSettingsTab('voice')}
              className={`flex items-center justify-center gap-1.5 rounded-t-xl px-4 text-xs font-medium transition-all ${
                settingsTab === 'voice'
                  ? 'bg-amber-500/25 py-2.5 text-amber-200'
                  : 'bg-amber-500/[0.08] py-2 text-amber-300/60 hover:bg-amber-500/15 hover:text-amber-200'
              }`}
            >
              <Microphone className="h-3.5 w-3.5 text-amber-400" />
              <span>{t.topbar.tabVoice}</span>
            </button>
          </nav>
        ) : (
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="truncate text-sm font-semibold text-neutral-100">
              {activeProject?.name ?? 'Arch Pi'}
            </h1>
            {activeProject && (
              <span className="flex items-center gap-1 rounded-md bg-[#1a1a1a] px-2 py-0.5 text-[11px] text-neutral-400">
                <GitBranch className="h-3 w-3 text-neutral-500" />
                {activeWindow?.branch || activeProject.branch}
              </span>
            )}
            <span className="hidden max-w-[280px] truncate text-xs text-neutral-500 sm:inline-block">
              {activeProject?.rootPath}
            </span>
          </div>
        )}
      </div>

      {/* Right: Optional Split + Custom Window Controls */}
      <div className="titlebar-no-drag flex items-center gap-2">
        {activeView === 'workspace' && (
          <button
            disabled={isSplitLocked}
            onClick={() => {
              if (isSplitLocked) return;
              if (splitSecondaryWindowId) {
                setSplitSecondaryWindow(null);
              } else {
                const other = windows.find(
                  (w) =>
                    w.projectId === activeProject?.id &&
                    !w.archived &&
                    w.id !== activeWindowId
                );
                if (other) setSplitSecondaryWindow(other.id);
              }
            }}
            data-tooltip={isSplitLocked ? t.topbar.splitLockedTooltip : t.topbar.splitTooltip}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
              isSplitLocked
                ? 'cursor-not-allowed bg-white/[0.12] text-neutral-100'
                : splitSecondaryWindowId
                  ? 'bg-white/[0.12] text-neutral-100'
                  : 'bg-[#1a1a1a] text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <ViewColumns2 className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{t.topbar.split}</span>
            {isSplitLocked && <Lock className="h-3 w-3 text-violet-300" />}
          </button>
        )}

        {/* Custom Window Controls (Minimize / Maximize / Close) */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => window.archpi.windowMinimize()}
            data-tooltip={t.topbar.minimize}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/[0.08] hover:text-neutral-100 transition-colors"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={async () => {
              const next = await window.archpi.windowToggleMaximize();
              setIsMaximized(next);
            }}
            data-tooltip={isMaximized ? t.topbar.restore : t.topbar.maximize}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/[0.08] hover:text-neutral-100 transition-colors"
          >
            {isMaximized ? (
              <Copy className="h-3 w-3" />
            ) : (
              <Square className="h-3 w-3" />
            )}
          </button>
          <button
            onClick={() => window.archpi.windowClose()}
            data-tooltip={t.topbar.close}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
          >
            <Xmark className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
