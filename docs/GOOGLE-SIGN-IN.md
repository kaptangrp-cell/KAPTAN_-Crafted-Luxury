# Google sign-in setup and verification

The Google button now calls Supabase Auth directly. Previously it called Lovable Cloud OAuth, which does not use the Google provider configured in your Supabase dashboard. The new `/auth/callback` page completes the return to the store and displays a retry link for failed or cancelled sign-in. The screenshot alone does not establish the exact old redirect URL.

## Required dashboard settings

1. In **Supabase → Authentication → Providers → Google**, enable Google and save the Google OAuth client ID and secret. Use the same Supabase project as the store's Vercel environment variables.
2. Copy the callback URL shown in that provider panel (normally `https://<project-ref>.supabase.co/auth/v1/callback`). Add that exact URL to **Google Cloud Console → APIs & Services → Credentials → your Web application OAuth client → Authorized redirect URIs**. This is the Supabase URL, not the store URL.
3. In **Supabase → Authentication → URL Configuration**, set **Site URL** to the store's exact production origin. Add `https://YOUR-STORE-DOMAIN/auth/callback` to **Redirect URLs**, replacing the placeholder with your domain. Add each exact origin you actually use (including www if applicable). Keep existing email confirmation and password recovery redirect URLs.
4. Add your store origin to Google's **Authorized JavaScript origins**. If the Google consent app is in Testing, add the Google account you are testing with as a test user.
5. Deploy the code changes. Dashboard settings alone do not add the new callback route to an old deployment.

Do not share callback query strings, URL fragments, OAuth secrets, or access tokens.

## Customer checks after deployment

- In a private window, choose Continue with Google, select an allowed Google account, and approve. Expect a return to the store homepage with the account signed in, not a 404. Refresh and confirm the session persists.
- Sign out and repeat with the same Google account. Expect the same customer identity and only that customer's orders.
- Cancel consent. If Google redirects back, expect a friendly failure message and Back to sign in; if Google stays on its own cancellation screen, navigate back to the store to retry.
- Open `/auth/callback` in a signed-out private window without OAuth parameters. Expect a retry message, not a 404 or a false successful login.
- Recheck email/password login, signup confirmation, and password reset. Their existing flows are unchanged.

The shared Supabase browser client currently uses its default implicit flow and automatically reads the returned session. If switching to PKCE later, update callback handling and test password recovery as part of that change.

References: https://supabase.com/docs/guides/auth/social-login/auth-google and https://supabase.com/docs/guides/auth/redirect-urls
