import { useEffect, useState, type CSSProperties } from 'react';
import { ChevronUp } from 'lucide-react';
import { api, LABEL_COLORS, type CustomField, type FieldType, type Label, type LabelColor, type TimeEntry } from '../api';
import { duration, localToday, timeAgo } from '../format';
import { useApi } from '../hooks';
import { useSession } from '../session';
import { Icon } from './Icon';
import { UpgradeNotice, usePlan } from './Plan';
import { DatePicker, IconButton, Modal, Pill, useAction, useConfirm } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label as UILabel } from '@/components/ui/label';

// ---------- Labels ----------

export function LabelChip({ label, onRemove }: { label: Pick<Label, 'name' | 'color'>; onRemove?: () => void }) {
  return (
    <Badge
      variant="outline"
      className="label-chip max-w-48 gap-1.5 border-transparent bg-[color-mix(in_oklab,var(--lc)_16%,transparent)] text-foreground"
      style={{ '--lc': `var(--c-${label.color})` } as CSSProperties}
    >
      <i className="size-1.5 shrink-0 rounded-full bg-(--lc)" aria-hidden="true" />
      <span className="truncate">{label.name}</span>
      {onRemove && (
        <button type="button" className="-mr-1 rounded-full p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground" aria-label={`Remove label ${label.name}`} onClick={onRemove}>
          <Icon name="x" size={11} />
        </button>
      )}
    </Badge>
  );
}

export function LabelChips({ labels }: { labels?: Label[] }) {
  if (!labels?.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {labels.map((l) => (
        <LabelChip key={l.id} label={l} />
      ))}
    </span>
  );
}

/** Pick labels for a task, creating new ones inline. */
export function LabelPicker({ taskId, value, disabled, onChange }: { taskId: string; value: Label[]; disabled?: boolean; onChange: (labels: Label[]) => void }) {
  const act = useAction();
  const { data: all, reload } = useApi<Label[]>('/labels');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [color, setColor] = useState<LabelColor>('blue');
  const save = async (ids: string[]) => {
    const labels = await act(() => api.put<Label[]>(`/tasks/${taskId}/labels`, { labelIds: ids }));
    if (labels) onChange(labels);
  };
  const ids = value.map((l) => l.id);
  const matches = (all ?? []).filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase()));
  const exact = (all ?? []).some((l) => l.name.toLowerCase() === q.trim().toLowerCase());
  return (
    <div className="label-picker flex w-full flex-wrap items-center gap-1.5">
      {value.map((l) => (
        <LabelChip key={l.id} label={l} onRemove={disabled ? undefined : () => save(ids.filter((id) => id !== l.id))} />
      ))}
      {!value.length && disabled && <span className="text-muted-foreground text-xs">None</span>}
      {!disabled && (
        <Button variant="ghost" size="xs" type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {!open && !value.length && <Icon name="plus" data-icon="inline-start" />}
          {open ? 'Done' : value.length ? 'Edit' : 'Add label'}
        </Button>
      )}
      {open && (
        <div className="flex w-full flex-col gap-2 rounded-xl border bg-popover p-2 shadow-sm">
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find or create a label" aria-label="Find or create a label" />
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {matches.map((l) => (
              <UILabel key={l.id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 font-normal hover:bg-muted">
                <Checkbox
                  checked={ids.includes(l.id)}
                  onCheckedChange={(checked) => save(checked ? [...ids, l.id] : ids.filter((id) => id !== l.id))} />
                <LabelChip label={l} />
              </UILabel>
            ))}
          </div>
          {q.trim() && !exact && (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const created = await act(() => api.post<Label>('/labels', { name: q.trim(), color }));
                if (!created) return;
                setQ('');
                await reload();
                await save([...ids, created.id]);
              }}
            >
              <ColorDots value={color} onChange={setColor} />
              <Button variant="outline" size="sm" type="submit">Create “{q.trim()}”</Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export function ColorDots({ value, onChange }: { value: LabelColor; onChange: (c: LabelColor) => void }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colour">
      {LABEL_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          className={cn('size-5 rounded-full ring-offset-2 ring-offset-popover outline-none focus-visible:ring-2 focus-visible:ring-ring', value === c && 'ring-2 ring-foreground')}
          style={{ background: `var(--c-${c})` }}
          onClick={() => onChange(c)}
        />
      ))}
    </span>
  );
}

// ---------- Custom fields ----------

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  select: 'Dropdown',
  person: 'Person',
  checkbox: 'Checkbox',
  url: 'Link',
};

