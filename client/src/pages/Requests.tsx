import { useState } from 'react';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Callout, EmptyState, ErrorState, FormField, Loading, Modal, Page, PageHeader, Pill, TabBar, toneFor, useAction } from '@/components/kit';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { timeAgo } from '../format';
import { useApi } from '../hooks';
import { usePeople, useSession } from '../session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

interface Request {
  id: string;
  kind: string;
  title: string;
  details: string;
  requester_id: string;
  requester_name: string;
  requester_color: string;
  approver_id: string;
  approver_name: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  resolution_note: string;
  decided_at: string | null;
  created_at: string;
}

const KIND_LABEL: Record<string, string> = { access: 'Access', purchase: 'Purchase', leave: 'Leave handoff', support: 'Internal support', other: 'Other' };

export function Requests() {
  const { me } = useSession();
  const people = usePeople();
  const act = useAction();
  const [tab, setTab] = useState<'inbox' | 'mine'>('inbox');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ kind: 'purchase', title: '', details: '', approverId: '' });
  const [note, setNote] = useState<Record<string, string>>({});
  const { data, error, reload } = useApi<Request[]>('/requests');
  const list = (data ?? []).filter((r) => (tab === 'inbox' ? r.approver_id === me!.user.id : r.requester_id === me!.user.id));
  const pending = (data ?? []).filter((r) => r.approver_id === me!.user.id && r.status === 'pending').length;

  const decide = async (r: Request, status: 'approved' | 'rejected' | 'cancelled') => {
    await act(() => api.post(`/requests/${r.id}/decide`, { status, note: note[r.id] ?? '' }), `Request ${status}`);
    reload();
  };

  return (
    <Page width="narrow">
      <PageHeader
        title="Requests & approvals"
        description="Lightweight approvals for access, purchases, leave handoffs and internal support."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Icon name="plus" data-icon="inline-start" /> New request
          </Button>
        }
      />
      <TabBar value={tab} onChange={setTab} tabs={[{ id: 'inbox', label: 'To approve', count: pending }, { id: 'mine', label: 'My requests' }]} />
      {error && <ErrorState error={error} retry={reload} />}
      {!data && !error && <Loading />}
      {data && !list.length && <EmptyState icon="inboxCheck" title={tab === 'inbox' ? 'Nothing waiting for you' : 'You have not made any requests'} />}
      {list.map((r) => (
        <Card key={r.id} size="sm" className={cn(r.status === 'cancelled' && 'opacity-70')}>
          <CardHeader className="flex flex-wrap items-center gap-2">
            <Avatar user={{ id: r.requester_id, name: r.requester_name, color: r.requester_color }} size="sm" />
            <CardTitle className="min-w-0 truncate">{r.title}</CardTitle>
            <Pill>{KIND_LABEL[r.kind]}</Pill>
            <Pill tone={toneFor(r.status)} className="capitalize">
              {r.status}
            </Pill>
            <span className="ml-auto text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p className="text-xs text-muted-foreground">
              {r.requester_name} → {r.approver_name}
            </p>
            {r.details && <p className="whitespace-pre-wrap">{r.details}</p>}
            {r.resolution_note && (
              <Callout tone="info">
                <strong>{r.approver_name}:</strong> {r.resolution_note}
              </Callout>
            )}
          </CardContent>
          {r.status === 'pending' && (r.approver_id === me!.user.id || r.requester_id === me!.user.id) && (
            <CardFooter className="flex-wrap gap-2">
              {r.approver_id === me!.user.id && (
                <>
                  <Input className="min-w-40 flex-1" placeholder="Optional note" value={note[r.id] ?? ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} aria-label="Note" />
                  <Button variant="outline" onClick={() => decide(r, 'rejected')}>
                    Decline
                  </Button>
                  <Button onClick={() => decide(r, 'approved')}>Approve</Button>
                </>
              )}
              {r.requester_id === me!.user.id && (
                <Button variant="outline" size="sm" onClick={() => decide(r, 'cancelled')}>
                  Cancel request
                </Button>
              )}
            </CardFooter>
          )}
        </Card>
      ))}
      <Modal open={creating} onClose={() => setCreating(false)} title="New request">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await act(() => api.post('/requests', form), 'Request sent');
            if (ok) {
              setCreating(false);
              setForm({ kind: 'purchase', title: '', details: '', approverId: '' });
              setTab('mine');
              reload();
            }
          }}
        >
          <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-4">
            <FormField label="Type">
              <NativeSelect value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {Object.entries(KIND_LABEL).map(([k, v]) => (
                  <NativeSelectOption key={k} value={k}>
                    {v}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Approver">
              <NativeSelect required value={form.approverId} onChange={(e) => setForm({ ...form, approverId: e.target.value })}>
                <NativeSelectOption value="">Choose…</NativeSelectOption>
                {people
                  .filter((p) => p.id !== me!.user.id && p.role !== 'guest')
                  .map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.name}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </FormField>
          </div>
          <FormField label="What do you need?">
            <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Figma licence for the design contractor" />
          </FormField>
          <FormField label="Details">
            <Textarea rows={4} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="Cost, dates, justification, links to the system of record…" />
          </FormField>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="submit">Send request</Button>
          </div>
        </form>
      </Modal>
    </Page>
  );
}
