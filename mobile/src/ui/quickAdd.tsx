import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { api, type Project } from '../lib/api';
import { useApi } from '../lib/hooks';
import { parseQuickAdd, type QuickAddToken } from '../lib/quickAdd';
import { useSession } from '../lib/session';
import { radius, useTheme } from '../lib/theme';
import { Icon } from './Icon';
import { Button, Input, Muted, Row, T, useAction } from './kit';

const CHIP_ICON: Record<QuickAddToken['kind'], string> = { due: 'calendar', priority: 'flag', owner: 'users', project: 'folder' };
const CHIP_NAME: Record<QuickAddToken['kind'], string> = { due: 'due date', priority: 'priority', owner: 'owner', project: 'project' };

/**
 * One line to a task: "Send deck to @maya friday !high #brand refresh". What it understood shows as chips
 * while you type; × on a chip leaves those words in the title instead. Same parser as the web.
 */
export function QuickAddTask({
  onCreated,
  defaultDue,
  placeholder = 'Add a task — try “Call @maya tomorrow !high”',
  extra,
}: {
  onCreated: () => void;
  /** Used when the text names no date (e.g. today, on Home's focus list). */
  defaultDue?: string | null;
  placeholder?: string;
  /** A field the parse leaves out, such as a date chosen with a picker beside it. */
  extra?: ReactNode;
}) {
  const { c } = useTheme();
  const { people } = useSession();
  const act = useAction();
  const { data: projects } = useApi<Project[]>('/projects');
  const [text, setText] = useState('');
  const [skip, setSkip] = useState<Set<QuickAddToken['kind']>>(new Set());
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(
    () => parseQuickAdd(text, { people: people.map((p) => ({ id: p.id, name: p.name })), projects: (projects ?? []).map((p) => ({ id: p.id, name: p.name })), skip }),
    [text, people, projects, skip],
  );

  const submit = async () => {
    if (!parsed.title || busy) return;
    setBusy(true);
    const ok = await act(
      () =>
        api.post('/tasks', {
          title: parsed.title,
          dueDate: parsed.dueDate ?? defaultDue ?? null,
          ...(parsed.priority ? { priority: parsed.priority } : {}),
          ...(parsed.ownerId ? { ownerId: parsed.ownerId } : {}),
          ...(parsed.projectId ? { projectId: parsed.projectId } : {}),
        }),
      'Task added',
    );
    setBusy(false);
    if (!ok) return;
    setText('');
    setSkip(new Set());
    onCreated();
  };

  return (
    <View style={{ gap: 8 }}>
      <Row gap={8}>
        <Icon name="plus" size={18} color={c.accentInk} />
        <Input
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (!v) setSkip(new Set());
          }}
          placeholder={placeholder}
          accessibilityLabel="New task"
          returnKeyType="done"
          onSubmitEditing={submit}
          style={{ flex: 1 }}
        />
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, minHeight: 24, alignItems: 'center' }} accessibilityLiveRegion="polite">
        {parsed.tokens.map((t) => (
          <View key={t.kind} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 9, paddingRight: 2, height: 28, borderRadius: radius.pill, borderWidth: 1, borderColor: c.accentLine, backgroundColor: c.accentSoft }}>
            <Icon name={CHIP_ICON[t.kind]} size={12} color={c.accentInk} />
            <T size={12} weight="semibold" style={{ color: c.accentInk }}>
              {t.label}
            </T>
            <Pressable
              onPress={() => setSkip(new Set(skip).add(t.kind))}
              accessibilityRole="button"
              accessibilityLabel={`Keep “${t.text}” in the title instead of using it as the ${CHIP_NAME[t.kind]}`}
              hitSlop={8}
              style={{ padding: 4 }}
            >
              <Icon name="x" size={12} color={c.accentInk} />
            </Pressable>
          </View>
        ))}
        {!parsed.tokens.length && <Muted size={12}>Dates like “friday” or “in 3 days”, !high for priority, @name to assign, #project to file it.</Muted>}
      </View>
      <Row gap={8}>
        {extra && <View style={{ flex: 1 }}>{extra}</View>}
        <Button variant="primary" title="Add" disabled={!parsed.title || busy} loading={busy} onPress={submit} style={extra ? undefined : { marginLeft: 'auto' }} />
      </Row>
    </View>
  );
}
