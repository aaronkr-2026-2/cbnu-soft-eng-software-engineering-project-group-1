import { Clock, MapPin } from "lucide-react";
import { useMember } from "@/lib/queries";
import type { AppointmentRecord, AppointmentStatus } from "@/types";

const STATUS: Record<AppointmentStatus, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-amber-100 text-amber-600" },
  CONFIRMED: { label: "Confirmed", className: "bg-pine-100 text-pine-700" },
  COMPLETED: { label: "Completed", className: "bg-ink-900/6 text-ink-500" },
  CANCELED: { label: "Canceled", className: "bg-rose-100 text-rose-600" },
  NO_SHOW: { label: "No-show", className: "bg-rose-100 text-rose-600" },
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, className } = STATUS[status] ?? STATUS.PENDING;
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

export function AppointmentCard({ appointment: a }: { appointment: AppointmentRecord }) {
  const doctor = useMember(a.doctorId).data;
  const clinic = useMember(a.clinicId).data;
  const doctorName = doctor?.memberFullName || doctor?.memberNick || "Doctor";
  const start = new Date(a.startsAt);
  const timeZone = clinic?.clinicTimezone || undefined; // klinika vaqt zonasida ko'rsatiladi

  return (
    <li className="flex items-center justify-between gap-4 px-6 py-4">
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-pine-100 text-sm font-semibold text-pine-700">
          {doctorName[0]?.toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-900">{doctorName}</p>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-ink-500">
            {doctor?.doctorSpecializations?.length ? (
              <span>{doctor.doctorSpecializations.map(titleCase).join(", ")}</span>
            ) : null}
            <span className="flex items-center gap-1">
              <MapPin size={12} /> {clinic?.clinicName || clinic?.memberNick || "Clinic"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-right text-xs text-ink-500">
          <p className="flex items-center justify-end gap-1 font-medium text-ink-700">
            <Clock size={12} />
            {start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone })}
          </p>
          <p>{start.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone })}</p>
        </div>
        <StatusBadge status={a.status} />
      </div>
    </li>
  );
}

function titleCase(v: string) {
  return v.charAt(0) + v.slice(1).toLowerCase();
}
