'use client';

// The file waiting above the composer text box (ui-screens 5.10). What it shows comes from
// `trayView`; this component only lays it out.
import { Play, X } from 'lucide-react';
import type { JSX } from 'react';

import { cn } from '@/common/common.logic';
import { testIds } from '@/common/test-ids';

import type { TrayView } from './inbox.attachment';

export function AttachmentTray({
  view,
  onCancel,
}: {
  view: TrayView;
  onCancel: () => void;
}): JSX.Element {
  const percent = view.progress ?? null;
  return (
    <div
      data-testid={testIds.attachmentTray}
      data-state={view.status}
      className="mb-1 flex h-[76px] items-center gap-3"
    >
      <div
        data-testid={testIds.attachmentPreview}
        className="relative size-16 shrink-0 overflow-hidden rounded-[10px] bg-line"
      >
        {view.previewUrl !== null && (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob: preview, nothing to optimise
          <img src={view.previewUrl} alt="" className="size-full object-cover" />
        )}
        {view.kind === 'video' && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-7 items-center justify-center rounded-full bg-[rgba(25,19,39,.55)] text-white">
              <Play aria-hidden="true" className="size-3.5 fill-current" />
            </span>
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate py-0.5 text-sub leading-normal text-fg">{view.fileName}</p>
        <p
          data-testid={testIds.attachmentStatus}
          data-code={view.code}
          className={cn(
            'py-0.5 text-sub leading-normal',
            view.tone === 'danger' ? 'text-danger' : 'text-muted',
          )}
        >
          {view.text}
        </p>
        {view.progress !== undefined && (
          <div
            data-testid={testIds.attachmentProgress}
            role="progressbar"
            aria-label={view.announce}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
            className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-line"
          >
            <div
              className={cn(
                'h-full rounded-full bg-accent transition-[width] duration-200',
                percent === null && 'w-1/3 animate-pulse',
              )}
              style={percent === null ? undefined : { width: `${String(percent)}%` }}
            />
          </div>
        )}
        {/* One announcement per step, not per percent. */}
        <span className="sr-only" aria-live="polite">
          {view.announce}
        </span>
      </div>

      <button
        type="button"
        data-testid={testIds.attachmentCancel}
        aria-label={view.buttonLabel}
        onClick={onCancel}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-selected hover:text-fg medium:size-8"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
