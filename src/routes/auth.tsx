import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { PageLayout } from "@/components/layout/PageLayout";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "Sign In — KAPTAN" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: { full_name: fullName },
          },
        });

        if (error) throw error;

        toast.success("Account created. Please check your email to confirm.");
        setMode("signin");
      }

      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) throw error;

        toast.success("Welcome back!");
        navigate({ to: "/" });
      }

      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });

        if (error) throw error;

        toast.success("Password reset link sent. Check your email.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);

    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });

    if (result.error) {
      toast.error("Google sign-in failed");
      setLoading(false);
      return;
    }

    if (result.redirected) return;

    navigate({ to: "/" });
  }

  return (
    <PageLayout>
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16">
        <Link to="/" className="font-serif text-2xl tracking-[0.2em] text-gold">
          KAPTAN
        </Link>

        <h1 className="mt-6 font-serif text-3xl font-semibold text-white">
          {mode === "signin" && "Welcome Back"}
          {mode === "signup" && "Create Account"}
          {mode === "forgot" && "Recover Account"}
        </h1>

        <p className="mt-2 text-sm text-white/60">
          {mode === "signin" && "Sign in to continue your journey."}
          {mode === "signup" && "Join the KAPTAN family."}
          {mode === "forgot" && "Enter your email to reset your password."}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 w-full space-y-4">
          {mode === "signup" && (
            <Field
              label="Full Name"
              value={fullName}
              onChange={setFullName}
              required
            />
          )}

          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            required
          />

          {mode !== "forgot" && (
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              required
            />
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold py-3 text-sm font-bold uppercase tracking-wider text-black transition-colors hover:bg-gold-vivid disabled:opacity-50"
          >
            {loading && "Please wait..."}
            {!loading && mode === "signin" && "Sign In"}
            {!loading && mode === "signup" && "Create Account"}
            {!loading && mode === "forgot" && "Send Reset Link"}
          </button>
        </form>

        {mode !== "forgot" && (
          <>
            <div className="my-6 flex w-full items-center gap-3">
              <div className="h-px flex-1 bg-gold/20" />
              <span className="text-xs text-gold/50">OR</span>
              <div className="h-px flex-1 bg-gold/20" />
            </div>

            <button
              onClick={handleGoogle}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 border border-gold/30 bg-black py-3 text-sm font-semibold text-white transition-colors hover:bg-gold/10 disabled:opacity-50"
            >
              Continue with Google
            </button>
          </>
        )}

        {mode === "signin" && (
          <>
            <button
              onClick={() => setMode("forgot")}
              className="mt-5 text-sm text-gold/70 hover:text-gold"
            >
              Forgot password?
            </button>

            <button
              onClick={() => setMode("signup")}
              className="mt-4 text-sm text-gold/70 hover:text-gold"
            >
              Need an account? Sign up
            </button>
          </>
        )}

        {mode === "signup" && (
          <button
            onClick={() => setMode("signin")}
            className="mt-6 text-sm text-gold/70 hover:text-gold"
          >
            Already have an account? Sign in
          </button>
        )}

        {mode === "forgot" && (
          <button
            onClick={() => setMode("signin")}
            className="mt-6 text-sm text-gold/70 hover:text-gold"
          >
            Back to sign in
          </button>
        )}
      </div>
    </PageLayout>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">
        {label}
      </span>
      <input
        type={type}
        required={required}
        minLength={type === "password" ? 6 : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gold/30 bg-black px-3 py-2.5 text-white outline-none focus:border-gold"
      />
    </label>
  );
}