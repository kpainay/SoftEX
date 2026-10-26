import { Fragment, memo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

const LINK = 'font-medium text-primary underline-offset-4 hover:underline';

/**
 * A small, safe Markdown renderer. It never injects HTML: every node is built
 * with React elements, and links are limited to http(s) and in-app paths.
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(@\[[^\]]+\]\((?:team:)?[0-9a-f-]{36}\))|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    const token = m[0];
    if (m[1]) out.push(<code key={k} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">{token.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(token.slice(2, -2), k)}</strong>);
    else if (m[3]) out.push(<em key={k}>{inline(token.slice(1, -1), k)}</em>);
    else if (m[4]) {
      const [, name, ref] = token.match(/@\[([^\]]+)\]\(([^)]+)\)/)!;
      // A person, or a whole team ("team:<id>").
      const to = ref.startsWith('team:') ? `/teams/${ref.slice(5)}` : `/people/${ref}`;
      out.push(
        <Link key={k} className="rounded-sm bg-accent px-1 font-medium text-accent-foreground hover:underline" to={to}>
          @{name}
        </Link>,
      );
    } else if (m[5]) {
      const [, label, href] = token.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      out.push(linkEl(href, label, k));
    } else if (m[6]) out.push(linkEl(token, token, k));
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Returns a normalised http(s) URL, or null for anything else (javascript:, data:, relative…). */
function safeExternalUrl(href: string): string | null {
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function linkEl(href: string, label: string, key: string) {
  // In-app links only: a single leading slash, never "//" or "/\\" (which browsers treat as another site).
  if (/^\/(?![/\\])[^\s]*$/.test(href)) {
    return (
      <Link key={key} to={href} className={LINK}>
        {label}
      </Link>
    );
  }
  const external = safeExternalUrl(href);
  if (external) {
    return (
      <a key={key} href={external} target="_blank" rel="noopener noreferrer nofollow" className={LINK}>
        {label}
      </a>
    );
  }
  return <Fragment key={key}>{label}</Fragment>;
}

/** Memoised: its props are plain strings, so a redraw of the screen around it never re-parses unchanged text. */
export const Markdown = memo(function Markdown({ text, compact = false }: { text: string; compact?: boolean }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={key++} className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">
          <code>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading && !compact) {
      const level = heading[1].length;
      const content = inline(heading[2], `h${key}`);
      blocks.push(
        level === 1 ? (
          <h2 key={key++} className="mt-5 font-heading text-lg font-semibold first:mt-0">
            {content}
          </h2>
        ) : level === 2 ? (
          <h3 key={key++} className="mt-4 font-heading text-base font-semibold first:mt-0">
            {content}
          </h3>
        ) : (
          <h4 key={key++} className="mt-3 font-semibold first:mt-0">
            {content}
          </h4>
        ),
      );
      i++;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '');
        const box = itemText.match(/^\[( |x)\]\s+(.*)$/i);
        items.push(
          <li key={i} className={box ? '-ml-5 flex list-none items-start gap-2' : undefined}>
            {box ? <Checkbox className="mt-0.5" checked={box[1].toLowerCase() === 'x'} readOnly aria-label="checklist item" /> : null}
            <span>{inline(box ? box[2] : itemText, `li${i}`)}</span>
          </li>,
        );
        i++;
      }
      blocks.push(
        ordered ? (
          <ol key={key++} className="ml-5 list-decimal marker:text-muted-foreground [&>li+li]:mt-1">
            {items}
          </ol>
        ) : (
          <ul key={key++} className="ml-5 list-disc marker:text-muted-foreground [&>li+li]:mt-1">
            {items}
          </ul>
        ),
      );
      continue;
    }
    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(
        <blockquote key={key++} className="border-l-2 border-primary/40 pl-3 text-muted-foreground">
          {inline(quote.join(' '), `q${key}`)}
        </blockquote>,
      );
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,3}\s|>|\s*([-*]|\d+\.)\s+)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) {
      para.push(lines[i++]);
    }
    blocks.push(
      <p key={key++}>
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(p, `p${key}-${j}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  // Blocks follow each other with a gap; compact (messages) keeps it tighter.
  return <div className={cn('markdown min-w-0 break-words [&>*+*]:mt-3', compact && 'compact [&>*+*]:mt-2')}>{blocks}</div>;
});
