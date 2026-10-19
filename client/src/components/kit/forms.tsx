import { Children, cloneElement, isValidElement, useId, useState, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldTitle } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';

/** Give a single child control an id (or reuse its own) so the label points at it. */
function useLabelledChild(children: ReactNode) {
  const generated = useId();
  const only = Children.count(children) === 1 && isValidElement(children) ? (children as ReactElement<{ id?: string }>) : null;
  if (!only) return { id: undefined, control: children };
  const id = only.props.id ?? generated;
  return { id, control: only.props.id ? only : cloneElement(only, { id }) };
}

/**
 * A labelled form control with an optional hint and error.
 * `<FormField label="Title"><Input value={…} /></FormField>`
 */
export function FormField({
  label,
  hint,
  error,
  children,
  className,
  orientation,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  orientation?: 'vertical' | 'horizontal' | 'responsive';
}) {
  const { id, control } = useLabelledChild(children);
  if (!id)
    // Several controls: label them all by wrapping, as a plain <label> would.
    return (
      <Field className={className} orientation={orientation} data-invalid={error ? true : undefined}>
        <label className="flex flex-col gap-2">
          <span className="text-sm leading-snug font-medium">{label}</span>
          {control}
        </label>
        {hint && <FieldDescription>{hint}</FieldDescription>}
        {error && <FieldError>{error}</FieldError>}
      </Field>
    );
  return (
    <Field className={className} orientation={orientation} data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {control}
      {hint && <FieldDescription>{hint}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

/** A password box with a show/hide toggle, so people can check what they typed on a phone keyboard. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const [shown, setShown] = useState(false);
  return (
    <InputGroup className={className}>
      <InputGroupInput {...props} type={shown ? 'text' : 'password'} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" onClick={() => setShown((v) => !v)} aria-label={shown ? 'Hide' : 'Show'} title={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}>
          {shown ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

/** A setting that is on or off: a switch with its label and an optional description. */
export function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
  id: givenId,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const generated = useId();
  const id = givenId ?? generated;
  return (
    <Field orientation="horizontal" className={className} data-disabled={disabled || undefined}>
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </Field>
  );
}

/** A checkbox with its label (and an optional line of description underneath). */
export function CheckboxField({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
  id: givenId,
  name,
  required,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  required?: boolean;
}) {
  const generated = useId();
  const id = givenId ?? generated;
  return (
    <Field orientation="horizontal" className={className} data-disabled={disabled || undefined}>
      <Checkbox id={id} name={name} required={required} checked={checked} onCheckedChange={(v) => onCheckedChange(!!v)} disabled={disabled} />
      {description ? (
        <FieldContent>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <FieldDescription>{description}</FieldDescription>
        </FieldContent>
      ) : (
        <FieldLabel htmlFor={id} className="font-normal">
          {label}
        </FieldLabel>
      )}
    </Field>
  );
}

export interface Option<T extends string = string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

/** A native select (works with every keyboard, screen reader and phone picker), styled as shadcn. */
export function Select<T extends string = string>({
  options,
  value,
  onValueChange,
  placeholder,
  className,
  size,
  ...props
}: Omit<ComponentProps<typeof NativeSelect>, 'value' | 'onChange'> & {
  options: Option<T>[];
  value: T | '' | null | undefined;
  onValueChange: (value: T) => void;
  placeholder?: string;
}) {
  return (
    <NativeSelect className={cn('w-full', className)} size={size} value={value ?? ''} onChange={(e) => onValueChange(e.target.value as T)} {...props}>
      {placeholder !== undefined && <NativeSelectOption value="">{placeholder}</NativeSelectOption>}
      {options.map((o) => (
        <NativeSelectOption key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/** The row of buttons at the end of a form. */
export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center justify-end gap-2', className)}>{children}</div>;
}

/** A form-level error message under the fields. */
export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p className="text-sm text-destructive" role="alert">
      {children}
    </p>
  );
}

export { FieldTitle };

/** Pick one of the app's colours (projects, labels). Each swatch is a toggle with the colour's name. */
export function ColorSwatches({ colors, value, onChange, 'aria-label': ariaLabel = 'Colour' }: { colors: string[]; value: string; onChange: (c: string) => void; 'aria-label'?: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      {colors.map((c) => (
        <button
          type="button"
          key={c}
          aria-label={c}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={cn(
            'size-7 rounded-full ring-offset-2 ring-offset-background transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
            value === c && 'ring-2 ring-foreground',
          )}
          style={{ background: `var(--c-${c})` }}
        />
      ))}
    </div>
  );
}
