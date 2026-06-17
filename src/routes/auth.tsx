import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { PageLayout } from "@/components/layout/PageLayout";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In — KAPTAN" },
      { name: "description", content: "Sign in or create your KAPTAN account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Account created. Check your email to confirm.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate({ to: "/" });
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
        <Link to="/" className="font-serif text-2xl tracking-[0.2em] text-gold">KAPTAN</Link>
        <h1 className="mt-6 font-serif text-3xl font-semibold text-white">
          {mode === "signin" ? "Welcome Back" : "Create Account"}
        </h1>
        <p className="mt-2 text-sm text-white/60">
          {mode === "signin" ? "Sign in to continue your journey." : "Join the KAPTAN family."}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 w-full space-y-4">
          {mode === "signup" && (
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-gold/70">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full border border-gold/30 bg-black px-3 py-2.5 text-white outline-none focus:border-gold"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-gold/70">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gold/30 bg-black px-3 py-2.5 text-white outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-gold/70">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gold/30 bg-black px-3 py-2.5 text-white outline-none focus:border-gold"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold py-3 text-sm font-bold uppercase tracking-wider text-black transition-colors hover:bg-gold-vivid disabled:opacity-50"
          >
            {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

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
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#fff" d="M21.35 11.1H12v3.2h5.35c-.23 1.4-1.7 4.1-5.35 4.1-3.2 0-5.8-2.65-5.8-5.9s2.6-5.9 5.8-5.9c1.85 0 3.05.78 3.75 1.45l2.55-2.45C16.85 3.8 14.7 3 12 3 6.95 3 2.85 7.05 2.85 12s4.1 9 9.15 9c5.3 0 8.8-3.7 8.8-8.9 0-.6-.05-1.05-.15-1.5z"/></svg>
          Continue with Google
        </button>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-6 text-sm text-gold/70 hover:text-gold"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </PageLayout>
  );
}
