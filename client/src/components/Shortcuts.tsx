import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/kit';
import { Kbd } from '@/components/ui/kbd';

/** "g" then a key: where it goes. */
export const GO_TO: { key: string; path: string; label: string }[] = [
  { key: 'h', path: '/', label: 'Home' },
  { key: 'a', path: '/activities', label: 'Activities' },
  { key: 'c', path: '/chats', label: 'Chats' },
  { key: 'm', path: '/my-work', label: 'My work' },
  { key: 'p', path: '/projects', label: 'Projects' },
  { key: 'f', path: '/files', label: 'Files' },
  { key: 'k', path: '/knowledge', label: 'Knowledge' },
  { key: 'e', path: '/meetings', label: 'Meetings' },
  { key: 's', path: '/settings', label: 'Settings' },
];

const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? '⌘' : 'Ctrl';

const SECTIONS: { title: string; keys: [string[], string][] }[] = [
  {
    title: 'Anywhere',
    keys: [
      [[MOD, 'K'], 'Search, jump to anything, or run a command'],
      [['/'], 'Search'],
      [['C'], 'Create a task'],
      [['?'], 'Show these shortcuts'],
    ],
  },
  { title: 'Go to', keys: GO_TO.map((g) => [['G', g.key.toUpperCase()], g.label]) },
  {
    title: 'Writing a message',
    keys: [
      [['Enter'], 'Send (or a new line, if “Enter to send” is off)'],
      [['Shift', 'Enter'], 'New line'],
      [[MOD, 'Enter'], 'Always sends'],
      [['↑'], 'Edit your last message (when the box is empty)'],
      [['@'], 'Mention a person or a team'],
    ],
  },
  {
    title: 'Writing a page',
    keys: [
      [[MOD, 'B'], 'Bold'],
      [[MOD, 'I'], 'Italic'],
      [[MOD, 'K'], 'Link'],
    ],
  },
];

/** Typing in a field, or a dialog is open: single-key shortcuts stay out of the way. */
function busy(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return true;
  // A dialog on its way out (closing animation) no longer counts.
  return !!document.querySelector('[role="dialog"]:not([data-ending-style]):not([data-closed]), [role="alertdialog"]:not([data-ending-style]):not([data-closed])');
}

/**
 * Single-key shortcuts for the whole app: "/" search, "c" create a task, "?" this sheet, and "g" then a
 * letter to go somewhere. Ignored while typing, in dialogs, or with Ctrl/Alt/⌘ held.
 */
export function useShortcuts({ onSearch, onCreate, onHelp }: { onSearch: () => void; onCreate: () => void; onHelp: () => void }) {
  const navigate = useNavigate();
  const pendingGo = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || busy(e.target)) return;
      const key = e.key.toLowerCase();
      if (Date.now() - pendingGo.current < 1500) {
        pendingGo.current = 0;
        const target = GO_TO.find((g) => g.key === key);
        if (target) {
          e.preventDefault();
          navigate(target.path);
        }
        return;
      }
      if (key === 'g') pendingGo.current = Date.now();
      else if (e.key === '?') (e.preventDefault(), onHelp());
      else if (e.key === '/') (e.preventDefault(), onSearch());
      else if (key === 'c') (e.preventDefault(), onCreate());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, onSearch, onCreate, onHelp]);
}

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" wide readOnly>
      <div className="grid gap-6 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <section key={s.title} aria-label={s.title}>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{s.title}</h3>
            <dl className="flex flex-col gap-1.5">
              {s.keys.map(([keys, what]) => (
                <div key={what} className="flex items-center justify-between gap-3 text-sm">
                  <dt>{what}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
