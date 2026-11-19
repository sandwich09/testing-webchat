'use client';

import { Pause, Play } from 'lucide-react';
import { useRef, useState } from 'react';

import { testIds } from '@/common/test-ids';
import { copy } from '@/features/inbox/inbox.constants';
import { useOnlyOnePlaying } from '@/features/inbox/thread/inbox.audio.hooks';
import { audioProgress, formatAudioTime } from '@/features/inbox/thread/inbox.thread.logic';

type AudioPlayerProps = {
  src: string;
  /** From the LINE event, shown until the file's own length is known. */
  durationMs: number | null;
  onError: () => void;
};

/**
 * A small themed player over a hidden `<audio>` (ui-screens 5.3): play or pause, a seek bar and
 * elapsed / total time. No autoplay; starting one player pauses any other.
 */
export function AudioPlayer({ src, durationMs, onError }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState<number | null>(durationMs === null ? null : durationMs / 1000);
  useOnlyOnePlaying(audioRef);

  const toggle = () => {
    const audio = audioRef.current;
    if (audio === null) return;
    if (audio.paused) {
      audio.play().catch(() => {
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  };

  const progress = audioProgress(current, total);
  return (
    <div
      data-testid={testIds.messageAudio}
      data-playing={isPlaying ? 'true' : 'false'}
      className="flex w-64 max-w-full items-center gap-2 px-2 py-1.5"
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => {
          setIsPlaying(true);
        }}
        onPause={() => {
          setIsPlaying(false);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={(event) => {
          setCurrent(event.currentTarget.currentTime);
        }}
        onLoadedMetadata={(event) => {
          const d = event.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setTotal(d);
        }}
        onError={onError}
      />
      <button
        type="button"
        data-testid={testIds.messageAudioToggle}
        aria-label={isPlaying ? copy.media.audioPause : copy.media.audioPlay}
        onClick={toggle}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-strong text-white hover:bg-accent-strong/90"
      >
        {isPlaying ? (
          <Pause aria-hidden="true" className="size-5 fill-current" />
        ) : (
          <Play aria-hidden="true" className="ml-0.5 size-5 fill-current" />
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <input
          type="range"
          aria-label={copy.media.audioProgress}
          aria-valuetext={`${formatAudioTime(current)} / ${formatAudioTime(total ?? 0)}`}
          min={0}
          max={1000}
          step={1}
          value={Math.round(progress * 1000)}
          disabled={total === null}
          onChange={(event) => {
            const audio = audioRef.current;
            if (audio === null || total === null) return;
            audio.currentTime = (Number(event.target.value) / 1000) * total;
            setCurrent(audio.currentTime);
          }}
          className="h-5 w-full cursor-pointer accent-accent-strong disabled:cursor-default"
        />
        <p className="text-meta text-muted tabular-nums">
          {formatAudioTime(current)} / {total === null ? '-:--' : formatAudioTime(total)}
        </p>
      </div>
    </div>
  );
}
