import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { bytes as fmtBytes, timeAgo } from '../format';
import { useApi, useRealtime } from '../hooks';
import { Icon } from './Icon';
import { UpgradeNotice } from './Plan';
import { Callout, CheckboxField, FormField, Modal, Pill, Segmented, useAction, useConfirm, useToast } from '@/components/kit';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';

interface Recording {
  id: string;
  kind: 'audio' | 'screen';
  status: 'recording' | 'ready' | 'stopped';
  mime: string | null;
  size: number;
  duration_sec: number;
  started_by: { id: string; name: string } | null;
  started_at: string;
  ended_at: string | null;
  transcript_status: 'none' | 'live' | 'queued' | 'processing' | 'done' | 'failed';
  transcript_error: string | null;
  segment_count: number;
  media_url: string | null;
  can_delete: boolean;
}
interface RecordingsInfo {
  recordings: Recording[];
  available: boolean;
  can_record: boolean;
  server_transcription: boolean;
  max_bytes: number;
}
interface Segment {
  id: string;
  start_ms: number;
  end_ms?: number;
  text: string;
  speaker_name?: string | null;
}

// Browser speech recognition (Chrome, Edge, Safari); not in every browser, so it's optional.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
const SpeechRecognitionCtor = (): (new () => Recognition) | undefined =>
  (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor(s / 60) % 60).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(s % 60).padStart(2, '0')}`;
};

function pickMime(kind: 'audio' | 'screen') {
  if (typeof MediaRecorder === 'undefined') return null;
  const options =
    kind === 'screen'
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return options.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}
const EXT: Record<string, string> = { 'audio/webm': 'weba', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'video/webm': 'webm', 'video/mp4': 'mp4' };

interface Session {
  recordingId: string;
  recorder: MediaRecorder;
  streams: MediaStream[];
  audioContext?: AudioContext;
  recognition?: Recognition;
  started: number;
  chunks: Blob[];
  bytes: number;
  mime: string;
}

/** Record the meeting, show live captions, and list recordings with their transcripts. */
export function MeetingRecordings({ meetingId, meetingTitle }: { meetingId: string; meetingTitle: string }) {
  const act = useAction();
  const confirm = useConfirm();
  const toast = useToast();
  const { data, reload } = useApi<RecordingsInfo>(`/meetings/${meetingId}/recordings`);
  const [asking, setAsking] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [interim, setInterim] = useState('');
  const [captions, setCaptions] = useState<Segment[]>([]);
  const [saving, setSaving] = useState(false);
  const [transcribe, setTranscribe] = useState(true);
  const pendingSegments = useRef<{ startMs: number; endMs: number; text: string }[]>([]);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  useRealtime((e) => {
    if (e.meetingId !== meetingId) return;
    if (e.type === 'meeting.recording') reload();
    if (e.type === 'meeting.caption') setCaptions((c) => [...c, ...e.segments].slice(-40));
  });

  // Tick the timer; send captions in small batches; stop before the file gets too big to upload.
  useEffect(() => {
    if (!session) return;
    const t = window.setInterval(() => {
      setElapsed(Date.now() - session.started);
      if (data && session.bytes > data.max_bytes * 0.95) {
        toast('The recording reached the upload size limit, so it was stopped and saved.', 'error');
        void stop(true);
      }
    }, 500);
    const flush = window.setInterval(() => void sendSegments(session.recordingId), 3000);
    const warn = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => {
      window.clearInterval(t);
      window.clearInterval(flush);
      window.removeEventListener('beforeunload', warn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const sendSegments = async (recordingId: string) => {
    const batch = pendingSegments.current.splice(0, 50);
    if (!batch.length) return;
    try {
      await api.post(`/recordings/${recordingId}/segments`, { segments: batch });
    } catch {
      pendingSegments.current.unshift(...batch);
    }
  };

  const start = async (kind: 'audio' | 'screen', language: string, captionsOn: boolean) => {
    const mime = pickMime(kind);
    if (!mime || !navigator.mediaDevices?.getUserMedia) {
      toast('This browser cannot record. Try a recent Chrome, Edge, Firefox or Safari.', 'error');
      return;
    }
    const streams: MediaStream[] = [];
    let audioContext: AudioContext | undefined;
    let recordStream: MediaStream;
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streams.push(mic);
      if (kind === 'screen') {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10 }, audio: true });
        streams.push(screen);
        // Mix the microphone with the shared tab or screen's own sound.
        audioContext = new AudioContext();
        const out = audioContext.createMediaStreamDestination();
        audioContext.createMediaStreamSource(mic).connect(out);
        if (screen.getAudioTracks().length) audioContext.createMediaStreamSource(screen).connect(out);
        recordStream = new MediaStream([...screen.getVideoTracks(), ...out.stream.getAudioTracks()]);
        // Stopping the share from the browser's own bar ends the recording too.
        screen.getVideoTracks()[0]?.addEventListener('ended', () => void stop(true));
      } else recordStream = mic;
    } catch {
      streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      toast('Recording needs permission to use your microphone' + (kind === 'screen' ? ' and to share your screen.' : '.'), 'error');
      return;
    }

    const rec = await act(() => api.post<Recording>(`/meetings/${meetingId}/recordings`, { kind, consent: true, language: language.split('-')[0] }));
    if (!rec) {
      streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      await audioContext?.close();
      return;
    }
    const recorder = new MediaRecorder(recordStream, { mimeType: mime, audioBitsPerSecond: 48_000, ...(kind === 'screen' ? { videoBitsPerSecond: 600_000 } : {}) });
    const s: Session = { recordingId: rec.id, recorder, streams, audioContext, started: Date.now(), chunks: [], bytes: 0, mime: mime.split(';')[0] };
    recorder.ondataavailable = (e) => {
      if (e.data.size) {
        s.chunks.push(e.data);
        s.bytes += e.data.size;
      }
    };
    recorder.start(1000);

    const Ctor = captionsOn ? SpeechRecognitionCtor() : undefined;
    if (Ctor) {
      const recognition = new Ctor();
      recognition.lang = language;
      recognition.continuous = true;
      recognition.interimResults = true;
      let segmentStart = 0;
      recognition.onresult = (e) => {
        let live = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const text = r[0].transcript.trim();
          if (r.isFinal && text) {
            failures = 0;
            const now = Date.now() - s.started;
            pendingSegments.current.push({ startMs: segmentStart, endMs: now, text });
            segmentStart = now;
          } else live += `${text} `;
        }
        setInterim(live.trim());
      };
      // Browsers end recognition after a pause; keep it going while recording, but give up
      // if the speech service keeps failing (offline, blocked) rather than retrying forever.
      let failures = 0;
      recognition.onend = () => {
        if (sessionRef.current?.recordingId !== s.recordingId || failures >= 3) return;
        window.setTimeout(() => {
          try {
            if (sessionRef.current?.recordingId === s.recordingId) recognition.start();
          } catch {
            /* already restarting */
          }
        }, 300);
      };
      recognition.onerror = (e) => {
        failures += e.error === 'no-speech' || e.error === 'aborted' ? 0 : 1;
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') failures = 3;
      };
      try {
        recognition.start();
        s.recognition = recognition;
      } catch {
        /* captions are optional */
      }
    }
    setElapsed(0);
    setCaptions([]);
    setSession(s);
  };

  const stop = async (save: boolean) => {
    const s = sessionRef.current;
    if (!s) return;
    setSession(null);
    setInterim('');
    s.recognition && (s.recognition.onend = null);
    s.recognition?.stop();
    const done = new Promise<void>((resolve) => {
      s.recorder.onstop = () => resolve();
      if (s.recorder.state === 'inactive') resolve();
    });
    if (s.recorder.state !== 'inactive') s.recorder.stop();
    await done;
    s.streams.forEach((st) => st.getTracks().forEach((t) => t.stop()));
    await s.audioContext?.close().catch(() => {});
    await sendSegments(s.recordingId);
    if (!save || !s.chunks.length) {
      await act(() => api.post(`/recordings/${s.recordingId}/stop`));
      reload();
      return;
    }
    setSaving(true);
    const file = new File(s.chunks, `recording.${EXT[s.mime] ?? 'webm'}`, { type: s.mime });
    const form = new FormData();
    form.append('durationSec', String(Math.round((Date.now() - s.started) / 1000)));
    form.append('transcribe', String(!!data?.server_transcription && transcribe));
    form.append('file', file);
    const ok = await act(() => api.upload(`/recordings/${s.recordingId}/upload`, form), 'Recording saved');
    if (!ok) {
      // Keep a copy the person can save themselves rather than losing the meeting.
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${meetingTitle.replace(/[^\w\- ]+/g, '').trim() || 'meeting'}.${EXT[s.mime] ?? 'webm'}`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast('The recording could not be uploaded, so it was downloaded to this device instead.', 'error');
    }
    setSaving(false);
    reload();
  };

  if (!data) return null;
  const othersRecording = data.recordings.filter((r) => r.status === 'recording' && r.id !== session?.recordingId);
  if (!data.recordings.length && !data.can_record) return null;

  const recDot = <span className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" aria-hidden="true" />;
  return (
    <Card id="recordings">
      <CardHeader>
        <CardTitle>Recording & transcript</CardTitle>
        {data.can_record && data.available && !session && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setAsking(true)} disabled={saving}>
              {saving ? <Spinner data-icon="inline-start" /> : <span className="size-2 rounded-full bg-destructive" aria-hidden="true" />} {saving ? 'Saving…' : 'Record'}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!data.available && data.can_record && <UpgradeNotice feature="recordings" compact />}

        {othersRecording.map((r) => (
          <Callout tone="warning" key={r.id}>
            {r.started_by?.name} is recording this meeting.
          </Callout>
        ))}

        {session && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2" role="status">
            {recDot}
            <strong className="font-semibold tabular-nums">Recording {clock(elapsed)}</strong>
            <span className="text-xs text-muted-foreground">{fmtBytes(session.bytes)}</span>
            <span className="min-w-0 flex-1" />
            {data.server_transcription && <CheckboxField label="Transcribe after saving" checked={transcribe} onCheckedChange={setTranscribe} className="w-auto" />}
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (await confirm({ title: 'Discard this recording?', description: 'Nothing recorded so far is kept.', confirmLabel: 'Discard', destructive: true })) void stop(false);
              }}
            >
              Discard
            </Button>
            <Button size="sm" onClick={() => void stop(true)}>
              Stop and save
            </Button>
          </div>
        )}

        {(session || captions.length > 0 || interim) && (
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-xl bg-muted p-3 text-sm" aria-live="polite" aria-label="Live captions">
            {captions.slice(-6).map((c) => (
              <p key={c.id}>
                {c.speaker_name && <strong className="font-semibold">{c.speaker_name}: </strong>}
                {c.text}
              </p>
            ))}
            {session && pendingSegments.current.slice(-3).map((c, i) => <p key={`p${i}`}>{c.text}</p>)}
            {interim && <p className="text-muted-foreground">{interim}</p>}
            {session && !session.recognition && (
              <p className="text-xs text-muted-foreground">Live captions aren’t available in this browser{data.server_transcription ? '; the server can transcribe the recording afterwards' : ''}.</p>
            )}
          </div>
        )}

        {data.recordings
          .filter((r) => r.status === 'ready')
          .map((r) => (
            <RecordingItem key={r.id} rec={r} serverTranscription={data.server_transcription} onChange={reload} meetingTitle={meetingTitle} />
          ))}
        {!data.recordings.some((r) => r.status === 'ready') && !session && data.can_record && data.available && (
          <p className="text-sm text-muted-foreground">Record the meeting from this device (your microphone, or your screen and microphone), with live captions where the browser supports them.</p>
        )}
      </CardContent>

      {asking && (
        <StartRecording
          serverTranscription={data.server_transcription}
          onClose={() => setAsking(false)}
          onStart={(kind, language, captionsOn) => {
            setAsking(false);
            void start(kind, language, captionsOn);
          }}
        />
      )}
    </Card>
  );
}

