import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function DashboardLayout() {
  return (
    <div className="flex min-h-screen bg-sand-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-8 lg:px-12">
        <Outlet />
      </main>
    </div>
  );
}
