import React, { useEffect, useRef } from 'react';
import { Flash } from 'iconoir-react';
import type { ThinkingLevel } from '@archpi/shared';

export interface ThinkingOption {
  value: ThinkingLevel | '';
  label: string;
  hint: string;
}

export const PIXEL_THINKING_OPTIONS: ThinkingOption[] = [
  { value: '', label: '默认', hint: '跟随模型与角色默认配置' },
  { value: 'none', label: 'None', hint: '关闭深度思考，极速直出' },
  { value: 'minimal', label: 'Minimal', hint: '极轻推理，适合简单问答' },
  { value: 'low', label: 'Low', hint: '轻量推理，兼顾响应速度' },
  { value: 'medium', label: 'Medium', hint: '均衡推理，适合日常开发' },
  { value: 'high', label: 'High', hint: '深度思考，处理复杂逻辑' },
  { value: 'xhigh', label: 'XHigh', hint: '高强度多步推演与验证' },
  { value: 'max', label: 'Max', hint: '接近上限的推理预算' },
  { value: 'ultra', label: 'Ultra', hint: '全像素超频，极限攻坚模式' }
];

const SPARK_COLORS = ['#ffffff', '#4d9abf', '#f09082', '#f1be58'];

interface Spark {
  x: number;
  y: number;
  size: number;
  speed: number;
  color: string;
  phase: number;
}

interface PixelThinkingSliderProps {
  value: ThinkingLevel | '';
  modelName?: string;
  allowedLevels?: ThinkingLevel[];
  onChange: (value: ThinkingLevel | '') => void;
  onReset?: () => void;
}

export const PixelThinkingSlider: React.FC<PixelThinkingSliderProps> = ({
  value,
  allowedLevels,
  onChange
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingRef = useRef(false);

  const options =
    allowedLevels && allowedLevels.length > 0
      ? [
          PIXEL_THINKING_OPTIONS[0],
          ...PIXEL_THINKING_OPTIONS.slice(1).filter(
            (o) => o.value !== '' && allowedLevels.includes(o.value)
          )
        ]
      : PIXEL_THINKING_OPTIONS;

  const maxIndex = Math.max(0, options.length - 1);
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const activeOption = options[activeIndex] ?? options[0];
  const intensity = maxIndex > 0 ? activeIndex / maxIndex : 0; // 0 .. 1

  const accentHex =
    intensity >= 0.85
      ? '#f1be58'
      : intensity >= 0.6
      ? '#f09082'
      : intensity >= 0.25
      ? '#4d9abf'
      : '#a1a1aa';

  const fillBackground =
    intensity >= 0.85
      ? 'linear-gradient(90deg, #4d9abf 0%, #f09082 50%, #f1be58 100%)'
      : intensity >= 0.55
      ? 'linear-gradient(90deg, #4d9abf 0%, #f09082 100%)'
      : intensity >= 0.25
      ? 'linear-gradient(90deg, #356d89 0%, #4d9abf 100%)'
      : 'linear-gradient(90deg, #27272a 0%, #3f3f46 100%)';

  // Subtle pixel spark stream inside the fill pill
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = 280;
    const height = 26;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const count = Math.round(4 + intensity * 26);
    const baseSpeed = 0.2 + intensity * 1.1;

    const sparks: Spark[] = Array.from({ length: count }, (_, i) => ({
      x: (i / count) * width + Math.random() * 20,
      y: 2 + Math.floor(Math.random() * (height - 6)),
      size: intensity >= 0.7 && Math.random() > 0.65 ? 2.5 : 2,
      speed: baseSpeed * (0.7 + Math.random() * 0.7),
      color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)],
      phase: Math.random() * Math.PI * 2
    }));

    let rafId = 0;
    let tick = 0;

    const render = () => {
      tick += 0.05;
      ctx.clearRect(0, 0, width, height);

      for (const s of sparks) {
        s.x += s.speed;
        if (s.x > width) {
          s.x = -s.size;
          s.y = 2 + Math.floor(Math.random() * (height - 6));
        }
        const twinkle = 0.35 + 0.65 * Math.sin(tick + s.phase);
        ctx.globalAlpha = twinkle * (0.25 + intensity * 0.65);
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
      }

      ctx.globalAlpha = 1;
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [intensity]);

  const updateFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const idx = Math.round(ratio * maxIndex);
    const opt = options[idx];
    if (opt && opt.value !== value) {
      onChange(opt.value);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-[14px] p-3.5">
      {/* Top Bar */}
      <div className="flex items-center gap-2">
        <span
          style={{ color: accentHex }}
          className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/[0.05] transition-colors"
        >
          <Flash className="h-3.5 w-3.5" />
        </span>
        <span className="text-xs font-medium text-neutral-300">思考深度</span>
      </div>

      {/* Hero Level + Description */}
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <span
          style={{ color: accentHex }}
          className="text-lg font-semibold tracking-tight transition-colors"
        >
          {activeOption.label}
        </span>
        <span className="truncate text-[11px] text-neutral-400">
          {activeOption.hint}
        </span>
      </div>

      {/* Pill-in-Pill Slider Track + Clickable Ticks */}
      <div className="flex flex-col gap-1.5">
        <div
          ref={trackRef}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={maxIndex}
          aria-valuenow={activeIndex}
          aria-valuetext={activeOption.label}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault();
              const next = Math.min(maxIndex, activeIndex + 1);
              onChange(options[next].value);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault();
              const prev = Math.max(0, activeIndex - 1);
              onChange(options[prev].value);
            }
          }}
          onPointerDown={(e) => {
            draggingRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            updateFromClientX(e.clientX);
          }}
          onPointerMove={(e) => {
            if (!draggingRef.current) return;
            updateFromClientX(e.clientX);
          }}
          onPointerUp={(e) => {
            if (draggingRef.current) {
              draggingRef.current = false;
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          className="relative h-8 w-full cursor-pointer select-none rounded-full border border-white/[0.08] bg-[#0a0a0c] p-[3px] touch-none"
        >
          {/* Neutral snap-point dots inside the track */}
          <div className="pointer-events-none absolute inset-[3px] z-10">
            {options.map((opt, idx) => {
              const ratio = maxIndex > 0 ? idx / maxIndex : 0;
              return (
                <span
                  key={opt.value || 'default'}
                  style={{ left: `calc(12px + ${ratio} * (100% - 24px))` }}
                  className="absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-400/45"
                />
              );
            })}
          </div>

          <div
            style={{
              width: `calc(24px + ${intensity} * (100% - 24px))`,
              background: fillBackground,
              boxShadow:
                intensity >= 0.7
                  ? `0 0 14px ${accentHex}44`
                  : undefined
            }}
            className="relative flex h-full items-center justify-end overflow-hidden rounded-full pr-[3px] transition-[width] duration-150 ease-out"
          >
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
            <span className="relative z-20 h-[18px] w-[18px] shrink-0 rounded-full bg-white shadow-sm" />
          </div>
        </div>
      </div>
    </div>
  );
};
