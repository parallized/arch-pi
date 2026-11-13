import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChatBubble,
  ChatBubbleQuestion,
  Clock,
  Compress,
  Globe,
  Group,
  TaskList,
  Timer
} from 'iconoir-react';
import { TopGlowBox } from './TopGlowBox';
import { useT } from '../i18n';

export type SlashCommandId =
  | 'btw'
  | 'goal'
  | 'compact'
  | 'schedule'
  | 'browser'
  | 'plan'
  | 'grill-me'
  | 'teamwork';

export interface SlashCommandItem {
  id: SlashCommandId;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SLASH_COMMAND_DEFS: Array<{
  id: SlashCommandId;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'btw', name: 'btw', icon: ChatBubble },
  { id: 'goal', name: 'goal', icon: Timer },
  { id: 'compact', name: 'compact', icon: Compress },
  { id: 'schedule', name: 'schedule', icon: Clock },
  { id: 'browser', name: 'browser', icon: Globe },
  { id: 'plan', name: 'plan', icon: TaskList },
  { id: 'grill-me', name: 'grill-me', icon: ChatBubbleQuestion },
  { id: 'teamwork', name: 'teamwork', icon: Group }
];

export interface SlashCommandPanelProps {
  filter: string;
  onSelect: (cmd: SlashCommandItem) => void;
  onClose: () => void;
}

export const SlashCommandPanel: React.FC<SlashCommandPanelProps> = ({
  filter,
  onSelect,
  onClose
}) => {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands = useMemo<SlashCommandItem[]>(
    () =>
      SLASH_COMMAND_DEFS.map((def) => ({
        ...def,
        description: t.slashCommands[def.id]
      })),
    [t]
  );

  const filteredCommands = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [commands, filter]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredCommands.length === 0) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSelect(filteredCommands[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [filteredCommands, selectedIndex, onSelect, onClose]);

  if (filteredCommands.length === 0) {
    return null;
  }

  return (
    <div ref={panelRef} className="w-full">
      <TopGlowBox
        roundedClassName="rounded-2xl"
        innerRoundedClassName="rounded-[15px]"
        innerClassName="overflow-hidden p-2 shadow-2xl shadow-black/80"
      >
        <div className="max-h-96 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {filteredCommands.map((cmd, idx) => {
            const isSelected = idx === selectedIndex;
            const Icon = cmd.icon;
            return (
              <button
                key={cmd.id}
                type="button"
                onClick={() => onSelect(cmd)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex items-start gap-2.5 rounded-xl p-2.5 text-left transition-colors ${
                  isSelected
                    ? 'bg-white/[0.08] ring-1 ring-white/10'
                    : 'bg-white/[0.02] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-neutral-300">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-neutral-100">
                      /{cmd.name}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-neutral-400">
                    {cmd.description}
                  </p>
                </div>
              </button>
            );
          })}
          </div>
        </div>
      </TopGlowBox>
    </div>
  );
};
