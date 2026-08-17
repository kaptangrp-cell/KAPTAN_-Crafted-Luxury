import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListJournalPosts,
  adminUpsertJournalPost,
  adminDeleteJournalPost,
} from "@/lib/journal.functions";

export const Route = createFileRoute("/_authenticated/admin/journal")({
  component: AdminJournalPage,
});

const empty = {
  id: null as string | null,
  slug: "",
  title: "",
  excerpt: "",
  body: "",
  cover_image_url: "",
  category: "",
  author_name: "KAPTAN Atelier",
  is_published: false,
};

function AdminJournalPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const listFn = useServerFn(adminListJournalPosts);
  const upsertFn = useServerFn(adminUpsertJournalPost);
  const delFn = useServerFn(adminDeleteJournalPost);
  const { data, isLoading } = useQuery({ queryKey: ["admin-journal"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<typeof empty | null>(null);

  const upsert = useMutation({
    mutationFn: (form: typeof empty) =>
      upsertFn({
        data: {
          id: form.id,
          slug: form.slug,
          title: form.title,
          excerpt: form.excerpt || null,
          body: form.body,
          cover_image_url: form.cover_image_url || null,
          category: form.category || null,
          author_name: form.author_name,
          is_published: form.is_published,
        },
      }),
    onSuccess: () => {
      toast.success(t("adminCategories.savedToast"));
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-journal"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("adminProducts.deletedToast"));
      qc.invalidateQueries({ queryKey: ["admin-journal"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl text-white">{t("adminJournal.title")}</h1>
        <button
          onClick={() => setEditing(empty)}
          className="flex items-center gap-2 bg-gold px-4 py-2 text-sm font-bold text-black"
        >
          <Plus size={16} /> {t("adminJournal.newPost")}
        </button>
      </div>

      <div className="border border-gold/15 bg-[#1A1A1A]">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-white/50">
            <tr>
              <th className="p-3">{t("adminJournal.colTitle")}</th>
              <th className="p-3">{t("adminProducts.colCategory")}</th>
              <th className="p-3">{t("adminProducts.colStatus")}</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-white/50">
                  {t("adminProducts.loading")}
                </td>
              </tr>
            )}

            {!isLoading && (data?.posts ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-white/50">
                  {t("adminJournal.noPostsYet")}
                </td>
              </tr>
            )}

            {(data?.posts ?? []).map((p) => (
              <tr key={p.id} className="border-t border-gold/5">
                <td className="p-3 text-white">{p.title}</td>
                <td className="p-3 text-white/60">{p.category || "—"}</td>
                <td className="p-3">
                  <span
                    className={`px-2 py-0.5 text-xs uppercase tracking-wider ${
                      p.is_published
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-white/10 text-white/50"
                    }`}
                  >
                    {p.is_published ? t("adminJournal.published") : t("adminJournal.draft")}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() =>
                        setEditing({
                          id: p.id,
                          slug: p.slug,
                          title: p.title,
                          excerpt: p.excerpt ?? "",
                          body: p.body ?? "",
                          cover_image_url: p.cover_image_url ?? "",
                          category: p.category ?? "",
                          author_name: p.author_name ?? "KAPTAN Atelier",
                          is_published: Boolean(p.is_published),
                        })
                      }
                      className="text-gold/70 hover:text-gold"
                    >
                      <Pencil size={14} />
                    </button>

                    <button
                      onClick={() => confirm(t("adminJournal.deleteConfirm", { title: p.title })) && del.mutate(p.id)}
                      className="text-white/40 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 pt-16">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              upsert.mutate(editing);
            }}
            className="w-full max-w-xl space-y-3 border border-gold/30 bg-[#1A1A1A] p-6"
          >
            <h2 className="font-serif text-lg text-white">
              {editing.id ? t("adminJournal.editPost") : t("adminJournal.newPost")}
            </h2>

            <Field
              label={t("adminJournal.titleLabel")}
              value={editing.title}
              onChange={(v) =>
                setEditing({
                  ...editing,
                  title: v,
                  slug: editing.slug || slugify(v),
                })
              }
              required
            />

            <Field
              label={t("adminProducts.slugLabel")}
              value={editing.slug}
              onChange={(v) => setEditing({ ...editing, slug: v })}
              required
            />

            <Field
              label={t("adminProducts.categoryLabel")}
              value={editing.category}
              onChange={(v) => setEditing({ ...editing, category: v })}
            />

            <Field
              label={t("adminJournal.authorLabel")}
              value={editing.author_name}
              onChange={(v) => setEditing({ ...editing, author_name: v })}
              required
            />

            <TextArea
              label={t("adminJournal.excerptLabel")}
              value={editing.excerpt}
              onChange={(v) => setEditing({ ...editing, excerpt: v })}
              rows={2}
            />

            <TextArea
              label={t("adminJournal.bodyLabel")}
              value={editing.body}
              onChange={(v) => setEditing({ ...editing, body: v })}
              rows={10}
              required
            />

            <ImageUpload
              label={t("adminJournal.coverImageLabel")}
              value={editing.cover_image_url}
              folder="journal"
              onUploaded={(url) => setEditing({ ...editing, cover_image_url: url })}
            />

            <label className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                checked={editing.is_published}
                onChange={(e) => setEditing({ ...editing, is_published: e.target.checked })}
                className="accent-gold"
              />
              <span className="text-sm text-white/80">{t("adminJournal.publishedCheckboxLabel")}</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="border border-white/20 px-4 py-2 text-sm text-white/70"
              >
                {t("adminProducts.cancel")}
              </button>

              <button
                type="submit"
                disabled={upsert.isPending}
                className="bg-gold px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
              >
                {upsert.isPending ? t("adminProducts.saving") : t("adminProducts.save")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gold/20 bg-[#0D0D0D] px-3 py-2 text-sm text-white outline-none focus:border-gold"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 4,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">
        {label}
      </span>
      <textarea
        required={required}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gold/20 bg-[#0D0D0D] px-3 py-2 text-sm text-white outline-none focus:border-gold"
      />
    </label>
  );
}

function ImageUpload({
  label,
  value,
  folder,
  onUploaded,
}: {
  label: string;
  value: string;
  folder: string;
  onUploaded: (url: string) => void;
}) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    try {
      setUploading(true);

      const ext = file.name.split(".").pop() || "png";
      const fileName = `${folder}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const { error } = await supabase.storage
        .from("product-images")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (error) throw error;

      const { data } = supabase.storage.from("product-images").getPublicUrl(fileName);

      onUploaded(data.publicUrl);
      toast.success(t("adminProducts.imageUploadedToast"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminCategories.imageUploadFailedToast"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">
        {label}
      </span>

      <input
        type="file"
        accept="image/*"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="w-full border border-gold/20 bg-[#0D0D0D] px-3 py-2 text-sm text-white"
      />

      {uploading && <p className="mt-1 text-xs text-gold">{t("adminProducts.uploading")}</p>}

      <p className="mb-1 mt-3 text-[11px] uppercase tracking-wider text-white/40">
        {t("adminJournal.orPasteImageUrl")}
      </p>
      <input
        type="url"
        placeholder="https://images.unsplash.com/..."
        defaultValue={value}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v) onUploaded(v);
        }}
        className="w-full border border-gold/20 bg-[#0D0D0D] px-3 py-2 text-sm text-white outline-none focus:border-gold"
      />

      {value && (
        <img
          src={value}
          alt=""
          className="mt-3 h-24 w-24 border border-gold/20 object-cover"
        />
      )}
    </label>
  );
}
