import { useState } from 'react';
import { api } from '../api';
import { dateTime } from '../format';
import { Icon } from './Icon';
import { DateTimePicker, FormField, Modal, useAction } from '@/components/kit';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/** Quick choices for "later": in 20 minutes, in an hour, this evening, tomorrow morning, next Monday. */
export function laterPresets(from = new Date()) {
  const at = (d: Date, h: number, m = 0) => {
    const x = new Date(d);
    x.setHours(h, m, 0, 0);
    return x;
  };
  const plus = (ms: number) => new Date(from.getTime() + ms);
  const tomorrow = new Date(from);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const monday = new Date(from);
  monday.setDate(monday.getDate() + (((8 - monday.getDay()) % 7) || 7));
  const list = [
    { label: 'In 20 minutes', date: plus(20 * 60_000) },
    { label: 'In 1 hour', date: plus(60 * 60_000) },
    { label: 'In 3 hours', date: plus(3 * 60 * 60_000) },
    { label: 'Tomorrow morning', date: at(tomorrow, 9) },
    { label: 'Next Monday', date: at(monday, 9) },
  ];
  const evening = at(from, 17);
  if (evening.getTime() - from.getTime() > 60 * 60_000) list.splice(3, 0, { label: 'This evening', date: evening });
  return list;
}

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** A modal that asks "when?" with quick presets and a custom date/time. */
export function WhenModal({
  open,
  onClose,
  title,
  eyebrow,
  confirmLabel,
  withNote,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  confirmLabel: string;
  withNote?: boolean;
  onPick: (iso: string, note: string) => Promise<unknown>;
}) {
  const [custom, setCustom] = useState(() => toLocalInput(new Date(Date.now() + 2 * 60 * 60_000)));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const pick = async (d: Date) => {
    setBusy(true);
    const ok = await onPick(d.toISOString(), note);
    setBusy(false);
    if (ok) {
      setNote('');
      onClose();
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={title} eyebrow={eyebrow}>
      {withNote && (
        <FormField label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="What should you remember?" />
        </FormField>
      )}
      <ItemGroup className="later-presets my-3 grid gap-2 sm:grid-cols-2">
        {laterPresets().map((p) => (
          <Item key={p.label} variant="outline" size="sm" className="hover:bg-muted" render={<button type="button" disabled={busy} onClick={() => pick(p.date)} />}>
            <ItemContent>
              <ItemTitle>{p.label}</ItemTitle>
              <ItemDescription>{dateTime(p.date.toISOString())}</ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new Date(custom);
          if (!Number.isNaN(d.getTime())) pick(d);
        }}
      >
        <FormField label="Or pick a date and time" className="w-auto">
          <DateTimePicker value={custom} onChange={(v) => v && setCustom(v)} />
        </FormField>
        <Button disabled={busy} type="submit">
          {confirmLabel}
        </Button>
      </form>
    </Modal>
  );
}

/** "Remind me" for a message or task (or a free-form note when neither is given). */
export function RemindModal({ open, onClose, messageId, taskId }: { open: boolean; onClose: () => void; messageId?: string; taskId?: string }) {
  const act = useAction();
  return (
    <WhenModal
      open={open}
      onClose={onClose}
      eyebrow="REMINDER"
      title="Remind me about this"
      confirmLabel="Set reminder"
      withNote
      onPick={(iso, note) =>
        act(
          () => api.post('/reminders', { remindAt: iso, note, messageId, taskId }),
          `Reminder set for ${dateTime(iso)}`,
        )
      }
    />
  );
}

export function RemindButton({ taskId, messageId, label = 'Remind me' }: { taskId?: string; messageId?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Icon name="clock" data-icon="inline-start" /> {label}
      </Button>
      <RemindModal open={open} onClose={() => setOpen(false)} taskId={taskId} messageId={messageId} />
    </>
  );
}
