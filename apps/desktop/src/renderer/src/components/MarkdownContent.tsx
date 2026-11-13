import React, { useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { NavArrowRight } from 'iconoir-react';

interface MarkdownContentProps {
  content: string;
  isStreaming?: boolean;
}

interface ContentSegment {
  type: 'think' | 'text';
  content: string;
  closed: boolean;
}

const STREAMING_TITLE_PREFIX_RE =
  /<(?:a(?:r(?:c(?:h(?:p(?:i(?:-(?:t(?:i(?:t(?:l(?:e)?)?)?)?)?)?)?)?)?)?)?)?$/i;

function stripImplicitTitleTags(raw: string, isStreaming: boolean): string {
  let cleaned = raw.replace(
    /(```[\s\S]*?```|`[^`\n]*`)|<archpi-title>[\s\S]*?<\/archpi-title>/gi,
    (full, codeBlock) => (codeBlock ? full : '')
  );
  if (isStreaming) {
    // Only hide an incomplete trailing <archpi-title...> while streaming, and never inside backticks
    const unclosedIdx = cleaned.search(/<archpi-title\b(?![\s\S]*<\/archpi-title>)/i);
    if (unclosedIdx !== -1) {
      const backtickCount = (cleaned.slice(0, unclosedIdx).match(/`/g) ?? []).length;
      if (backtickCount % 2 === 0) {
        cleaned = cleaned.slice(0, unclosedIdx);
      }
    } else {
      cleaned = cleaned.replace(STREAMING_TITLE_PREFIX_RE, '');
    }
  }
  return cleaned.trimEnd();
}

function splitThinkBlocks(raw: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let cursor = 0;

  while (cursor < raw.length) {
    const startIdx = raw.indexOf('<think>', cursor);
    if (startIdx === -1) {
      const rest = raw.slice(cursor);
      if (rest.trim()) {
        segments.push({ type: 'text', content: rest, closed: true });
      }
      break;
    }

    if (startIdx > cursor) {
      const before = raw.slice(cursor, startIdx);
      if (before.trim()) {
        segments.push({ type: 'text', content: before, closed: true });
      }
    }

    const bodyStart = startIdx + '<think>'.length;
    const endIdx = raw.indexOf('</think>', bodyStart);
    if (endIdx === -1) {
      const thinkingBody = raw.slice(bodyStart).trim();
      segments.push({ type: 'think', content: thinkingBody, closed: false });
      break;
    }

    const thinkingBody = raw.slice(bodyStart, endIdx).trim();
    if (thinkingBody) {
      segments.push({ type: 'think', content: thinkingBody, closed: true });
    }
    cursor = endIdx + '</think>'.length;
  }

  return segments;
}

const ThinkingBlock: React.FC<{
  content: string;
  closed: boolean;
  isStreaming: boolean;
}> = ({ content, closed, isStreaming }) => {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const isActivelyThinking = isStreaming && !closed;
  const open = manualOpen ?? isActivelyThinking;

  return (
    <div className="my-1.5 first:mt-0 last:mb-0">
      <button
        type="button"
        onClick={() => setManualOpen((prev) => !(prev ?? isActivelyThinking))}
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11.5px] text-neutral-400 transition-colors hover:bg-white/[0.05] hover:text-neutral-200"
      >
        <NavArrowRight
          className={`h-3 w-3 shrink-0 transition-transform duration-150 ${
            open ? 'rotate-90' : ''
          }`}
        />
        {isActivelyThinking && (
          <span className="h-1.5 w-1.5 rounded-full bg-violet-400/80 animate-pulse" />
        )}
        <span className={isActivelyThinking ? 'text-neutral-300' : 'text-neutral-400'}>
          {isActivelyThinking ? '思考中...' : '已思考'}
        </span>
      </button>
      {open && content && (
        <div className="mt-1.5 ml-1.5 max-h-60 overflow-y-auto border-l-2 border-white/10 pl-3 text-[12px] leading-relaxed whitespace-pre-wrap text-neutral-400">
          {content}
        </div>
      )}
    </div>
  );
};

const markdownComponents: Components = {
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-neutral-50">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-neutral-200">{children}</em>,
  del: ({ children }) => <del className="text-neutral-400 line-through">{children}</del>,
  h1: ({ children }) => (
    <h1 className="mt-3 mb-1.5 text-base font-semibold text-neutral-100 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-2.5 mb-1 text-sm font-semibold text-neutral-100 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-2 mb-1 text-[13px] font-semibold text-neutral-100 first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-2 mb-1 text-[13px] font-medium text-neutral-200 first:mt-0">
      {children}
    </h4>
  ),
  ul: ({ children }) => (
    <ul className="my-1.5 list-disc space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1.5 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-violet-400/50 pl-3 text-neutral-300 first:mt-0 last:mb-0">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-violet-300 underline decoration-violet-400/40 underline-offset-2 hover:text-violet-200"
    >
      {children}
    </a>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-[#121212] p-3 font-[inherit] text-[12px] leading-relaxed text-neutral-200 first:mt-0 last:mb-0 [&_code]:rounded-none [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-[inherit] text-[12px] text-violet-200">
      {children}
    </code>
  ),
  hr: () => <hr className="my-3 border-white/10" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto first:mt-0 last:mb-0">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-white/15 px-2.5 py-1.5 font-semibold text-neutral-200">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-white/10 px-2.5 py-1.5 text-neutral-300">{children}</td>
  )
};

export const MarkdownContent: React.FC<MarkdownContentProps> = React.memo(
  ({ content, isStreaming = false }) => {
    const hasThinkTag = content.includes('<think>');
    const segments = hasThinkTag
      ? splitThinkBlocks(content)
      : [{ type: 'text' as const, content, closed: true }];

    const renderedSegments = segments
      .map((seg, idx) => {
        if (seg.type === 'think') {
          return (
            <ThinkingBlock
              key={`think-${idx}`}
              content={seg.content}
              closed={seg.closed}
              isStreaming={isStreaming}
            />
          );
        }
        const visibleText = stripImplicitTitleTags(seg.content, isStreaming);
        if (!visibleText.trim()) return null;
        return (
          <ReactMarkdown
            key={`text-${idx}`}
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {visibleText}
          </ReactMarkdown>
        );
      })
      .filter(Boolean);

    return (
      <div
        className={`min-w-0 break-words text-[13px] leading-relaxed ${
          isStreaming ? 'markdown-streaming' : ''
        }`}
      >
        {renderedSegments}
      </div>
    );
  }
);
