import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type UserRef } from '../api';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { useProjectFields } from '../components/Work';
import { Callout, CheckboxField, EmptyState, ErrorState, FormField, IconButton, Loading, Modal, notify, Page, PageHeader, Pill, useAction, useConfirm } from '@/components/kit';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { useApi } from '../hooks';
import { useSession } from '../session';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

type QuestionType = 'short' | 'long' | 'email' | 'number' | 'date' | 'select';
interface Question {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options: string[];
  maps?: string | null;
}
interface Form {
  id: string;
  project_id: string;
  title: string;
  description: string;
  questions: Question[];
  public: boolean;
  public_url: string | null;
  owner: UserRef | null;
  closed: boolean;
  responses: number;
  created_at: string;
  project?: { id: string; name: string } | null;
  can_manage?: boolean;
}

const TYPE_LABEL: Record<QuestionType, string> = { short: 'Short answer', long: 'Paragraph', email: 'Email', number: 'Number', date: 'Date', select: 'Choice' };
const MAPS_LABEL: Record<string, string> = { title: 'Task title', description: 'Task description', due_date: 'Due date', priority: 'Priority' };

const newQuestion = (n: number, patch: Partial<Question> = {}): Question => ({
  id: `q${Date.now().toString(36)}${n}`,
  label: '',
  type: 'short',
  required: false,
  options: [],
  maps: null,
  ...patch,
});

