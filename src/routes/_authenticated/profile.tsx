import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { useAuthStore } from "@/stores/authStore";
import { PageLayout } from "@/components/layout/PageLayout";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "My Profile — KAPTAN" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuthStore();
  const fetchProfile = useServerFn(getMyProfile);
  const updateFn = useServerFn(updateMyProfile);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile(),
  });

  const [form, setForm] = useState({ full_name: "", phone: "", date_of_birth: "", email_marketing: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.profile) {
      setForm({
        full_name: data.profile.full_name ?? "",
        phone: data.profile.phone ?? "",
        date_of_birth: data.profile.date_of_birth ?? "",
        email_marketing: !!data.profile.email_marketing,
      });
    }
  }, [data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateFn({
        data: {
          full_name: form.full_name || null,
          phone: form.phone || null,
          date_of_birth: form.date_of_birth || null,
          email_marketing: form.email_marketing,
        },
      });
      toast.success("Profile updated");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageLayout>
      <section className="mx-auto max-w-5xl px-4 py-12 md:px-6">
        <h1 className="font-serif text-4xl font-semibold text-white">My Account</h1>

        <div className="mt-6 flex flex-wrap gap-4 border-b border-gold/10 pb-4 text-sm">
          <Link to="/profile" className="text-gold">Profile</Link>
          <Link to="/orders" className="text-white/60 hover:text-gold">Orders</Link>
          <Link to="/wishlist" className="text-white/60 hover:text-gold">Wishlist</Link>
        </div>

        {isLoading ? (
          <p className="mt-10 text-white/60">Loading…</p>
        ) : (
          <form onSubmit={save} className="mt-8 max-w-xl space-y-4">
            <div>
              <span className="text-xs uppercase tracking-wider text-gold/70">Email</span>
              <p className="font-mono text-sm text-white/80">{user?.email}</p>
            </div>
            <Field label="Full Name" value={form.full_name} onChange={(v) => setForm((f) => ({ ...f, full_name: v }))} />
            <Field label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
            <Field label="Date of Birth" type="date" value={form.date_of_birth} onChange={(v) => setForm((f) => ({ ...f, date_of_birth: v }))} />

            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={form.email_marketing}
                onChange={(e) => setForm((f) => ({ ...f, email_marketing: e.target.checked }))}
                className="accent-gold"
              />
              Send me updates and offers via email
            </label>

            <button
              type="submit"
              disabled={saving}
              className="bg-gold px-6 py-2 text-sm font-bold uppercase tracking-wider text-black hover:bg-gold-vivid disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </form>
        )}
      </section>
    </PageLayout>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gold/20 bg-[#1A1A1A] px-3 py-2 text-sm text-white outline-none focus:border-gold"
      />
    </label>
  );
}
