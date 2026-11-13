import React from 'react';
import type { TaskStatus } from '@archpi/shared';
import { useArchpiStore } from '../store/useArchpiStore';
import { useT } from '../i18n';
import {
  formatRelativeTime,
  ROLE_BADGE_META,
  TASK_COLUMN_META
} from './statusTheme';

const COLUMNS: TaskStatus[] = ['planning', 'needs_you', 'working', 'in_review', 'ready'];

export const BoardView: React.FC = () => {
  const {
    tasks,
    windows,
    activeProjectId,
    setActiveWindow,
    setActiveView
  } = useArchpiStore();
  const t = useT();

  const projectTasks = tasks.filter(
    (t) => !activeProjectId || t.projectId === activeProjectId
  );

  const getColumnTasks = (col: TaskStatus) => {
    return projectTasks.filter((t) => t.status === col);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden p-5">
      {/* Columns are transparent layout tracks (no card-in-card) */}
      <div className="grid flex-1 grid-cols-1 gap-5 overflow-x-auto md:grid-cols-2 xl:grid-cols-5">
        {COLUMNS.map((col) => {
          const meta = TASK_COLUMN_META[col];
          const colTasks = getColumnTasks(col);

          return (
            <div key={col} className="flex min-w-[180px] flex-col">
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
                  <span className="text-xs font-medium text-neutral-200">
                    {t.board.status[col]}
                  </span>
                </div>
                <span className="text-xs text-neutral-500">
                  {colTasks.length === 0 ? t.board.noTasks : colTasks.length}
                </span>
              </div>

              {colTasks.length > 0 && (
                <div className="flex-1 space-y-2.5 overflow-y-auto pr-0.5">
                  {colTasks.map((task) => {
                    const assignedWin = windows.find((w) => w.id === task.assignedWindowId);
                    const roleMeta = assignedWin ? ROLE_BADGE_META[assignedWin.role] : null;

                    return (
                      <div
                        key={task.id}
                        onClick={() => {
                          if (assignedWin) {
                            setActiveWindow(assignedWin.id);
                          } else {
                            setActiveView('workspace');
                          }
                        }}
                        className="group cursor-pointer rounded-xl bg-[#1e1e1e] p-3.5 transition-colors hover:bg-[#252525]"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <h3 className="line-clamp-2 text-[13px] font-medium leading-snug text-neutral-100">
                            {task.title}
                          </h3>
                        </div>

                        <div className="text-[11px] text-neutral-500">
                          {formatRelativeTime(task.updatedAt, t.time)}
                        </div>

                        {assignedWin && roleMeta && (
                          <div className="mt-2.5 flex items-center justify-between pt-2 text-[11px]">
                            <span className="truncate text-neutral-400">
                              {assignedWin.title}
                            </span>
                            <span
                              className={`text-[11px] font-medium leading-none ${roleMeta.badgeClass}`}
                            >
                              {roleMeta.short}
                            </span>
                          </div>
                        )}
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
  );
};
