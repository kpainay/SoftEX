import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { api, formWith, type PickedFile } from '../lib/api';
import { pickDocuments, pickMedia } from '../lib/files';
import { bytes, timeAgo } from '../lib/format';
import { useTheme } from '../lib/theme';
import { Icon } from './Icon';
import { ActionSheet, Avatar, Button, Field, Input, Muted, Pill, Row, Sheet, T, useAction } from './kit';

export interface FileSummary {
  id: string;
  name: string;
  label: string;
  external_url: string | null;
  project_id: string | null;
  channel_id: string | null;
  task_id: string | null;
  version: number;
  mime: string | null;
  size: number | null;
  owner: { id: string; name: string; color: string } | null;
  updated_at: string;
  archived_at: string | null;
  /** Where the file lives: the chat or channel it was shared in, its project, task or team. */
  place?: { kind: 'chat' | 'channel' | 'project' | 'task' | 'team' | 'library'; name: string; link: string };
}

export type FileKind = 'image' | 'document' | 'pdf' | 'sheet' | 'media' | 'link';

export const FILE_KINDS: { id: 'all' | FileKind; label: string }[] = [
  { id: 'all', label: 'Any type' },
  { id: 'image', label: 'Images' },
  { id: 'document', label: 'Documents' },
  { id: 'pdf', label: 'PDFs' },
  { id: 'sheet', label: 'Spreadsheets' },
  { id: 'media', label: 'Audio and video' },
  { id: 'link', label: 'Links' },
];

/** What sort of file this is, from its type, or its name when the type is unknown (same rules as the web). */
export function fileKind(f: Pick<FileSummary, 'mime' | 'name' | 'external_url'>): FileKind | 'other' {
  if (f.external_url) return 'link';
  const mime = f.mime ?? '';
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/') || mime.startsWith('video/')) return 'media';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (/sheet|excel|csv/.test(mime) || ['xls', 'xlsx', 'csv', 'ods', 'numbers'].includes(ext)) return 'sheet';
  if (/word|document|text|rtf|presentation|powerpoint/.test(mime) || ['doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'ppt', 'pptx', 'key', 'pages'].includes(ext)) return 'document';
  return 'other';
}

const KIND_ICON: Record<string, string> = { link: 'link', image: 'eye', media: 'play', pdf: 'transcript', sheet: 'table', document: 'transcript', other: 'file' };

/** "#general", "Chat with Maya Singh", "Design team", "Brand refresh". */
export function placeLabel(place: NonNullable<FileSummary['place']>) {
  if (place.kind === 'channel') return `#${place.name}`;
  if (place.kind === 'chat') return `Chat with ${place.name}`;
  if (place.kind === 'team') return `${place.name} team`;
  return place.name;
}

/** One file in a list: what it is, where it was shared, by whom and when. */
export function FileRow({ f }: { f: FileSummary }) {
  const { c } = useTheme();
  const kind = fileKind(f);
  const where = f.place && f.place.kind !== 'library' ? placeLabel(f.place) : null;
  return (
    <Pressable
      onPress={() => router.push(`/files/${f.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${f.name}${where ? `, in ${where}` : ''}`}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 }, pressed && { backgroundColor: c.hover }]}
    >
      <View style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: c.sunken, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={KIND_ICON[kind]} size={18} color={c.ink2} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Row gap={6}>
          <T weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
            {f.name}
          </T>
          {!!f.label && <Pill label={f.label} />}
        </Row>
        <Muted size={12} numberOfLines={2}>
          {[where, f.owner?.name, f.external_url ? 'Link' : bytes(f.size), timeAgo(f.updated_at)].filter(Boolean).join(' · ')}
        </Muted>
      </View>
      {f.owner && <Avatar user={f.owner} size="sm" />}
    </Pressable>
  );
}

/** Upload from the phone, or add a link to a file kept elsewhere. `fields` adds e.g. a teamId. */
export function useFileAdding(onAdded: () => void, fields: Record<string, string> = {}) {
  const act = useAction();
  const [uploading, setUploading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState({ name: '', url: '' });
  const send = async (picked: PickedFile[]) => {
    for (const f of picked) await act(() => api.upload('/files', formWith({ ...fields, file: f })), 'File uploaded');
    onAdded();
  };
  const sheets = (
    <>
      <ActionSheet
        open={uploading}
        onClose={() => setUploading(false)}
        title="Upload"
        actions={[
          { label: 'Photo or video', icon: 'upload', onPress: () => act(async () => send(await pickMedia('library', true))) },
          { label: 'Take a photo', icon: 'eye', onPress: () => act(async () => send(await pickMedia('camera'))), hidden: Platform.OS === 'web' },
          { label: 'File', icon: 'file', onPress: () => act(async () => send(await pickDocuments(true))) },
        ]}
      />
      <Sheet
        open={linking}
        onClose={() => setLinking(false)}
        title="Link an external file"
        footer={
          <Button
            title="Add link"
            variant="primary"
            full
            disabled={!link.name.trim() || !/^https?:\/\//.test(link.url)}
            onPress={async () => {
              const ok = await act(() => api.post('/files/link', { ...fields, ...link }), 'Link added');
              if (ok) {
                setLinking(false);
                setLink({ name: '', url: '' });
                onAdded();
              }
            }}
          />
        }
      >
        <Field label="Name">
          <Input value={link.name} onChangeText={(v) => setLink({ ...link, name: v })} />
        </Field>
        <Field label="URL">
          <Input value={link.url} onChangeText={(v) => setLink({ ...link, url: v })} placeholder="https://…" keyboardType="url" autoCapitalize="none" />
        </Field>
      </Sheet>
    </>
  );
  return { upload: () => setUploading(true), addLink: () => setLinking(true), sheets };
}
