import { LucideIcon } from "lucide-react";
import clsx from "clsx";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "pine" | "amber" | "rose";
}

const TONES = {
  pine: "bg-pine-100 text-pine-700",
  amber: "bg-amber-100 text-amber-600",
  rose: "bg-rose-100 text-rose-600",
};

export function StatCard({ label, value, icon: Icon, tone = "pine" }: StatCardProps) {
  return (
    <div className="rounded-xl2 border border-ink-900/8 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-500">{label}</p>
        <div className={clsx("flex h-8 w-8 items-center justify-center rounded-lg", TONES[tone])}>
          <Icon size={16} strokeWidth={2.2} />
        </div>
      </div>
      <p className="mt-3 font-display text-3xl font-medium text-ink-900">{value}</p>
    </div>
  );
}
