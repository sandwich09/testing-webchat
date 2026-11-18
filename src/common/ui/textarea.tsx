import * as React from 'react';

import { cn } from '@/common/common.logic';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-[13px] border border-line bg-surface px-3.5 py-2.5 text-[16px] leading-normal text-fg transition-[color,box-shadow] outline-none placeholder:text-muted medium:text-[15px]',
        'focus-visible:border-accent-strong focus-visible:ring-[3px] focus-visible:ring-accent-strong/30',
        'aria-invalid:border-danger aria-invalid:ring-danger/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
