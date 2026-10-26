import { useEffect, useState } from 'react';
import { dateLabel, timeAgo } from '../format';
import { useSearchParams } from 'react-router-dom';
import { api, type Me } from '../api';
import { Icon } from '../components/Icon';
import { CategoryLayout, type Category, Callout, FormField, Loading, LoadingRows, Modal, Page, PageHeader, Panel, PasswordInput, Pill, SecretReveal, SwitchField, TimePicker, useAction, useConfirm } from '@/components/kit';
import { Kbd } from '@/components/ui/kbd';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { UpgradeNotice, usePlan } from '../components/Plan';
import { useApi } from '../hooks';
import { useSession } from '../session';
import { MfaSetup } from './Auth';
import { disablePush, enablePush, pushState, type PushState } from '../pwa';
import { useTheme, type ThemeChoice } from '../theme';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

type Section = 'account' | 'security' | 'notifications' | 'general' | 'developer';

const SECTIONS: Category<Section>[] = [
  { id: 'account', label: 'Account', icon: 'user', hint: 'Profile, your data, delete account' },
  { id: 'security', label: 'Security', icon: 'shield', hint: 'Multifactor sign-in, password, devices' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', hint: 'Focus time, quiet hours, email, push' },
  { id: 'general', label: 'General', icon: 'settings', hint: 'Appearance, getting started' },
  { id: 'developer', label: 'Developer', icon: 'code', hint: 'API tokens' },
];

/** Links from before settings were grouped (?tab=…) still land in the right place. */
const OLD_TABS: Record<string, Section> = { profile: 'account', notifications: 'notifications', security: 'security', api: 'developer', onboarding: 'general' };

export function Settings() {
  const [params, setParams] = useSearchParams();
  const asked = (params.get('section') ?? OLD_TABS[params.get('tab') ?? ''] ?? null) as Section | null;
  const { has } = usePlan();
  return (
    <Page>
      <PageHeader title="Settings" description="Your account, security, notifications and preferences." />
      <CategoryLayout label="Settings categories" backLabel="Settings" categories={SECTIONS} open={asked} onOpen={(id) => setParams(id ? { section: id } : {})}>
        {(shown) => (
          <>
            {shown.id === 'account' && (
              <>
                <Profile />
                <YourData />
                <DeleteAccount />
              </>
            )}
            {shown.id === 'security' && <Security />}
            {shown.id === 'notifications' && <Notifications />}
            {shown.id === 'general' && (
              <>
                <Appearance />
                <Onboarding />
              </>
            )}
            {shown.id === 'developer' && (has('api') ? <ApiTokens /> : <UpgradeNotice feature="api" />)}
          </>
        )}
      </CategoryLayout>
    </Page>
  );
}

function YourData() {
  return (
    <Panel title="Your data" description="Download everything you can access — messages, tasks, pages, file metadata, meetings and decisions — as JSON.">
      <a href="/api/export" className={buttonVariants({ variant: 'outline', className: 'self-start' })}>
        <Icon name="download" data-icon="inline-start" />
        Export my data
      </a>
    </Panel>
  );
}

/** Light, dark, or follow the device. Saved on this device. */
function Appearance() {
  const { choice, setTheme } = useTheme();
  const options: { id: ThemeChoice; label: string; hint: string; icon: string }[] = [
    { id: 'system', label: 'System', hint: 'Match this device', icon: 'monitor' },
    { id: 'light', label: 'Light', hint: 'Cream and terracotta', icon: 'sun' },
    { id: 'dark', label: 'Dark', hint: 'Easier on the eyes at night', icon: 'moon' },
  ];
  const swatch: Record<ThemeChoice, string> = {
    system: 'bg-[linear-gradient(135deg,#fef6eb_50%,#131312_50%)]',
    light: 'bg-[#fef6eb]',
    dark: 'bg-[#131312]',
  };
  return (
    <Panel title="Appearance" description="Saved on this device. You can also switch from the menu under your name.">
      <RadioGroup value={choice} onValueChange={(v) => setTheme(v as ThemeChoice)} aria-label="Appearance" className="grid gap-3 sm:grid-cols-3">
        {options.map((o) => (
          <Label
            key={o.id}
            className={cn('flex cursor-pointer flex-col items-stretch gap-2 rounded-xl border p-3 font-normal transition-colors hover:bg-muted/50', choice === o.id && 'border-primary bg-accent/40')}
          >
            <span className={cn('relative h-14 overflow-hidden rounded-lg border', swatch[o.id])} aria-hidden="true">
              <span className="absolute top-2 left-2 h-2 w-8 rounded-full bg-[#b5461b]" />
            </span>
            <span className="flex items-center gap-2">
              <RadioGroupItem value={o.id} />
              <span className="flex flex-col">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon name={o.icon} size={14} /> {o.label}
                </span>
                <span className="text-xs text-muted-foreground">{o.hint}</span>
              </span>
            </span>
          </Label>
        ))}
      </RadioGroup>
    </Panel>
  );
}

const ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
})();

