import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSearchParams } from "react-router-dom";
import { forwardRef, type SelectHTMLAttributes } from "react";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { AppointmentCard } from "@/components/AppointmentCard";
import { errorMessage } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import { clinicLocalToUtcIso } from "@/lib/directory";
import { useBookAppointment, useDirectory, useMyAppointmentList } from "@/lib/queries";

const SELECT_CLASS =
  "rounded-lg border border-ink-900/12 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700";

const SelectField = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }
>(({ label, error, children, ...rest }, ref) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-sm font-medium text-ink-700">{label}</label>
    <select ref={ref} className={SELECT_CLASS} {...rest}>
      {children}
    </select>
    {error && <span className="text-xs font-medium text-rose-600">{error}</span>}
  </div>
));
SelectField.displayName = "SelectField";

const bookSchema = z.object({
  clinicId: z.string().min(1, "Choose a clinic"),
  doctorId: z.string().min(1, "Choose a doctor"),
  startsAt: z.string().min(1, "Choose date and time"),
});
type BookValues = z.infer<typeof bookSchema>;

const titleCase = (v: string) => v.charAt(0) + v.slice(1).toLowerCase();

export default function Appointments() {
  const user = useAuthStore((s) => s.user);
  const [params] = useSearchParams();
  const { appointments, isLoading, error } = useMyAppointmentList();
  const { directory, isLoading: dirLoading } = useDirectory();
  const book = useBookAppointment();
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const canBook = user?.role === "patient";

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BookValues>({ resolver: zodResolver(bookSchema) });

  const clinicId = watch("clinicId");
  const selected = directory.find((d) => d.clinic._id === clinicId);

  // Katalog yuklangach (yoki ?clinic=&doctor= bo'lsa) klinikani oldindan tanlash
  useEffect(() => {
    if (!directory.length || clinicId) return;
    const pre = directory.find((d) => d.clinic._id === params.get("clinic")) ?? directory[0];
    setValue("clinicId", pre.clinic._id);
  }, [directory, clinicId, params, setValue]);

  // Shifokorni opsiyalar chizilgandan keyin tanlash (aks holda brauzer birinchisini tanlab qoladi)
  const doctorPreselected = useRef(false);
  useEffect(() => {
    const want = params.get("doctor");
    if (doctorPreselected.current || !want || !selected?.doctors.some((d) => d._id === want)) return;
    doctorPreselected.current = true;
    setValue("doctorId", want);
  }, [selected, params, setValue]);

  async function onBook(values: BookValues) {
    setMessage(null);
    try {
      await book.mutateAsync({
        doctorId: values.doctorId,
        clinicId: values.clinicId,
        // Kiritilgan vaqt klinikaning vaqt zonasida; backend'ga UTC ISO ko'rinishida yuboriladi
        startsAt: clinicLocalToUtcIso(values.startsAt, selected?.clinic.clinicTimezone ?? "UTC"),
      });
      setMessage({ type: "ok", text: "Appointment booked." });
      reset({ clinicId: values.clinicId, doctorId: values.doctorId, startsAt: "" });
    } catch (err) {
      setMessage({ type: "error", text: errorMessage(err, "Could not book the appointment.") });
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-medium text-ink-900">My appointments</h1>
      <p className="mt-1 text-sm text-ink-500">Book a 30-minute visit with an approved doctor.</p>

      {message && (
        <div
          className={`mt-5 rounded-lg px-3.5 py-2.5 text-sm ${
            message.type === "ok" ? "bg-pine-100 text-pine-900" : "bg-rose-100 text-rose-600"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="mt-6 rounded-xl2 border border-ink-900/8 bg-white p-6 shadow-card">
        <h2 className="font-display text-lg font-medium text-ink-900">Book new appointment</h2>
        {!canBook ? (
          <p className="mt-4 text-sm text-ink-500">Only patient accounts can book appointments.</p>
        ) : dirLoading ? (
          <p className="mt-4 text-sm text-ink-500">Loading clinics…</p>
        ) : (
          <form onSubmit={handleSubmit(onBook)} className="mt-4 flex flex-col gap-4">
            <SelectField
              label="Clinic"
              error={errors.clinicId?.message}
              {...register("clinicId", {
                onChange: (e) =>
                  setValue("doctorId", directory.find((d) => d.clinic._id === e.target.value)?.doctors[0]?._id ?? ""),
              })}
            >
              {directory.map(({ clinic }) => (
                <option key={clinic._id} value={clinic._id}>
                  {clinic.clinicName}
                </option>
              ))}
            </SelectField>
            {selected?.clinic.memberAddress && (
              <p className="-mt-2 text-xs text-ink-500">{selected.clinic.memberAddress}</p>
            )}
            <SelectField label="Doctor" error={errors.doctorId?.message} {...register("doctorId")}>
              {selected?.doctors.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.memberFullName || d.memberNick}
                  {d.doctorSpecializations?.length ? ` · ${d.doctorSpecializations.map(titleCase).join(", ")}` : ""}
                </option>
              ))}
            </SelectField>
            <TextField
              label={`Date and time (${selected?.clinic.clinicTimezone ?? "clinic"} time)`}
              type="datetime-local"
              step={1800}
              error={errors.startsAt?.message}
              {...register("startsAt")}
            />
            <Button type="submit" loading={book.isPending}>
              Book appointment
            </Button>
          </form>
        )}
      </section>

      <div className="mt-8 rounded-xl2 border border-ink-900/8 bg-white shadow-card">
        <div className="border-b border-ink-900/8 px-6 py-4">
          <h2 className="font-display text-lg font-medium text-ink-900">Your appointments</h2>
        </div>
        {isLoading ? (
          <p className="px-6 py-8 text-sm text-ink-500">Loading…</p>
        ) : error ? (
          <p className="px-6 py-8 text-sm text-rose-600">{errorMessage(error, "Couldn't load appointments.")}</p>
        ) : appointments.length === 0 ? (
          <p className="px-6 py-8 text-sm text-ink-500">No appointments yet.</p>
        ) : (
          <ul className="divide-y divide-ink-900/6">
            {appointments.map((a) => (
              <AppointmentCard key={a._id} appointment={a} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
