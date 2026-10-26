import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type Person } from '../api';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { statusLabel } from '../components/Layout';
import { EmptyState, ErrorState, FilterBar, Loading, Page, PageHeader, Pill, SearchField, StatusDot, TabBar, useAction } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { localTimeIn, ROLE_LABEL, dateLabel } from '../format';
import { useApi } from '../hooks';
import { usePeople, useSession } from '../session';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Button, buttonVariants } from '@/components/ui/button';

export function Directory() {
  const people = usePeople();
  const [tab, setTab] = useState<'people' | 'teams'>('people');
  const [q, setQ] = useState('');
  const [team, setTeam] = useState('');
  const { data: teams } = useApi<{ id: string; name: string; description: string; members: { id: string; name: string; color: string }[] }[]>('/teams');
  const filtered = people.filter(
    (p) =>
      (!q || `${p.name} ${p.title} ${p.expertise.join(' ')} ${p.email}`.toLowerCase().includes(q.toLowerCase())) &&
      (!team || p.teams.some((t) => t.id === team)),
  );
  return (
    <Page>
      <PageHeader title="Directory" description="Find people by team, role, expertise and working hours." />
      <TabBar value={tab} onChange={setTab} tabs={[{ id: 'people', label: 'People', count: people.length }, { id: 'teams', label: 'Teams', count: teams?.length }]} />
      {tab === 'people' && (
        <>
          <FilterBar>
            <SearchField className="max-w-md flex-1" value={q} onChange={setQ} placeholder="Search name, role or expertise (e.g. “design”, “SQL”)" aria-label="Search people" />
            <NativeSelect value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
              <NativeSelectOption value="">All teams</NativeSelectOption>
              {teams?.map((t) => (
                <NativeSelectOption key={t.id} value={t.id}>
                  {t.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FilterBar>
          {!filtered.length && <EmptyState icon="users" title="No one matches" />}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <Link key={p.id} to={`/people/${p.id}`} className="group/person rounded-[min(var(--radius-4xl),24px)] outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
                <Card size="sm" className="h-full transition-shadow group-hover/person:shadow-md">
                  <CardContent className="flex gap-3">
                    <Avatar user={p} size="lg" showPresence />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <strong className="truncate font-semibold">{p.name}</strong>
                      <span className="truncate text-xs text-muted-foreground">{p.title || ROLE_LABEL[p.role]}</span>
                      <span className="flex items-center gap-1.5 text-xs">
                        <StatusDot status={p.status} /> <span className="truncate">{p.status_text || statusLabel(p.status)} · {localTimeIn(p.timezone)}</span>
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.role === 'guest' && <Pill tone="warning">Guest</Pill>}
                        {p.teams.map((t) => (
                          <Pill key={t.id}>{t.name}</Pill>
                        ))}
                        {p.expertise.slice(0, 3).map((x) => (
                          <Pill tone="brand" key={x}>
                            {x}
                          </Pill>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
      {tab === 'teams' && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teams?.map((t) => (
            <Card key={t.id} size="sm">
              <CardHeader>
                <CardTitle>
                  <Link to={`/teams/${t.id}`} className="hover:underline">
                    {t.name}
                  </Link>
                </CardTitle>
                <CardDescription>{t.description || 'No description.'}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {t.members.map((m) => (
                  <Link key={m.id} to={`/people/${m.id}`} className={buttonVariants({ variant: 'outline', size: 'xs', className: 'gap-1.5 rounded-full pl-0.5' })}>
                    <Avatar user={m} size="xs" /> {m.name}
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}
          {teams && !teams.length && (
            <EmptyState icon="users" title="No teams yet" className="col-span-full">
              Leads and admins can create teams in Administration.
            </EmptyState>
          )}
        </div>
      )}
    </Page>
  );
}

/** One label/value row in the profile's details. */
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm break-words">{children}</dd>
    </>
  );
}

export function PersonView() {
  const { id } = useParams();
  const { me } = useSession();
  const navigate = useNavigate();
  const act = useAction();
  const { data: p, error } = useApi<Person & { projects: { id: string; name: string; color: string }[]; joined_at: string; mfa_enabled?: boolean }>(`/people/${id}`);
  if (error) return <ErrorState error={error} />;
  if (!p) return <Loading />;
  const isMe = p.id === me!.user.id;
  return (
    <Page width="narrow">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Avatar user={p} size="xl" showPresence />
          <div className="flex min-w-0 flex-1 basis-52 flex-col gap-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight break-words">{p.name}</h1>
            <p className="text-sm text-muted-foreground">
              {p.title || ROLE_LABEL[p.role]} · {ROLE_LABEL[p.role]}
            </p>
            <p className="flex items-center gap-1.5 text-sm">
              <StatusDot status={p.status} /> {p.status_text || statusLabel(p.status)}
              {p.focus_until && new Date(p.focus_until) > new Date() && ` until ${new Date(p.focus_until).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}
            </p>
          </div>
          {isMe ? (
            <Link to="/settings" className={buttonVariants({ variant: 'outline' })}>
              Edit profile
            </Link>
          ) : (
            <Button
              onClick={async () => {
                const dm = await act(() => api.post<{ id: string }>('/dms', { userIds: [p.id] }));
                if (dm) navigate(`/channels/${dm.id}`);
              }}
            >
              <Icon name="chat" data-icon="inline-start" /> Message
            </Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-y-3 [&>dd]:mb-2 sm:[&>dd]:mb-0">
            <Detail label="Email">
              <a className="text-primary hover:underline" href={`mailto:${p.email}`}>
                {p.email}
              </a>
            </Detail>
            <Detail label="Local time">
              {localTimeIn(p.timezone)} ({p.timezone})
            </Detail>
            <Detail label="Working hours">{p.working_hours}</Detail>
            <Detail label="Teams">{p.teams.map((t) => t.name).join(', ') || '—'}</Detail>
            <Detail label="Expertise">
              {p.expertise.length
                ? p.expertise.map((x) => (
                    <Pill tone="brand" key={x}>
                      {x}
                    </Pill>
                  ))
                : '—'}
            </Detail>
            <Detail label="Projects">
              {p.projects.length
                ? p.projects.map((pr) => (
                    <Badge key={pr.id} variant="outline" render={<Link to={`/projects/${pr.id}`} />}>
                      <span className="size-2 rounded-full" style={{ background: `var(--c-${pr.color})` }} /> {pr.name}
                    </Badge>
                  ))
                : '—'}
            </Detail>
            {p.role === 'guest' && (
              <Detail label="Guest access">
                Sponsored by {p.sponsor_name ?? '—'} · ends {p.guest_expires_at ? dateLabel(p.guest_expires_at) : '—'}
              </Detail>
            )}
            {p.mfa_enabled !== undefined && <Detail label="MFA">{p.mfa_enabled ? 'Enabled' : 'Not enabled'}</Detail>}
            <Detail label="Joined">{dateLabel(p.joined_at)}</Detail>
          </dl>
        </CardContent>
      </Card>
    </Page>
  );
}
