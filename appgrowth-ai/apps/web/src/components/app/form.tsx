'use client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { FieldError, UseFormRegisterReturn } from 'react-hook-form';

/** Labelled input with its validation message wired up for screen readers. */
export function Field({ label, id, error, hint, reg, textarea, ...rest }: {
  label: string; id: string; error?: FieldError; hint?: string; reg: UseFormRegisterReturn; textarea?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'>) {
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {textarea
        ? <Textarea id={id} aria-invalid={!!error} aria-describedby={describedBy} {...reg} />
        : <Input id={id} aria-invalid={!!error} aria-describedby={describedBy} {...rest} {...reg} />}
      {error ? <p id={`${id}-err`} className="text-xs text-destructive">{error.message}</p> : hint ? <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,128}$/;
export const strongPasswordMsg = 'At least 10 characters with upper and lower case letters and a number';
