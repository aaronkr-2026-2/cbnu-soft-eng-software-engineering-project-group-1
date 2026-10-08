import { CalendarCheck, CheckCircle2, Heart, Star, MapPin, Clock } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/Button";
import { useAuthStore } from "@/lib/auth";
import type { Appointment } from "@/types";

// Placeholder data — replace with a `useQuery` call to GET /api/v1/appointments/me
const MOCK_APPOINTMENTS: Appointment[] = [
  {
    id: "1",
    doctorName: "Dr. Nodira Yusupova",
    hospitalName: "Tashkent Medical Plaza",
    specialty: "Cardiologist",
    date: "2026-09-15",
    time: "10:30",
    status: "confirmed",
  },
  {
    id: "2",
    doctorName: "Dr. Sardor Aliyev",
    hospitalName: "National Oncology Center",
    specialty: "Dermatologist",
    date: "2026-09-18",
    time: "14:00",
    status: "pending",
  },
  {
    id: "3",
    doctorName: "Dr. Kamola Rashidova",
    hospitalName: "Shifo Med Clinic",
    specialty: "General Practitioner",
    date: "2026-09-22",
    time: "09:15",
    status: "confirmed",
  },
];

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.fullName?.split(" ")[0] ?? "there";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium text-ink-900">
            Welcome back, {firstName}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Here's an overview of your appointments and health activity.
          </p>
        </div>
        <Button>Book new appointment</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Upcoming appointments" value={2} icon={CalendarCheck} tone="pine" />
        <StatCard label="Completed visits" value={14} icon={CheckCircle2} tone="pine" />
        <StatCard label="Saved hospitals" value={5} icon={Heart} tone="rose" />
        <StatCard label="Reviews given" value="4.6" icon={Star} tone="amber" />
      </div>

      <div className="mt-8 rounded-xl2 border border-ink-900/8 bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-ink-900/8 px-6 py-4">
          <h2 className="font-display text-lg font-medium text-ink-900">Upcoming appointments</h2>
          <a href="#" className="text-sm font-medium text-pine-700 hover:underline">
            View all
          </a>
        </div>

        <ul className="divide-y divide-ink-900/6">
          {MOCK_APPOINTMENTS.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-4 px-6 py-4">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-pine-100 text-sm font-semibold text-pine-700">
                  {a.doctorName
                    .split(" ")
                    .slice(-1)[0]?.[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink-900">{a.doctorName}</p>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-ink-500">
                    <span>{a.specialty}</span>
                    <span className="flex items-center gap-1">
                      <MapPin size={12} /> {a.hospitalName}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right text-xs text-ink-500">
                  <p className="flex items-center justify-end gap-1 font-medium text-ink-700">
                    <Clock size={12} /> {a.time}
                  </p>
                  <p>{formatDate(a.date)}</p>
                </div>
                <StatusBadge status={a.status} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "long" });
}

function StatusBadge({ status }: { status: Appointment["status"] }) {
  const map: Record<Appointment["status"], { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-amber-100 text-amber-600" },
    confirmed: { label: "Confirmed", className: "bg-pine-100 text-pine-700" },
    completed: { label: "Completed", className: "bg-ink-900/6 text-ink-500" },
    cancelled: { label: "Cancelled", className: "bg-rose-100 text-rose-600" },
    no_show: { label: "No-show", className: "bg-rose-100 text-rose-600" },
  };
  const { label, className } = map[status];
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{label}</span>
  );
}
