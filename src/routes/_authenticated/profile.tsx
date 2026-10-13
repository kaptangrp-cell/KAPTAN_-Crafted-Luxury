import { AvatarPicker } from "@/components/account/AvatarPicker";
import { AccountHeader } from "@/components/account/AccountHeader";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { useAuthStore } from "@/stores/authStore";
import { PageLayout } from "@/components/layout/PageLayout";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "My Profile — KAPTAN" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const fetchProfile = useServerFn(getMyProfile);
  const updateFn = useServerFn(updateMyProfile);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: Boolean(user),
    queryFn: () => fetchProfile(),
  });

  const [form, setForm] = useState({
    avatar_url: null as string | null,
    full_name: "",
    phone: "",
    date_of_birth: "",
    email_marketing: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.profile) {
      setForm({
        avatar_url: data.profile.avatar_url,
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
      const result = await updateFn({
        data: {
          ...(form.avatar_url !== data?.profile.avatar_url ? { avatar_url: form.avatar_url } : {}),
          full_name: form.full_name || null,
          phone: form.phone || null,
          date_of_birth: form.date_of_birth || null,
          email_marketing: form.email_marketing,
        },
      });
      useAuthStore
        .getState()
        .setProfile({
          ...result.profile,
          role: result.profile.role === "admin" ? "admin" : "customer",
        });
      toast.success(t("profile.updatedToast"));
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("profile.saveFailedToast"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageLayout>
      <section className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <AccountHeader active="profile" />

        {isLoading ? (
          <p className="mt-10 text-white/60">{t("account.loading")}</p>
        ) : isError ? (
          <div role="alert" className="rounded-2xl border border-gold/20 p-6 text-white/70">
            <p>{t("accountStyle.loadFailed")}</p>
            <button onClick={() => void refetch()} className="mt-3 text-gold">
              {t("orders.retry")}
            </button>
          </div>
        ) : (
          <form
            onSubmit={save}
            className="rounded-2xl border border-gold/15 bg-[#0D0D0D] p-5 sm:p-8"
          >
            <AvatarPicker
              value={form.avatar_url}
              onChange={(avatar_url) => setForm((current) => ({ ...current, avatar_url }))}
            />
            <div className="mb-7 border-b border-gold/10 pb-6">
              <h2 className="font-serif text-xl text-white">{t("accountStyle.personalDetails")}</h2>
              <p className="mt-2 text-sm text-white/50">{t("accountStyle.personalHint")}</p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-xl border border-gold/10 bg-[#1A1A1A] px-4 py-3">
                <span className="text-xs uppercase tracking-wider text-gold/70">
                  {t("profile.emailLabel")}
                </span>
                <p className="mt-2 break-all text-sm text-white/80">{user?.email}</p>
              </div>
              <Field
                label={t("profile.fullNameLabel")}
                value={form.full_name}
                onChange={(v) => setForm((f) => ({ ...f, full_name: v }))}
              />
              <Field
                label={t("profile.phoneLabel")}
                type="tel"
                value={form.phone}
                onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
              />
              <Field
                label={t("profile.dobLabel")}
                type="date"
                value={form.date_of_birth}
                onChange={(v) => setForm((f) => ({ ...f, date_of_birth: v }))}
              />
            </div>
            <label className="my-7 flex items-start gap-3 rounded-xl border border-gold/10 bg-gold/5 p-4 text-sm leading-relaxed text-white/80">
              <input
                type="checkbox"
                checked={form.email_marketing}
                onChange={(e) => setForm((f) => ({ ...f, email_marketing: e.target.checked }))}
                className="mt-1 h-4 w-4 shrink-0 accent-gold"
              />
              {t("profile.marketingLabel")}
            </label>

            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-gold px-7 py-3 text-sm font-bold uppercase tracking-wider text-black hover:bg-gold-vivid disabled:opacity-50"
            >
              {saving ? t("profile.saving") : t("profile.saveChanges")}
            </button>
          </form>
        )}
      </section>
    </PageLayout>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-12 w-full rounded-xl border border-gold/20 bg-[#1A1A1A] px-4 py-3 text-sm text-white outline-none transition-shadow focus:border-gold focus:ring-2 focus:ring-gold/10"
      />
    </label>
  );
}
