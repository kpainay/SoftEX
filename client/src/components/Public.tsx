import { useEffect, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { usePublicPricing, type PublicPricing } from '../pages/Pricing';
import { useSession } from '../session';
import { Logo, TAGLINE } from './Logo';
import { buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

/** Name shown as the business behind the service (falls back to the product name). */
export const companyName = (info?: PublicPricing) => info?.company.name ?? 'Küü';

export function PublicHeader() {
  const { me } = useSession();
  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 md:px-6">
        <Link to="/" aria-label="Küü home" className="shrink-0">
          <Logo height={28} />
        </Link>
        <nav className="flex items-center gap-1 max-sm:hidden" aria-label="Website">
          <a href="/#features" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Features
          </a>
          <NavLink to="/pricing" className={({ isActive }) => buttonVariants({ variant: isActive ? 'secondary' : 'ghost', size: 'sm' })}>
            Pricing
          </NavLink>
          <a href="/#faq" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            FAQ
          </a>
        </nav>
        <span className="flex-1" />
        {me ? (
          <Link to="/" className={buttonVariants({ size: 'sm' })}>
            Open Küü
          </Link>
        ) : (
          <>
            <Link to="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Sign in
            </Link>
            <Link to="/register" className={buttonVariants({ size: 'sm' })}>
              Start free trial
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

const footLink = 'text-sm text-muted-foreground hover:text-foreground';

export function PublicFooter() {
  const { data } = usePublicPricing();
  const contact = data?.support_email ?? data?.company.email;
  return (
    <footer className="mt-16 border-t bg-card">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[2fr_1fr_1fr] md:px-6">
        <div className="flex flex-col gap-2">
          <Logo height={28} />
          <p className="font-medium">{TAGLINE}</p>
          <p className="max-w-xs text-sm text-muted-foreground">One calm workspace for your team’s conversations, projects, knowledge and meetings.</p>
        </div>
        <nav className="flex flex-col gap-2" aria-label="Product">
          <h4 className="text-sm font-semibold">Product</h4>
          <a href="/#features" className={footLink}>
            Features
          </a>
          <Link to="/pricing" className={footLink}>
            Pricing
          </Link>
          <Link to="/register" className={footLink}>
            Start free trial
          </Link>
          <Link to="/login" className={footLink}>
            Sign in
          </Link>
        </nav>
        <nav className="flex flex-col gap-2" aria-label="Company">
          <h4 className="text-sm font-semibold">Company</h4>
          {contact && (
            <a href={`mailto:${contact}`} className={footLink}>
              Contact us
            </a>
          )}
          <Link to="/terms" className={footLink}>
            Terms of Service
          </Link>
          <Link to="/privacy" className={footLink}>
            Privacy Policy
          </Link>
        </nav>
      </div>
      <Separator />
      <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted-foreground md:px-6">
        © {new Date().getFullYear()} {companyName(data)}
        {data?.company.address ? ` · ${data.company.address}` : ''}
      </p>
    </footer>
  );
}

/** Frame for the public website pages: header, content, footer, and a page title. */
export function PublicPage({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <PublicHeader />
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 pt-4 pb-15">{children}</main>
      <PublicFooter />
    </div>
  );
}
