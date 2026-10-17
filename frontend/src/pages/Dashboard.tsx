import { CalendarCheck, CheckCircle2, Ban, ListChecks } from "lucide-react";
import { Link } from "react-router-dom";
import { StatCard } from "@/components/StatCard";
import { AppointmentCard } from "@/components/AppointmentCard";
import { useAuthStore } from "@/lib/auth";
import { useDirectory, useMyAppointmentList } from "@/lib/queries";
import { MapPin } from "lucide-react";

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const firstName =
    user?.fullName?.replace(/^dr\.?\s+/i, "").split(" ")[0] || "there";
  const { appointments, isLoading } = useMyAppointmentList();
  const { directory, isLoading: dirLoading } = useDirectory();

  const now = Date.now();
  const active = (s: string) => s === "PENDING" || s === "CONFIRMED";
  const upcoming = appointments
    .filter((a) => active(a.status) && +new Date(a.startsAt) >= now)
    .sort((x, y) => +new Date(x.startsAt) - +new Date(y.startsAt));
  const completed = appointments.filter((a) => a.status === "COMPLETED").length;
  const canceled = appointments.filter((a) => a.status === "CANCELED" || a.status === "NO_SHOW").length;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium text-ink-900">Welcome back, {firstName}</h1>
          <p className="mt-1 text-sm text-ink-500">Here's an overview of your appointments.</p>
        </div>
        {user?.role === "patient" && (
        <Link
            to="/dashboard/appointments"
            className="inline-flex items-center justify-center rounded-lg bg-pine-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-pine-900"
          >
            Book new appointment
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Upcoming appointments" value={upcoming.length} icon={CalendarCheck} tone="pine" />
        <StatCard label="Completed visits" value={completed} icon={CheckCircle2} tone="pine" />
        <StatCard label="Canceled / no-show" value={canceled} icon={Ban} tone="rose" />
        <StatCard label="Total appointments" value={appointments.length} icon={ListChecks} tone="amber" />
      </div>

      <div className="mt-8 rounded-xl2 border border-ink-900/8 bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-ink-900/8 px-6 py-4">
          <h2 className="font-display text-lg font-medium text-ink-900">Upcoming appointments</h2>
          <Link to="/dashboard/appointments" className="text-sm font-medium text-pine-700 hover:underline">
            View all
          </Link>
        </div>
        {isLoading ? (
          <p className="px-6 py-8 text-sm text-ink-500">Loading…</p>
        ) : upcoming.length === 0 ? (
          <p className="px-6 py-8 text-sm text-ink-500">No upcoming appointments.</p>
        ) : (
          <ul className="divide-y divide-ink-900/6">
            {upcoming.slice(0, 5).map((a) => (
              <AppointmentCard key={a._id} appointment={a} />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8 rounded-xl2 border border-ink-900/8 bg-white shadow-card">
        <div className="border-b border-ink-900/8 px-6 py-4">
          <h2 className="font-display text-lg font-medium text-ink-900">Clinics &amp; doctors</h2>
        </div>
        {dirLoading ? (
          <p className="px-6 py-8 text-sm text-ink-500">Loading…</p>
        ) : directory.length === 0 ? (
          <p className="px-6 py-8 text-sm text-ink-500">No clinics yet.</p>
        ) : (
          <ul className="divide-y divide-ink-900/6">
            {directory.map(({ clinic: c, doctors }) => (
              <li key={c._id} className="px-6 py-4">
                <p className="text-sm font-semibold text-ink-900">{c.clinicName}</p>
                {c.memberAddress && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                    <MapPin size={12} /> {c.memberAddress}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {doctors.map((d) => (
                    <Link
                      key={d._id}
                      to={`/dashboard/appointments?clinic=${c._id}&doctor=${d._id}`}
                      className="rounded-lg border border-ink-900/10 px-3 py-1.5 text-xs text-ink-700 hover:bg-pine-100 hover:text-pine-900"
                    >
                      {d.memberFullName || d.memberNick}
                      {d.doctorSpecializations?.length
                        ? ` · ${d.doctorSpecializations.map((x) => x.charAt(0) + x.slice(1).toLowerCase()).join(", ")}`
                        : ""}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
