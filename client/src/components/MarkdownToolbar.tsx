import type { KeyboardEvent, RefObject } from 'react';
import { Icon } from './Icon';
import { IconButton } from '@/components/kit';
import { Separator } from '@/components/ui/separator';

type Field = HTMLTextAreaElement;
type Edit = { value: string; start: number; end: number };

/** Wrap the selection in a marker (**bold**), or unwrap it when it is already wrapped. */
function wrap({ value, start, end }: Edit, before: string, after = before, placeholder = 'text'): Edit {
  const selected = value.slice(start, end);
  if (value.slice(start - before.length, start) === before && value.slice(end, end + after.length) === after) {
    return { value: value.slice(0, start - before.length) + selected + value.slice(end + after.length), start: start - before.length, end: end - before.length };
  }
  const inner = selected || placeholder;
  return { value: value.slice(0, start) + before + inner + after + value.slice(end), start: start + before.length, end: start + before.length + inner.length };
}

/** Put a prefix at the start of every selected line (headings, lists, quotes), or take it off if every line has it. */
function prefixLines({ value, start, end }: Edit, prefix: (i: number) => string, matches: RegExp): Edit {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = value.indexOf('\n', end) === -1 ? value.length : value.indexOf('\n', end);
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const remove = lines.every((l) => matches.test(l));
  const next = lines.map((l, i) => (remove ? l.replace(matches, '') : prefix(i) + l.replace(/^(#{1,6} |> |- \[[ x]\] |- |\d+\. )/, ''))).join('\n');
  return { value: value.slice(0, lineStart) + next + value.slice(lineEnd), start: lineStart, end: lineStart + next.length };
}

const ACTIONS = {
  bold: { label: 'Bold (Ctrl+B)', icon: 'bold', run: (e: Edit) => wrap(e, '**') },
  italic: { label: 'Italic (Ctrl+I)', icon: 'italic', run: (e: Edit) => wrap(e, '_') },
  strike: { label: 'Strikethrough', icon: 'strike', run: (e: Edit) => wrap(e, '~~') },
  heading: { label: 'Heading', icon: 'heading', run: (e: Edit) => prefixLines(e, () => '## ', /^## /) },
  bullets: { label: 'Bulleted list', icon: 'list', run: (e: Edit) => prefixLines(e, () => '- ', /^- (?!\[)/) },
  numbers: { label: 'Numbered list', icon: 'listOrdered', run: (e: Edit) => prefixLines(e, (i) => `${i + 1}. `, /^\d+\. /) },
  checklist: { label: 'Checklist', icon: 'task', run: (e: Edit) => prefixLines(e, () => '- [ ] ', /^- \[[ x]\] /) },
  quote: { label: 'Quote', icon: 'quote', run: (e: Edit) => prefixLines(e, () => '> ', /^> /) },
  code: { label: 'Code', icon: 'code', run: (e: Edit) => (e.value.slice(e.start, e.end).includes('\n') ? wrap(e, '```\n', '\n```', 'code') : wrap(e, '`', '`', 'code')) },
  link: { label: 'Link (Ctrl+K)', icon: 'link', run: (e: Edit) => {
    const selected = e.value.slice(e.start, e.end) || 'link text';
    const text = `[${selected}](https://)`;
    // Leave the address selected, ready to paste over.
    const at = e.start + selected.length + 3;
    return { value: e.value.slice(0, e.start) + text + e.value.slice(e.end), start: at, end: at + 8 };
  } },
} as const;
type Action = keyof typeof ACTIONS;
const GROUPS: Action[][] = [['bold', 'italic', 'strike'], ['heading', 'bullets', 'numbers', 'checklist'], ['quote', 'code', 'link']];

/**
 * Formatting buttons for a Markdown text box: they add the Markdown for you, so nobody has to know it.
 * `onKeyDown` adds the usual shortcuts (Ctrl/⌘+B, I, K) to the text box.
 */
export function useMarkdownToolbar(field: RefObject<Field | null>, onChange: (value: string) => void, disabled = false) {
  const apply = (action: Action) => {
    const el = field.current;
    if (!el || disabled) return;
    const next = ACTIONS[action].run({ value: el.value, start: el.selectionStart, end: el.selectionEnd });
    onChange(next.value);
    // After React has put the new text in, restore the selection around what was formatted.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.start, next.end);
    });
  };
  const onKeyDown = (e: KeyboardEvent<Field>) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const action = ({ b: 'bold', i: 'italic', k: 'link' } as Record<string, Action>)[e.key.toLowerCase()];
    if (!action) return;
    e.preventDefault();
    apply(action);
  };
  const toolbar = (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 rounded-xl border bg-muted/40 p-1">
      {GROUPS.map((group, i) => (
        <span key={i} className="flex items-center gap-0.5">
          {i > 0 && <Separator orientation="vertical" className="mx-1 h-5" />}
          {group.map((a) => (
            // Keep focus (and the selection) in the text box when a button is pressed.
            <IconButton key={a} label={ACTIONS[a].label} size="icon-sm" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => apply(a)}>
              <Icon name={ACTIONS[a].icon} />
            </IconButton>
          ))}
        </span>
      ))}
    </div>
  );
  return { toolbar, onKeyDown };
}
