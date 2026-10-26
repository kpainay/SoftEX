import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { type Decision } from '../api';
import { Icon } from '../components/Icon';
import { Markdown } from '../components/Markdown';
import { EmptyState, ErrorState, Loading, Page, PageHeader, SearchField } from '@/components/kit';
import { Card } from '@/components/ui/card';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from '@/components/ui/item';
import { dateTime } from '../format';
import { useApi } from '../hooks';

export function Decisions() {
  const { data, error, reload } = useApi<Decision[]>('/decisions?limit=200');
  const [q, setQ] = useState('');
  const list = (data ?? []).filter((d) => !q || `${d.title} ${d.rationale} ${d.project_name ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const link = 'text-primary hover:underline';
  return (
    <Page width="narrow">
      <PageHeader title="Decisions" description="Every recorded decision you can access, linked back to where it was made." />
      <SearchField value={q} onChange={setQ} placeholder="Filter decisions" />
      {error && <ErrorState error={error} retry={reload} />}
      {!data && !error && <Loading />}
      {data && !list.length && (
        <EmptyState icon="gavel" title="No decisions yet">
          Record decisions from a message menu, a meeting, or a project’s Decisions tab.
        </EmptyState>
      )}
      {list.length > 0 && (
        <Card className="py-2">
          <ItemGroup className="gap-0" role="list" aria-label="Decisions">
            {list.map((d, i) => (
              <Fragment key={d.id}>
                {i > 0 && <ItemSeparator className="my-0" />}
                <Item className="items-start" role="listitem">
                  <ItemMedia variant="icon" className="size-8 rounded-lg bg-accent text-accent-foreground">
                    <Icon name="gavel" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{d.title}</ItemTitle>
                    {d.rationale && (
                      <div className="text-sm text-muted-foreground">
                        <Markdown text={d.rationale} compact />
                      </div>
                    )}
                    <ItemDescription className="text-xs">
                      {d.decided_by_name} · {dateTime(d.created_at)}
                      {d.project_id && (
                        <>
                          {' · '}
                          <Link className={link} to={`/projects/${d.project_id}?tab=decisions`}>
                            {d.project_name}
                          </Link>
                        </>
                      )}
                      {d.channel_id && d.message_id && (
                        <>
                          {' · '}
                          <Link className={link} to={`/channels/${d.channel_id}?message=${d.message_id}`}>
                            #{d.channel_name}
                          </Link>
                        </>
                      )}
                      {d.meeting_id && (
                        <>
                          {' · '}
                          <Link className={link} to={`/meetings/${d.meeting_id}`}>
                            {d.meeting_title}
                          </Link>
                        </>
                      )}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              </Fragment>
            ))}
          </ItemGroup>
        </Card>
      )}
    </Page>
  );
}
