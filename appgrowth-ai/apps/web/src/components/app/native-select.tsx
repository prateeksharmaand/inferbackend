import { cn } from 'cn';
import { forwardRef } from 'react';

/** Styled native <select>: accessible, works with react-hook-form register(), fine on mobile. */
export const NativeSelect = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }>(
  ({ options, placeholder, className, ...props }, ref) => (
    <select ref={ref} className={cn('h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30', className)} {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
);
NativeSelect.displayName = 'NativeSelect';
