import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  EditPencil,
  Folder,
  FolderPlus,
  MoreHoriz,
  MoreVert,
  NavArrowDown,
  NavArrowRight,
  Plus,
  Search,
  Settings,
  SidebarCollapse,
  Trash
} from 'iconoir-react';

const FolderOpenIcon: React.FC<{ className?: string }> = ({ className = 'h-3.5 w-3.5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M2 11V4.6a.6.6 0 0 1 .6-.6h6.178a.6.6 0 0 1 .39.144l3.164 2.712a.6.6 0 0 0 .39.144H19.4a.6.6 0 0 1 .6.6V11" />
    <path d="M2.6 11h16.8a.6.6 0 0 1 .584.737l-1.56 6.8a.6.6 0 0 1-.584.463H4.16a.6.6 0 0 1-.584-.463l-1.56-6.8A.6.6 0 0 1 2.6 11Z" />
  </svg>
);
import archPiLogo from '../assets/logo.svg';
import { useArchpiStore } from '../store/useArchpiStore';
import { ROLE_BADGE_META, WINDOW_STATUS_META } from './statusTheme';
import { useT } from '../i18n';
import { TopGlowBox } from './TopGlowBox';
import { SidebarQuotaCard } from './SidebarQuotaCard';

export const Sidebar: React.FC = () => {
  const {
    projects,
    windows,
    activeProjectId,
    activeWindowId,
    splitSecondaryWindowId,
    masterWorkerLinks,
    activeView,
    searchQuery,
    sidebarCollapsed,
    setActiveProject,
    setActiveWindow,
    setActiveView,
    setSearchQuery,
    toggleSidebar,
    openNewWindow,
    createProject,
    renameWindow,
    archiveWindow,
    closeWindow
  } = useArchpiStore();
  const t = useT();

  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [addingProject, setAddingProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [menuWindow, setMenuWindow] = useState<{
    id: string;
    left: number;
    top: number;
    openUp: boolean;
  } | null>(null);
  const [renamingWindowId, setRenamingWindowId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const windowMenuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuProjectId) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuProjectId(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuProjectId(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuProjectId]);

  useEffect(() => {
    if (!menuWindow) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-window-menu-trigger]')) return;
      if (windowMenuRef.current && !windowMenuRef.current.contains(target)) {
        setMenuWindow(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuWindow(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuWindow]);

  useEffect(() => {
    if (!renamingWindowId) return;
    const id = requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [renamingWindowId]);

  const commitRename = async (windowId: string, originalTitle: string) => {
    const next = renameDraft.trim();
    setRenamingWindowId(null);
    if (next && next !== originalTitle) {
      await renameWindow(windowId, next);
    }
  };

  if (sidebarCollapsed) return null;

  const toggleProjectFolder = (projectId: string) => {
    setCollapsedProjects((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const expandProjectFolder = (projectId: string) => {
    setCollapsedProjects((prev) => (prev[projectId] ? { ...prev, [projectId]: false } : prev));
  };

  const handleAddProject = async () => {
    const dir = await window.archpi.selectDirectory();
    if (!dir) return;
    const baseName = dir.split(/[\\/]/).filter(Boolean).pop() || 'workspace';
    await createProject({
      name: projectName.trim() || baseName,
      rootPath: dir,
      branch: 'main'
    });
    setProjectName('');
    setAddingProject(false);
  };

  const q = searchQuery.trim().toLowerCase();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-[#0e0e0e] text-neutral-300 select-none">
      {/* Top Brand Bar */}
      <div className="titlebar-drag flex h-12 items-center justify-between px-3.5 pt-1">
        <div className="titlebar-no-drag flex items-center gap-2.5">
          <img
            src={archPiLogo}
            alt="Arch Pi"
            className="h-5 w-auto [image-rendering:pixelated]"
          />
          <span className="text-[17px] font-bold tracking-tight text-neutral-100">
            Arch Pi
          </span>
        </div>
        <button
          onClick={toggleSidebar}
          data-tooltip={t.sidebar.collapseSidebar}
          className="titlebar-no-drag rounded-md p-1 text-neutral-500 hover:bg-white/5 hover:text-neutral-200 transition-colors"
        >
          <SidebarCollapse className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-3 pt-1">
        <div className="flex items-center gap-2 rounded-lg bg-[#181818] px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.sidebar.search}
            className="w-full bg-transparent text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none"
          />
          <kbd className="whitespace-nowrap rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-neutral-500">
            {/mac/i.test(navigator.platform) ? '⌘ K' : 'Ctrl + K'}
          </kbd>
        </div>
      </div>

      {/* Projects & Alive Windows */}
      <div
        onScroll={() => {
          if (menuWindow) setMenuWindow(null);
        }}
        className="flex-1 overflow-y-auto px-2"
      >
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            {t.sidebar.projects}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleAddProject}
              data-tooltip={t.sidebar.openProjectDir}
              className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {addingProject && (
          <div className="mx-1 mb-2 rounded-lg bg-[#181818] p-2">
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={t.sidebar.projectAliasPlaceholder}
              className="mb-1.5 w-full rounded bg-black/30 px-2 py-1 text-xs text-neutral-200 focus:outline-none"
            />
          </div>
        )}

        <div className="space-y-1">
          {projects.map((project) => {
            const isProjectActive = project.id === activeProjectId && activeView === 'board';
            const isCollapsed = collapsedProjects[project.id];
            const projectWindows = windows.filter(
              (w) =>
                w.projectId === project.id &&
                !w.archived &&
                (!q || w.title.toLowerCase().includes(q) || w.role.includes(q))
            );

            return (
              <div key={project.id} className="space-y-0.5">
                <div
                  onClick={() => {
                    setActiveProject(project.id);
                    expandProjectFolder(project.id);
                  }}
                  className={`group flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors ${
                    isProjectActive
                      ? 'bg-white/[0.06] text-zinc-100'
                      : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleProjectFolder(project.id);
                      }}
                      data-tooltip={isCollapsed ? t.sidebar.expandProject : t.sidebar.collapseProject}
                      className="shrink-0 text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      {isCollapsed ? (
                        <Folder className="h-3.5 w-3.5" />
                      ) : (
                        <FolderOpenIcon className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <span className="truncate font-medium">{project.name}</span>
                  </div>
                  <div
                    ref={menuProjectId === project.id ? menuRef : undefined}
                    className="relative flex shrink-0 items-center gap-0.5 text-zinc-500"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleProjectFolder(project.id);
                      }}
                      data-tooltip={isCollapsed ? t.sidebar.expand : t.sidebar.collapse}
                      className="rounded p-0.5 hover:bg-white/10 hover:text-zinc-200 transition-colors"
                    >
                      {isCollapsed ? (
                        <NavArrowRight className="h-3.5 w-3.5" />
                      ) : (
                        <NavArrowDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuProjectId((prev) => (prev === project.id ? null : project.id));
                      }}
                      data-tooltip={t.sidebar.projectMenu}
                      className={`rounded p-0.5 transition-colors ${
                        menuProjectId === project.id
                          ? 'bg-white/10 text-zinc-200'
                          : 'hover:bg-white/10 hover:text-zinc-200'
                      }`}
                    >
                      <MoreHoriz className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openNewWindow(project.id);
                      }}
                      data-tooltip={t.sidebar.newWindow}
                      className="rounded p-0.5 hover:bg-white/10 hover:text-zinc-200 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>

                    {menuProjectId === project.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="animate-menu-pop absolute right-0 top-full z-50 mt-1 w-36"
                      >
                        <TopGlowBox
                          roundedClassName="rounded-xl"
                          innerRoundedClassName="rounded-[11px]"
                          innerClassName="p-1 shadow-xl shadow-black/50"
                        >
                          <div className="flex flex-col gap-0.5">
                            {[
                              {
                                label: t.sidebar.openBoard,
                                onClick: () => {
                                  setActiveProject(project.id);
                                  setMenuProjectId(null);
                                }
                              },
                              {
                                label: t.sidebar.newWindow,
                                onClick: () => {
                                  openNewWindow(project.id);
                                  setMenuProjectId(null);
                                }
                              },
                              {
                                label: isCollapsed
                                  ? t.sidebar.expandFolder
                                  : t.sidebar.collapseFolder,
                                onClick: () => {
                                  toggleProjectFolder(project.id);
                                  setMenuProjectId(null);
                                }
                              }
                            ].map((item, idx) => (
                              <button
                                key={item.label}
                                type="button"
                                onClick={item.onClick}
                                style={{ animationDelay: `${0.03 + idx * 0.035}s` }}
                                className="animate-menu-item w-full rounded-[8px] px-2.5 py-1.5 text-left text-xs text-neutral-300 hover:bg-white/[0.06] hover:text-neutral-100 transition-colors"
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </TopGlowBox>
                      </div>
                    )}
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="relative space-y-0.5">
                    {masterWorkerLinks.map((link) => {
                      const masterIdx = projectWindows.findIndex(
                        (w) => w.id === link.masterWindowId
                      );
                      const workerIdx = projectWindows.findIndex(
                        (w) => w.id === link.workerWindowId
                      );
                      if (masterIdx === -1 || workerIdx === -1 || masterIdx === workerIdx) {
                        return null;
                      }
                      const rowStride = 34; // h-8 (32px) + space-y-0.5 (2px)
                      const masterY = masterIdx * rowStride + 16;
                      const workerY = workerIdx * rowStride + 16;
                      const topY = Math.min(masterY, workerY);
                      const bottomY = Math.max(masterY, workerY);
                      const xRight = 20;
                      const xLeft = 7;
                      const r = 5;
                      const pathD = [
                        `M ${xRight} ${topY}`,
                        `L ${xLeft + r} ${topY}`,
                        `Q ${xLeft} ${topY} ${xLeft} ${topY + r}`,
                        `L ${xLeft} ${bottomY - r}`,
                        `Q ${xLeft} ${bottomY} ${xLeft + r} ${bottomY}`,
                        `L ${xRight} ${bottomY}`
                      ].join(' ');
                      const gradId = `mw-link-${project.id}-${link.masterWindowId}-${link.workerWindowId}`;
                      return (
                        <svg
                          key={gradId}
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0 left-0 z-10 h-full w-6 overflow-visible"
                        >
                          <defs>
                            <linearGradient
                              id={gradId}
                              gradientUnits="userSpaceOnUse"
                              x1="0"
                              y1={masterY}
                              x2="0"
                              y2={workerY}
                            >
                              <stop offset="0%" stopColor="#a855f7" />
                              <stop offset="100%" stopColor="#737373" />
                            </linearGradient>
                          </defs>
                          <path
                            d={pathD}
                            fill="none"
                            stroke={`url(#${gradId})`}
                            strokeWidth="1.75"
                            strokeLinecap="round"
                          />
                        </svg>
                      );
                    })}
                    {projectWindows.map((win, idx) => {
                      const isWinActive =
                        (win.id === activeWindowId || win.id === splitSecondaryWindowId) &&
                        activeView === 'workspace';
                      const isLockedWin = masterWorkerLinks.some(
                        (link) =>
                          link.locked &&
                          (win.id === link.masterWindowId || win.id === link.workerWindowId)
                      );
                      const roleMeta = ROLE_BADGE_META[win.role];
                      const isMenuOpen = menuWindow?.id === win.id;
                      const isRenaming = renamingWindowId === win.id;

                      return (
                        <div
                          key={win.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (!isRenaming) setActiveWindow(win.id);
                          }}
                          onKeyDown={(e) => {
                            if (!isRenaming && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              setActiveWindow(win.id);
                            }
                          }}
                          style={{ animationDelay: `${0.02 + idx * 0.035}s` }}
                          className={`group/win animate-menu-item flex h-8 w-full cursor-pointer items-center justify-between rounded-lg px-2 text-left text-xs transition-colors ${
                            isWinActive || isMenuOpen
                              ? 'bg-white/[0.08] text-neutral-100'
                              : 'text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200'
                          }`}
                        >
                          {isRenaming ? (
                            <input
                              ref={renameInputRef}
                              type="text"
                              value={renameDraft}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter') {
                                  void commitRename(win.id, win.title);
                                } else if (e.key === 'Escape') {
                                  setRenamingWindowId(null);
                                }
                              }}
                              onBlur={() => {
                                void commitRename(win.id, win.title);
                              }}
                              className="ml-[18px] mr-1 min-w-0 flex-1 rounded border border-white/20 bg-black/40 px-1.5 py-0.5 text-xs text-neutral-100 focus:border-white/40 focus:outline-none"
                            />
                          ) : (
                            <span className="truncate pl-[22px]">{win.title}</span>
                          )}
                          <div className="ml-1.5 flex shrink-0 items-center gap-1">
                            {win.inboxQueue.length > 0 && (
                              <span className="rounded bg-white/10 px-1 text-[9px] text-neutral-200">
                                +{win.inboxQueue.length}
                              </span>
                            )}
                            <span
                              className={`text-[11px] font-medium leading-none ${roleMeta.badgeClass} ${
                                isLockedWin
                                  ? ''
                                  : isMenuOpen
                                    ? 'hidden'
                                    : 'group-hover/win:hidden'
                              }`}
                            >
                              {roleMeta.short}
                            </span>
                            {!isLockedWin && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuWindow(null);
                                    void archiveWindow(win.id);
                                  }}
                                  data-tooltip={t.sidebar.archiveWindow}
                                  className={`rounded p-0.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100 ${
                                    isMenuOpen ? 'inline-flex' : 'hidden group-hover/win:inline-flex'
                                  }`}
                                >
                                  <Archive className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  data-window-menu-trigger
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isMenuOpen) {
                                      setMenuWindow(null);
                                      return;
                                    }
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const spaceBelow = window.innerHeight - rect.bottom;
                                    const openUp = spaceBelow < 135 && rect.top > 135;
                                    setMenuWindow({
                                      id: win.id,
                                      left: rect.left,
                                      top: openUp ? rect.top - 4 : rect.bottom + 4,
                                      openUp
                                    });
                                  }}
                                  data-tooltip={t.sidebar.windowMenu}
                                  className={`rounded p-0.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100 ${
                                    isMenuOpen
                                      ? 'inline-flex bg-white/10 text-zinc-100'
                                      : 'hidden group-hover/win:inline-flex'
                                  }`}
                                >
                                  <MoreVert className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Quota & Settings */}
      <div className="space-y-2 p-2.5">
        <SidebarQuotaCard />
        <button
          onClick={() => setActiveView('settings')}
          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
            activeView === 'settings'
              ? 'bg-white/[0.08] text-neutral-100'
              : 'text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200'
          }`}
        >
          <Settings className="h-3.5 w-3.5" />
          <span>{t.sidebar.settings}</span>
        </button>
      </div>

      {menuWindow &&
        (() => {
          const targetWin = windows.find((w) => w.id === menuWindow.id);
          if (!targetWin) return null;
          return createPortal(
            <div
              ref={windowMenuRef}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                left: menuWindow.left,
                top: menuWindow.top,
                transform: menuWindow.openUp ? 'translateY(-100%)' : undefined
              }}
              className="animate-menu-pop z-[9999] w-40"
            >
              <TopGlowBox
                roundedClassName="rounded-xl"
                innerRoundedClassName="rounded-[11px]"
                innerClassName="p-1 shadow-xl shadow-black/50"
              >
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuWindow(null);
                      setRenameDraft(targetWin.title);
                      setRenamingWindowId(targetWin.id);
                    }}
                    style={{ animationDelay: '0.03s' }}
                    className="animate-menu-item flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-xs text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-neutral-100"
                  >
                    <EditPencil className="h-3.5 w-3.5 text-neutral-400" />
                    <span>{t.sidebar.renameWindow}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuWindow(null);
                      void archiveWindow(targetWin.id);
                    }}
                    style={{ animationDelay: '0.05s' }}
                    className="animate-menu-item flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-xs text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-neutral-100"
                  >
                    <Archive className="h-3.5 w-3.5 text-neutral-400" />
                    <span>{t.sidebar.archiveWindow}</span>
                  </button>
                  <div className="my-0.5 h-px bg-white/[0.06]" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuWindow(null);
                      void closeWindow(targetWin.id);
                    }}
                    style={{ animationDelay: '0.07s' }}
                    className="animate-menu-item flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-xs text-neutral-300 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                  >
                    <Trash className="h-3.5 w-3.5 text-neutral-400" />
                    <span>{t.sidebar.deleteWindow}</span>
                  </button>
                </div>
              </TopGlowBox>
            </div>,
            document.body
          );
        })()}
    </aside>
  );
};