/** A project's intake forms (Asana/Monday forms): requests from anyone become tasks. */
export function ProjectForms({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const { data, error, reload } = useApi<Form[]>(`/projects/${projectId}/forms`);
  const [editing, setEditing] = useState<Form | 'new' | null>(null);
  if (error) return <ErrorState error={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">Collect requests with a form. Every response becomes a task here, assigned to the form’s owner.</p>
        {canManage && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Icon name="plus" data-icon="inline-start" /> New form
          </Button>
        )}
      </div>
      {!data.length && <EmptyState icon="form" title="No forms yet">{canManage ? 'Create one to take in bug reports, design requests or IT tickets.' : 'Project leads can create forms.'}</EmptyState>}
      <div className="grid gap-3 md:grid-cols-2">
        {data.map((f) => (
          <Card key={f.id} size="sm" className="form-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon name="form" size={16} />
                </span>
                <span className="truncate">{f.title}</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {f.questions.length} question{f.questions.length === 1 ? '' : 's'} · {f.responses} response{f.responses === 1 ? '' : 's'}
                {f.owner && <> · goes to {f.owner.name}</>}
              </CardDescription>
              <CardAction>{f.closed ? <Pill>Closed</Pill> : f.public ? <Pill tone="success">Public link</Pill> : <Pill>Members only</Pill>}</CardAction>
            </CardHeader>
            <CardFooter className="flex-wrap gap-2">
              <Link to={`/forms/${f.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Open form
              </Link>
              {f.public_url && <CopyLink url={f.public_url} />}
              {canManage && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(f)}>
                  Edit
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>
      {editing && (
        <FormBuilder
          projectId={projectId}
          form={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function CopyLink({ url }: { url: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          notify('Link copied', 'success');
        } catch {
          notify('Copy this link', 'info', { description: url });
        }
      }}
    >
      <Icon name="link" data-icon="inline-start" />
      Copy public link
    </Button>
  );
}

function FormBuilder({ projectId, form, onClose, onSaved }: { projectId: string; form: Form | null; onClose: () => void; onSaved: () => void }) {
  const act = useAction();
  const confirm = useConfirm();
  const { people } = useSession();
  const { data: fields } = useProjectFields(projectId);
  const [title, setTitle] = useState(form?.title ?? '');
  const [description, setDescription] = useState(form?.description ?? '');
  const [ownerId, setOwnerId] = useState(form?.owner?.id ?? '');
  const [isPublic, setPublic] = useState(form?.public ?? false);
  const [closed, setClosed] = useState(form?.closed ?? false);
  const [questions, setQuestions] = useState<Question[]>(
    form?.questions ?? [newQuestion(0, { label: 'What do you need?', required: true, maps: 'title' }), newQuestion(1, { label: 'Details', type: 'long', maps: 'description' })],
  );
  const set = (i: number, patch: Partial<Question>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const mapOptions = [...Object.entries(MAPS_LABEL), ...(fields ?? []).map((f) => [f.id, `Field: ${f.name}`] as [string, string])];

  const save = async () => {
    const body = { title, description, ownerId: ownerId || null, public: isPublic, questions: questions.map((q) => ({ ...q, options: q.type === 'select' ? q.options : [] })) };
    const ok = form ? await act(() => api.patch(`/forms/${form.id}`, { ...body, closed }), 'Form saved') : await act(() => api.post(`/projects/${projectId}/forms`, body), 'Form created');
    if (ok) onSaved();
  };

  return (
    <Modal open onClose={onClose} title={form ? 'Edit form' : 'New form'} eyebrow="Intake form" wide>
      <div className="flex flex-col gap-3">
        <FormField label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Design request" />
        </FormField>
        <FormField label="Introduction" hint="Shown above the questions.">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="New tasks go to">
            <NativeSelect value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <NativeSelectOption value="">Nobody (unassigned)</NativeSelectOption>
              {people.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
          <div className="flex flex-col gap-3 sm:pt-6">
            <CheckboxField label="Anyone with the link can respond (no sign-in)" checked={isPublic} onCheckedChange={setPublic} />
            {form && <CheckboxField label="Closed — stop taking responses" checked={closed} onCheckedChange={setClosed} />}
          </div>
        </div>
        <Separator />
        <h3 className="font-semibold">Questions</h3>
        {questions.map((q, i) => (
          <div key={q.id} className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="min-w-0 flex-1" value={q.label} onChange={(e) => set(i, { label: e.target.value })} placeholder={`Question ${i + 1}`} aria-label={`Question ${i + 1}`} maxLength={200} />
              <NativeSelect value={q.type} onChange={(e) => set(i, { type: e.target.value as QuestionType })} aria-label="Answer type">
                {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
                  <NativeSelectOption key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <IconButton label="Remove question" size="icon-sm" disabled={questions.length === 1} onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}>
                <Icon name="trash" />
              </IconButton>
            </div>
            {q.type === 'select' && (
              <Input
                value={q.options.join(', ')}
                onChange={(e) => set(i, { options: e.target.value.split(',').map((o) => o.trimStart()) })}
                onBlur={() => set(i, { options: q.options.map((o) => o.trim()).filter(Boolean) })}
                placeholder="Choices, separated by commas"
                aria-label="Choices"
              />
            )}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <CheckboxField label="Required" checked={q.required} onCheckedChange={(checked) => set(i, { required: checked })} className="w-auto" />
              <label className="inline-flex items-center gap-2 text-muted-foreground">
                Fills in
                <NativeSelect size="sm" value={q.maps ?? ''} onChange={(e) => set(i, { maps: e.target.value || null })} aria-label="Fills in">
                  <NativeSelectOption value="">Description only</NativeSelectOption>
                  {mapOptions.map(([id, label]) => (
                    <NativeSelectOption key={id} value={id}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
            </div>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setQuestions((qs) => [...qs, newQuestion(qs.length)])}
          disabled={questions.length >= 40}>
          <Icon name="plus" data-icon="inline-start" /> Add question
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {form && (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                if (!(await confirm({ title: 'Delete this form?', description: 'Tasks it created stay.', confirmLabel: 'Delete form', destructive: true }))) return;
                if (await act(() => api.del(`/forms/${form.id}`), 'Form deleted')) onSaved();
              }}>
              Delete
            </Button>
          )}
          <span className="min-w-0 flex-1" />
          {form?.public && (
            <Button
              variant="outline"
              onClick={async () => {
                if (!(await confirm({ title: 'Make a new public link?', description: 'The old one stops working.', confirmLabel: 'New link' }))) return;
                if (await act(() => api.patch(`/forms/${form.id}`, { newLink: true }), 'New link created')) onSaved();
              }}
            >
              New link
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={!title.trim() || questions.some((q) => !q.label.trim())}>
            Save form
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** The questions, as a fillable form. */
function FormFields({ questions, answers, onChange }: { questions: Question[]; answers: Record<string, unknown>; onChange: (a: Record<string, unknown>) => void }) {
  const set = (id: string, v: unknown) => onChange({ ...answers, [id]: v });
  return (
    <>
      {questions.map((q) => {
        const value = (answers[q.id] as string | undefined) ?? '';
        const label = `${q.label}${q.required ? ' *' : ''}`;
        return (
          <FormField key={q.id} label={label}>
            {q.type === 'long' ? (
              <Textarea rows={4} value={value} required={q.required} maxLength={10000} onChange={(e) => set(q.id, e.target.value)} />
            ) : q.type === 'select' ? (
              <NativeSelect value={value} required={q.required} onChange={(e) => set(q.id, e.target.value)}>
                <NativeSelectOption value="">Choose…</NativeSelectOption>
                {q.options.map((o) => (
                  <NativeSelectOption key={o} value={o}>
                    {o}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            ) : (
              <Input
                type={q.type === 'short' ? 'text' : q.type}
                value={value}
                required={q.required}
                maxLength={q.type === 'short' ? 500 : undefined}
                onChange={(e) => set(q.id, q.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
              />
            )}
          </FormField>
        );
      })}
    </>
  );
}

const cleanAnswers = (answers: Record<string, unknown>) => Object.fromEntries(Object.entries(answers).filter(([, v]) => v !== '' && v !== undefined));

/** Internal fill page for workspace members: /forms/:id */
export function FormFill() {
  const { id } = useParams();
  const act = useAction();
  const { data: form, error, reload } = useApi<Form>(`/forms/${id}`);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [done, setDone] = useState<string | null>(null);
  if (error) return <ErrorState error={error} retry={reload} />;
  if (!form) return <Loading />;
  return (
    <Page width="narrow">
      <PageHeader
        eyebrow={
          form.project ? (
            <Link className="hover:underline" to={`/projects/${form.project.id}?tab=forms`}>
              {form.project.name}
            </Link>
          ) : (
            'Form'
          )
        }
        title={form.title}
        description={form.description && <span className="whitespace-pre-wrap">{form.description}</span>}
      />
      {done ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="check" className="text-success" /> Thanks — your request was sent.
            </CardTitle>
          </CardHeader>
          <CardFooter className="gap-2">
            <Link to={`/tasks/${done}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              View the task
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAnswers({});
                setDone(null);
              }}
            >
              Send another
            </Button>
          </CardFooter>
        </Card>
      ) : form.closed ? (
        <EmptyState icon="lock" title="This form is closed" />
      ) : (
        <Card>
          <CardContent>
            <form
              className="flex flex-col gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const res = await act(() => api.post<{ taskId: string }>(`/forms/${form.id}/responses`, { answers: cleanAnswers(answers) }));
                if (res) setDone(res.taskId);
              }}
            >
              <FormFields questions={form.questions} answers={answers} onChange={setAnswers} />
              <div className="flex justify-end">
                <Button type="submit">Submit</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </Page>
  );
}

