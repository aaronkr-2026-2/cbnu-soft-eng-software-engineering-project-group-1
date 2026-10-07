import { MapPin, Briefcase, Building2 } from "lucide-react";
import type { MemberProfile } from "@/types";

export function DoctorProfile({ doctor }: { doctor: MemberProfile }) {
  return (
    <div className="rounded-xl border border-ink-900/8 bg-white p-6 shadow-card">
      <div className="flex gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-pine-100 text-2xl font-bold text-pine-700">
          {doctor.memberFullName?.[0] ?? doctor.memberNick?.[0] ?? "D"}
        </div>

        <div className="flex-1">
          <h2 className="font-display text-xl font-medium text-ink-900">
            {doctor.memberFullName || doctor.memberNick || "Doctor profile"}
          </h2>

          {doctor.doctorSpecializations?.length ? (
            <div className="mt-1 flex items-center gap-2 text-sm text-ink-600">
              <Briefcase size={14} />
              <span>{doctor.doctorSpecializations.join(", ")}</span>
            </div>
          ) : null}

          <div className="mt-2 text-sm text-ink-500">
            Clinic status: {" "}
            <span
              className={
                doctor.doctorClinicStatus === "APPROVED"
                  ? "font-semibold text-green-600"
                  : doctor.doctorClinicStatus === "PENDING"
                    ? "font-semibold text-amber-600"
                    : "font-semibold text-rose-600"
              }
            >
              {doctor.doctorClinicStatus}
            </span>
          </div>
        </div>
      </div>

      {doctor.memberDesc && (
        <div className="mt-5 border-t border-ink-900/8 pt-4">
          <p className="text-sm leading-6 text-ink-700">{doctor.memberDesc}</p>
        </div>
      )}

      {doctor.memberAddress && (
        <div className="mt-3 flex items-start gap-2 text-sm text-ink-600">
          <MapPin size={16} className="mt-0.5 shrink-0" />
          <p>{doctor.memberAddress}</p>
        </div>
      )}

      {doctor.clinicName && (
        <div className="mt-3 flex items-center gap-2 text-sm text-ink-600">
          <Building2 size={16} className="shrink-0" />
          <span>{doctor.clinicName}</span>
        </div>
      )}
    </div>
  );
}
