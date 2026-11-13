import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  Antenna,
  Archery,
  Atom,
  Bookmark,
  Box,
  Brain,
  ChatBubble,
  CheckCircle,
  Cloud,
  Code,
  CodeBrackets,
  ColorFilter,
  Compass,
  ControlSlider,
  Cpu,
  Crown,
  Cube,
  Dashboard,
  Database,
  DataTransferBoth,
  Eye,
  Filter,
  Fingerprint,
  FireFlame,
  Flash,
  Folder,
  GitBranch,
  Globe,
  HardDrive,
  Heart,
  Hexagon,
  Home,
  Infinite,
  Internet,
  Key,
  Laptop,
  LightBulb,
  Link,
  Lock,
  MagicWand,
  Mail,
  Microphone,
  MoonSat,
  NavArrowDown,
  Network,
  Package,
  Palette,
  PeaceHand,
  Planet,
  PlugTypeA,
  Puzzle,
  Rocket,
  Search,
  Send,
  Server,
  Settings,
  Shield,
  Sparks,
  Square,
  Star,
  SunLight,
  Terminal,
  Tools,
  Translate,
  Trophy,
  Wifi,
  Wrench,
  Xmark
} from 'iconoir-react';
import * as LobeIcons from '@lobehub/icons/es/icons';
import { toc, type IconToc } from '@lobehub/icons/es/toc';
import type { ProviderConfig } from '@archpi/shared';
import { TopGlowBox } from './TopGlowBox';

type IconoirComponent = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

interface MonoIconEntry {
  id: string;
  label: string;
  keywords: string;
  Component: IconoirComponent;
}

