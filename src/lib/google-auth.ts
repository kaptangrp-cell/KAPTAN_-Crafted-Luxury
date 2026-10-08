import type { SupabaseClient } from "@supabase/supabase-js";

type Auth = SupabaseClient["auth"];

export async function startGoogleSignIn(auth: Pick<Auth, "signInWithOAuth">, origin: string) {
  const { data, error } = await auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: new URL("/auth/callback", origin).href },
  });
  if (error) throw error;
  if (!data.url) throw new Error("Google sign-in did not return a redirect URL");
}

export async function completeGoogleSignIn(auth: Pick<Auth, "getSession">, returnUrl: string) {
  const url = new URL(returnUrl);
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (
    [url.searchParams, fragment].some(
      (params) => params.has("error") || params.has("error_description"),
    )
  ) {
    throw new Error("Google sign-in was cancelled or could not be completed");
  }
  // The shared Supabase client uses implicit flow. getSession waits for its
  // automatic URL/session initialization; do not parse or persist tokens here.
  const { data, error } = await auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("No sign-in session was received");
}