function StartRecording({ serverTranscription, onClose, onStart }: { serverTranscription: boolean; onClose: () => void; onStart: (kind: 'audio' | 'screen', language: string, captions: boolean) => void }) {
  const [kind, setKind] = useState<'audio' | 'screen'>('audio');
  const [language, setLanguage] = useState(() => (navigator.language?.startsWith('fr') ? 'fr-FR' : 'en-US'));
  const [captions, setCaptions] = useState(!!SpeechRecognitionCtor());
  const [consent, setConsent] = useState(false);
  const canScreen = !!navigator.mediaDevices?.getDisplayMedia;
  return (
    <Modal open onClose={onClose} title="Record this meeting">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onStart(kind, language, captions);
        }}
      >
        <Segmented
          aria-label="What to record"
          value={kind}
          onChange={setKind}
          options={[
            {
              value: 'audio',
              label: (
                <>
                  <Icon name="mic" /> Sound only
                </>
              ),
            },
            ...(canScreen
              ? [
                  {
                    value: 'screen' as const,
                    label: (
                      <>
                        <Icon name="video" /> Screen and sound
                      </>
                    ),
                  },
                ]
              : []),
          ]}
        />
        <p className="text-xs text-muted-foreground">
          {kind === 'audio'
            ? 'Records your microphone — ideal for a meeting in one room, or on speakerphone. Small files, even on a slow connection.'
            : 'Choose the video call’s tab or window, and tick “share audio” so everyone’s voices are included.'}
        </p>
        <FormField label="Language spoken">
          <NativeSelect value={language} onChange={(e) => setLanguage(e.target.value)}>
            <NativeSelectOption value="en-US">English</NativeSelectOption>
            <NativeSelectOption value="en-GB">English (UK)</NativeSelectOption>
            <NativeSelectOption value="fr-FR">French</NativeSelectOption>
            <NativeSelectOption value="ar-SA">Arabic</NativeSelectOption>
            <NativeSelectOption value="es-ES">Spanish</NativeSelectOption>
            <NativeSelectOption value="pt-PT">Portuguese</NativeSelectOption>
          </NativeSelect>
        </FormField>
        <CheckboxField
          label="Live captions"
          description={!SpeechRecognitionCtor() ? `Not available in this browser${serverTranscription ? ' — the server can transcribe afterwards' : ''}` : undefined}
          checked={captions}
          disabled={!SpeechRecognitionCtor()}
          onCheckedChange={setCaptions}
        />
        <CheckboxField label="Everyone in this meeting knows it is being recorded and agrees." checked={consent} onCheckedChange={setConsent} required />
        <p className="text-xs text-muted-foreground">People invited to the meeting are notified, and anyone viewing it in Küü sees that it is being recorded.</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!consent} type="submit">
            <span className="size-2 rounded-full bg-current" aria-hidden="true" /> Start recording
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RecordingItem({ rec, serverTranscription, onChange, meetingTitle }: { rec: Recording; serverTranscription: boolean; onChange: () => void; meetingTitle: string }) {
  const act = useAction();
  const confirm = useConfirm();
  const player = useRef<HTMLMediaElement | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [now, setNow] = useState(0);
  const { data: transcript } = useApi<{ source: 'live' | 'server'; segments: Segment[] }>(open ? `/recordings/${rec.id}/transcript` : null, [rec.transcript_status]);
  const seek = (ms: number) => {
    if (!player.current) return;
    player.current.currentTime = ms / 1000;
    void player.current.play().catch(() => {});
  };
  const shown = (transcript?.segments ?? []).filter((s) => !q || s.text.toLowerCase().includes(q.toLowerCase()));
  const download = () => {
    const text = (transcript?.segments ?? []).map((s) => `[${clock(s.start_ms)}] ${s.speaker_name ? `${s.speaker_name}: ` : ''}${s.text}`).join('\n');
    const url = URL.createObjectURL(new Blob([`${meetingTitle}\n\n${text}\n`], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meetingTitle.replace(/[^\w\- ]+/g, '').trim() || 'meeting'} transcript.txt`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const statusText: Record<Recording['transcript_status'], string> = {
    none: 'No transcript',
    live: 'Live captions',
    queued: 'Transcript queued…',
    processing: 'Transcribing…',
    done: 'Transcript ready',
    failed: 'Transcription failed',
  };
  const media = rec.media_url ?? '';
  return (
    <div className="recording-item flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Icon name={rec.kind === 'screen' ? 'video' : 'mic'} size={16} className="text-muted-foreground" />
        <strong className="font-semibold tabular-nums">{clock(rec.duration_sec * 1000)}</strong>
        <span className="text-xs text-muted-foreground">
          by {rec.started_by?.name} · {timeAgo(rec.started_at)} · {fmtBytes(rec.size)}
        </span>
        <span className="min-w-0 flex-1" />
        <Pill tone={rec.transcript_status === 'failed' ? 'danger' : rec.transcript_status === 'done' ? 'success' : 'neutral'} title={rec.transcript_error ?? undefined}>
          {statusText[rec.transcript_status]}
        </Pill>
      </div>
      {rec.kind === 'screen' ? (
        <video ref={(el) => void (player.current = el)} className="max-h-96 w-full rounded-lg bg-black" controls preload="metadata" src={media} onTimeUpdate={(e) => setNow(e.currentTarget.currentTime * 1000)} />
      ) : (
        <audio ref={(el) => void (player.current = el)} className="w-full" controls preload="metadata" src={media} onTimeUpdate={(e) => setNow(e.currentTarget.currentTime * 1000)} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {(rec.segment_count > 0 || rec.transcript_status === 'done') && (
          <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <Icon name="transcript" data-icon="inline-start" /> {open ? 'Hide transcript' : 'Transcript'}
          </Button>
        )}
        {serverTranscription && !['queued', 'processing'].includes(rec.transcript_status) && (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (await act(() => api.post(`/recordings/${rec.id}/transcribe`), 'Transcription started')) onChange();
            }}
          >
            {rec.transcript_status === 'done' ? 'Transcribe again' : 'Transcribe'}
          </Button>
        )}
        <a href={`${media}?download=1`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          <Icon name="download" data-icon="inline-start" />
          Download
        </a>
        {rec.can_delete && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={async () => {
              if (!(await confirm({ title: 'Delete this recording?', description: 'Its transcript is deleted too. This cannot be undone.', confirmLabel: 'Delete recording', destructive: true }))) return;
              if (await act(() => api.del(`/recordings/${rec.id}`), 'Recording deleted')) onChange();
            }}
          >
            <Icon name="trash" data-icon="inline-start" /> Delete
          </Button>
        )}
      </div>
      {open && transcript && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the transcript" aria-label="Search the transcript" className="min-w-0 flex-1" />
            <Button variant="outline" size="sm" onClick={download}>
              Save as text
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{transcript.source === 'server' ? 'Full transcript' : 'Live captions from the recording device'} · may contain recognition mistakes</p>
          <ol className="flex max-h-80 flex-col gap-0.5 overflow-y-auto text-sm">
            {shown.map((s) => {
              const current = now >= s.start_ms && now < (s.end_ms ?? s.start_ms) + 500;
              return (
                <li key={s.id} className={cn('flex gap-3 rounded-lg px-2 py-1', current && 'bg-accent')}>
                  <Button variant="link" size="inline" className="shrink-0 font-mono text-xs tabular-nums" onClick={() => seek(s.start_ms)} aria-label={`Play from ${clock(s.start_ms)}`}>
                    {clock(s.start_ms)}
                  </Button>
                  <span>
                    {s.speaker_name && <strong className="font-semibold">{s.speaker_name}: </strong>}
                    {s.text}
                  </span>
                </li>
              );
            })}
            {!shown.length && <li className="px-2 text-muted-foreground">{q ? 'No matches.' : 'Nothing was transcribed.'}</li>}
          </ol>
        </div>
      )}
    </div>
  );
}
