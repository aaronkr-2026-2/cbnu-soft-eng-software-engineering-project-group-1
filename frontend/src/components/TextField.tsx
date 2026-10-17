import { InputHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, className, id, ...rest }, ref) => {
    const inputId = id || label.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-ink-700">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            "rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300",
            "focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700",
            error ? "border-rose-600" : "border-ink-900/12",
            className
          )}
          {...rest}
        />
        {error && <span className="text-xs font-medium text-rose-600">{error}</span>}
      </div>
    );
  }
);
TextField.displayName = "TextField";