/** Read-only display of a field value (tables, cards). */
export function FieldValue({ field, value }: { field: CustomField; value: unknown }) {
  const { people } = useSession();
  if (value === undefined || value === null || value === '') return <span className="text-muted-foreground">—</span>;
  switch (field.type) {
    case 'checkbox':
      return value ? <Icon name="check" size={14} /> : <span className="text-muted-foreground">—</span>;
    case 'select': {
      const opt = field.options.find((o) => o.label === value);
      return <LabelChip label={{ name: String(value), color: opt?.color ?? 'blue' }} />;
    }
    case 'person':
      return <span>{people.find((p) => p.id === value)?.name ?? 'Former member'}</span>;
    case 'url':
      return (
        <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline" onClick={(e) => e.stopPropagation()}>
          {String(value).replace(/^https?:\/\//, '').slice(0, 40)}
        </a>
      );
    case 'number':
      return <span>{Number(value).toLocaleString()}</span>;
    default:
      return <span>{String(value)}</span>;
  }
}

/** Editable field value; saves on change/blur. */
export function FieldInput({ field, value, disabled, onSave }: { field: CustomField; value: unknown; disabled?: boolean; onSave: (value: unknown) => void }) {
  const { people } = useSession();
  const label = field.name;
  switch (field.type) {
    case 'checkbox':
      return (
        <Checkbox
          checked={!!value}
          disabled={disabled}
          aria-label={label}
          onCheckedChange={(checked) => onSave(checked)} />
      );
    case 'select':
      return (
        <NativeSelect value={(value as string) ?? ''} disabled={disabled} aria-label={label} onChange={(e) => onSave(e.target.value || null)}>
          <NativeSelectOption value="">—</NativeSelectOption>
          {field.options.map((o) => (
            <NativeSelectOption key={o.label} value={o.label}>
              {o.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      );
    case 'person':
      return (
        <NativeSelect value={(value as string) ?? ''} disabled={disabled} aria-label={label} onChange={(e) => onSave(e.target.value || null)}>
          <NativeSelectOption value="">—</NativeSelectOption>
          {people.map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      );
    case 'date':
      return <DatePicker value={value as string | null} disabled={disabled} aria-label={label} onChange={(v) => onSave(v)} placeholder="—" />;
    case 'number':
      return (
        <Input
          type="number"
          className="w-32"
          defaultValue={(value as number) ?? ''}
          key={String(value)}
          disabled={disabled}
          aria-label={label}
          onBlur={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value);
            if (v !== (value ?? null)) onSave(v);
          }}
        />
      );
    default:
      return (
        <Input
          type={field.type === 'url' ? 'url' : 'text'}
          defaultValue={(value as string) ?? ''}
          key={String(value)}
          disabled={disabled}
          aria-label={label}
          placeholder={field.type === 'url' ? 'https://' : ''}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== ((value as string) ?? '')) onSave(v || null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      );
  }
}

export function useProjectFields(projectId: string | null | undefined) {
  return useApi<CustomField[]>(projectId ? `/projects/${projectId}/fields` : null);
}

/** Custom field rows inside the task drawer's property list. */
export function TaskFieldRows({ taskId, projectId, values, disabled, onChange }: { taskId: string; projectId?: string | null; values: Record<string, unknown>; disabled: boolean; onChange: (v: Record<string, unknown>) => void }) {
  const act = useAction();
  const { data: fields } = useProjectFields(projectId);
  if (!fields?.length) return null;
  return (
    <>
      {fields.map((f) => (
        <FieldRow key={f.id} field={f}>
          <FieldInput
            field={f}
            value={values[f.id]}
            disabled={disabled}
            onSave={async (value) => {
              const res = await act(() => api.put<{ fields: Record<string, unknown> }>(`/tasks/${taskId}/fields/${f.id}`, { value }));
              if (res) onChange(res.fields);
            }}
          />
        </FieldRow>
      ))}
    </>
  );
}

function FieldRow({ field, children }: { field: CustomField; children: React.ReactNode }) {
  return (
    <>
      <dt className="truncate pt-1.5 text-sm text-muted-foreground" title={FIELD_TYPE_LABEL[field.type]}>
        {field.name}
      </dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2">{children}</dd>
    </>
  );
}

/** Project settings: add, rename, reorder and remove custom fields. */
export function FieldsManager({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const act = useAction();
  const confirm = useConfirm();
  const plan = usePlan();
  const { data: fields, reload } = useProjectFields(open ? projectId : null);
  const [name, setName] = useState('');
  const [type, setType] = useState<FieldType>('text');
  const [options, setOptions] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Custom fields" eyebrow="Project settings">
      {!plan.has('fields') ? (
        <UpgradeNotice feature="fields" />
      ) : (
        <>
          <p className="text-muted-foreground">Fields show on every task in this project and as columns in the table view.</p>
          <ul className="my-3 flex flex-col divide-y rounded-xl border">
            {fields?.map((f, i) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 p-2">
                <Input
                  className="w-auto min-w-0 flex-1 basis-40"
                  defaultValue={f.name}
                  aria-label="Field name"
                  onBlur={async (e) => {
                    if (e.target.value.trim() && e.target.value !== f.name) await act(() => api.patch(`/fields/${f.id}`, { name: e.target.value.trim() }));
                    reload();
                  }}
                />
                <Pill>{FIELD_TYPE_LABEL[f.type]}</Pill>
                {f.type === 'select' && <small className="text-muted-foreground">{f.options.map((o) => o.label).join(', ')}</small>}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${f.name} up`}
                  disabled={i === 0}
                  onClick={async () => {
                    const order = fields.map((x) => x.id);
                    [order[i - 1], order[i]] = [order[i], order[i - 1]];
                    await act(async () => {
                      for (const [position, id] of order.entries()) await api.patch(`/fields/${id}`, { position });
                    });
                    reload();
                  }}>
                  <ChevronUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Delete ${f.name}`}
                  onClick={async () => {
                    if (!(await confirm({ title: `Delete the “${f.name}” field?`, description: 'Its values on every task are removed too.', confirmLabel: 'Delete field', destructive: true }))) return;
                    await act(() => api.del(`/fields/${f.id}`));
                    reload();
                  }}>
                  <Icon name="trash" size={13} />
                </Button>
              </li>
            ))}
            {fields && !fields.length && <li className="p-3 text-sm text-muted-foreground">No fields yet.</li>}
          </ul>
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const opts = options
                .split(',')
                .map((o) => o.trim())
                .filter(Boolean)
                .map((label, i) => ({ label, color: LABEL_COLORS[i % LABEL_COLORS.length] }));
              const ok = await act(() => api.post(`/projects/${projectId}/fields`, { name, type, options: opts }), 'Field added');
              if (!ok) return;
              setName('');
              setOptions('');
              reload();
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Input className="w-auto min-w-0 flex-1 basis-48" value={name} onChange={(e) => setName(e.target.value)} placeholder="New field name" aria-label="New field name" required maxLength={60} />
              <NativeSelect value={type} onChange={(e) => setType(e.target.value as FieldType)} aria-label="Field type">
                {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => (
                  <NativeSelectOption key={t} value={t}>
                    {FIELD_TYPE_LABEL[t]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            {type === 'select' && <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Options, separated by commas" aria-label="Dropdown options" required />}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button size="sm" disabled={!name.trim()} type="submit">
                Add field
              </Button>
            </div>
          </form>
        </>
      )}
    </Modal>
  );
}

// ---------- Time tracking ----------

/** The running timer's elapsed time, ticking each second. */
export function useElapsed(startedAt: string | null | undefined) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return '';
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

/** Timer plus manual entries on a task. */
export function TimeTracker({ taskId, estimateHours, canLog }: { taskId: string; estimateHours: number | null; canLog: boolean }) {
  const act = useAction();
  const plan = usePlan();
  const { me } = useSession();
  const { data, reload } = useApi<{ entries: TimeEntry[]; total_minutes: number; running: TimeEntry | null }>(`/tasks/${taskId}/time`);
  const elapsed = useElapsed(data?.running?.started_at);
  const [adding, setAdding] = useState(false);
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(localToday());
  const [note, setNote] = useState('');
  if (!data) return null;
  const available = plan.has('fields');
  const changed = () => {
    reload();
    window.dispatchEvent(new Event('kuu:time'));
  };
  const pct = estimateHours ? Math.min(100, Math.round((data.total_minutes / (estimateHours * 60)) * 100)) : null;
  return (
    <section className="flex flex-col gap-2">
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <h3 className="flex items-baseline gap-2 text-sm font-semibold">
          Time {data.total_minutes > 0 && <span className="text-xs font-normal text-muted-foreground">{duration(data.total_minutes)} logged{estimateHours ? ` of ${estimateHours}h` : ''}</span>}
        </h3>
        {canLog && available && (
          <span className="flex flex-wrap items-center gap-1">
            {data.running ? (
              <Button
                variant="outline"
                size="xs"
                className="text-destructive"
                onClick={async () => {
                  await act(() => api.post('/time/stop'));
                  changed();
                }}
              >
                <span className="size-2 animate-pulse rounded-full bg-destructive" /> <span className="tabular-nums">{elapsed}</span> Stop
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="xs"
                onClick={async () => {
                  await act(() => api.post(`/tasks/${taskId}/time/start`));
                  changed();
                }}
              >
                <Icon name="play" data-icon="inline-start" /> Start timer
              </Button>
            )}
            <Button variant="ghost" size="xs" onClick={() => setAdding((a) => !a)}>
              {adding ? 'Cancel' : 'Log time'}
            </Button>
          </span>
        )}
      </div>
      {pct !== null && data.total_minutes > 0 && (
        <Progress value={pct} aria-label={`${pct}% of estimate`} className={cn(pct >= 100 && '[&_[data-slot=progress-indicator]]:bg-destructive')} />
      )}
      {!available && canLog && <UpgradeNotice feature="fields" compact />}
      {adding && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const minutes = Math.round(Number(hours) * 60);
            if (!minutes) return;
            const ok = await act(() => api.post(`/tasks/${taskId}/time`, { minutes, date, note }), 'Time logged');
            if (!ok) return;
            setHours('');
            setNote('');
            setAdding(false);
            changed();
          }}
        >
          <Input type="number" min={0} max={24} step={0.25} className="w-24" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="hours" aria-label="Hours" required />
          <DatePicker value={date} max={localToday()} clearable={false} onChange={(v) => v && setDate(v)} aria-label="Date" />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" maxLength={500} className="min-w-40 flex-1" />
          <Button size="sm" type="submit">
            Save time
          </Button>
        </form>
      )}
      {data.entries.slice(0, 8).map((e) => (
        <div key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
          <strong className="font-semibold tabular-nums">{e.running ? elapsed || 'Running' : duration(e.minutes)}</strong>
          <span>{e.user?.name}</span>
          {e.note && <span className="text-muted-foreground">— {e.note}</span>}
          <span className="text-xs text-muted-foreground">{timeAgo(e.started_at)}</span>
          {(e.user?.id === me?.user.id || me?.role === 'admin' || me?.role === 'owner') && !e.running && (
            <IconButton
              label="Remove time entry"
              size="icon-xs"
              onClick={async () => {
                await act(() => api.del(`/time/${e.id}`));
                changed();
              }}
            >
              <Icon name="x" />
            </IconButton>
          )}
        </div>
      ))}
    </section>
  );
}
