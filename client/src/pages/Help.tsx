import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useShell } from '../components/Layout';
import { usePublicPricing } from './Pricing';
import { Button, buttonVariants } from '@/components/ui/button';
import { Page, PageHeader, SearchField } from '@/components/kit';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Kbd } from '@/components/ui/kbd';

interface Topic {
  id: string;
  icon: string;
  title: string;
  items: { q: string; a: React.ReactNode }[];
}

const TOPICS: Topic[] = [
  {
    id: 'start',
    icon: 'flag',
    title: 'Getting started',
    items: [
      {
        q: 'Where do I begin?',
        a: (
          <>
            Home shows what matters today: tasks due, blocked work, meetings coming up and what changed since you last looked. Workspace owners also see a short{' '}
            <em>Get ready</em> checklist there until the team is set up.
          </>
        ),
      },
      {
        q: 'How do I invite my team?',
        a: (
          <>
            Admins and team leads use <em>Invite people</em> at the bottom of the sidebar, or <Link to="/admin?tab=invitations">Administration → Invitations</Link>. You can
            paste a list of emails to invite many people at once.
          </>
        ),
      },
      {
        q: 'Can I create things quickly from anywhere?',
        a: (
          <>
            Use <em>Create</em> in the top bar for a task, project, message, meeting or page, and press <kbd>⌘ K</kbd> / <kbd>Ctrl K</kbd> to search everything.
          </>
        ),
      },
    ],
  },
  {
    id: 'chat',
    icon: 'chat',
    title: 'Chat and channels',
    items: [
      {
        q: 'Channels or chats?',
        a: 'Channels are for a team, project or topic, and everyone who joins sees the history. Chats are direct conversations with one or a few people.',
      },
      {
        q: 'Turn a message into work',
        a: (
          <>
            Hover a message and choose the task icon to create a task with one owner and a due date, or use the menu to <em>Record decision</em>. Both stay linked to the
            message.
          </>
        ),
      },
      {
        q: 'Polls, voice notes and urgent messages',
        a: 'The composer has buttons to attach files, record a voice note and start a poll. Mark a message urgent only when it cannot wait: it reaches people even in quiet hours.',
      },
      { q: 'Too many notifications?', a: 'Mute a channel or switch it to mentions-only from the channel header. Quiet hours and focus time are in Settings.' },
    ],
  },
  {
    id: 'work',
    icon: 'folder',
    title: 'Projects and tasks',
    items: [
      {
        q: 'Views',
        a: 'Each project has list, board, table and calendar views, a timeline you can drag, milestones, risks, decisions and check-ins. Workload shows who is overloaded.',
      },
      {
        q: 'Custom fields, labels and time',
        a: 'Project owners add fields (number, date, dropdown and more) under Fields. Start a timer or log time on any task; Timesheet shows your week.',
      },
      { q: 'Intake forms', a: 'Under a project’s Forms tab, build a form that turns each response into a task. Share it with colleagues or publicly with a link.' },
      { q: 'Automations', a: 'Under Automations, set rules such as “when a task moves to review, assign the reviewer”. Nothing runs without a rule you can see.' },
    ],
  },
  {
    id: 'plan',
    icon: 'target',
    title: 'Goals and dashboards',
    items: [
      { q: 'Goals', a: 'Set a goal, add key results you can measure, and link the projects that move it. Progress updates as linked work is done.' },
      {
        q: 'Dashboards',
        a: 'Build a dashboard from charts of open work, overdue tasks, progress and trends. Everyone sees numbers only from the projects they can open.',
      },
    ],
  },
  {
    id: 'knowledge',
    icon: 'book',
    title: 'Knowledge, whiteboards and meetings',
    items: [
      {
        q: 'Pages that stay trustworthy',
        a: 'Every page has an owner and a review date, and approved pages show first in search. Several people can edit a page at once. Publish a page to the web from its menu.',
      },
      { q: 'Whiteboards', a: 'Brainstorm with sticky notes, shapes and connectors. Everyone on the board edits at the same time.' },
      {
        q: 'Meetings',
        a: 'Schedule from Meetings, a channel or a project, add an agenda, record with live captions, and capture decisions and follow-up tasks. Ending the meeting shares everything.',
      },
    ],
  },
  {
    id: 'privacy',
    icon: 'shield',
    title: 'Privacy and security',
    items: [
      {
        q: 'Who can see what?',
        a: 'Private channels and projects, and their files, never appear in search, activity, notifications or exports for people who are not members. Guests only see what you share.',
      },
      {
        q: 'Protect your account',
        a: (
          <>
            Turn on two-step sign-in and review where you are signed in under <Link to="/settings?tab=security">Settings → Security</Link>. You can also export your data there.
          </>
        ),
      },
    ],
  },
];

export function Help() {
  const { openSearch } = useShell();
  const { data: pricing } = usePublicPricing();
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const text = (node: React.ReactNode): string =>
    typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : node && typeof node === 'object' && 'props' in node ? text((node as { props: { children?: React.ReactNode } }).props.children) : '';
  const topics = TOPICS.map((t) => ({ ...t, items: t.items.filter((i) => !term || `${t.title} ${i.q} ${text(i.a)}`.toLowerCase().includes(term)) })).filter((t) => t.items.length);
  const contact = pricing?.support_email ?? pricing?.company.email;
  return (
    <Page width="narrow">
      <PageHeader title="Help" description="How to get the most out of Küü, one topic at a time." />
      <SearchField className="max-w-none" placeholder="Search help…" value={q} onChange={setQ} aria-label="Search help" />
      <nav className="flex flex-wrap gap-1.5" aria-label="Help topics">
        {TOPICS.map((t) => (
          <a key={t.id} href={`#help-${t.id}`} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'rounded-full' })}>
            <Icon name={t.icon} data-icon="inline-start" /> {t.title}
          </a>
        ))}
      </nav>
      {!topics.length && (
        <p className="text-sm text-muted-foreground">
          Nothing in help matches “{q}”.{' '}
          <Button variant="link" size="inline" onClick={() => openSearch(q)}>
            Search your workspace instead
          </Button>
        </p>
      )}
      {topics.map((t) => (
        <Card key={t.id} id={`help-${t.id}`} className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name={t.icon} size={18} className="text-primary" /> {t.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion multiple key={term ? `open-${term}` : 'closed'} defaultValue={term ? t.items.map((i) => i.q) : []}>
              {t.items.map((i) => (
                <AccordionItem key={i.q} value={i.q}>
                  <AccordionTrigger>{i.q}</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-muted-foreground">{i.a}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon name="help" size={18} className="text-primary" /> Still stuck?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Ask your workspace admin, or{' '}
          {contact ? (
            <>
              email us at{' '}
              <a className="text-primary hover:underline" href={`mailto:${contact}`}>
                {contact}
              </a>
              .
            </>
          ) : (
            'contact whoever runs your Küü server.'
          )}{' '}
          Messages and pages support <Kbd>**bold**</Kbd>, <Kbd>*italic*</Kbd>, <Kbd>`code`</Kbd>, lists, <Kbd>&gt; quotes</Kbd>, links and <Kbd>@mentions</Kbd>.
        </CardContent>
      </Card>
    </Page>
  );
}
