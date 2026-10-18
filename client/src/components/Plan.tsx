import { useEffect, useState, type ReactNode } from 'react';
import { dateLabel } from '../format';
import { Link } from 'react-router-dom';
import { api, type Feature, type PublicPlan } from '../api';
import { useSession } from '../session';
import { Sparkles } from 'lucide-react';
import { Icon } from './Icon';
import { Callout, useAction } from '@/components/kit';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const FEATURE_LABEL: Record<Feature, string> = {
  ai: 'AI assistance',
  automations: 'Automations',
  planning: 'Timeline and workload',
  insights: 'Insights and dashboards',
  guests: 'Guest access',
  api: 'API tokens and webhooks',
  sso: 'Single sign-on',
  scim: 'User provisioning (SCIM)',
  retention: 'Retention and legal hold',
  fields: 'Custom fields and time tracking',
  goals: 'Goals and intake forms',
  recordings: 'Meeting recordings and transcripts',
};

/** The plan catalog is the single source of truth for which plan unlocks a feature; fetched once per page load. */
let catalog: Promise<PublicPlan[]> | null = null;
const loadCatalog = () => (catalog ??= api.get<{ plans: PublicPlan[] }>('/public/plans').then((r) => r.plans).catch(() => ((catalog = null), [])));

/** The cheapest plan an admin can buy that includes a feature, e.g. "Team". */
export function useUpgradePlan(feature: Feature) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadCatalog().then((plans) => live && setName(plans.find((p) => p.self_serve && p.features.includes(feature))?.name ?? null));
    return () => {
      live = false;
    };
  }, [feature]);
  return name;
}

/** Plan helpers: which features this workspace has, and whether plans apply at all. */
export function usePlan() {
  const { me } = useSession();
  const plan = me?.workspace.plan;
  return {
    plan,
    saas: me?.mode === 'saas',
    has: (feature: Feature) => !plan || plan.features.includes(feature),
  };
}

export const daysUntil = (iso: string | null | undefined) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)) : 0);

export const usd = (n: number) => `$${n.toFixed(n % 1 ? 2 : 0)}`;

/** Friendly Liberian-dollar equivalent when the operator has set an exchange rate. */
export const lrd = (n: number, rate: number | null | undefined) => (rate ? `≈ L$${Math.round(n * rate).toLocaleString()}` : '');

/**
 * Shown in place of a feature the workspace's plan doesn't include. With `readOnly`, it sits above
 * existing content that stays viewable after a downgrade.
 */
export function UpgradeNotice({ feature, compact = false, readOnly = false }: { feature: Feature; compact?: boolean; readOnly?: boolean }) {
  const { can } = useSession();
  const plan = useUpgradePlan(feature);
  return (
    <Alert role="note" className={cn('border-primary/20 bg-accent/60', compact && 'py-2.5')}>
      <Sparkles className="text-primary" />
      <AlertTitle>
        {readOnly ? `${FEATURE_LABEL[feature]} are read-only on your plan` : `${FEATURE_LABEL[feature]} is part of the ${plan ?? 'paid'} plan${plan ? '' : 's'}`}
      </AlertTitle>
      <AlertDescription>
        {readOnly
          ? `Everything already here stays readable. ${can('admin') ? `Upgrade${plan ? ` to ${plan}` : ''} to create and change them again.` : 'Ask a workspace admin to upgrade to make changes.'}`
          : can('admin')
            ? 'Upgrade to unlock it for your whole team. Nothing you already have changes.'
            : 'Ask a workspace admin to upgrade to unlock it.'}
      </AlertDescription>
      {can('admin') && (
        <AlertAction>
          <Link
            to="/admin?tab=billing"
            className={buttonVariants({
              size: "sm"
            })}>See plans
                      </Link>
        </AlertAction>
      )}
    </Alert>
  );
}

/** A full-width strip under the top bar. */
function Banner({ tone, children, action }: { tone: 'warning' | 'info'; children: ReactNode; action: ReactNode }) {
  return (
    <Callout tone={tone} className="rounded-none border-x-0 border-t-0" action={action}>
      {children}
    </Callout>
  );
}

