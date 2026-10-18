import { useState } from 'react';
import { api, type Feature, type PlanId, type PublicPlan } from '../api';
import { Icon } from '../components/Icon';
import { Markdown } from '../components/Markdown';
import { FEATURE_ORDER, PlanFeatures, PlanPrice, contactHref, daysUntil, lrd, usd } from '../components/Plan';
import { Callout, ErrorState, FormField, Loading, Meter, Modal, Pill, toneFor, useAction } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { bytes, dateTime, dateLabel } from '../format';
import { useApi } from '../hooks';
import { useSession } from '../session';
import { Button, buttonVariants } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';

interface Payment {
  id: string;
  plan: PlanId;
  months: number;
  seats: number;
  amount: number;
  method: string;
  method_label: string;
  reference: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decision_note: string;
  period_end: string | null;
  created_at: string;
  submitted_by: { id: string; name: string } | null;
}

interface BillingData {
  plan: {
    id: PlanId;
    name: string;
    status: 'trial' | 'active' | 'grace' | 'free';
    purchased: PlanId;
    trial_ends_at: string | null;
    paid_through: string | null;
    features: Feature[];
    custom?: boolean;
  };
  usage: {
    members: number;
    member_limit: number | null;
    guests: number;
    storage_bytes: number;
    storage_limit: number | null;
    ai_used: number;
    ai_limit: number | null;
    recording_seconds: number;
    recording_hours: number | null;
    blocked: { key: string; label: string; count: number }[];
  };
  plans: PublicPlan[];
  lrd_per_usd: number | null;
  annual_factor: number;
  grace_days: number;
  month_options: number[];
  methods: { id: string; label: string }[];
  instructions: string | null;
  support_email: string | null;
  payments: Payment[];
}

const STATUS_TEXT: Record<Payment['status'], string> = { pending: 'Waiting for confirmation', approved: 'Confirmed', rejected: 'Not confirmed', cancelled: 'Cancelled' };

/** A flat price per workspace; paying for 12 months at once applies the annual discount. */
export const totalFor = (price: number, months: number, annualFactor: number) => Math.round(price * months * (months >= 12 ? annualFactor : 1) * 100) / 100;

const hours = (seconds: number) => `${Math.round((seconds / 3600) * 10) / 10} h`;

