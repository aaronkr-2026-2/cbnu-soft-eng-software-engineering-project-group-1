import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", loading, className, children, disabled, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-60",
          variant === "primary" && "bg-pine-700 text-white hover:bg-pine-900",
          variant === "secondary" &&
            "border border-ink-900/10 bg-white text-ink-900 hover:bg-sand-100",
          variant === "ghost" && "text-pine-700 hover:bg-pine-100",
          className
        )}
        {...rest}
      >
        {loading && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
