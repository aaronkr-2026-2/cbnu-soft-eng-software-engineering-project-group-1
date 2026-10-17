import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bookAppointment,
  getAppointment,
  getClinicDoctors,
  getClinics,
  getHealth,
  getMember,
  getMyAppointments,
} from "./api";
import { useAuthStore } from "./auth";

export function useMember(id?: string | null) {
  return useQuery({
    queryKey: ["member", id],
    queryFn: () => getMember(id as string),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useAppointment(id: string) {
  return useQuery({ queryKey: ["appointment", id], queryFn: () => getAppointment(id) });
}

// Appointment'lar bazadan (GraphQL myAppointments) o'qiladi
export function useMyAppointmentList() {
  const userId = useAuthStore((s) => s.user?.id);
  const q = useQuery({ queryKey: ["myAppointments", userId], queryFn: getMyAppointments, enabled: !!userId });
  return {
    appointments: q.data ?? [],
    isLoading: q.isLoading,
    error: q.error,
  };
}

export function useBookAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: bookAppointment,
    onSuccess: (appointment) => {
      qc.setQueryData(["appointment", appointment._id], appointment);
      void qc.invalidateQueries({ queryKey: ["myAppointments"] });
    },
  });
}

// Klinikalar va ularning tasdiqlangan shifokorlari (bazadan)
export function useDirectory() {
  const clinics = useQuery({ queryKey: ["clinics"], queryFn: getClinics, staleTime: 60_000 });
  const doctors = useQueries({
    queries: (clinics.data ?? []).map((c) => ({
      queryKey: ["clinicDoctors", c._id],
      queryFn: () => getClinicDoctors(c._id),
      staleTime: 60_000,
    })),
  });
  const directory = (clinics.data ?? []).map((c, i) => ({ clinic: c, doctors: doctors[i]?.data ?? [] }));
  return { directory, isLoading: clinics.isLoading || doctors.some((d) => d.isLoading), error: clinics.error };
}

export function useHealth() {
  return useQuery({ queryKey: ["health"], queryFn: getHealth, refetchInterval: 30_000 });
}