/** Top-of-page reminders: confirm your email, trial countdown, overdue payment. */
export function AccountBanners() {
  const { me, can } = useSession();
  const act = useAction();
  const [sent, setSent] = useState(false);
  if (!me || me.mode !== 'saas') return null;
  const plan = me.workspace.plan;
  const banners = [];
  if (!me.user.email_verified) {
    banners.push(
      <Banner
        tone="warning"
        key="verify"
        action={
          <Button
            variant="outline"
            size="xs"
            disabled={sent}
            onClick={async () => {
              if (await act(() => api.post('/me/verify-email/resend'), 'Confirmation email sent')) setSent(true);
            }}
          >
            {sent ? 'Sent — check your inbox' : 'Resend link'}
          </Button>
        }
      >
        Please confirm your email address ({me.user.email}) to invite people, use AI and pay for a plan.
      </Banner>,
    );
  }
  if (can('admin')) {
    if (plan.status === 'trial' && daysUntil(plan.trial_ends_at) <= 14) {
      const days = daysUntil(plan.trial_ends_at);
      banners.push(
        <Banner
          tone="info"
          key="trial"
          action={
            <Link
              to="/admin?tab=billing"
              className={buttonVariants({
                variant: "outline",
                size: "xs"
              })}>See plans
                          </Link>
          }
        >
          {days <= 1 ? 'Your Organization trial ends today.' : `${days} days left in your Organization trial.`} Choose a plan to keep every feature.
        </Banner>,
      );
    }
    if (plan.status === 'grace') {
      banners.push(
        <Banner
          tone="warning"
          key="grace"
          action={
            <Link
              to="/admin?tab=billing"
              className={buttonVariants({
                variant: "outline",
                size: "xs"
              })}>Renew
                          </Link>
          }
        >
          Your {plan.name} plan ended on {dateLabel(plan.paid_through)}. Renew within a few days to keep paid features.
        </Banner>,
      );
    }
  }
  return <>{banners}</>;
}

const storage = (gb: number) => (gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`);

/** A plan's price line: flat per workspace, free, or by quote. */
export function PlanPrice({ plan }: { plan: PublicPlan }) {
  return (
    <p className="flex items-baseline gap-1.5">
      {plan.price == null ? (
        <strong className="font-heading text-3xl font-semibold">Custom quote</strong>
      ) : plan.price ? (
        <>
          <strong className="font-heading text-3xl font-semibold">{usd(plan.price)}</strong> <span className="text-sm text-muted-foreground">per workspace / month</span>
        </>
      ) : (
        <>
          <strong className="font-heading text-3xl font-semibold">$0</strong> <span className="text-sm text-muted-foreground">forever</span>
        </>
      )}
    </p>
  );
}

function FeatureRow({ on = true, children }: { on?: boolean; children: ReactNode }) {
  return (
    <li className={cn('flex gap-2', !on && 'text-muted-foreground line-through decoration-muted-foreground/40')}>
      <Icon name={on ? 'check' : 'x'} size={14} className={cn('mt-0.5 shrink-0', on ? 'text-success' : 'text-muted-foreground')} />
      <span>{children}</span>
    </li>
  );
}

export function PlanFeatures({ plan, all }: { plan: PublicPlan; all: Feature[] }) {
  const has = (f: Feature) => plan.features.includes(f);
  return (
    <ul className="flex flex-col gap-2 text-sm">
      <FeatureRow>{plan.member_limit ? `Up to ${plan.member_limit} members` : 'More than 50 members'}</FeatureRow>
      <FeatureRow>{storage(plan.storage_gb)} storage</FeatureRow>
      <FeatureRow>Projects, tasks, messaging, file sharing, knowledge and meetings</FeatureRow>
      {all.map((f) => (
        <FeatureRow key={f} on={has(f)}>
          {FEATURE_LABEL[f]}
          {f === 'recordings' && has(f) ? (plan.recording_hours == null ? ' (unlimited)' : ` (${plan.recording_hours} hours a month)`) : ''}
          {f === 'ai' && has(f) && plan.ai_per_month ? ` (${plan.ai_per_month.toLocaleString()} requests a month)` : ''}
        </FeatureRow>
      ))}
      <FeatureRow on={plan.priority_support}>Priority support</FeatureRow>
    </ul>
  );
}

/** How to get a plan that can't be bought in the app (Enterprise). */
export function contactHref(supportEmail: string | null | undefined, planName: string) {
  return supportEmail ? `mailto:${supportEmail}?subject=${encodeURIComponent(`Küü ${planName} quote`)}` : null;
}

export const FEATURE_ORDER: Feature[] = ['planning', 'fields', 'goals', 'recordings', 'automations', 'guests', 'insights', 'api', 'ai', 'sso', 'scim', 'retention'];
