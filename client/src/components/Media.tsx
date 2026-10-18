import { useState } from 'react';
import { useApi } from '../hooks';
import { Icon } from './Icon';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Uploaded video or audio, played in place. `#t=0.1` makes browsers (notably Safari) show the first frame as a preview. */
export function MediaAttachment({ file }: { file: { id: string; name: string; mime?: string | null } }) {
  const src = `/api/files/${file.id}/download?inline=1`;
  if (file.mime?.startsWith('audio/')) {
    return (
      <figure className="flex max-w-sm flex-col gap-1">
        <audio controls preload="metadata" src={src} aria-label={file.name} className="w-full" />
        <figcaption className="truncate text-xs text-muted-foreground">{file.name}</figcaption>
      </figure>
    );
  }
  return (
    <figure className="video-attachment flex max-w-md flex-col gap-1">
      <video controls playsInline preload="metadata" src={`${src}#t=0.1`} aria-label={file.name} className="max-h-80 w-full rounded-xl bg-black" />
      <figcaption className="truncate text-xs text-muted-foreground">{file.name}</figcaption>
    </figure>
  );
}

export const isPlayable = (mime?: string | null) => !!mime && (mime.startsWith('video/') || mime.startsWith('audio/'));

type Provider = 'youtube' | 'vimeo' | 'loom' | 'tiktok' | 'facebook';
type VideoLink = { url: string; provider: Provider; youtubeId?: string } | { url: string; provider: 'file' };

const PROVIDER_NAME: Record<Provider, string> = { youtube: 'YouTube', vimeo: 'Vimeo', loom: 'Loom', tiktok: 'TikTok', facebook: 'Facebook' };

function classify(raw: string): VideoLink | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  const path = u.pathname;
  if (host === 'youtu.be' || host === 'youtube.com' || host === 'music.youtube.com') {
    const id = host === 'youtu.be' ? path.slice(1).split('/')[0] : path === '/watch' ? u.searchParams.get('v') : /^\/(?:shorts|embed|live|v)\/([\w-]{11})/.exec(path)?.[1];
    return id && /^[\w-]{11}$/.test(id) ? { url: raw, provider: 'youtube', youtubeId: id } : null;
  }
  if ((host === 'vimeo.com' || host === 'player.vimeo.com') && /^\/(?:video\/)?\d{5,12}(?:\/|$)/.test(path)) return { url: raw, provider: 'vimeo' };
  if (host === 'loom.com' && /^\/(?:share|embed)\/[0-9a-f]{32}/.test(path)) return { url: raw, provider: 'loom' };
  if (host === 'tiktok.com' && /^\/@[\w.-]+\/video\/\d{8,25}/.test(path)) return { url: raw, provider: 'tiktok' };
  if ((host === 'facebook.com' && /\/(videos|watch|reel)\b/.test(path)) || host === 'fb.watch') return { url: raw, provider: 'facebook' };
  if (u.protocol === 'https:' && /\.(mp4|m4v|webm|mov|ogv)$/i.test(path)) return { url: raw, provider: 'file' };
  return null;
}

/** Video links in a message's text (at most three previews per message). */
export function videoLinks(text: string): VideoLink[] {
  const found = new Map<string, VideoLink>();
  for (const m of text.matchAll(/https?:\/\/[^\s<>()[\]"'`]+/g)) {
    const url = m[0].replace(/[.,;:!?]+$/, '');
    const link = classify(url);
    if (link && !found.has(url)) found.set(url, link);
    if (found.size >= 3) break;
  }
  return [...found.values()];
}

interface EmbedInfo {
  provider: Provider;
  url: string;
  embedUrl: string;
  title: string | null;
  thumbnail: string | null;
}

/** A thumbnail card for a video link that turns into the provider's player when pressed. */
function VideoLinkCard({ link }: { link: Extract<VideoLink, { provider: Provider }> }) {
  const { data } = useApi<EmbedInfo>(`/embeds/video?url=${encodeURIComponent(link.url)}`);
  const [playing, setPlaying] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumbnail = data?.thumbnail ?? (link.youtubeId ? `https://i.ytimg.com/vi/${link.youtubeId}/hqdefault.jpg` : null);
  const vertical = link.provider === 'tiktok';
  const title = data?.title ?? `${PROVIDER_NAME[link.provider]} video`;
  if (playing && data?.embedUrl) {
    return (
      <div className={cn('overflow-hidden rounded-xl bg-black', vertical ? 'aspect-[9/16] max-w-xs' : 'aspect-video max-w-md')}>
        <iframe
          className="size-full"
          src={data.embedUrl}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      </div>
    );
  }
  return (
    <Card size="sm" className={cn('video-card gap-0 py-0', vertical ? 'max-w-[14rem]' : 'max-w-sm')}>
      <button
        type="button"
        className={cn('video-thumb group/thumb relative block w-full overflow-hidden bg-muted', vertical ? 'aspect-[9/16]' : 'aspect-video')}
        onClick={() => setPlaying(true)}
        disabled={!data?.embedUrl}
        aria-label={`Play ${title}`}
      >
        {thumbnail && !thumbFailed ? (
          <img src={thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setThumbFailed(true)} className="size-full object-cover" />
        ) : (
          <span className="block size-full bg-gradient-to-br from-muted to-secondary" />
        )}
        <span className="absolute inset-0 m-auto flex size-12 items-center justify-center rounded-full bg-black/60 text-white transition-transform group-hover/thumb:scale-110" aria-hidden="true">
          <Icon name="play" size={22} className="translate-x-px fill-current" />
        </span>
      </button>
      <a className="flex flex-col gap-0.5 px-3 py-2 hover:bg-muted/50" href={link.url} target="_blank" rel="noopener noreferrer">
        <strong className="truncate text-sm font-medium">{title}</strong>
        <span className="text-xs text-muted-foreground">{PROVIDER_NAME[link.provider]}</span>
      </a>
    </Card>
  );
}

/** Previews for every video link in a message. */
export function VideoLinks({ text }: { text: string }) {
  const links = videoLinks(text);
  if (!links.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {links.map((link) =>
        link.provider === 'file' ? (
          <figure key={link.url} className="video-attachment max-w-md">
            <video controls playsInline preload="metadata" src={`${link.url}#t=0.1`} className="max-h-80 w-full rounded-xl bg-black" />
          </figure>
        ) : (
          <VideoLinkCard key={link.url} link={link} />
        ),
      )}
    </div>
  );
}
