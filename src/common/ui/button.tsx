import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/common/common.logic';

// Shapes follow docs/architecture/frontend.md: capsule buttons, bold labels (weight 700).
// `secondary` is the button of the settings page; `default` (primary) appears only in dialogs and
// the welcome page, at most once per screen (docs/guidelines/ux-writing.md).
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sub font-bold whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'border border-line bg-surface text-fg hover:bg-selected',
        destructive: 'bg-danger text-white hover:bg-danger/90',
        ghost: 'text-fg hover:bg-selected',
        link: 'rounded-none text-fg underline underline-offset-4 hover:no-underline',
      },
      size: {
        // 36px, and 44px on a narrow screen (ui-screens 9.2, frontend accessibility)
        default: 'h-11 px-4 medium:h-9',
        sm: 'h-11 min-w-11 gap-1.5 px-3 medium:h-8 medium:min-w-0',
        lg: 'h-12 px-6 text-section',
        icon: 'size-11 medium:size-9',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
