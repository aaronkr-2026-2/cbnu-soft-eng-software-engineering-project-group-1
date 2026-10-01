import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { AuthLayout } from "@/components/AuthLayout";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { register as registerRequest, MOCK_AUTH, mockRegister } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";

const schema = z
  .object({
    fullName: z.string().min(2, "Enter your full name"),
    email: z.string().email("Enter a valid email address"),
    phone: z
      .string()
      .min(9, "Enter a complete phone number")
      .regex(/^[0-9+\s]+$/, "Digits only"),
    role: z.enum(["patient", "doctor", "hospital_admin"]),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

const ROLES: { value: FormValues["role"]; label: string; hint: string }[] = [
  { value: "patient", label: "Patient", hint: "Book appointments & search medicine" },
  { value: "doctor", label: "Doctor", hint: "Requires hospital approval" },
  { value: "hospital_admin", label: "Hospital Admin", hint: "Requires manual verification" },
];

export default function Register() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: "patient" },
  });

  const selectedRole = watch("role");

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setLoading(true);
    try {
      const { data } = MOCK_AUTH
        ? await mockRegister(values.fullName, values.email)
        : await registerRequest(values);
      setSession(data.user, data.accessToken);
      navigate("/dashboard");
    } catch (err: any) {
      setServerError(
        err?.response?.data?.message || "Something went wrong while signing up. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Join us"
      title="Create your account in under a minute."
      subtitle="Sign up as a patient, doctor, or hospital and connect to the MedConnect network."
    >
      <h2 className="font-display text-2xl font-medium text-ink-900">Create an account</h2>
      <p className="mt-1.5 text-sm text-ink-500">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-pine-700 hover:underline">
          Sign in
        </Link>
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-700">I am signing up as</span>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setValue("role", r.value)}
                className={clsx(
                  "rounded-lg border px-2.5 py-2.5 text-left text-xs transition-colors",
                  selectedRole === r.value
                    ? "border-pine-700 bg-pine-100 text-pine-900"
                    : "border-ink-900/12 bg-white text-ink-500 hover:border-pine-700/40"
                )}
              >
                <span className="block text-sm font-semibold">{r.label}</span>
                <span className="mt-0.5 block leading-snug text-ink-500">{r.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <TextField label="Full name" placeholder="Aziza Karimova" error={errors.fullName?.message} {...register("fullName")} />
        <TextField label="Email" type="email" placeholder="name@example.com" error={errors.email?.message} {...register("email")} />
        <TextField label="Phone number" placeholder="+998 90 123 45 67" error={errors.phone?.message} {...register("phone")} />

        <div className="grid grid-cols-2 gap-3">
          <TextField label="Password" type="password" placeholder="••••••••" error={errors.password?.message} {...register("password")} />
          <TextField label="Confirm password" type="password" placeholder="••••••••" error={errors.confirmPassword?.message} {...register("confirmPassword")} />
        </div>

        {serverError && (
          <div className="rounded-lg bg-rose-100 px-3.5 py-2.5 text-sm text-rose-600">{serverError}</div>
        )}

        <p className="text-xs leading-relaxed text-ink-500">
          By signing up you agree to MedConnect's{" "}
          <a href="#" className="font-medium text-pine-700 hover:underline">Terms of Service</a> and{" "}
          <a href="#" className="font-medium text-pine-700 hover:underline">Privacy Policy</a>.
        </p>

        <Button type="submit" loading={loading} className="mt-1 w-full">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
