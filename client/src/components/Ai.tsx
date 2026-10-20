import { useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '../api';
import { usePeople, useSession } from '../session';
import { Icon } from './Icon';
import { Markdown } from './Markdown';
import { DatePicker, useAction } from '@/components/kit';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';

/** True when AI assistance is available and switched on for this workspace. */
export function useAiEnabled() {
  const { me } = useSession();
  return !!me?.workspace.ai_enabled && !!me?.workspace.ai_available && !!me?.workspace.plan?.features.includes('ai');
}

/** The frame every AI output sits in: a clear label, the content, and who can see it. */
function AiBox({ title, children, footer, ...props }: { title: ReactNode; children: ReactNode; footer?: ReactNode; role?: string; 'aria-label'?: string }) {
  return (
    <Card size="sm" className="gap-3 bg-accent/40 ring-primary/15" {...props}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-primary uppercase">
          <Sparkles className="size-3.5" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">{children}</CardContent>
      {footer && <CardFooter className="flex-wrap gap-2">{footer}</CardFooter>}
    </Card>
  );
}

export function AiDraft({ text, onUse, useLabel }: { text: string; onUse?: () => void; useLabel?: string }) {
  return (
    <AiBox
      title="AI draft — check it before relying on it"
      role="region"
      aria-label="AI draft"
      footer={
        <>
          <span className="min-w-0 flex-1 text-xs text-muted-foreground">Only visible to you. Generated from content you have access to.</span>
          <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(text)}>
            Copy
          </Button>
          {onUse && (
            <Button size="sm" onClick={onUse}>
              {useLabel ?? 'Use'}
            </Button>
          )}
        </>
      }
    >
      <Markdown text={text} />
    </AiBox>
  );
}

interface Suggestion {
  title: string;
  owner_id: string | null;
  owner_name: string | null;
  due_date: string | null;
  reason: string;
}

/** Thread tools: summary and task suggestions that a person reviews before anything is created. */
export function ThreadAi({ messageId, excluded }: { messageId: string; excluded: boolean }) {
  const enabled = useAiEnabled();
  const people = usePeople();
  const act = useAction();
  const [busy, setBusy] = useState<'summary' | 'tasks' | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<{ project_id: string | null; source_message_id: string; suggestions: (Suggestion & { pick: boolean })[] } | null>(null);
  if (!enabled) return null;
  if (excluded) return <p className="block p-3 text-xs text-muted-foreground">AI assistance is turned off for this conversation.</p>;
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!!busy}
          onClick={async () => {
            setBusy('summary');
            const res = await act(() => api.post<{ summary: string }>(`/ai/threads/${messageId}/summary`));
            setBusy(null);
            if (res) setSummary(res.summary);
          }}>
          {busy === 'summary' ? <Spinner data-icon="inline-start" /> : <Icon name="spark" data-icon="inline-start" />} {busy === 'summary' ? 'Summarizing…' : 'Summarize thread'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!!busy}
          onClick={async () => {
            setBusy('tasks');
            const res = await act(() => api.post<{ project_id: string | null; source_message_id: string; suggestions: Suggestion[] }>(`/ai/threads/${messageId}/suggest-tasks`));
            setBusy(null);
            if (res) setSuggested({ ...res, suggestions: res.suggestions.map((s) => ({ ...s, pick: true })) });
          }}>
          {busy === 'tasks' ? <Spinner data-icon="inline-start" /> : <Icon name="task" data-icon="inline-start" />} {busy === 'tasks' ? 'Looking…' : 'Suggest tasks'}
        </Button>
      </div>
      {summary && <AiDraft text={summary} />}
      {suggested && (
        <AiBox
          title="Suggested tasks — review before creating"
          footer={
            <>
              <span className="min-w-0 flex-1" />
              <Button variant="outline" size="sm" onClick={() => setSuggested(null)}>
                Dismiss
              </Button>
              <Button
                size="sm"
                disabled={!suggested.suggestions.some((s) => s.pick)}
                onClick={async () => {
                  let created = 0;
                  for (const s of suggested.suggestions.filter((x) => x.pick)) {
                    const ok = await act(() =>
                      api.post('/tasks', { title: s.title, ownerId: s.owner_id, dueDate: s.due_date, projectId: suggested.project_id, sourceMessageId: suggested.source_message_id }),
                    );
                    if (ok) created += 1;
                  }
                  if (created) {
                    setSuggested(null);
                    await act(async () => undefined, `${created} task${created > 1 ? 's' : ''} created`);
                  }
                }}
              >
                Create selected
              </Button>
            </>
          }
        >
          {!suggested.suggestions.length && <p className="text-muted-foreground">No clear follow-ups found.</p>}
          {suggested.suggestions.map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <Checkbox
                checked={s.pick}
                aria-label={`Create ${s.title}`}
                onCheckedChange={(checked) => setSuggested({ ...suggested, suggestions: suggested.suggestions.map((x, j) => (j === i ? { ...x, pick: checked } : x)) })} />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Input
                  value={s.title}
                  aria-label="Task title"
                  onChange={(e) => setSuggested({ ...suggested, suggestions: suggested.suggestions.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <NativeSelect
                    value={s.owner_id ?? ''}
                    aria-label="Owner"
                    onChange={(e) => setSuggested({ ...suggested, suggestions: suggested.suggestions.map((x, j) => (j === i ? { ...x, owner_id: e.target.value || null } : x)) })}
                  >
                    <NativeSelectOption value="">Unassigned</NativeSelectOption>
                    {people.map((p) => (
                      <NativeSelectOption key={p.id} value={p.id}>
                        {p.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <DatePicker
                    size="sm"
                    value={s.due_date}
                    aria-label="Due date"
                    placeholder="No due date"
                    onChange={(v) => setSuggested({ ...suggested, suggestions: suggested.suggestions.map((x, j) => (j === i ? { ...x, due_date: v } : x)) })}
                  />
                </div>
                <small className="text-muted-foreground">{s.reason}</small>
              </div>
            </div>
          ))}
        </AiBox>
      )}
    </div>
  );
}