/** Public fill page, no sign-in: /f/:token */
export function PublicForm() {
  const { token } = useParams();
  const { data: form, error } = useApi<{ title: string; description: string; workspace_name: string; questions: Question[]; closed: boolean }>(`/public/forms/${token}`);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [who, setWho] = useState({ name: '', email: '', website: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [problem, setProblem] = useState('');
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
          <Logo height={24} />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-10">
        {error ? (
          <EmptyState icon="alert" title="This form isn’t available">
            The link may have been changed or removed.
          </EmptyState>
        ) : !form ? (
          <Loading />
        ) : (
          <>
            <PageHeader eyebrow={form.workspace_name} title={form.title} description={form.description && <span className="whitespace-pre-wrap">{form.description}</span>} />
            {state === 'sent' ? (
              <Callout tone="success" title="Thank you — your response was received." />
            ) : form.closed ? (
              <EmptyState icon="lock" title="This form is no longer taking responses" />
            ) : (
              <Card>
                <CardContent>
                  <form
                    className="relative flex flex-col gap-4"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setState('sending');
                      setProblem('');
                      try {
                        await api.post(`/public/forms/${token}`, { answers: cleanAnswers(answers), ...who });
                        setState('sent');
                      } catch (err) {
                        setProblem((err as Error).message);
                        setState('idle');
                      }
                    }}
                  >
                    <FormFields questions={form.questions} answers={answers} onChange={setAnswers} />
                    <Separator />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="Your name">
                        <Input value={who.name} onChange={(e) => setWho({ ...who, name: e.target.value })} maxLength={100} autoComplete="name" />
                      </FormField>
                      <FormField label="Your email" hint="So the team can follow up.">
                        <Input type="email" value={who.email} onChange={(e) => setWho({ ...who, email: e.target.value })} maxLength={200} autoComplete="email" />
                      </FormField>
                    </div>
                    {/* Left empty by people; bots fill it in. */}
                    <input
                      className="pointer-events-none absolute -left-[9999px] size-px opacity-0"
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden="true"
                      value={who.website}
                      onChange={(e) => setWho({ ...who, website: e.target.value })}
                      name="website"
                    />
                    {problem && <Callout tone="warning">{problem}</Callout>}
                    <div className="flex justify-end">
                      <Button disabled={state === 'sending'} type="submit">
                        {state === 'sending' && <Spinner data-icon="inline-start" />}
                        {state === 'sending' ? 'Sending…' : 'Submit'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </>
        )}
        <p className="mt-auto pt-8 text-center text-xs text-muted-foreground">Powered by Küü</p>
      </main>
    </div>
  );
}
