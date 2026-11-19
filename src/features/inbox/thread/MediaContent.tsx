'use client';

import { FileWarning, ImageOff, Paperclip, Play } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/common/common.logic';
import { testIds } from '@/common/test-ids';
import { copy } from '@/features/inbox/inbox.constants';
import type { ThreadMessage } from '@/features/inbox/inbox.logic';
import type { MediaView } from '@/features/inbox/thread/inbox.thread.logic';

type MediaContentProps = {
  message: ThreadMessage;
  view: MediaView;
  /** Opens the lightbox. `trigger` is the button that was pressed, so focus can return to it. */
  onOpen: (message: ThreadMessage, trigger: HTMLElement) => void;
  /** The sticker picture did not load: the bubble shows the sticker text instead. */
  onStickerError: () => void;
};

/** Picture, video preview, sticker or "other" content of a bubble (ui-screens 5.3 table). */
export function MediaContent({ message, view, onOpen, onStickerError }: MediaContentProps) {
  const common = {
    'data-testid': testIds.messageMedia,
    'data-media-kind': view.kind,
  } as const;

  if (view.kind === 'sticker') {
    return (
      <div {...common}>
        {view.src === null ? null : (
          // eslint-disable-next-line @next/next/no-img-element -- plain lazy <img> by design (frontend.md)
          <img
            src={view.src}
            alt={copy.media.sticker}
            width={120}
            height={120}
            loading="lazy"
            onError={onStickerError}
            className="block size-[120px] object-contain"
          />
        )}
      </div>
    );
  }

  if (view.kind === 'other') {
    return (
      <div {...common} className="flex items-start gap-2 px-3 py-2">
        <Paperclip aria-hidden="true" className="mt-[3px] size-4 shrink-0 text-muted" />
        <div className="min-w-0">
          <p className="text-body">{view.label}</p>
          <p className="text-sub text-muted">{copy.media.otherHint}</p>
        </div>
      </div>
    );
  }

  const failedText = view.kind === 'image' ? copy.media.imageFailed : copy.media.videoFailed;

  switch (view.state) {
    case 'pending':
      return (
        <div
          {...common}
          className="flex h-[180px] w-60 max-w-full animate-pulse items-center justify-center bg-line px-3 text-center text-sub text-muted"
        >
          {copy.media.loading}
        </div>
      );
    case 'failed':
      return (
        <div {...common} className="flex h-[72px] w-60 max-w-full items-center gap-2 px-3">
          <ImageOff aria-hidden="true" className="size-5 shrink-0 text-muted" />
          <p className="text-sub text-muted">{failedText}</p>
        </div>
      );
    case 'too_large':
      return (
        <div {...common} className="flex items-start gap-2 px-3 py-2">
          <FileWarning aria-hidden="true" className="mt-[3px] size-4 shrink-0 text-muted" />
          <p className="text-sub [overflow-wrap:anywhere] text-muted">{copy.media.tooLarge}</p>
        </div>
      );
    case 'picture':
      return (
        <PictureButton
          key={view.src}
          message={message}
          kind={view.kind}
          src={view.src ?? ''}
          openable={view.openable}
          onOpen={onOpen}
          failedText={failedText}
          common={common}
        />
      );
  }
}

type PictureButtonProps = {
  message: ThreadMessage;
  kind: 'image' | 'video';
  src: string;
  openable: boolean;
  onOpen: MediaContentProps['onOpen'];
  failedText: string;
  common: { 'data-testid': string; 'data-media-kind': string };
};

/** The picture of an image or the first frame of a video; a button when it can open the lightbox. */
function PictureButton({
  message,
  kind,
  src,
  openable,
  onOpen,
  failedText,
  common,
}: PictureButtonProps) {
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <div {...common} className="flex h-[72px] w-60 max-w-full items-center gap-2 px-3">
        <ImageOff aria-hidden="true" className="size-5 shrink-0 text-muted" />
        <p className="text-sub text-muted">{failedText}</p>
      </div>
    );
  }

  const picture = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- plain lazy <img> by design (frontend.md) */}
      <img
        src={src}
        alt={kind === 'video' ? copy.media.video : copy.media.image}
        loading="lazy"
        onLoad={() => {
          setLoaded(true);
        }}
        onError={() => {
          setBroken(true);
        }}
        className={cn(
          'block h-auto max-h-[320px] w-auto max-w-60 object-contain',
          !loaded && 'min-h-[120px] min-w-[120px] bg-line',
        )}
      />
      {kind === 'video' ? (
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-fg/55 text-white"
        >
          <Play className="size-5 fill-current" />
        </span>
      ) : null}
    </>
  );

  if (!openable) {
    return (
      <div {...common} className="relative">
        {picture}
      </div>
    );
  }

  return (
    <button
      type="button"
      {...common}
      aria-label={kind === 'video' ? copy.media.play : copy.media.openImage}
      onClick={(event) => {
        onOpen(message, event.currentTarget);
      }}
      className="relative block focus-visible:outline-offset-[-2px]"
    >
      {picture}
    </button>
  );
}
