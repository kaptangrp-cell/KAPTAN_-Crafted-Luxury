import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Mail, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { PageLayout } from "@/components/layout/PageLayout";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — KAPTAN" },
      { name: "description", content: "Get in touch with the KAPTAN team." },
      { property: "og:title", content: "Contact KAPTAN" },
      { property: "og:description", content: "We'd love to hear from you." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from("feedback_messages").insert({
        name: form.name,
        email: form.email,
        subject: form.subject,
        message: form.message,
      });
      if (error) throw error;
      toast.success(t("contact.success"));
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("contact.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageLayout>
      <section className="mx-auto max-w-5xl px-4 py-16 md:px-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">{t("contact.kicker")}</p>
          <h1 className="mt-3 font-serif text-4xl font-semibold text-white md:text-5xl">{t("contact.title")}</h1>
          <p className="mx-auto mt-3 max-w-xl text-white/60">{t("contact.subtitle")}</p>
        </div>

        <div className="mt-12 grid gap-10 md:grid-cols-[1fr_1.5fr]">
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <Mail className="mt-1 text-gold" size={18} />
              <div>
                <p className="text-xs uppercase tracking-wider text-gold/70">{t("contact.email")}</p>
                <a href="mailto:contact@kaptangrp.com" className="text-sm text-white hover:text-gold">contact@kaptangrp.com</a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="mt-1 text-gold" size={18} />
              <div>
                <p className="text-xs uppercase tracking-wider text-gold/70">{t("contact.phone")}</p>
                <a href="tel:+4915216164830" className="text-sm text-white hover:text-gold">+49 175 7134333</a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="mt-1 text-gold" size={18} />
              <div>
                <p className="text-xs uppercase tracking-wider text-gold/70">{t("contact.workshop")}</p>
                <p className="text-sm text-white">Marburg, Germany</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 border border-gold/20 bg-[#1A1A1A] p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <input required placeholder={t("contact.name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border border-gold/30 bg-black px-3 py-2.5 text-sm text-white outline-none focus:border-gold" />
              <input required type="email" placeholder={t("contact.email")} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="border border-gold/30 bg-black px-3 py-2.5 text-sm text-white outline-none focus:border-gold" />
            </div>
            <input required placeholder={t("contact.subject")} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full border border-gold/30 bg-black px-3 py-2.5 text-sm text-white outline-none focus:border-gold" />
            <textarea required rows={6} placeholder={t("contact.message")} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="w-full border border-gold/30 bg-black px-3 py-2.5 text-sm text-white outline-none focus:border-gold" />
            <button disabled={loading} className="w-full bg-gold py-3 text-sm font-bold uppercase tracking-wider text-black hover:bg-gold-vivid disabled:opacity-50">
              {loading ? t("contact.sending") : t("contact.send")}
            </button>
          </form>
        </div>
      </section>
    </PageLayout>
  );
}
