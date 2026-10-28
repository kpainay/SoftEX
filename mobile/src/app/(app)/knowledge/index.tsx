import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { qs } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useApi, useReloadOnFocus } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { useShell } from '@/lib/shell';
import { useTheme } from '@/lib/theme';
import { Icon } from '@/ui/Icon';
import { Card, Empty, ErrorState, IconButton, LinkText, Loading, Muted, Pill, Row, Screen, SearchBox, Select, T, Toggle } from '@/ui/kit';

export interface PageSummary {
  id: string;
  title: string;
  status: 'draft' | 'approved';
  project_id: string | null;
  project_name: string | null;
  review_date: string | null;
  needs_review: boolean;
  version: number;
  owner: { id: string; name: string; color: string } | null;
  updated_at: string;
  updated_by: { id: string; name: string } | null;
  excerpt: string;
  parent_id: string | null;
  icon: string | null;
  public: boolean;
}
export default function Knowledge() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { openCreate } = useShell();
  const { me } = useSession();
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState<'all' | 'approved' | 'draft' | 'review'>('all');
  const [archived, setArchived] = useState(false);
  const pages = useApi<PageSummary[]>(`/pages${qs({ archived: archived ? 'true' : undefined })}`);
  useReloadOnFocus(pages.reload);
  const guest = me!.role === 'guest';

  const pageIds = new Set((pages.data ?? []).map((p) => p.id));
  const childCount = (id: string) => (pages.data ?? []).filter((p) => p.parent_id === id).length;
  const narrowed = !!filter || status !== 'all';
  const pageList = (pages.data ?? []).filter(
    (p) =>
      (narrowed || !p.parent_id || !pageIds.has(p.parent_id)) &&
      (!filter || `${p.title} ${p.excerpt}`.toLowerCase().includes(filter.toLowerCase())) &&
      (status === 'all' || (status === 'review' ? p.needs_review : p.status === status)),
  );
  const current = pages;
  // Files moved to their own screen; old links (?tab=files) go there.
  if (params.tab === 'files') return <Redirect href="/files" />;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Knowledge',
          headerRight: () =>
            guest ? null : (
              <IconButton name="plus" label="New page" color={c.accentInk} onPress={() => openCreate('page')} />
            ),
        }}
      />
      <Screen refreshing={current.refreshing} onRefresh={current.refresh}>
        <Muted size={14}>Policies, how-tos and decisions — with owners and review dates so they stay trustworthy.</Muted>
        <Row gap={4} wrap>
          <Muted size={13}>Looking for a file?</Muted>
          <LinkText size={13} onPress={() => router.push('/files')}>
            Open Files
          </LinkText>
        </Row>
        <SearchBox value={filter} onChangeText={setFilter} placeholder="Filter pages" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
          <View style={{ width: 170 }}>
              <Select
                title="Status"
                value={status}
                onChange={setStatus}
                options={[
                  { id: 'all', label: 'All pages' },
                  { id: 'approved', label: 'Approved' },
                  { id: 'draft', label: 'Drafts' },
                  { id: 'review', label: 'Due for review' },
                ]}
              />
          </View>
          <View style={{ width: 150 }}>
            <Toggle label="Archived" value={archived} onChange={setArchived} />
          </View>
        </ScrollView>
        {current.error && !current.data ? (
          <ErrorState error={current.error} retry={current.reload} />
        ) : !current.data ? (
          <Loading inline />
        ) : !pageList.length ? (
            <Empty icon="book" title="No pages yet">
              Capture how your team works: policies, onboarding guides, runbooks.
            </Empty>
          ) : (
            pageList.map((p) => (
              <Card key={p.id} onPress={() => router.push(`/knowledge/${p.id}`)} style={{ gap: 6 }}>
                <Row wrap gap={6}>
                  {p.icon ? <T size={18}>{p.icon}</T> : <Icon name="book" size={17} color={c.accentInk} />}
                  {p.public && <Icon name="globe" size={14} color={c.muted} />}
                  {p.status === 'approved' ? <Pill label="Approved" tone="green" /> : <Pill label="Draft" />}
                  {p.needs_review && <Pill label="Review due" tone="red" />}
                </Row>
                <T size={16} weight="display">
                  {p.title}
                </T>
                <Muted numberOfLines={2}>{p.excerpt || 'Empty page'}</Muted>
                <Muted size={12}>
                  {p.project_name ? `${p.project_name} · ` : ''}
                  {p.owner?.name} · updated {timeAgo(p.updated_at)}
                  {!narrowed && childCount(p.id) > 0 ? ` · ${childCount(p.id)} sub-page${childCount(p.id) === 1 ? '' : 's'}` : ''}
                </Muted>
              </Card>
            ))
        )}
      </Screen>
    </>
  );
}