const MONO_ICONS: MonoIconEntry[] = [
  { id: 'cpu', label: 'Cpu', keywords: '芯片 处理器 chip', Component: Cpu },
  { id: 'brain', label: 'Brain', keywords: '大脑 智能 ai', Component: Brain },
  { id: 'sparks', label: 'Sparks', keywords: '智慧 灵光 magic', Component: Sparks },
  { id: 'atom', label: 'Atom', keywords: '原子 科学 core', Component: Atom },
  { id: 'globe', label: 'Globe', keywords: '全球 网络 web', Component: Globe },
  { id: 'internet', label: 'Internet', keywords: '互联网 网路', Component: Internet },
  { id: 'cloud', label: 'Cloud', keywords: '云服务 云端', Component: Cloud },
  { id: 'server', label: 'Server', keywords: '服务器 节点', Component: Server },
  { id: 'database', label: 'Database', keywords: '数据库 存储', Component: Database },
  { id: 'hard-drive', label: 'HardDrive', keywords: '硬盘 本地', Component: HardDrive },
  { id: 'network', label: 'Network', keywords: '网络 拓扑', Component: Network },
  { id: 'cube', label: 'Cube', keywords: '立方体 模型', Component: Cube },
  { id: 'box', label: 'Box', keywords: '盒子 容器', Component: Box },
  { id: 'package', label: 'Package', keywords: '包 模块', Component: Package },
  { id: 'code', label: 'Code', keywords: '代码 编程', Component: Code },
  { id: 'code-brackets', label: 'CodeBrackets', keywords: '括号 开发', Component: CodeBrackets },
  { id: 'terminal', label: 'Terminal', keywords: '终端 命令行', Component: Terminal },
  { id: 'git-branch', label: 'GitBranch', keywords: '分支 版本', Component: GitBranch },
  { id: 'flash', label: 'Flash', keywords: '闪电 极速', Component: Flash },
  { id: 'rocket', label: 'Rocket', keywords: '火箭 启动', Component: Rocket },
  { id: 'fire-flame', label: 'FireFlame', keywords: '火焰 热门', Component: FireFlame },
  { id: 'shield', label: 'Shield', keywords: '安全 盾牌', Component: Shield },
  { id: 'key', label: 'Key', keywords: '密钥 api', Component: Key },
  { id: 'lock', label: 'Lock', keywords: '锁定 隐私', Component: Lock },
  { id: 'fingerprint', label: 'Fingerprint', keywords: '指纹 认证', Component: Fingerprint },
  { id: 'magic-wand', label: 'MagicWand', keywords: '魔法 生成', Component: MagicWand },
  { id: 'light-bulb', label: 'LightBulb', keywords: '灵感 创意', Component: LightBulb },
  { id: 'compass', label: 'Compass', keywords: '指南针 探索', Component: Compass },
  { id: 'planet', label: 'Planet', keywords: '星球 宇宙', Component: Planet },
  { id: 'sun-light', label: 'SunLight', keywords: '太阳 光明', Component: SunLight },
  { id: 'moon-sat', label: 'MoonSat', keywords: '月亮 卫星', Component: MoonSat },
  { id: 'star', label: 'Star', keywords: '星星 收藏', Component: Star },
  { id: 'heart', label: 'Heart', keywords: '心 喜欢', Component: Heart },
  { id: 'crown', label: 'Crown', keywords: '皇冠 旗舰', Component: Crown },
  { id: 'trophy', label: 'Trophy', keywords: '奖杯 冠军', Component: Trophy },
  { id: 'eye', label: 'Eye', keywords: '视觉 多模态', Component: Eye },
  { id: 'chat-bubble', label: 'ChatBubble', keywords: '对话 聊天', Component: ChatBubble },
  { id: 'send', label: 'Send', keywords: '发送 请求', Component: Send },
  { id: 'microphone', label: 'Microphone', keywords: '语音 麦克风', Component: Microphone },
  { id: 'translate', label: 'Translate', keywords: '翻译 语言', Component: Translate },
  { id: 'puzzle', label: 'Puzzle', keywords: '拼图 插件', Component: Puzzle },
  { id: 'plug', label: 'Plug', keywords: '插头 接口', Component: PlugTypeA },
  { id: 'link', label: 'Link', keywords: '链接 网关', Component: Link },
  { id: 'data-transfer', label: 'DataTransfer', keywords: '传输 同步', Component: DataTransferBoth },
  { id: 'activity', label: 'Activity', keywords: '脉冲 监控', Component: Activity },
  { id: 'antenna', label: 'Antenna', keywords: '信号 天线', Component: Antenna },
  { id: 'wifi', label: 'Wifi', keywords: '无线 连接', Component: Wifi },
  { id: 'infinite', label: 'Infinite', keywords: '无限 循环', Component: Infinite },
  { id: 'hexagon', label: 'Hexagon', keywords: '六边形 节点', Component: Hexagon },
  { id: 'square', label: 'Square', keywords: '方形 基础', Component: Square },
  { id: 'dashboard', label: 'Dashboard', keywords: '仪表盘 性能', Component: Dashboard },
  { id: 'control-slider', label: 'ControlSlider', keywords: '滑块 调节', Component: ControlSlider },
  { id: 'settings', label: 'Settings', keywords: '设置 配置', Component: Settings },
  { id: 'tools', label: 'Tools', keywords: '工具 调试', Component: Tools },
  { id: 'wrench', label: 'Wrench', keywords: '扳手 修复', Component: Wrench },
  { id: 'palette', label: 'Palette', keywords: '调色板 图像', Component: Palette },
  { id: 'color-filter', label: 'ColorFilter', keywords: '滤镜 视觉', Component: ColorFilter },
  { id: 'archery', label: 'Archery', keywords: '靶心 精准', Component: Archery },
  { id: 'check-circle', label: 'CheckCircle', keywords: '验证 通过', Component: CheckCircle },
  { id: 'bookmark', label: 'Bookmark', keywords: '书签 标记', Component: Bookmark },
  { id: 'folder', label: 'Folder', keywords: '文件夹 目录', Component: Folder },
  { id: 'laptop', label: 'Laptop', keywords: '电脑 本地', Component: Laptop },
  { id: 'home', label: 'Home', keywords: '主页 本地', Component: Home },
  { id: 'mail', label: 'Mail', keywords: '邮件 消息', Component: Mail },
  { id: 'filter', label: 'Filter', keywords: '过滤 路由', Component: Filter },
  { id: 'peace-hand', label: 'PeaceHand', keywords: '手势 友好', Component: PeaceHand }
];

const MONO_ICON_MAP: Record<string, IconoirComponent> = Object.fromEntries(
  MONO_ICONS.map((entry) => [entry.id, entry.Component])
);

type LobeIconComponent = React.ComponentType<{ size?: number | string; className?: string }> & {
  Color?: React.ComponentType<{ size?: number | string; className?: string }>;
};

const LOBE_ICON_MAP = LobeIcons as unknown as Record<string, LobeIconComponent>;

const DEFAULT_PROVIDER_ICON_ID: Record<ProviderConfig['provider'], string> = {
  anthropic: 'Claude',
  openai: 'OpenAI',
  google: 'Gemini',
  'openai-compatible': 'cpu'
};

