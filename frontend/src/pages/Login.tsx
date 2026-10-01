import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";

import { AuthLayout } from "@/components/AuthLayout";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { mockLogin } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";

const schema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),

  password: z.string().min(6, "Password must be at least 6 characters"),
});

type FormValues = z.infer<typeof schema>;

export default function Login() {
  const navigate = useNavigate();

  const setSession = useAuthStore((state) => state.setSession);

  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setLoading(true);

    try {
      // Mock login — backendga request yuborilmaydi
      const { data } = await mockLogin(values.email);

      console.log("Mock login:", data);

      // User sessionni saqlash
      setSession(data.user, data.accessToken);

      // Dashboardga o'tish
      navigate("/dashboard");
    } catch (error) {
      console.error("Login error:", error);

      setServerError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Find your doctor, book a visit, check medicine stock — all in one place."
      subtitle="MedConnect brings together hospitals, doctors, and medicine availability across every city in one platform."
    >
      <h2 className="font-display text-2xl font-medium text-ink-900">
        Sign in to your account
      </h2>

      {/* Mock mode indicator */}
      <p className="mt-2 inline-block rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-600">
        Mock mode — any valid email/password logs you in
      </p>

      <p className="mt-1.5 text-sm text-ink-500">
        Don't have an account?{" "}
        <Link
          to="/register"
          className="font-medium text-pine-700 hover:underline"
        >
          Sign up
        </Link>
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-7 flex flex-col gap-4"
      >
        <TextField
          label="Email"
          type="email"
          placeholder="name@example.com"
          error={errors.email?.message}
          disabled={loading}
          {...register("email")}
        />

        <TextField
          label="Password"
          type="password"
          placeholder="••••••••"
          error={errors.password?.message}
          disabled={loading}
          {...register("password")}
        />

        {serverError && (
          <div className="rounded-lg bg-rose-100 px-3.5 py-2.5 text-sm text-rose-600">
            {serverError}
          </div>
        )}

        <div className="mt-1 flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-ink-500">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-900/20 text-pine-700"
              disabled={loading}
            />
            Remember me
          </label>

          <a href="#" className="font-medium text-pine-700 hover:underline">
            Forgot password?
          </a>
        </div>

        <Button type="submit" loading={loading} className="mt-2 w-full">
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
