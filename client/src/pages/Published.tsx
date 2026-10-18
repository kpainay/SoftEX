import { useEffect } from 'react';
import { dateLabel } from '../format';
import { useParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Markdown } from '../components/Markdown';
import { EmptyState, Loading } from '@/components/kit';
import { useApi } from '../hooks';
import { Separator } from '@/components/ui/separator';

/** A knowledge page published to the web: read-only, no sign-in (/p/:token). */
export function PublishedPage() {
  const { token } = useParams();
  const { data: page, error } = useApi<{ title: string; body: string; icon: string | null; updated_at: string; workspace_name: string }>(`/public/pages/${token}`);
  useEffect(() => {
    if (page) document.title = `${page.title} · ${page.workspace_name}`;
  }, [page]);
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <Logo height={24} />
          {page && <span className="truncate text-xs text-muted-foreground">{page.workspace_name}</span>}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
        {error ? (
          <EmptyState icon="alert" title="This page isn’t available">
            It may have been unpublished, or the link changed.
          </EmptyState>
        ) : !page ? (
          <Loading />
        ) : (
          <article className="flex flex-col gap-2">
            <h1 className="flex items-center gap-3 font-heading text-3xl font-semibold tracking-tight text-balance">
              {page.icon && <span aria-hidden="true">{page.icon}</span>} {page.title}
            </h1>
            <p className="text-xs text-muted-foreground">Updated {dateLabel(page.updated_at)}</p>
            <Separator className="my-4" />
            <Markdown text={page.body} />
          </article>
        )}
        <p className="mt-auto pt-8 text-center text-xs text-muted-foreground">Published with Küü</p>
      </main>
    </div>
  );
}