function renderLobeIcon(id: string, size: number): React.ReactNode | null {
  const Comp = LOBE_ICON_MAP[id];
  if (!Comp) return null;
  const ColorComp = Comp.Color ?? Comp;
  return <ColorComp size={size} />;
}

export interface ProviderIconProps {
  icon?: string;
  provider?: ProviderConfig['provider'];
  size?: number;
  className?: string;
}

export const ProviderIcon: React.FC<ProviderIconProps> = ({
  icon,
  provider,
  size = 20,
  className = ''
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const resolved = icon?.trim() || (provider ? DEFAULT_PROVIDER_ICON_ID[provider] : 'cpu');

  const isUrl =
    resolved.startsWith('data:image/') ||
    resolved.startsWith('http://') ||
    resolved.startsWith('https://');

  if (isUrl && !imgFailed) {
    return (
      <img
        src={resolved}
        alt=""
        onError={() => setImgFailed(true)}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded object-contain ${className}`}
      />
    );
  }

  const fallbackId = provider ? DEFAULT_PROVIDER_ICON_ID[provider] : 'cpu';
  const effectiveId = isUrl && imgFailed ? fallbackId : resolved;

  const MonoIcon = MONO_ICON_MAP[effectiveId];
  if (MonoIcon) {
    return (
      <MonoIcon
        style={{ width: size, height: size }}
        className={`shrink-0 text-neutral-200 ${className}`}
      />
    );
  }

  const lobeNode = renderLobeIcon(effectiveId, size);
  if (lobeNode) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      >
        {lobeNode}
      </span>
    );
  }

  return (
    <Cpu
      style={{ width: size, height: size }}
      className={`shrink-0 text-neutral-200 ${className}`}
    />
  );
};

// Sort toc once: provider logos first, then model, then application
const SORTED_LOGOS: IconToc[] = [...toc]
  .filter((item) => Boolean(LOBE_ICON_MAP[item.id]))
  .sort((a, b) => {
    const order = (g: IconToc['group']) => (g === 'provider' ? 0 : g === 'model' ? 1 : 2);
    const diff = order(a.group) - order(b.group);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });

type PickerMode = 'mono' | 'logo' | null;

export interface ProviderIconPickerProps {
  value?: string;
  provider: ProviderConfig['provider'];
  baseUrl?: string;
  onChange: (icon: string | undefined) => void;
  dropdownAlign?: 'left' | 'right';
  onStatusChange?: (status: { text: string; tone: 'error' | 'success' } | null) => void;
}

export const ProviderIconPicker: React.FC<ProviderIconPickerProps> = ({
  value,
  provider,
  baseUrl,
  onChange,
  dropdownAlign = 'right',
  onStatusChange
}) => {
  const [mode, setMode] = useState<PickerMode>(null);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [monoQuery, setMonoQuery] = useState('');
  const [logoQuery, setLogoQuery] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ text: string; tone: 'error' | 'success' } | null>(
    null
  );
  const [logoScrollTop, setLogoScrollTop] = useState(0);
  const logoGridRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    openUp: boolean;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const monoTriggerRef = useRef<HTMLButtonElement>(null);
  const logoTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const MENU_WIDTH = 320;

  const updatePosition = () => {
    const triggerEl = mode === 'mono' ? monoTriggerRef.current : logoTriggerRef.current;
    const rect = triggerEl?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 270 && rect.top > spaceBelow;
    const rawLeft = dropdownAlign === 'left' ? rect.left : rect.right - MENU_WIDTH;
    const left = Math.max(12, Math.min(rawLeft, window.innerWidth - MENU_WIDTH - 12));
    setMenuPos({
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left,
      openUp
    });
  };

  useEffect(() => {
    if (mode === 'logo') {
      setLogoScrollTop(0);
      if (logoGridRef.current) {
        logoGridRef.current.scrollTop = 0;
      }
    }
  }, [mode, logoQuery]);

  useLayoutEffect(() => {
    if (!mode) {
      setMenuPos(null);
      return;
    }
    updatePosition();
  }, [mode, dropdownAlign]);

  useEffect(() => {
    if (!mode) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!menuRef.current || !menuRef.current.contains(target))
      ) {
        setMode(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMode(null);
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
  }, [mode, dropdownAlign]);

  const filteredMonoIcons = useMemo(() => {
    const q = monoQuery.trim().toLowerCase();
    if (!q) return MONO_ICONS;
    return MONO_ICONS.filter(
      (item) =>
        item.id.toLowerCase().includes(q) ||
        item.label.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q)
    );
  }, [monoQuery]);

  const filteredLogos = useMemo(() => {
    const q = logoQuery.trim().toLowerCase();
    if (!q) return SORTED_LOGOS;
    return SORTED_LOGOS.filter(
      (item) =>
        item.id.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.fullTitle.toLowerCase().includes(q)
    );
  }, [logoQuery]);

  const reportStatus = (next: { text: string; tone: 'error' | 'success' } | null) => {
    if (onStatusChange) {
      onStatusChange(next);
    } else {
      setStatusMsg(next);
    }
  };

  const toggleMode = (next: Exclude<PickerMode, null>) => {
    reportStatus(null);
    setMode((prev) => (prev === next ? null : next));
  };

  const handleFetchFromBaseUrl = () => {
    const raw = baseUrl?.trim() ?? '';
    if (!raw) {
      reportStatus({ text: '请先填写 Base URL', tone: 'error' });
      return;
    }

    let faviconUrl: string;
    try {
      const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const parsed = new URL(normalized);
      faviconUrl = `${parsed.origin}/favicon.ico`;
    } catch {
      reportStatus({ text: 'Base URL 格式无效', tone: 'error' });
      return;
    }

    setFetchingUrl(true);
    reportStatus(null);

    const probe = new Image();
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setFetchingUrl(false);
      reportStatus({ text: '未获取到该域名的图标', tone: 'error' });
    }, 6000);

    probe.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      setFetchingUrl(false);
      onChange(faviconUrl);
      reportStatus({ text: '已获取域名图标', tone: 'success' });
    };

    probe.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      setFetchingUrl(false);
      reportStatus({ text: '未获取到该域名的图标', tone: 'error' });
    };

    probe.src = faviconUrl;
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
        <div
          title="当前图标"
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#111111]"
        >
          <ProviderIcon key={value ?? provider} icon={value} provider={provider} size={22} />
        </div>

        {provider !== 'google' && (
          <button
            type="button"
            disabled={fetchingUrl}
            onClick={handleFetchFromBaseUrl}
            className="h-9 shrink-0 rounded-xl bg-[#111111] px-3.5 text-xs text-neutral-300 transition-colors hover:bg-[#161616] hover:text-white disabled:opacity-50"
          >
            {fetchingUrl ? '获取中...' : '从 URL 获取'}
          </button>
        )}

        <button
          ref={monoTriggerRef}
          type="button"
          onClick={() => toggleMode('mono')}
          className={`flex h-9 shrink-0 items-center gap-2 rounded-xl px-3.5 text-xs transition-colors focus:outline-none ${
            mode === 'mono'
              ? 'bg-[#1a1a1a] text-neutral-100 ring-1 ring-white/15'
              : 'bg-[#111111] text-neutral-300 hover:bg-[#161616] hover:text-white'
          }`}
        >
          <span>单色图标</span>
          <NavArrowDown
            className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${
              mode === 'mono' ? 'rotate-180' : ''
            }`}
          />
        </button>

        <button
          ref={logoTriggerRef}
          type="button"
          onClick={() => toggleMode('logo')}
          className={`flex h-9 shrink-0 items-center gap-2 rounded-xl px-3.5 text-xs transition-colors focus:outline-none ${
            mode === 'logo'
              ? 'bg-[#1a1a1a] text-neutral-100 ring-1 ring-white/15'
              : 'bg-[#111111] text-neutral-300 hover:bg-[#161616] hover:text-white'
          }`}
        >
          <span>LOGO</span>
          <NavArrowDown
            className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${
              mode === 'logo' ? 'rotate-180' : ''
            }`}
          />
        </button>

        {value && (
          <button
            type="button"
            onClick={() => {
              onChange(undefined);
              reportStatus(null);
            }}
            className="h-9 shrink-0 rounded-xl px-2.5 text-xs text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-200"
          >
            恢复默认
          </button>
        )}
      </div>

      {!onStatusChange && statusMsg && (
        <p
          className={`mt-1.5 text-[11px] ${
            statusMsg.tone === 'error' ? 'text-rose-400' : 'text-emerald-400'
          }`}
        >
          {statusMsg.text}
        </p>
      )}

      {/* 下拉选择面板：单色图标 / LOGO（Portal 到 body，避免触发弹窗滚动容器重排） */}
      {mode &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              left: menuPos.left,
              top: menuPos.top,
              width: MENU_WIDTH,
              transform: menuPos.openUp ? 'translateY(-100%)' : undefined
            }}
            className="animate-menu-pop z-[9999] max-w-[calc(100vw-24px)]"
          >
            <TopGlowBox
              roundedClassName="rounded-xl"
              innerRoundedClassName="rounded-[11px]"
              innerClassName="p-2.5 shadow-2xl shadow-black/70"
            >
            {mode === 'mono' ? (
              <div className="space-y-2">
                <div className="relative flex items-center">
                  <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-neutral-500" />
                  <input
                    type="text"
                    value={monoQuery}
                    onChange={(e) => setMonoQuery(e.target.value)}
                    placeholder="查找单色图标..."
                    className="w-full rounded-lg border border-white/10 bg-[#161616] py-1.5 pl-8 pr-8 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-white/20 focus:outline-none"
                  />
                  {monoQuery && (
                    <button
                      type="button"
                      onClick={() => setMonoQuery('')}
                      className="absolute right-2.5 text-neutral-500 hover:text-neutral-200"
                    >
                      <Xmark className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid max-h-[200px] grid-cols-8 gap-1.5 overflow-y-auto pt-0.5">
                  {filteredMonoIcons.length > 0 ? (
                    filteredMonoIcons.map((item) => {
                      const isSelected = value === item.id;
                      const IconComp = item.Component;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          title={item.label}
                          onClick={() => {
                            onChange(item.id);
                            setMode(null);
                          }}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                            isSelected
                              ? 'bg-white/15 text-white ring-1 ring-white/40'
                              : 'text-neutral-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <IconComp className="h-4.5 w-4.5" />
                        </button>
                      );
                    })
                  ) : (
                    <div className="col-span-full py-6 text-center text-xs text-neutral-500">
                      未找到匹配的单色图标
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative flex items-center">
                  <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-neutral-500" />
                  <input
                    type="text"
                    value={logoQuery}
                    onChange={(e) => setLogoQuery(e.target.value)}
                    placeholder="查找 LOGO..."
                    className="w-full rounded-lg border border-white/10 bg-[#161616] py-1.5 pl-8 pr-8 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-white/20 focus:outline-none"
                  />
                  {logoQuery && (
                    <button
                      type="button"
                      onClick={() => setLogoQuery('')}
                      className="absolute right-2.5 text-neutral-500 hover:text-neutral-200"
                    >
                      <Xmark className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {(() => {
                  const COLS = 8;
                  const ROW_HEIGHT = 38; // 32px item (h-8) + 6px gap (gap-1.5)
                  const VIEWPORT_HEIGHT = 200;
                  const totalRows = Math.ceil(filteredLogos.length / COLS);
                  const totalHeight = Math.max(0, totalRows * ROW_HEIGHT - 6);
                  const startRow = Math.max(0, Math.floor(logoScrollTop / ROW_HEIGHT) - 1);
                  const endRow = Math.min(
                    totalRows,
                    Math.ceil((logoScrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + 2
                  );
                  const visibleItems = filteredLogos.slice(startRow * COLS, endRow * COLS);

                  return (
                    <div
                      ref={logoGridRef}
                      onScroll={(e) => setLogoScrollTop(e.currentTarget.scrollTop)}
                      className="max-h-[200px] overflow-y-auto pt-0.5"
                    >
                      {filteredLogos.length > 0 ? (
                        <div style={{ height: totalHeight, position: 'relative' }}>
                          <div
                            className="grid grid-cols-8 gap-1.5"
                            style={{
                              position: 'absolute',
                              top: startRow * ROW_HEIGHT,
                              left: 0,
                              right: 0
                            }}
                          >
                            {visibleItems.map((item) => {
                              const isSelected = value === item.id;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  title={item.fullTitle || item.id}
                                  onClick={() => {
                                    onChange(item.id);
                                    setMode(null);
                                  }}
                                  className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                                    isSelected
                                      ? 'bg-white/15 ring-1 ring-white/40'
                                      : 'hover:bg-white/10'
                                  }`}
                                >
                                  {renderLobeIcon(item.id, 20)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="py-6 text-center text-xs text-neutral-500">
                          未找到匹配的 LOGO
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
            </TopGlowBox>
          </div>,
          document.body
        )}
    </div>
  );
};
