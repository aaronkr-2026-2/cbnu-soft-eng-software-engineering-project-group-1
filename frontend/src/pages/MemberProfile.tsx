import { Clock, MapPin, Building2 } from "lucide-react";
import type { MemberProfile } from "@/types";

export function ClinicProfile({ clinic }: { clinic: MemberProfile }) {
  return (
    <div className="rounded-xl border border-ink-900/8 bg-white p-6 shadow-card">
      <div className="flex gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-pine-100 text-2xl font-bold text-pine-700">
          {clinic.clinicName?.[0] ?? "C"}
        </div>

        <div className="flex-1">
          <h2 className="font-display text-xl font-medium text-ink-900">
            {clinic.clinicName || "Clinic profile"}
          </h2>

          {clinic.clinicTimezone && (
            <div className="mt-1 flex items-center gap-2 text-sm text-ink-600">
              <Clock size={14} />
              <span>{clinic.clinicTimezone}</span>
            </div>
          )}
        </div>
      </div>

      {clinic.memberDesc && (
        <div className="mt-5 border-t border-ink-900/8 pt-4">
          <p className="text-sm leading-6 text-ink-700">{clinic.memberDesc}</p>
        </div>
      )}

      {clinic.memberAddress && (
        <div className="mt-3 flex items-start gap-2 text-sm text-ink-600">
          <MapPin size={16} className="mt-0.5 shrink-0" />
          <p>{clinic.memberAddress}</p>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 text-sm text-ink-600">
        <Building2 size={16} className="shrink-0" />
        <span>Clinic profile</span>
      </div>
    </div>
  );
}
