import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListCategories,
  adminUpsertCategory,
  adminDeleteCategory,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/categories")({
  component: AdminCategoriesPage,
});

const empty = {
  id: null as string | null,
  name: "",
  slug: "",
  description: "",
  image_url: "",
  sort_order: 0,
};

function AdminCategoriesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListCategories);
  const upsertFn = useServerFn(adminUpsertCategory);
  const delFn = useServerFn(adminDeleteCategory);
  const { data, isLoading } = useQuery({ queryKey: ["admin-cats"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<typeof empty | null>(null);

  const upsert = useMutation({
    mutationFn: (form: typeof empty) =>
      upsertFn({
        data: {
          id: form.id,
          name: form.name,
          slug: form.slug,
          description: form.description || null,
          image_url: form.image_url || null,
          sort_order: Number(form.sort_order),
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-cats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin-cats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl text-white">Categories</h1>
        <button
          onClick={() => setEditing(empty)}
          className="flex items-center gap-2 bg-gold px-4 py-2 text-sm font-bold text-black"
        >
          <Plus size={16} /> New Category
        </button>
      </div>

      <div className="border border-gold/15 bg-[#1A1A1A]">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-white/50">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Slug</th>
              <th className="p-3">Order</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-white/50">
                  Loading...
                </td>
              </tr>
            )}

            {(data?.categories ?? []).map((c) => (
              <tr key={c.id} className="border-t border-gold/5">
                <td className="p-3 text-white">{c.name}</td>
                <td className="p-3 font-mono text-white/60">{c.slug}</td>
                <td className="p-3 text-white/60">{c.sort_order}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() =>
                        setEditing({
                          id: c.id,
                          name: c.name,
                          slug: c.slug,
                          description: c.description ?? "",
                          image_url: c.image_url ?? "",
                          sort_order: c.sort_order ?? 0,
                        })
                      }
                      className="text-gold/70 hover:text-gold"
                    >
                      <Pencil size={14} />
                    </button>

                    <button
                      onClick={() => confirm(`Delete ${c.name}?`) && del.mutate(c.id)}
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
            className="w-full max-w-lg space-y-3 border border-gold/30 bg-[#1A1A1A] p-6"
          >
            <h2 className="font-serif text-lg text-white">
              {editing.id ? "Edit" : "New"} Category
            </h2>

            <Field
              label="Name"
              value={editing.name}
              onChange={(v) =>
                setEditing({
                  ...editing,
                  name: v,
                  slug: editing.slug || slugify(v),
                })
              }
              required
            />

            <Field
              label="Slug"
              value={editing.slug}
              onChange={(v) => setEditing({ ...editing, slug: v })}
              required
            />

            <Field
              label="Description"
              value={editing.description}
              onChange={(v) => setEditing({ ...editing, description: v })}
            />

            <ImageUpload
              label="Category Image"
              value={editing.image_url}
              folder="categories"
              onUploaded={(url) => setEditing({ ...editing, image_url: url })}
            />

            <Field
              label="Sort Order"
              type="number"
              value={String(editing.sort_order)}
              onChange={(v) => setEditing({ ...editing, sort_order: Number(v) })}
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="border border-white/20 px-4 py-2 text-sm text-white/70"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={upsert.isPending}
                className="bg-gold px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
              >
                {upsert.isPending ? "Saving..." : "Save"}
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
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Image upload failed");
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

      {uploading && <p className="mt-1 text-xs text-gold">Uploading...</p>}

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