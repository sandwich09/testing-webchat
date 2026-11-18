import * as React from 'react';

import { cn } from '@/common/common.logic';

// 16px on a narrow screen so iPhone does not zoom, 15px from 720px (ui-screens 1.2).
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'selection:bg-accent-strong selection:text-white file:text-fg placeholder:text-muted',
        'h-11 w-full min-w-0 rounded-[13px] border border-line bg-surface px-3.5 py-1 text-[16px] leading-normal text-fg transition-[color,box-shadow] outline-none medium:h-10 medium:text-[15px]',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sub file:font-bold',
        'focus-visible:border-accent-strong focus-visible:ring-[3px] focus-visible:ring-accent-strong/30',
        'aria-invalid:border-danger aria-invalid:ring-danger/20',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
