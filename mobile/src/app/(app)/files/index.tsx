import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { qs } from '@/lib/api';
import { useApi, useReloadOnFocus } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { FILE_KINDS, FileRow, fileKind, useFileAdding, type FileKind, type FileSummary } from '@/ui/files';
import { Card, Empty, ErrorState, IconButton, Loading, Muted, Row, Screen, SearchBox, Select, Toggle } from '@/ui/kit';

type Where = 'all' | 'chat' | 'channel' | 'project' | 'mine';

/** Every file you can open, wherever it was shared: chats, channels, projects, tasks and teams. */
export default function Files() {
  const { c } = useTheme();
  const { me } = useSession();
  const [search, setSearch] = useState('');
  const [where, setWhere] = useState<Where>('all');
  const [kind, setKind] = useState<'all' | FileKind>('all');
  const [archived, setArchived] = useState(false);
  const { data, error, reload, refresh, refreshing } = useApi<FileSummary[]>(`/files${qs({ archived: archived ? 'true' : undefined })}`);
  useReloadOnFocus(reload);
  const adding = useFileAdding(reload);
  const guest = me!.role === 'guest';

  const words = search.trim().toLowerCase();
  const list = (data ?? []).filter(
    (f) =>
      (!words || `${f.name} ${f.label} ${f.owner?.name ?? ''} ${f.place?.name ?? ''}`.toLowerCase().includes(words)) &&
      (kind === 'all' || fileKind(f) === kind) &&
      (where === 'all' || (where === 'mine' ? f.owner?.id === me!.user.id : where === 'project' ? f.place?.kind === 'project' || f.place?.kind === 'task' : f.place?.kind === where)),
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Files',
          headerRight: () =>
            guest ? null : (
              <Row gap={0}>
                <IconButton name="link" label="Link a file" onPress={adding.addLink} />
                <IconButton name="upload" label="Upload" color={c.accentInk} onPress={adding.upload} />
              </Row>
            ),
        }}
      />
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <Muted size={14}>Everything shared with you, in one place — whichever chat, channel or project it was shared in.</Muted>
        <SearchBox value={search} onChangeText={setSearch} placeholder="Search files" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
          <View style={{ width: 190 }}>
            <Select
              title="Shared in"
              value={where}
              onChange={setWhere}
              options={[
                { id: 'all', label: 'Shared anywhere' },
                { id: 'chat', label: 'In chats' },
                { id: 'channel', label: 'In channels' },
                { id: 'project', label: 'In projects and tasks' },
                { id: 'mine', label: 'Uploaded by me' },
              ]}
            />
          </View>
          <View style={{ width: 170 }}>
            <Select title="File type" value={kind} onChange={setKind} options={FILE_KINDS} />
          </View>
          <View style={{ width: 150 }}>
            <Toggle label="Archived" value={archived} onChange={setArchived} />
          </View>
        </ScrollView>
        {error && !data ? (
          <ErrorState error={error} retry={reload} />
        ) : !data ? (
          <Loading inline />
        ) : !list.length ? (
          <Empty icon="files" title={data.length ? 'No files match' : 'No files yet'}>
            {data.length ? 'Try another search or filter.' : 'Files shared in chats, channels and projects show up here.'}
          </Empty>
        ) : (
          <Card padded={false} style={{ paddingHorizontal: 14 }}>
            {list.map((f) => (
              <FileRow key={f.id} f={f} />
            ))}
          </Card>
        )}
      </Screen>
      {adding.sheets}
    </>
  );
}