export function BillingSettings() {
  const { data, error, reload } = useApi<BillingData>('/billing');
  const act = useAction();
  const [paying, setPaying] = useState<PlanId | null>(null);
  if (error) return <ErrorState error={error} retry={reload} />;
  if (!data) return <Loading />;
  const { plan, usage } = data;

  const statusLine =
    plan.status === 'trial'
      ? `Organization trial — ${daysUntil(plan.trial_ends_at)} days left (ends ${dateLabel(plan.trial_ends_at)}). If you don't choose a plan, you move to Free and keep all your data.`
      : plan.status === 'active'
        ? `Paid until ${dateLabel(plan.paid_through)}.`
        : plan.status === 'grace'
          ? `Payment overdue since ${dateLabel(plan.paid_through)}. Paid features keep working for ${data.grace_days} days after that date.`
          : 'Free forever. Upgrade any time to unlock more.';

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardDescription className="text-xs font-semibold tracking-wide text-primary uppercase">Current plan</CardDescription>
          <CardTitle aria-level={2} className="font-heading text-xl flex flex-wrap items-center gap-2">
              {plan.name}{' '}
              <Pill tone={toneFor(plan.status)} className="capitalize">
                {plan.status === 'grace' ? 'overdue' : plan.status}
              </Pill>
</CardTitle>
          <CardDescription>{statusLine}</CardDescription>
          {plan.status !== 'free' && plan.status !== 'trial' && (
            <CardAction>
              <Button onClick={() => setPaying(plan.purchased)}>Renew</Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Meter label={usage.guests ? `Members (plus ${usage.guests} guest${usage.guests === 1 ? '' : 's'}, who don't count)` : 'Members'} used={usage.members} limit={usage.member_limit} />
            <Meter label="File storage" used={usage.storage_bytes} limit={usage.storage_limit} format={(n) => bytes(n)} />
            {!!usage.recording_hours && <Meter label="Meeting recording this month" used={usage.recording_seconds} limit={usage.recording_hours * 3600} format={hours} />}
            {!!usage.ai_limit && <Meter label={plan.status === 'trial' ? 'AI requests during trial' : 'AI requests this month'} used={usage.ai_used} limit={usage.ai_limit} />}
          </div>
          {plan.custom && <p className="text-xs text-muted-foreground">Custom terms apply to this workspace, as agreed with us.</p>}
          {usage.blocked.length > 0 && (
            <Callout tone="warning" title="Your team tried to use these in the last 30 days, and your plan stopped them:">
              <ul className="ml-4 list-disc">
                {usage.blocked.map((b) => (
                  <li key={b.key}>
                    {b.label}{' '}
                    <span className="text-muted-foreground">
                      · {b.count} time{b.count === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            </Callout>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.plans.map((p) => {
          const current = plan.status !== 'trial' && plan.id === p.id;
          const tooSmall = p.member_limit != null && usage.members > p.member_limit;
          const contact = contactHref(data.support_email, p.name);
          return (
            <Card key={p.id} className={cn(p.id === 'organization' && 'ring-2 ring-primary', current && 'bg-accent/40')}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">{p.name}</CardTitle>
                  {p.id === 'organization' && <Badge>Includes AI</Badge>}
                  {current && <Badge variant="secondary">Current</Badge>}
                </div>
                <PlanPrice plan={p} />
                {!!p.price && <CardDescription className="text-xs">{lrd(p.price, data.lrd_per_usd) || 'Paid monthly or yearly'}</CardDescription>}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <p className="text-sm text-muted-foreground">{p.tagline}</p>
                <PlanFeatures plan={p} all={FEATURE_ORDER} />
              </CardContent>
              <CardFooter>
                {current ? (
                  <Button variant="outline" className="w-full" disabled>
                    Current plan
                  </Button>
                ) : p.self_serve && tooSmall ? (
                  <p className="text-xs text-muted-foreground">
                    Your workspace has {usage.members} members; {p.name} allows up to {p.member_limit}.
                  </p>
                ) : p.self_serve ? (
                  <Button className="w-full" variant={p.id === 'organization' ? 'default' : 'outline'} onClick={() => setPaying(p.id)}>
                    Choose {p.name}
                  </Button>
                ) : p.price == null ? (
                  contact ? (
                    <a href={contact} className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
                      Contact us for a quote
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground">Contact us for a quote.</p>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">Workspaces move here automatically when a trial or paid plan ends.</p>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle aria-level={2}>Payments</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!data.payments.length && <p className="text-sm text-muted-foreground">No payments yet.</p>}
          {data.payments.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{dateTime(p.created_at)}</TableCell>
                    <TableCell>
                      {data.plans.find((x) => x.id === p.plan)?.name ?? p.plan} · {p.months} mo
                    </TableCell>
                    <TableCell className="tabular-nums">{usd(p.amount)}</TableCell>
                    <TableCell>{p.method_label}</TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{p.reference}</code>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <Pill tone={toneFor(p.status)}>{STATUS_TEXT[p.status]}</Pill>
                      {p.decision_note && <span className="block text-xs text-muted-foreground">{p.decision_note}</span>}
                      {p.status === 'approved' && p.period_end && <span className="block text-xs text-muted-foreground">Covers until {dateLabel(p.period_end)}</span>}
                    </TableCell>
                    <TableCell>
                      {p.status === 'pending' && (
                        <Button variant="outline" size="sm" onClick={async () => (await act(() => api.del(`/billing/payments/${p.id}`), 'Payment cancelled')) && reload()}>
                          Cancel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {data.support_email && (
            <p className="text-xs text-muted-foreground">
              Questions about billing? Email{' '}
              <a className="text-primary hover:underline" href={`mailto:${data.support_email}`}>
                {data.support_email}
              </a>
              .
            </p>
          )}
        </CardContent>
      </Card>

      <PayModal data={data} plan={paying} onClose={() => setPaying(null)} onDone={reload} />
    </div>
  );
}

function PayModal({ data, plan, onClose, onDone }: { data: BillingData; plan: PlanId | null; onClose: () => void; onDone: () => void }) {
  const { me } = useSession();
  const act = useAction();
  const [form, setForm] = useState({ plan: plan ?? 'team', months: 1, method: data.methods[0]?.id ?? 'orange_money', reference: '', payerName: '', payerPhone: '', note: '' });
  const [done, setDone] = useState(false);
  const [lastPlan, setLastPlan] = useState(plan);
  if (plan !== lastPlan) {
    setLastPlan(plan);
    setDone(false);
    if (plan) setForm((f) => ({ ...f, plan, reference: '' }));
  }
  const chosen = data.plans.find((p) => p.id === form.plan)!;
  const total = chosen ? totalFor(chosen.price ?? 0, form.months, data.annual_factor) : 0;
  const switching = data.plan.status === 'active' && data.plan.purchased !== form.plan;

  return (
    <Modal open={!!plan} onClose={onClose} title={done ? 'Payment submitted' : `Pay for ${chosen?.name ?? ''}`} eyebrow="BILLING" wide>
      {done ? (
        <div className="flex flex-col gap-3">
          <p>
            Thank you. We'll check the payment and confirm it — usually within one business day. You'll get an email and a notification when it's done, and your plan
            starts then.
          </p>
          <Button onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await act(() => api.post('/billing/payments', { ...form, months: Number(form.months) }));
            if (ok) {
              setDone(true);
              onDone();
            }
          }}
        >
          <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-4">
            <FormField label="Plan">
              <NativeSelect value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value as PlanId })}>
                {data.plans
                  .filter((p) => p.self_serve && (p.member_limit == null || data.usage.members <= p.member_limit))
                  .map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.name} — {usd(p.price ?? 0)} per workspace / month
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </FormField>
            <FormField label="Pay for">
              <NativeSelect value={form.months} onChange={(e) => setForm({ ...form, months: Number(e.target.value) })}>
                {data.month_options.map((m) => (
                  <NativeSelectOption key={m} value={m}>
                    {m === 1 ? '1 month' : m === 12 ? '12 months (2 months free)' : `${m} months`}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted px-4 py-3">
            <span className="min-w-0 flex-1 text-sm">
              {usd(chosen.price ?? 0)} × {form.months} month{form.months === 1 ? '' : 's'}
              {form.months >= 12 ? ' − 2 months free' : ''}
              <span className="block text-xs text-muted-foreground">One price for the whole workspace, up to {chosen.member_limit} members. Guests don't count.</span>
            </span>
            <strong className="font-heading text-2xl font-semibold tabular-nums">
              {usd(total)} <span className="text-xs font-normal text-muted-foreground">{lrd(total, data.lrd_per_usd)}</span>
            </strong>
          </div>
          {switching && <Callout tone="warning">Changing plans starts a new period on the day the payment is confirmed.</Callout>}
          <div className="flex flex-col gap-2 rounded-xl border p-4">
            <h3 className="font-semibold">1. Send the payment</h3>
            {data.instructions ? (
              <Markdown text={data.instructions} />
            ) : (
              <p className="text-muted-foreground">Payment details haven't been set up yet{data.support_email ? `. Email ${data.support_email} to pay.` : '. Please contact support.'}</p>
            )}
            <p className="text-muted-foreground text-xs">Pay exactly {usd(total)} and keep the transaction ID from your confirmation SMS or receipt.</p>
          </div>
          <h3 className="font-semibold">2. Tell us about it</h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-4">
            <FormField label="Paid with">
              <NativeSelect value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                {data.methods.map((m) => (
                  <NativeSelectOption key={m.id} value={m.id}>
                    {m.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Transaction ID / reference">
              <Input required minLength={3} maxLength={100} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="e.g. MP240925.1234.A56789" />
            </FormField>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-4">
            <FormField label="Phone number used (optional)">
              <Input type="tel" maxLength={40} value={form.payerPhone} onChange={(e) => setForm({ ...form, payerPhone: e.target.value })} placeholder="0770 000 000" />
            </FormField>
            <FormField label="Name on the account (optional)">
              <Input maxLength={100} value={form.payerName} onChange={(e) => setForm({ ...form, payerName: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Note (optional)">
            <Input maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </FormField>
          {!me?.user.email_verified && <Callout tone="warning">Confirm your email address first — use the link in the banner at the top of the page.</Callout>}
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1" />
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!me?.user.email_verified} type="submit">
              <Icon name="send" size={15} /> Submit payment
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
