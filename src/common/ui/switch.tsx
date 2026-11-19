'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

import { cn } from '@/common/common.logic';

// The "on" colour is `accent` (#F0055A): a switch has no text on it (frontend.md, colours).
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // The ::after layer widens the touch target to 44x44 without changing the drawn size.
        "peer relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-full border border-transparent transition-colors after:absolute after:-inset-x-[3px] after:-inset-y-[12px] after:content-[''] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent data-[state=unchecked]:bg-[#CFC8D4]",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-[18px] rounded-full bg-white shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-[2px]"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
