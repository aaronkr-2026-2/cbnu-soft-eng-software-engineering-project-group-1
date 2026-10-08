import { useAuthStore } from "@/lib/auth";
import { useHealth, useMember } from "@/lib/queries";

export default function Profile() {
  const user = useAuthStore((s) => s.user);
  const { data: member, isLoading, error } = useMember(user?.id);
  const health = useHealth();

  const rows: [string, string | null | undefined][] = [
    ["Full name", member?.memberFullName],
    ["Nickname", member?.memberNick],
    ["Email", user?.email],
    ["Account type", member?.memberType],
    ["Status", member?.memberStatus],
    ["Clinic", member?.clinicName],
    ["Timezone", member?.memberType === "CLINIC" ? member.clinicTimezone : null],
    ["Address", member?.memberAddress],
    ["About", member?.memberDesc],
    ["Specializations", member?.doctorSpecializations?.join(", ")],
  ];

  const ok = health.data?.status === "ok";

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-medium text-ink-900">Profile</h1>

      <div className="mt-6 rounded-xl2 border border-ink-900/8 bg-white shadow-card">
        {isLoading ? (
          <p className="px-6 py-8 text-sm text-ink-500">Loading…</p>
        ) : error ? (
          <p className="px-6 py-8 text-sm text-rose-600">Couldn't load your profile.</p>
        ) : (
          <dl className="divide-y divide-ink-900/6">
            {rows
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-6 py-3.5 text-sm">
                  <dt className="text-ink-500">{k}</dt>
                  <dd className="text-right font-medium text-ink-900">{v}</dd>
                </div>
              ))}
          </dl>
        )}
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-xl2 border border-ink-900/8 bg-white px-6 py-4 shadow-card text-sm">
        <span className={`h-2.5 w-2.5 rounded-full ${health.isLoading ? "bg-amber-600" : ok ? "bg-pine-700" : "bg-rose-600"}`} />
        <span className="text-ink-700">
          API: {health.isLoading ? "checking…" : ok ? "ready" : "unavailable"}
          {health.data?.database ? ` · database ${health.data.database}` : ""}
        </span>
      </div>
    </div>
  );
}
