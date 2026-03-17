import { forwardRef, type LabelHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('text-sm font-medium text-[var(--text-primary)] leading-none', className)}
      {...props}
    />
  ),
);
Label.displayName = 'Label';

export { Label };
