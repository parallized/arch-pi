import React, { useEffect, useRef, useState } from 'react';

interface TooltipState {
  text: string;
  visible: boolean;
  x: number;
  y: number;
}

const OFFSET_X = 12;
const OFFSET_Y = 16;
const VIEWPORT_PADDING = 8;

export const CursorTooltip: React.FC = () => {
  const [state, setState] = useState<TooltipState>({
    text: '',
    visible: false,
    x: 0,
    y: 0
  });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const activeTargetRef = useRef<HTMLElement | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const visibleRef = useRef(false);

  useEffect(() => {
    visibleRef.current = state.visible;
  }, [state.visible]);

  useEffect(() => {
    const clearTimer = () => {
      if (showTimerRef.current !== null) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };

    const computePos = (clientX: number, clientY: number) => {
      const el = tooltipRef.current;
      const width = el?.offsetWidth || 120;
      const height = el?.offsetHeight || 28;

      let nextX = clientX + OFFSET_X;
      let nextY = clientY + OFFSET_Y;

      if (nextX + width + VIEWPORT_PADDING > window.innerWidth) {
        nextX = Math.max(VIEWPORT_PADDING, clientX - width - OFFSET_X);
      }
      if (nextY + height + VIEWPORT_PADDING > window.innerHeight) {
        nextY = Math.max(VIEWPORT_PADDING, clientY - height - 10);
      }
      return { x: nextX, y: nextY };
    };

    const hide = () => {
      clearTimer();
      activeTargetRef.current = null;
      setState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    const handleMouseMove = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.('[data-tooltip]') as HTMLElement | null;
      const text = target?.getAttribute('data-tooltip')?.trim() || '';

      if (!target || !text) {
        if (activeTargetRef.current) {
          hide();
        }
        return;
      }

      const { x, y } = computePos(e.clientX, e.clientY);

      if (activeTargetRef.current !== target) {
        activeTargetRef.current = target;
        clearTimer();

        if (visibleRef.current) {
          setState({ text, visible: true, x, y });
        } else {
          setState({ text, visible: false, x, y });
          showTimerRef.current = window.setTimeout(() => {
            if (activeTargetRef.current === target) {
              setState((prev) => ({ ...prev, text, visible: true }));
            }
          }, 70);
        }
      } else {
        setState((prev) =>
          prev.x === x && prev.y === y && prev.text === text
            ? prev
            : { ...prev, text, x, y }
        );
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      if (!e.relatedTarget) {
        hide();
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseout', handleMouseOut);
    window.addEventListener('mousedown', hide);
    window.addEventListener('blur', hide);
    window.addEventListener('scroll', hide, true);

    return () => {
      clearTimer();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseout', handleMouseOut);
      window.removeEventListener('mousedown', hide);
      window.removeEventListener('blur', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);

  return (
    <div
      ref={tooltipRef}
      role="tooltip"
      aria-hidden={!state.visible}
      style={{
        transform: `translate3d(${state.x}px, ${state.y}px, 0)`
      }}
      className={`pointer-events-none fixed left-0 top-0 z-[9999] whitespace-nowrap rounded-lg bg-[#242424] px-2.5 py-1 text-[11px] font-medium text-neutral-100 shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-opacity duration-100 ${
        state.visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {state.text}
    </div>
  );
};
