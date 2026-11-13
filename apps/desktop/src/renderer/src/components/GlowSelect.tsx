import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, NavArrowDown, Search } from 'iconoir-react';
import { TopGlowBox } from './TopGlowBox';

export interface GlowSelectOption {
  value: string;
  label: string;
  badge?: React.ReactNode;
  rightLabel?: React.ReactNode;
  searchText?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface GlowSelectProps {
  value?: string;
  onChange?: (value: string) => void;
  multiple?: boolean;
  values?: string[];
  onChangeValues?: (values: string[]) => void;
  options: GlowSelectOption[];
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
}

export const GlowSelect: React.FC<GlowSelectProps> = ({
  value = '',
  onChange,
  multiple = false,
  values = [],
  onChangeValues,
  options,
  placeholder = 'Select...',
  className = '',
  size = 'sm',
  fullWidth = false,
  searchable = false,
  searchPlaceholder = '搜索...'
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    minWidth: number;
    openUp: boolean;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 240 && rect.top > spaceBelow;
    setMenuPos({
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      minWidth: rect.width,
      openUp
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!menuRef.current || !menuRef.current.contains(target))
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    const handleReposition = () => updatePosition();

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open]);

  const selected = options.find((opt) => opt.value === value);
  const selectedMulti = multiple
    ? options.filter((opt) => opt.value !== '' && values.includes(opt.value))
    : [];
  const hasValue = multiple ? selectedMulti.length > 0 : Boolean(selected);
  const displayLabel = multiple
    ? selectedMulti.length === 0
      ? placeholder
      : selectedMulti.length <= 2
      ? selectedMulti.map((o) => o.label).join(', ')
      : `${selectedMulti[0].label} +${selectedMulti.length - 1}`
    : selected
    ? selected.label
    : placeholder;

  const sizeClasses =
    size === 'md'
      ? 'rounded-xl bg-[#111111] px-3.5 py-2.5 hover:bg-[#161616]'
      : 'rounded-lg bg-[#141414] px-2.5 py-1.5 hover:bg-[#191919]';

  const q = query.trim().toLowerCase();
  const visibleOptions =
    searchable && q
      ? options.filter(
          (opt) =>
            opt.label.toLowerCase().includes(q) ||
            opt.value.toLowerCase().includes(q) ||
            (opt.searchText ? opt.searchText.toLowerCase().includes(q) : false)
        )
      : options;

  return (
    <div
      ref={containerRef}
      className={`relative ${fullWidth ? 'block w-full' : 'inline-block'} ${className}`.trim()}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-2 text-xs text-neutral-200 transition-colors focus:outline-none ${
          fullWidth ? 'w-full justify-between' : ''
        } ${sizeClasses}`.trim()}
      >
        <span
          className={`flex items-center gap-2 ${hasValue ? 'text-neutral-200' : 'text-neutral-500'}`}
        >
          {!multiple && selected?.icon}
          <span>{displayLabel}</span>
        </span>
        <NavArrowDown
          className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              left: menuPos.left,
              top: menuPos.top,
              minWidth: menuPos.minWidth,
              transform: menuPos.openUp ? 'translateY(-100%)' : undefined
            }}
            className="animate-menu-pop z-[9999] w-max"
          >
            <TopGlowBox
              roundedClassName="rounded-xl"
              innerRoundedClassName="rounded-[11px]"
              innerClassName="p-1 shadow-xl shadow-black/50"
            >
              {searchable && (
                <div className="mb-1 flex items-center gap-1.5 border-b border-white/10 px-2 pb-1.5 pt-1">
                  <Search className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                  <input
                    type="text"
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full bg-transparent text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
                  />
                </div>
              )}
              <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
                {visibleOptions.map((opt, idx) => {
                  const isSelected = multiple
                    ? opt.value === ''
                      ? values.length === 0
                      : values.includes(opt.value)
                    : opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={opt.disabled}
                      onClick={() => {
                        if (opt.disabled) return;
                        if (multiple) {
                          if (opt.value === '') {
                            onChangeValues?.([]);
                          } else {
                            const next = values.includes(opt.value)
                              ? values.filter((v) => v !== opt.value)
                              : [...values, opt.value];
                            onChangeValues?.(next);
                          }
                          return;
                        }
                        onChange?.(opt.value);
                        setOpen(false);
                      }}
                      style={{ animationDelay: `${0.03 + idx * 0.02}s` }}
                      className={`animate-menu-item flex w-full items-center justify-between gap-3 rounded-[8px] px-2.5 py-1.5 text-left text-xs transition-colors ${
                        opt.disabled
                          ? 'cursor-not-allowed text-neutral-500'
                          : isSelected
                          ? 'bg-white/[0.08] text-neutral-100'
                          : 'text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                        {opt.icon}
                        <span>{opt.label}</span>
                        {opt.badge}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                        {opt.rightLabel}
                        {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-neutral-300" />}
                      </span>
                    </button>
                  );
                })}
                {visibleOptions.length === 0 && (
                  <div className="px-2.5 py-2 text-center text-[11px] text-neutral-500">
                    无匹配项
                  </div>
                )}
              </div>
            </TopGlowBox>
          </div>,
          document.body
        )}
    </div>
  );
};
