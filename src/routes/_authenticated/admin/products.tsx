import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListProducts,
  adminUpsertProduct,
  adminDeleteProduct,
  adminListCategories,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/products")({
  component: AdminProductsPage,
});

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  price: number;
  stock_quantity: number;
  is_available: boolean | null;
  is_featured: boolean | null;
  category_id: string | null;
  categories: { name: string } | null;
  product_images: { url: string; sort_order: number }[];
};

const empty = {
  id: null as string | null,
  name: "",
  slug: "",
  category_id: null as string | null,
  short_description: "",
  full_description: "",
  price: 0,
  compare_at_price: null as number | null,
  stock_quantity: 0,
  is_available: true,
  is_featured: false,
  image_url: "",
};

function AdminProductsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListProducts);
  const catsFn = useServerFn(adminListCategories);
  const upsertFn = useServerFn(adminUpsertProduct);
  const deleteFn = useServerFn(adminDeleteProduct);

  const { data: prodData, isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => listFn(),
  });

  const { data: catData } = useQuery({
    queryKey: ["admin-cats"],
    queryFn: () => catsFn(),
  });

  const [editing, setEditing] = useState<typeof empty | null>(null);

  const upsert = useMutation({
    mutationFn: (form: typeof empty) =>
      upsertFn({
        data: {
          id: form.id,
          name: form.name,
          slug: form.slug,
          category_id: form.category_id || null,
          short_description: form.short_description || null,
          full_description: form.full_description || null,
          price: Number(form.price),
          compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null,
          stock_quantity: Number(form.stock_quantity),
          is_available: form.is_available,
          is_featured: form.is_featured,
          image_url: form.image_url || null,
        },
      }),
    onSuccess: () => {
      toast.success("Product saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function startEdit(p: ProductRow) {
    setEditing({
      id: p.id,
      name: p.name,
      slug: p.slug,
      category_id: p.category_id,
      short_description: "",
      full_description: "",
      price: Number(p.price),
      compare_at_price: null,
      stock_quantity: p.stock_quantity,
      is_available: p.is_available ?? true,
      is_featured: p.is_featured ?? false,
      image_url: p.product_images?.[0]?.url ?? "",
    });
  }

  const products = (prodData?.products ?? []) as never as ProductRow[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl text-white">Products</h1>

        <button
          onClick={() => setEditing(empty)}
          className="flex items-center gap-2 bg-gold px-4 py-2 text-sm font-bold text-black hover:bg-gold-vivid"
        >
          <Plus size={16} /> New Product
        </button>
      </div>

      <div className="border border-gold/15 bg-[#1A1A1A]">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-white/50">
            <tr>
              <th className="p-3">Product</th>
              <th className="p-3">Category</th>
              <th className="p-3">Price</th>
              <th className="p-3">Stock</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>

          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-white/50">
                  Loading...
                </td>
              </tr>
            )}

            {products.map((p) => (
              <tr key={p.id} className="border-t border-gold/5">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    {p.product_images?.[0]?.url && (
                      <img
                        src={p.product_images[0].url}
                        alt=""
                        className="h-10 w-10 object-cover"
                      />
                    )}
                    <span className="text-white">{p.name}</span>
                  </div>
                </td>

                <td className="p-3 text-white/60">{p.categories?.name ?? "—"}</td>
                <td className="p-3 font-mono text-gold">€{Number(p.price).toFixed(2)}</td>
                <td className="p-3 font-mono text-white/70">{p.stock_quantity}</td>

                <td className="p-3 text-xs">
                  <span
                    className={`rounded-full px-2 py-0.5 ${
                      p.is_available
                        ? "bg-green-500/20 text-green-300"
                        : "bg-red-500/20 text-red-300"
                    }`}
                  >
                    {p.is_available ? "Active" : "Hidden"}
                  </span>

                  {p.is_featured && (
                    <span className="ml-1 rounded-full bg-gold/20 px-2 py-0.5 text-gold">
                      Featured
                    </span>
                  )}
                </td>

                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => startEdit(p)}
                      className="text-gold/70 hover:text-gold"
                    >
                      <Pencil size={14} />
                    </button>

                    <button
                      onClick={() => confirm(`Delete ${p.name}?`) && del.mutate(p.id)}
                      className="text-white/40 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {!isLoading && !products.length && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-white/50">
                  No products yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)} title={editing.id ? "Edit Product" : "New Product"}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              upsert.mutate(editing);
            }}
            className="grid gap-3 md:grid-cols-2"
          >
            <F
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

            <F
              label="Slug"
              value={editing.slug}
              onChange={(v) => setEditing({ ...editing, slug: v })}
              required
            />

            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">
                Category
              </span>

              <select
                value={editing.category_id ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    category_id: e.target.value || null,
                  })
                }
                className="w-full border border-gold/20 bg-[#0D0D0D] px-3 py-2 text-sm text-white"
              >
                <option value="">—</option>
                {(catData?.categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <ImageUpload
              label="Product Image"
              value={editing.image_url}
              folder="products"
              onUploaded={(url) => setEditing({ ...editing, image_url: url })}
            />

            <F
              label="Price (€)"
              type="number"
              value={String(editing.price)}
              onChange={(v) => setEditing({ ...editing, price: Number(v) })}
              required
            />

            <F
              label="Compare At Price (€)"
              type="number"
              value={editing.compare_at_price?.toString() ?? ""}
              onChange={(v) =>
                setEditing({
                  ...editing,
                  compare_at_price: v ? Number(v) : null,
                })
              }
            />

            <F
              label="Stock"
              type="number"
              value={String(editing.stock_quantity)}
              onChange={(v) =>
                setEditing({
                  ...editing,
                  stock_quantity: Number(v),
                })
              }
              required
            />

            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">
                Short Description
              </span>
              <input
                value={editing.short_description}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    short_description: e.target.value,
                  })
                }
                className="w-full border border-gold/20 bg-[#0D0D0D] px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">
                Full Description
              </span>
              <textarea
                rows={4}
                value={editing.full_description}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    full_description: e.target.value,
                  })
                }
                className="w-full border border-gold/20 bg-[#0D0D0D] px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={editing.is_available}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    is_available: e.target.checked,
                  })
                }
                className="accent-gold"
              />
              Available
            </label>

            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={editing.is_featured}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    is_featured: e.target.checked,
                  })
                }
                className="accent-gold"
              />
              Featured
            </label>

            <div className="flex justify-end gap-2 md:col-span-2">
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
                className="bg-gold px-4 py-2 text-sm font-bold text-black hover:bg-gold-vivid disabled:opacity-50"
              >
                {upsert.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function F({
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

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 pt-16">
      <div className="w-full max-w-2xl border border-gold/30 bg-[#1A1A1A]">
        <div className="flex items-center justify-between border-b border-gold/10 p-4">
          <h2 className="font-serif text-lg text-white">{title}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}