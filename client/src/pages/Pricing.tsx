import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Feature, type PublicPlan } from '../api';
import { Icon } from '../components/Icon';
import { FEATURE_ORDER, PlanFeatures, PlanPrice, contactHref, lrd, usd } from '../components/Plan';
import { Loading } from '@/components/kit';
import { useApi } from '../hooks';
import { useSession } from '../session';
import { PublicPage } from '../components/Public';
import { Logo } from '../components/Logo';
import { buttonVariants } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface PublicPricing {
  mode: 'self_hosted' | 'saas';
  currency: string;
  lrd_per_usd: number | null;
  trial_days: number;
  annual_factor: number;
  support_email: string | null;
  plans: PublicPlan[];
  company: { name: string | null; address: string | null; email: string | null };
  terms_version: string;
}

export const usePublicPricing = () => useApi<PublicPricing>('/public/plans');

/** Public pricing page, reachable signed in or out. */
export function Pricing() {
  const { me } = useSession();
  const { data } = usePublicPricing();
  if (!data) return <Loading />;
  const perYear = (p: PublicPlan) => (p.price ?? 0) * 12 * data.annual_factor;
  const mail = (email: string) => (
    <a className="text-primary hover:underline" href={`mailto:${email}`}>
      {email}
    </a>
  );
  const faq: { q: string; a: ReactNode }[] = [
    { q: 'What happens when the trial ends?', a: 'Your workspace moves to the Free plan automatically. Nothing is deleted; paid features pause until you choose a plan.' },
    {
      q: 'How do I pay?',
      a: 'An admin chooses a plan under Administration → Billing, pays by mobile money or bank transfer, and enters the transaction ID. We confirm it and your plan starts — usually within one business day.',
    },
    {
      q: 'Is the price per person?',
      a: "No. Each plan is one flat monthly price for the whole workspace, up to its member limit. Guests (clients and partners you share specific channels or projects with) don't count toward the limit.",
    },
    {
      q: 'We have more than 50 people.',
      a: (
        <>
          Larger organisations get a custom quote based on usage, onboarding and support needs.
          {data.support_email ? <> Email {mail(data.support_email)} to talk it through.</> : ' Contact us to talk it through.'}
        </>
      ),
    },
    { q: 'Can I leave at any time?', a: 'Yes. Export your data whenever you like, and owners can delete the workspace permanently from Administration → Workspace.' },
  ];
  const body = (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 md:px-8">
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">Pricing</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance md:text-4xl">Everything your team needs, one simple price</h1>
        <p className="text-muted-foreground text-pretty">
          Chat, projects, knowledge and meetings in one place. One flat price per workspace, not per person. Start with a {data.trial_days}-day free trial of Organization — no payment
          needed — and keep a free plan for up to 5 members forever. Pay monthly or yearly by mobile money or bank transfer.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.plans.map((p) => (
          <Card key={p.id} className={cn('relative', p.id === 'organization' && 'ring-2 ring-primary')}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg">{p.name}</CardTitle>
                {p.id === 'organization' && <Badge>Includes AI</Badge>}
              </div>
              <PlanPrice plan={p} />
              <CardDescription className="text-xs">
                {p.price == null
                  ? 'Based on usage, onboarding and support needs'
                  : p.price
                    ? `${lrd(p.price, data.lrd_per_usd)}${data.lrd_per_usd ? ' · ' : ''}${usd(perYear(p))} a year when paid yearly`
                    : 'Free forever'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <p className="text-sm text-muted-foreground">{p.tagline}</p>
              <PlanFeatures plan={p} all={FEATURE_ORDER as Feature[]} />
            </CardContent>
            {(p.price == null ? !!contactHref(data.support_email, p.name) : !me) && (
              <CardFooter>
                {p.price == null ? (
                  <a href={contactHref(data.support_email, p.name)!} className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
                    Contact us
                  </a>
                ) : (
                  <Link to="/register" className={buttonVariants({ variant: p.id === 'organization' ? 'default' : 'outline', className: 'w-full' })}>
                    {p.price ? 'Start free trial' : 'Get started free'}
                  </Link>
                )}
              </CardFooter>
            )}
          </Card>
        ))}
      </div>
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <h2 className="font-heading text-xl font-semibold">Questions</h2>
        <Accordion>
          {faq.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger>{f.q}</AccordionTrigger>
              <AccordionContent>
                <p className="text-muted-foreground">{f.a}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {data.support_email && <p className="text-sm text-muted-foreground">More questions? Email {mail(data.support_email)}.</p>}
      </section>
    </div>
  );
  return me ? body : <PublicPage title="Pricing · Küü">{body}</PublicPage>;
}

/** Target of the link in the "confirm your email" message. */
export function VerifyEmail() {
  const { token } = useParams();
  const { me, refresh } = useSession();
  const [state, setState] = useState<'working' | 'done' | string>('working');
  useEffect(() => {
    api
      .post('/auth/verify-email', { token })
      .then(() => {
        setState('done');
        if (me) refresh();
      })
      .catch((e) => setState((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader className="items-center justify-items-center gap-4">
          <Logo height={34} />
          {state === 'done' && (
            <CardTitle className="flex items-center justify-center gap-2 text-xl">
              <Icon name="check" size={22} className="text-success" /> Email confirmed
            </CardTitle>
          )}
          {state !== 'working' && state !== 'done' && <CardTitle className="text-xl">Link not valid</CardTitle>}
          {state === 'done' && <CardDescription>Thanks! You can now invite your team, use AI features and choose a plan.</CardDescription>}
          {state !== 'working' && state !== 'done' && <CardDescription>{state}</CardDescription>}
        </CardHeader>
        <CardContent>{state === 'working' && <Loading label="Confirming" className="min-h-20" />}</CardContent>
        <CardFooter>
          <Link to="/" className={buttonVariants({ className: 'w-full' })}>
            {me ? 'Back to Küü' : 'Sign in'}
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
