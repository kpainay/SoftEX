import { Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Layout } from './components/Layout';
import { TaskDetail } from './components/TaskDrawer';
import { Loading, Page } from '@/components/kit';
import { Card, CardContent } from '@/components/ui/card';
import { AcceptInvite, ForgotPassword, Login, MfaSetup, Register, ResetPassword } from './pages/Auth';
import { useSession } from './session';
import { lazyPage } from './lazyPage';

// Each screen downloads its own code the first time it opens.
const Admin = lazyPage(() => import('./pages/Admin'), 'Admin');
const ChannelView = lazyPage(() => import('./pages/Chats'), 'ChannelView');
const ChannelsBrowser = lazyPage(() => import('./pages/Chats'), 'ChannelsBrowser');
const Chats = lazyPage(() => import('./pages/Chats'), 'Chats');
const Decisions = lazyPage(() => import('./pages/Decisions'), 'Decisions');
const Directory = lazyPage(() => import('./pages/Directory'), 'Directory');
const PersonView = lazyPage(() => import('./pages/Directory'), 'PersonView');
const Help = lazyPage(() => import('./pages/Help'), 'Help');
const Home = lazyPage(() => import('./pages/Home'), 'Home');
const Inbox = lazyPage(() => import('./pages/Inbox'), 'Inbox');
const FileView = lazyPage(() => import('./pages/Knowledge'), 'FileView');
const Knowledge = lazyPage(() => import('./pages/Knowledge'), 'Knowledge');
const PageView = lazyPage(() => import('./pages/Knowledge'), 'PageView');
const MeetingDetail = lazyPage(() => import('./pages/Meetings'), 'MeetingDetail');
const Meetings = lazyPage(() => import('./pages/Meetings'), 'Meetings');
const MyWork = lazyPage(() => import('./pages/MyWork'), 'MyWork');
const ProjectDetail = lazyPage(() => import('./pages/Projects'), 'ProjectDetail');
const Projects = lazyPage(() => import('./pages/Projects'), 'Projects');
const Later = lazyPage(() => import('./pages/Planning'), 'Later');
const Workload = lazyPage(() => import('./pages/Planning'), 'Workload');
const Requests = lazyPage(() => import('./pages/Requests'), 'Requests');
const Pricing = lazyPage(() => import('./pages/Pricing'), 'Pricing');
const VerifyEmail = lazyPage(() => import('./pages/Pricing'), 'VerifyEmail');
const Landing = lazyPage(() => import('./pages/Landing'), 'Landing');
const Privacy = lazyPage(() => import('./pages/Legal'), 'Privacy');
const Terms = lazyPage(() => import('./pages/Legal'), 'Terms');
const Operator = lazyPage(() => import('./pages/Operator'), 'Operator');
const Settings = lazyPage(() => import('./pages/Settings'), 'Settings');
const GoalDetail = lazyPage(() => import('./pages/Goals'), 'GoalDetail');
const Goals = lazyPage(() => import('./pages/Goals'), 'Goals');
const FormFill = lazyPage(() => import('./pages/Forms'), 'FormFill');
const PublicForm = lazyPage(() => import('./pages/Forms'), 'PublicForm');
const PublishedPage = lazyPage(() => import('./pages/Published'), 'PublishedPage');
const Timesheet = lazyPage(() => import('./pages/Timesheet'), 'Timesheet');
const DashboardView = lazyPage(() => import('./pages/Dashboards'), 'DashboardView');
const Dashboards = lazyPage(() => import('./pages/Dashboards'), 'Dashboards');
const BoardView = lazyPage(() => import('./pages/Boards'), 'BoardView');
const Boards = lazyPage(() => import('./pages/Boards'), 'Boards');

