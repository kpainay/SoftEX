import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type Project } from '../api';
import { useLiveDoc } from '../collab';
import { FavoriteButton } from '../components/Favorites';
import { Icon } from '../components/Icon';
import { PeerList } from '../components/LiveEditor';
import { Whiteboard } from '../components/Whiteboard';
import { EmptyState, ErrorState, FilterBar, FormField, IconButton, Loading, Modal, Page, PageHeader, Pill, SwitchField, useAction } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { timeAgo } from '../format';
import { useApi } from '../hooks';
import { useSession } from '../session';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Button, buttonVariants } from '@/components/ui/button';

interface Board {
  id: string;
  title: string;
  project: { id: string; name: string; color: string } | null;
  owner: { id: string; name: string } | null;
  can_edit: boolean;
  can_delete: boolean;
  updated_at: string;
  archived_at: string | null;
}

export function NewBoardButton({ projectId, size = 'default' }: { projectId?: string; size?: 'default' | 'sm' }) {
  const act = useAction();
  const navigate = useNavigate();
  const { data: projects } = useApi<Project[]>(projectId ? null : '/projects');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [project, setProject] = useState(projectId ?? '');
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <Icon name="plus" data-icon="inline-start" /> New whiteboard
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New whiteboard">
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const b = await act(() => api.post<Board>('/boards', { title, projectId: project || null }));
            if (b) navigate(`/boards/${b.id}`);
          }}
        >
          <FormField label="Name">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder="Q4 planning workshop" autoFocus />
          </FormField>
          {!projectId && (
            <FormField label="Project" hint="Project whiteboards are shared with the project; others with everyone in the workspace.">
              <NativeSelect value={project} onChange={(e) => setProject(e.target.value)}>
                <NativeSelectOption value="">No project (whole workspace)</NativeSelectOption>
                {(projects ?? [])
                  .filter((p) => !p.archived_at)
                  .map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.name}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </FormField>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!title.trim()} type="submit">
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Whiteboards for brainstorming, workshops and planning (Miro, FigJam, Teams Whiteboard). */
export function Boards({ projectId }: { projectId?: string }) {
  const [archived, setArchived] = useState(false);
  const { data, error, reload } = useApi<Board[]>(`/boards?archived=${archived}${projectId ? `&projectId=${projectId}` : ''}`);
  const { me } = useSession();
  const body = error ? (
    <ErrorState error={error} retry={reload} />
  ) : !data ? (
    <Loading />
  ) : !data.length ? (
    <EmptyState icon="whiteboard" title={archived ? 'No archived whiteboards' : 'No whiteboards yet'}>
      {!archived && 'Brainstorm with sticky notes, sketch a process, or plan a workshop together — everyone edits at once.'}
    </EmptyState>
  ) : (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {data.map((b) => (
        <Link key={b.id} to={`/boards/${b.id}`} className="group/board rounded-[min(var(--radius-4xl),24px)] outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
          <Card size="sm" className="h-full transition-shadow group-hover/board:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon name="whiteboard" size={16} />
                </span>
                <span className="truncate">{b.title}</span>
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-1 text-xs">
                {b.project ? (
                  <>
                    <span className="size-2 rounded-full" style={{ background: `var(--c-${b.project.color})` }} /> {b.project.name} ·{' '}
                  </>
                ) : null}
                {b.owner?.name} · updated {timeAgo(b.updated_at)}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
  if (projectId) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">Whiteboards shared with this project.</p>
          <NewBoardButton projectId={projectId} size="sm" />
        </div>
        {body}
      </div>
    );
  }
  return (
    <Page>
      <PageHeader
        title="Whiteboards"
        description="Sticky notes, shapes, arrows and sketches on an endless canvas that your team edits together, live."
        actions={me!.role !== 'guest' && <NewBoardButton />}
      />
      <FilterBar>
        <SwitchField label="Show archived" checked={archived} onCheckedChange={setArchived} className="w-auto" />
      </FilterBar>
      {body}
    </Page>
  );
}

export function BoardView() {
  const { id } = useParams();
  const act = useAction();
  const navigate = useNavigate();
  const { data: board, error, reload, setData } = useApi<Board>(`/boards/${id}`);
  const live = useLiveDoc('board', board?.id);
  if (error) return <ErrorState error={error} retry={reload} />;
  if (!board) return <Loading />;
  return (
    <div className="flex h-[calc(100dvh-3.5rem-4rem)] min-h-[26rem] flex-col md:h-[calc(100dvh-3.5rem)]">
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
        <Link
          to={board.project ? `/projects/${board.project.id}?tab=boards` : '/boards'}
          aria-label="Back to whiteboards"
          className={buttonVariants({
            variant: "ghost",
            size: "icon"
          })}>
          <Icon name="chevronLeft" />
        </Link>
        {board.can_edit ? (
          <Input
            className="h-9 w-auto max-w-sm min-w-0 flex-1 border-transparent bg-transparent font-heading text-base font-semibold shadow-none hover:border-input"
            defaultValue={board.title}
            key={board.title}
            aria-label="Whiteboard name"
            maxLength={120}
            onBlur={async (e) => {
              const title = e.target.value.trim();
              if (!title || title === board.title) return;
              const b = await act(() => api.patch<Board>(`/boards/${board.id}`, { title }));
              if (b) setData(b);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <h1 className="min-w-0 truncate font-heading text-base font-semibold">{board.title}</h1>
        )}
        <FavoriteButton kind="board" id={board.id} />
        {board.project && (
          <Badge variant="outline" className="max-md:hidden" render={<Link to={`/projects/${board.project.id}`} />}>
            <span className="size-2 rounded-full" style={{ background: `var(--c-${board.project.color})` }} /> {board.project.name}
          </Badge>
        )}
        {!board.can_edit && <Pill>View only</Pill>}
        <span className="min-w-0 flex-1" />
        {live && <PeerList peers={[...live.peers.values()]} label="Here now" />}
        {live && live.status === 'offline' && <Pill tone="danger">Offline</Pill>}
        {board.can_delete && (
          <IconButton
            label={board.archived_at ? 'Restore whiteboard' : 'Archive whiteboard'}
            onClick={async () => {
              const b = await act(() => api.patch<Board>(`/boards/${board.id}`, { archived: !board.archived_at }), board.archived_at ? 'Whiteboard restored' : 'Whiteboard archived');
              if (b && !board.archived_at) navigate('/boards');
              else if (b) setData(b);
            }}>
            <Icon name="flag" />
          </IconButton>
        )}
      </div>
      {!live || !live.ready ? <Loading label="Opening the whiteboard" /> : <Whiteboard live={live} title={board.title} />}
    </div>
  );
}
