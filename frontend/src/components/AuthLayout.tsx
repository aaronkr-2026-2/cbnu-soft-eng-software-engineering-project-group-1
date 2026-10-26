import { ReactNode } from "react";

interface AuthLayoutProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AuthLayout({ eyebrow, title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-pine-900 px-12 py-12 text-sand-50 lg:flex">
        <BrandMark />

        <div className="relative z-10 max-w-sm">
          <p className="mb-4 text-sm font-medium uppercase tracking-wide text-pine-200/80">
            {eyebrow}
          </p>
          <h1 className="font-display text-4xl font-medium leading-tight text-white">
            {title}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-pine-200/90">{subtitle}</p>
        </div>

        <div className="relative z-10 flex items-center gap-6 text-xs text-pine-200/70">
          <span>32 cities</span>
          <span className="h-1 w-1 rounded-full bg-pine-200/40" />
          <span>410+ hospitals</span>
          <span className="h-1 w-1 rounded-full bg-pine-200/40" />
          <span>1,200+ doctors</span>
        </div>

        <NetworkArt />
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-sand-50 px-6 py-12">
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="relative z-10 flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect width="28" height="28" rx="8" fill="#E9F3EE" />
        <path d="M14 7v14M7 14h14" stroke="#0B2B24" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      <span className="font-display text-lg font-semibold tracking-tight text-white">
        MedConnect
      </span>
    </div>
  );
}

function NetworkArt() {
  return (
    <svg
      className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[60%] w-full opacity-90"
      viewBox="0 0 560 420"
      fill="none"
      preserveAspectRatio="xMidYMax slice"
    >
      <g stroke="#238066" strokeOpacity="0.35" strokeWidth="1">
        <line x1="60" y1="360" x2="200" y2="260" />
        <line x1="200" y1="260" x2="360" y2="300" />
        <line x1="360" y1="300" x2="500" y2="220" />
        <line x1="200" y1="260" x2="320" y2="150" />
        <line x1="320" y1="150" x2="480" y2="120" />
      </g>
      <g fill="#0F6E5B" fillOpacity="0.55">
        <circle cx="60" cy="360" r="5" />
        <circle cx="200" cy="260" r="7" />
        <circle cx="360" cy="300" r="4" />
        <circle cx="500" cy="220" r="6" />
        <circle cx="320" cy="150" r="4" />
        <circle cx="480" cy="120" r="8" />
      </g>
    </svg>
  );
}
