import type { InputHTMLAttributes } from "react";

type FormFieldProps = Readonly<{
  id: string;
  label: string;
  description?: string;
  error?: string;
  inputProps?: Readonly<Omit<InputHTMLAttributes<HTMLInputElement>, "id">>;
}>;

export function FormField({
  id,
  label,
  description,
  error,
  inputProps,
}: FormFieldProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(
    (value): value is string => value !== undefined,
  );

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      {description ? (
        <p id={descriptionId} className="text-sm text-soft">
          {description}
        </p>
      ) : null}
      <input
        {...inputProps}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy.length > 0 ? describedBy.join(" ") : undefined}
        className={`ui-field-control ${inputProps?.className ?? ""}`.trim()}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