function TaskPage() {
  const { id } = useParams();
  return (
    <Page width="narrow">
      <Card>
        <CardContent>
          <TaskDetail taskId={id!} key={id} onDeleted={() => history.back()} />
        </CardContent>
      </Card>
    </Page>
  );
}

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Home'],
  [/^\/inbox/, 'Inbox'],
  [/^\/chats/, 'Chats'],
  [/^\/channels/, 'Channels'],
  [/^\/my-work/, 'My work'],
  [/^\/projects/, 'Projects'],
  [/^\/goals/, 'Goals'],
  [/^\/dashboards/, 'Dashboards'],
  [/^\/boards/, 'Whiteboards'],
  [/^\/forms|^\/f\//, 'Form'],
  [/^\/timesheet/, 'Timesheet'],
  [/^\/tasks/, 'Task'],
  [/^\/knowledge|^\/files/, 'Knowledge'],
  [/^\/meetings/, 'Meetings'],
  [/^\/directory|^\/people/, 'Directory'],
  [/^\/decisions/, 'Decisions'],
  [/^\/requests/, 'Requests'],
  [/^\/workload/, 'Workload'],
  [/^\/later/, 'Later'],
  [/^\/pricing/, 'Pricing'],
  [/^\/operator/, 'Operator console'],
  [/^\/settings/, 'Settings'],
  [/^\/admin/, 'Administration'],
  [/^\/help/, 'Help'],
];

/** Signed-out visitors always enter through the SaaS product website. */
function PublicHome() {
  return <Landing />;
}

export function App() {
  const { me, loading } = useSession();
  const location = useLocation();

  useEffect(() => {
    const title = TITLES.find(([re]) => re.test(location.pathname))?.[1];
    document.title = title ? `${title} · Küü` : 'Küü';
  }, [location.pathname]);

  // Published pages and public forms look the same whether or not the visitor is signed in.
  if (/^\/(f|p)\/[^/]+$/.test(location.pathname)) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
        <Route path="/f/:token" element={<PublicForm />} />
        <Route path="/p/:token" element={<PublishedPage />} />
      </Routes>
      </Suspense>
    );
  }

  if (loading) return <Loading label="Starting Küü" />;

  if (!me) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="/verify-email/:token" element={<VerifyEmail />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PublicHome />} />
        <Route path="/welcome" element={<Landing />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    );
  }

  // Pages that stand on their own even when signed in.
  if (/^\/(verify-email\/|terms$|privacy$|welcome$)/.test(location.pathname)) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
        <Route path="/welcome" element={<Landing />} />
        <Route path="/verify-email/:token" element={<VerifyEmail />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
      </Routes>
      </Suspense>
    );
  }
  if (me.mfa_setup_required) return <MfaSetup required />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/chats" element={<Chats />} />
        <Route path="/channels" element={<ChannelsBrowser />} />
        <Route path="/channels/:id" element={<ChannelView />} />
        <Route path="/my-work" element={<MyWork />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/tasks/:id" element={<TaskPage />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/goals/:id" element={<GoalDetail />} />
        <Route path="/forms/:id" element={<FormFill />} />
        <Route path="/timesheet" element={<Timesheet />} />
        <Route path="/dashboards" element={<Dashboards />} />
        <Route path="/dashboards/:id" element={<DashboardView />} />
        <Route path="/boards" element={<Boards />} />
        <Route path="/boards/:id" element={<BoardView />} />
        <Route path="/knowledge" element={<Knowledge />} />
        <Route path="/knowledge/:id" element={<PageView />} />
        <Route path="/files/:id" element={<FileView />} />
        <Route path="/meetings" element={<Meetings />} />
        <Route path="/meetings/:id" element={<MeetingDetail />} />
        <Route path="/directory" element={<Directory />} />
        <Route path="/people/:id" element={<PersonView />} />
        <Route path="/decisions" element={<Decisions />} />
        <Route path="/requests" element={<Requests />} />
        <Route path="/workload" element={<Workload />} />
        <Route path="/later" element={<Later />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/operator" element={<Operator />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/help" element={<Help />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/register" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