function Profile() {
  const { me, setMe, reloadPeople } = useSession();
  const act = useAction();
  const u = me!.user;
  const [form, setForm] = useState({
    name: u.name,
    title: u.title,
    timezone: u.timezone,
    working_hours: u.working_hours,
    status_text: u.status_text,
    expertise: u.expertise.join(', '),
  });
  return (
    <Panel title="Profile">
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const updated = await act(
          () => api.patch<Me>('/me', { ...form, expertise: form.expertise.split(',').map((s) => s.trim()).filter(Boolean) }),
          'Profile saved',
        );
        if (updated) {
          setMe(updated);
          reloadPeople();
        }
      }}
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-4">
        <FormField label="Name">
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </FormField>
        <FormField label="Title">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Product designer" />
        </FormField>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-4">
        <FormField label="Time zone">
          <NativeSelect value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
            {ZONES.map((z) => (
              <NativeSelectOption key={z} value={z}>
                {z}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Working hours">
          <Input value={form.working_hours} onChange={(e) => setForm({ ...form, working_hours: e.target.value })} placeholder="09:00-17:00" />
        </FormField>
      </div>
      <FormField label="Status message">
        <Input value={form.status_text} onChange={(e) => setForm({ ...form, status_text: e.target.value })} placeholder="e.g. In workshops until 2pm" maxLength={100} />
      </FormField>
      <FormField label="Expertise" hint="Comma separated. Helps colleagues find you in the directory.">
        <Input value={form.expertise} onChange={(e) => setForm({ ...form, expertise: e.target.value })} placeholder="Research, Figma, Accessibility" />
      </FormField>
      {form.timezone !== Intl.DateTimeFormat().resolvedOptions().timeZone && (
        <Callout tone="info">
          This device is in {Intl.DateTimeFormat().resolvedOptions().timeZone}.{' '}
          <Button
            variant="link"
            size="inline"
            type="button"
            onClick={() => setForm({ ...form, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })}>
            Use it
          </Button>
        </Callout>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="submit">Save profile</Button>
      </div>
    </form>
    </Panel>
  );
}

function Notifications() {
  const { me, setMe } = useSession();
  const act = useAction();
  const [quiet, setQuiet] = useState({ start: me!.user.quiet_start ?? '', end: me!.user.quiet_end ?? '' });
  const focusActive = me!.user.focus_until && new Date(me!.user.focus_until) > new Date();
  const setFocus = async (minutes: number | null) => {
    const updated = await act(
      () => api.patch<Me>('/me', minutes ? { status: 'focus', focus_until: new Date(Date.now() + minutes * 60_000).toISOString() } : { status: 'available', focus_until: null }),
      minutes ? `Focus time on for ${minutes >= 60 ? `${minutes / 60} hour${minutes > 60 ? 's' : ''}` : `${minutes} minutes`}` : 'Focus time ended',
    );
    if (updated) setMe(updated);
  };
  const savePref = async (patch: Partial<Me['user']>) => {
    const updated = await act(() => api.patch<Me>('/me', patch), 'Email preference saved');
    if (updated) setMe(updated);
  };
  return (
    <>
      <Panel title="Focus time" description="During focus time, notifications are collected in Activities without interrupting you. Urgent messages still come through.">
        {focusActive ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <strong>Focusing until {new Date(me!.user.focus_until!).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.</strong>
            <Button variant="outline" size="sm" onClick={() => setFocus(null)}>
              End now
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {[30, 60, 120, 240].map((m) => (
              <Button variant="outline" key={m} onClick={() => setFocus(m)}>
                <Icon name="moon" data-icon="inline-start" /> {m >= 60 ? `${m / 60} h` : `${m} min`}
              </Button>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Quiet hours" description={`A daily window, in your time zone (${me!.user.timezone}), when non-urgent notifications stay silent.`}>
        <form
          className="flex flex-wrap items-end gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const updated = await act(() => api.patch<Me>('/me', { quiet_start: quiet.start || null, quiet_end: quiet.end || null }), 'Quiet hours saved');
            if (updated) setMe(updated);
          }}
        >
          <FormField label="From" className="w-auto">
            <TimePicker value={quiet.start} onChange={(v) => setQuiet({ ...quiet, start: v })} />
          </FormField>
          <FormField label="Until" className="w-auto">
            <TimePicker value={quiet.end} onChange={(v) => setQuiet({ ...quiet, end: v })} />
          </FormField>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {(quiet.start || quiet.end) && (
              <Button variant="outline" type="button" onClick={() => setQuiet({ start: '', end: '' })}>
                Clear
              </Button>
            )}
            <Button type="submit">Save quiet hours</Button>
          </div>
        </form>
      </Panel>
      <Panel title="Email" footer={<p className="text-xs text-muted-foreground">Invitations, password resets and meeting invitations are always emailed.</p>}>
        <div className="flex flex-col gap-5">
          <SwitchField
            label="Morning digest"
            description="At 8am in your time zone, if you have unread notifications."
            checked={me!.user.email_digest}
            onCheckedChange={(checked) => savePref({ email_digest: checked })}
          />
          <SwitchField
            label="Urgent messages while I am away"
            description="Only when you are not connected to Küü."
            checked={me!.user.email_urgent}
            onCheckedChange={(checked) => savePref({ email_urgent: checked })}
          />
        </div>
      </Panel>
      <DeviceNotifications />
    </>
  );
}

/** Push notifications for this phone or computer, including when Küü is closed. */
function DeviceNotifications() {
  const act = useAction();
  const { data: config } = useApi<{ enabled: boolean; publicKey?: string }>('/push/config');
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (config) void pushState(config.enabled).then(setState);
  }, [config]);
  const turnOn = async () => {
    setBusy(true);
    try {
      const ok = await act(() => enablePush(config!.publicKey!, (sub) => api.post('/me/push', sub)), 'Notifications are on for this device');
      if (ok === false && Notification.permission === 'denied') setState('denied');
      else setState(await pushState(true));
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      const endpoint = await disablePush();
      if (endpoint) await act(() => api.del('/me/push', { endpoint }), 'Notifications are off for this device');
      setState(await pushState(true));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel
      title="Notifications on this device"
      description="Get mentions, assignments and urgent messages on this phone or computer when Küü is closed. They follow your quiet hours and focus time, except urgent messages."
      footer={<p className="text-xs text-muted-foreground">Per-channel preferences (all, mentions only, muted) are in each channel’s header.</p>}
    >
      {state === null && <Loading className="min-h-12" />}
      {state === 'on' && (
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="success">
            <Icon name="check" /> On for this device
          </Pill>
          <span className="flex-1" />
          <Button variant="outline" size="sm" disabled={busy} onClick={() => act(() => api.post('/me/push/test'), 'Test notification sent')}>
            Send a test
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={turnOff}>
            Turn off
          </Button>
        </div>
      )}
      {state === 'off' && (
        <div className="flex flex-col items-start gap-2">
          <Button disabled={busy} onClick={turnOn}>
            {busy && <Spinner data-icon="inline-start" />} Turn on notifications
          </Button>
          <span className="text-xs text-muted-foreground">On iPhone and iPad, first add Küü to your Home Screen (Share → Add to Home Screen), then open it from there.</span>
        </div>
      )}
      {state === 'denied' && <Callout tone="warning">Notifications are blocked for this site. Allow them in your browser’s site settings, then reload.</Callout>}
      {state === 'unavailable' && <Callout tone="neutral">Push notifications aren’t available here. Install Küü (or open the production site) to use them.</Callout>}
      {state === 'unsupported' && <Callout tone="neutral">This browser doesn’t support notifications.</Callout>}
    </Panel>
  );
}

function Security() {
  const { me, setMe } = useSession();
  const act = useAction();
  const [pw, setPw] = useState({ current: '', next: '' });
  const [disablePw, setDisablePw] = useState('');
  const [setup, setSetup] = useState(false);
  return (
    <>
      <Panel title="Multifactor authentication">
        {me!.user.mfa_enabled ? (
          <div className="flex flex-col gap-3">
            <Callout tone="success" title="Enabled">
              You will be asked for a code from your authenticator app when you sign in.
            </Callout>
            {!me!.workspace.require_mfa && (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const updated = await act(() => api.post<Me>('/me/mfa/disable', { password: disablePw }), 'Multifactor authentication turned off');
                  if (updated) setMe(updated);
                }}
              >
                <PasswordInput className="max-w-xs flex-1" placeholder="Password to confirm" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} aria-label="Password" required />
                <Button variant="destructive" type="submit">
                  Turn off
                </Button>
              </form>
            )}
          </div>
        ) : setup ? (
          <MfaSetup onDone={() => setSetup(false)} />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm text-muted-foreground">Protect your account with a second step at sign-in.</p>
            <Button onClick={() => setSetup(true)}>
              <Icon name="shield" data-icon="inline-start" /> Set up MFA
            </Button>
          </div>
        )}
      </Panel>
      <Panel title="Password">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await act(() => api.post('/me/password', pw), 'Password changed. Other sessions were signed out.');
            if (ok) setPw({ current: '', next: '' });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Current password">
              <PasswordInput autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </FormField>
            <FormField label="New password" hint="At least 8 characters.">
              <PasswordInput autoComplete="new-password" required minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </FormField>
          </div>
          <div className="flex justify-end">
            <Button type="submit">Change password</Button>
          </div>
        </form>
      </Panel>
      <Sessions />
    </>
  );
}

interface SessionRow {
  id: string;
  device: string;
  ip: string | null;
  workspace_name: string;
  created_at: string;
  last_seen_at: string;
  current: boolean;
}

function Sessions() {
  const act = useAction();
  const confirm = useConfirm();
  const { data, reload } = useApi<SessionRow[]>('/me/sessions');
  const others = data?.filter((s) => !s.current).length ?? 0;
  return (
    <Panel
      title="Where you’re signed in"
      description="If you don’t recognise a device, sign it out and change your password."
      footer={
        others > 0 && (
          <Button
            variant="outline"
            className="ml-auto"
            onClick={async () => {
              if (!(await confirm({ title: 'Sign out everywhere except this device?', confirmLabel: 'Sign out others' }))) return;
              await act(() => api.post('/me/sessions/revoke-others'), 'Signed out of all other devices');
              reload();
            }}
          >
            Sign out all other devices
          </Button>
        )
      }
    >
      {!data && <LoadingRows rows={2} />}
      <div className="flex flex-col divide-y">
        {data?.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <Icon name="monitor" size={18} className="text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {s.device} {s.current && <Pill tone="brand">This device</Pill>}
              </span>
              <span className="text-xs text-muted-foreground">
                {s.workspace_name}
                {s.ip && ` · ${s.ip}`} · signed in {dateLabel(s.created_at)} · last active {timeAgo(s.last_seen_at)}
              </span>
            </span>
            {!s.current && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={async () => {
                  await act(() => api.del(`/me/sessions/${s.id}`), 'Signed out');
                  reload();
                }}
              >
                Sign out
              </Button>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function DeleteAccount() {
  const { me, setMe } = useSession();
  const act = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ password: '', code: '', confirm: '' });
  return (
    <Panel
      className="ring-destructive/30"
      title={<span className="text-destructive">Delete account</span>}
      description="Erases your name, email address, password and personal settings, and removes you from every workspace. Messages and work you shared stay with your teams, shown as “Deleted user”. If you're the only owner of a workspace, make someone else an owner or delete the workspace first."
    >
      <Button variant="destructive" className="self-start" onClick={() => setOpen(true)}>
        Delete my account
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Delete your account?" eyebrow="Danger">
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await act(() => api.del('/me', { password: form.password, code: form.code || undefined }));
            if (ok) setMe(null);
          }}
        >
          <FormField label="Type DELETE to confirm">
            <Input required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="off" />
          </FormField>
          <FormField label="Your password">
            <Input required type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </FormField>
          {me!.user.mfa_enabled && (
            <FormField label="Authenticator code">
              <Input required inputMode="numeric" autoComplete="one-time-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </FormField>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1" />
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={form.confirm !== 'DELETE'} type="submit">
              Delete my account
            </Button>
          </div>
        </form>
      </Modal>
    </Panel>
  );
}

function Onboarding() {
  const act = useAction();
  const { data, reload } = useApi<{ id: string; title: string; description: string; link: string; done_at: string | null }[]>('/onboarding');
  if (!data) return <Loading />;
  const done = data.filter((d) => d.done_at).length;
  return (
    <Panel title="Getting started" description={data.length ? `${done} of ${data.length} complete` : undefined}>
      {data.length ? (
        <div className="flex flex-col gap-3">
          <Progress value={(done / data.length) * 100} aria-label="Onboarding progress" />
          <div className="flex flex-col divide-y">
            {data.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-2.5">
                <Checkbox
                  id={`onb-${item.id}`}
                  checked={!!item.done_at}
                  onCheckedChange={async () => {
                    await act(() => api.post(`/onboarding/${item.id}/toggle`));
                    reload();
                  }}
                />
                <Label htmlFor={`onb-${item.id}`} className="flex min-w-0 flex-1 flex-col items-start gap-0.5 font-normal">
                  <strong className={cn('font-medium', item.done_at && 'text-muted-foreground line-through')}>{item.title}</strong>
                  {item.description && <span className="text-xs text-muted-foreground">{item.description}</span>}
                </Label>
                {item.link && (
                  <a href={item.link} target={item.link.startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    Open
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Your workspace has not set up an onboarding checklist.</p>
      )}
    </Panel>
  );
}

function ApiTokens() {
  const { me } = useSession();
  const act = useAction();
  const confirm = useConfirm();
  const { data, reload } = useApi<{ id: string; name: string; prefix: string; scope: string; last_used_at: string | null; expires_at: string | null; revoked_at: string | null; created_at: string }[]>(
    '/integrations/tokens',
  );
  const [form, setForm] = useState({ name: '', scope: 'read', expiresInDays: '90' });
  const [created, setCreated] = useState<string | null>(null);
  if (me!.role === 'guest') return <Callout tone="neutral">Guests cannot create API tokens.</Callout>;
  return (
    <>
      <Panel
        title="Personal API tokens"
        description={
          <>
            Tokens let scripts and other tools use the Küü API as you, with your permissions. Send them as <Kbd>Authorization: Bearer sx_…</Kbd>. See{' '}
            <a className="text-primary hover:underline" href="https://github.com/zlanquapea/SoftEX/blob/main/docs/API.md" target="_blank" rel="noopener noreferrer">
              the API guide
            </a>
            .
          </>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await act(() =>
              api.post<{ token: string }>('/integrations/tokens', { name: form.name, scope: form.scope, expiresInDays: form.expiresInDays ? Number(form.expiresInDays) : null }),
            );
            if (res) {
              setCreated(res.token);
              setForm({ ...form, name: '' });
              reload();
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Name">
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Weekly report script" />
            </FormField>
            <FormField label="Access">
              <NativeSelect value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
                <NativeSelectOption value="read">Read only</NativeSelectOption>
                <NativeSelectOption value="write">Read and write</NativeSelectOption>
              </NativeSelect>
            </FormField>
            <FormField label="Expires">
              <NativeSelect value={form.expiresInDays} onChange={(e) => setForm({ ...form, expiresInDays: e.target.value })}>
                <NativeSelectOption value="30">In 30 days</NativeSelectOption>
                <NativeSelectOption value="90">In 90 days</NativeSelectOption>
                <NativeSelectOption value="365">In a year</NativeSelectOption>
                <NativeSelectOption value="">Never</NativeSelectOption>
              </NativeSelect>
            </FormField>
          </div>
          <div className="flex justify-end">
            <Button type="submit">Create token</Button>
          </div>
          {created && <SecretReveal title="Copy your token now — it will not be shown again." value={created} />}
        </form>
      </Panel>
      <Panel title="Your tokens">
        {!data && <LoadingRows rows={2} />}
        {data && !data.length && <p className="text-sm text-muted-foreground">No tokens yet.</p>}
        <div className="flex flex-col divide-y">
          {data?.map((t) => (
            <div key={t.id} className={cn('flex flex-wrap items-center gap-3 py-2.5', t.revoked_at && 'opacity-60')}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {t.name} <Pill>{t.scope === 'write' ? 'Read & write' : 'Read only'}</Pill>
                </span>
                <span className="text-xs text-muted-foreground">
                  <code className="font-mono">{t.prefix}…</code> · created {dateLabel(t.created_at)} · {t.last_used_at ? `last used ${timeAgo(t.last_used_at)}` : 'never used'}
                  {t.expires_at && ` · expires ${dateLabel(t.expires_at)}`}
                  {t.revoked_at && ' · revoked'}
                </span>
              </span>
              {!t.revoked_at && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={async () => {
                    if (!(await confirm({ title: `Revoke “${t.name}”?`, description: 'Anything using it will stop working immediately.', confirmLabel: 'Revoke', destructive: true }))) return;
                    await act(() => api.del(`/integrations/tokens/${t.id}`), 'Token revoked');
                    reload();
                  }}
                >
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
