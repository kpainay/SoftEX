import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Icon } from '../Icon';

export interface Category<Id extends string = string> {
  id: Id;
  label: string;
  icon: string;
  /** One line under the label saying what's inside. */
  hint?: string;
  /** Categories with the same group are listed together under its name. */
  group?: string;
}

/**
 * A list of categories beside the open one, for pages with many sections (settings, administration).
 * On a computer the list stays on the left; on a phone you see the list, tap into a category, and go back.
 */
export function CategoryLayout<Id extends string>({
  label,
  backLabel,
  categories,
  open,
  onOpen,
  showTitle = true,
  children,
}: {
  /** Names the list for screen readers, e.g. "Settings categories". */
  label: string;
  /** The phone's back link, e.g. "Settings". */
  backLabel: string;
  categories: Category<Id>[];
  /** The chosen category, or null when none was chosen yet (a computer then shows the first). */
  open: Id | null;
  onOpen: (id: Id | null) => void;
  /** Off when each category's content already starts with its own title. */
  showTitle?: boolean;
  children: (shown: Category<Id>) => ReactNode;
}) {
  const shown = categories.find((c) => c.id === open) ?? categories[0];
  const groups: { name?: string; items: Category<Id>[] }[] = [];
  for (const c of categories) {
    const last = groups[groups.length - 1];
    if (last && last.name === c.group) last.items.push(c);
    else groups.push({ name: c.group, items: [c] });
  }
  const chosen = categories.some((c) => c.id === open);
  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <nav aria-label={label} className={cn('flex flex-col gap-4 md:sticky md:top-4 md:w-64 md:shrink-0', chosen && 'max-md:hidden')}>
        {groups.map((g, i) => (
          <div key={g.name ?? i} className="flex flex-col gap-1.5">
            {g.name && <h2 className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.name}</h2>}
            <ul className="flex flex-col gap-0.5 rounded-2xl border bg-card p-1.5">
              {g.items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(c.id)}
                    aria-current={shown.id === c.id ? 'page' : undefined}
                    className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted', shown.id === c.id && 'md:bg-muted')}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                      <Icon name={c.icon} size={16} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium">{c.label}</span>
                      {c.hint && <span className="truncate text-xs text-muted-foreground">{c.hint}</span>}
                    </span>
                    <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground md:hidden" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <section aria-label={shown.label} className={cn('flex min-w-0 flex-1 flex-col gap-4', !chosen && 'max-md:hidden')}>
        <Button variant="ghost" size="sm" className="-ml-2 self-start md:hidden" onClick={() => onOpen(null)}>
          <Icon name="chevronLeft" data-icon="inline-start" /> {backLabel}
        </Button>
        {showTitle && <h2 className="font-heading text-lg font-semibold">{shown.label}</h2>}
        {children(shown)}
      </section>
    </div>
  );
}
