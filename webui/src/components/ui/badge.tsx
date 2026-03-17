import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-[var(--accent-dim)] text-[var(--accent)]',
        secondary: 'border-transparent bg-white/[0.06] text-[var(--text-secondary)]',
        destructive: 'border-transparent bg-[var(--red-dim)] text-[var(--red)]',
        outline: 'border-[var(--glass-border)] text-[var(--text-secondary)]',
        success: 'border-transparent bg-[var(--green-dim)] text-[var(--green)]',
        warning: 'border-transparent bg-[var(--amber-dim)] text-[var(--amber)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
