'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ExternalLink, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { testIds } from '@/common/test-ids';
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from '@/common/ui/dialog';
import { copy } from '@/features/inbox/inbox.constants';
import type { ThreadMessage } from '@/features/inbox/inbox.logic';

type MediaLightboxProps = {
  /** The image or video to show, or null when closed. */
  message: ThreadMessage | null;
  onClose: () => void;
  /** Where focus goes on close: the preview that was pressed. */
  returnFocusTo?: HTMLElement | null;
};

const ICON_BUTTON =
  'flex size-11 items-center justify-center rounded-full text-white hover:bg-white/15 focus-visible:outline-white';

/** The media itself. Keyed by URL by the caller so a failed load does not stick to the next file. */
function LightboxMedia({ message }: { message: ThreadMessage }) {
  const [failed, setFailed] = useState(false);
  const isVideo = message.type === 'video';
  const url = message.media?.url ?? null;
  // Stable on purpose: a new callback each render would run the cleanup (pause) on every render.
  const pauseOnRemove = useCallback((element: HTMLVideoElement) => {
    // Closing removes the element; stop the sound at once instead of waiting for cleanup.
    return () => {
      element.pause();
    };
  }, []);

  if (url === null || failed) {
    return (
      <p className="px-6 text-center text-body text-white">
        {isVideo ? copy.media.videoFailed : copy.media.imageFailed}
      </p>
    );
  }

  if (isVideo) {
    return (
      <video
        ref={pauseOnRemove}
        src={url}
        controls
        playsInline
        preload="metadata"
        onError={() => {
          setFailed(true);
        }}
        className="max-h-full max-w-full object-contain"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- plain <img> by design (frontend.md)
    <img
      src={url}
      alt={copy.media.image}
      onError={() => {
        setFailed(true);
      }}
      className="max-h-full max-w-full object-contain"
    />
  );
}

/**
 * Full-screen view of an image or video (ui-screens 6.4). Focus starts on the close button,
 * Escape closes, and focus goes back to the preview that was pressed.
 */
export function MediaLightbox({ message, onClose, returnFocusTo }: MediaLightboxProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const url = message?.media?.url ?? null;

  return (
    <Dialog
      open={message !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="bg-fg/92" />
        <DialogPrimitive.Content
          data-testid={testIds.mediaLightbox}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            closeRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            if (returnFocusTo?.isConnected === true) {
              event.preventDefault();
              returnFocusTo.focus();
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center outline-none"
        >
          <DialogTitle className="sr-only">{copy.lightbox.label}</DialogTitle>

          {/* Pressing the dark area outside the media closes the view. */}
          <div
            className="flex size-full items-center justify-center p-0 medium:p-14"
            onClick={(event) => {
              if (event.target === event.currentTarget) onClose();
            }}
          >
            {message === null ? null : <LightboxMedia key={url ?? message.id} message={message} />}
          </div>

          <div className="absolute top-0 right-0 flex gap-1 p-1 medium:p-2">
            {url === null ? null : (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={copy.lightbox.openOriginal}
                data-testid={testIds.lightboxOpenOriginal}
                className={ICON_BUTTON}
              >
                <ExternalLink aria-hidden="true" className="size-6" />
              </a>
            )}
            <button
              ref={closeRef}
              type="button"
              aria-label={copy.lightbox.close}
              data-testid={testIds.lightboxClose}
              onClick={onClose}
              className={ICON_BUTTON}
            >
              <X aria-hidden="true" className="size-6" />
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
