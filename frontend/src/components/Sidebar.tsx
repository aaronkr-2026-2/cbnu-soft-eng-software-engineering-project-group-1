import { NavLink } from "react-router-dom";
import clsx from "clsx";
import {
  LayoutGrid,
  CalendarCheck,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuthStore } from "@/lib/auth";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Overview", icon: LayoutGrid },
  { to: "/dashboard/appointments", label: "My appointments", icon: CalendarCheck },
  { to: "/dashboard/settings", label: "Profile", icon: Settings },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-ink-900/8 bg-white">
      <div className="flex items-center gap-2.5 px-6 py-6">
        <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
          <rect width="28" height="28" rx="8" fill="#0F6E5B" />
          <path d="M14 7v14M7 14h14" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
        <span className="font-display text-lg font-semibold text-ink-900">MedConnect</span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/dashboard"}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-pine-100 text-pine-900"
                  : "text-ink-500 hover:bg-sand-100 hover:text-ink-900"
              )
            }
          >
            <Icon size={18} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-ink-900/8 p-4">
        <div className="mb-3 flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-pine-700 text-sm font-semibold text-white">
            {user?.fullName?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-900">{user?.fullName ?? "User"}</p>
            <p className="truncate text-xs text-ink-500">{roleLabel(user?.role)}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium text-ink-500 hover:bg-sand-100 hover:text-rose-600"
        >
          <LogOut size={18} strokeWidth={2} />
          Log out
        </button>
      </div>
    </aside>
  );
}

function roleLabel(role?: string) {
  switch (role) {
    case "patient":
      return "Patient";
    case "doctor":
      return "Doctor";
    case "hospital_admin":
      return "Hospital Admin";
    case "super_admin":
      return "Super Admin";
    default:
      return "";
  }
}
