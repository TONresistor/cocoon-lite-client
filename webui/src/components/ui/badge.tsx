import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-[var(--accent-pastel-bg)] text-[var(--accent-pastel)]',
        secondary: 'border-transparent bg-white/[0.06] text-[var(--text-secondary)]',
        destructive: 'border-transparent bg-[var(--red-pastel-bg)] text-[var(--red-pastel)]',
        outline: 'border-[var(--glass-border)] text-[var(--text-secondary)]',
        success: 'border-transparent bg-[var(--green-pastel-bg)] text-[var(--green-pastel)]',
        warning: 'border-transparent bg-[var(--amber-pastel-bg)] text-[var(--amber-pastel)]',
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
