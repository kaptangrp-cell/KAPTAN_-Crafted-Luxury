import { useState } from "react";
import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  Plus,
  Pencil,
  Trash2,
  ImageIcon,
  Video,
  X,
  Upload,
  Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListProducts,
  adminUpsertProduct,
  adminDeleteProduct,
  adminListCategories,
  adminBulkCreateProducts,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/products")({
  component: AdminProductsPage,
});

type MediaItem = {
  url: string;
  media_type: "image" | "video";
  sort_order: number;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  short_description: string | null;
  full_description: string | null;
  stock_quantity: number;
  is_available: boolean | null;
  is_featured: boolean | null;
  category_id: string | null;
  categories: { name: string } | null;
  product_images: {
    id?: string;
    url: string;
    sort_order: number;
    alt_text?: string | null;
    media_type?: "image" | "video" | null;
  }[];
};

type BulkProductInput = {
  name: string;
  slug: string;
  category_slug: string;
  price: number;
  compare_at_price: number | null;
  stock_quantity: number;
  short_description: string | null;
  full_description: string | null;
  is_available: boolean;
  is_featured: boolean;
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
  media_items: [] as MediaItem[],
};

function AdminProductsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListProducts);
  const catsFn = useServerFn(adminListCategories);
  const upsertFn = useServerFn(adminUpsertProduct);
  const deleteFn = useServerFn(adminDeleteProduct);
  const bulkCreateFn = useServerFn(adminBulkCreateProducts);

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
          media_items: form.media_items.map((m, index) => ({
            url: m.url,
            media_type: m.media_type,
            sort_order: index,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Product saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkCreate = useMutation({
    mutationFn: (products: BulkProductInput[]) =>
      bulkCreateFn({
        data: { products },
      }),
    onSuccess: (result) => {
      toast.success(`${result.created} products imported`);
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
      short_description: p.short_description ?? "",
      full_description: p.full_description ?? "",
      price: Number(p.price),
      compare_at_price: p.compare_at_price ? Number(p.compare_at_price) : null,
      stock_quantity: p.stock_quantity,
      is_available: p.is_available ?? true,
      is_featured: p.is_featured ?? false,
      media_items: (p.product_images ?? [])
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
        .map((m, index) => ({
          url: m.url,
          media_type: m.media_type === "video" ? "video" : "image",
          sort_order: index,
        })),
    });
  }

  function addMedia(type: "image" | "video") {
    if (!editing) return;

    setEditing({
      ...editing,
      media_items: [
        ...editing.media_items,
        {
          url: "",
          media_type: type,
          sort_order: editing.media_items.length,
        },
      ],
    });
  }

  function updateMedia(index: number, patch: Partial<MediaItem>) {
    if (!editing) return;

    setEditing({
      ...editing,
      media_items: editing.media_items.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    });
  }

  function removeMedia(index: number) {
    if (!editing) return;

    setEditing({
      ...editing,
      media_items: editing.media_items.filter((_, i) => i !== index),
    });
  }

  function parseBoolean(value: unknown, defaultValue: boolean) {
    if (value === undefined || value === null || value === "") return defaultValue;

    const text = String(value).trim().toLowerCase();

    if (["true", "yes", "1", "y"].includes(text)) return true;
    if (["false", "no", "0", "n"].includes(text)) return false;

    return defaultValue;
  }

  async function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";

    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        toast.error("Excel file has no sheets");
        return;
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });

      if (rows.length === 0) {
        toast.error("Excel file has no product rows");
        return;
      }

      const products: BulkProductInput[] = rows.map((row, index) => {
        const name = String(row.name ?? "").trim();
        const slug = String(row.slug ?? "").trim();
        const category_slug = String(row.category_slug ?? "").trim();
        const price = Number(row.price);
        const stock_quantity = Number(row.stock_quantity);

        if (!name || !slug || !category_slug) {
          throw new Error(`Row ${index + 2}: name, slug, and category_slug are required`);
        }

        if (Number.isNaN(price)) {
          throw new Error(`Row ${index + 2}: price must be a number`);
        }

        if (Number.isNaN(stock_quantity)) {
          throw new Error(`Row ${index + 2}: stock_quantity must be a number`);
        }

        const compareRaw = row.compare_at_price;
        const compare_at_price =
          compareRaw === undefined || compareRaw === null || compareRaw === ""
            ? null
            : Number(compareRaw);

        if (compare_at_price !== null && Number.isNaN(compare_at_price)) {
          throw new Error(`Row ${index + 2}: compare_at_price must be a number or empty`);
        }

        return {
          name,
          slug,
          category_slug,
          price,
          compare_at_price,
          stock_quantity,
          short_description: String(row.short_description ?? "").trim() || null,
          full_description: String(row.full_description ?? "").trim() || null,
          is_available: parseBoolean(row.is_available, true),
          is_featured: parseBoolean(row.is_featured, false),
        };
      });

      bulkCreate.mutate(products);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid Excel file");
    }
  }

  function downloadTemplate() {
    const sample = [
      {
        name: "Premium Leather Wallet",
        slug: "premium-leather-wallet",
        category_slug: "leather-wallets",
        price: 29.99,
        compare_at_price: 39.99,
        stock_quantity: 50,
        short_description: "Handcrafted genuine leather wallet.",
        full_description: "Premium handcrafted leather wallet with durable stitching and elegant finish.",
        is_available: true,
        is_featured: false,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "kaptan-products-template.xlsx");
  }

  const products = (prodData?.products ?? []) as never as ProductRow[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="font-serif text-3xl text-white">Products</h1>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setEditing(empty)}
            className="flex items-center gap-2 bg-gold px-4 py-2 text-sm font-bold text-black hover:bg-gold-vivid"
          >
            <Plus size={16} /> New Product
          </button>

          <button
            type="button"
            onClick={() => document.getElementById("excel-upload")?.click()}
            disabled={bulkCreate.isPending}
            className="flex items-center gap-2 border border-gold px-4 py-2 text-sm font-bold text-gold hover:bg-gold hover:text-black disabled:opacity-50"
          >
            <Upload size={16} /> {bulkCreate.isPending ? "Importing..." : "Upload Excel"}
          </button>

          <button
            type="button"
            onClick={downloadTemplate}
            className="flex items-center gap-2 border border-gold/40 px-4 py-2 text-sm font-bold text-gold hover:bg-gold hover:text-black"
          >
            <Download size={16} /> Template
          </button>

          <input
            id="excel-upload"
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={handleExcelUpload}
          />
        </div>
      </div>

      <div className="border border-gold/20 bg-[#1A1A1A] p-4 text-sm text-white/60">
        Excel upload is for text data only. Product images and videos can be uploaded manually after the products are created.
        Required Excel columns: <span className="text-gold">name, slug, category_slug, price, stock_quantity</span>.
      </div>

      <div className="border border-gold/15 bg-[#1A1A1A]">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-white/50">
            <tr>
              <th className="p-3">Product</th>
              <th className="p-3">Category</th>
              <th className="p-3">Media</th>
              <th className="p-3">Price</th>
              <th className="p-3">Stock</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>

          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-white/50">
                  Loading...
                </td>
              </tr>
            )}

            {products.map((p) => {
              const sortedMedia = (p.product_images ?? []).sort(
                (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
              );
              const firstImage = sortedMedia.find((m) => m.media_type !== "video") ?? sortedMedia[0];

              return (
                <tr key={p.id} className="border-t border-gold/5">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {firstImage?.url && firstImage.media_type === "video" ? (
                        <video src={firstImage.url} className="h-10 w-10 object-cover" muted />
                      ) : firstImage?.url ? (
                        <img src={firstImage.url} alt="" className="h-10 w-10 object-cover" />
                      ) : null}
                      <span className="text-white">{p.name}</span>
                    </div>
                  </td>

                  <td className="p-3 text-white/60">{p.categories?.name ?? "—"}</td>
                  <td className="p-3 text-white/60">{sortedMedia.length}</td>
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
                      <button onClick={() => startEdit(p)} className="text-gold/70 hover:text-gold">
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
              );
            })}

            {!isLoading && !products.length && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-white/50">
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

            <div className="md:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-gold/70">
                  Product Photos & Videos
                </span>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => addMedia("image")}
                    className="flex items-center gap-1 border border-gold/30 px-3 py-1 text-xs text-gold hover:bg-gold hover:text-black"
                  >
                    <ImageIcon size={14} /> Add Image
                  </button>

                  <button
                    type="button"
                    onClick={() => addMedia("video")}
                    className="flex items-center gap-1 border border-gold/30 px-3 py-1 text-xs text-gold hover:bg-gold hover:text-black"
                  >
                    <Video size={14} /> Add Video
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {editing.media_items.length === 0 && (
                  <p className="border border-dashed border-gold/20 p-4 text-center text-sm text-white/50">
                    No media added yet. Add at least one product image.
                  </p>
                )}

                {editing.media_items.map((item, index) => (
                  <MediaUpload
                    key={index}
                    item={item}
                    index={index}
                    onChange={(patch) => updateMedia(index, patch)}
                    onRemove={() => removeMedia(index)}
                  />
                ))}
              </div>
            </div>

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

function MediaUpload({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: MediaItem;
  index: number;
  onChange: (patch: Partial<MediaItem>) => void;
  onRemove: () => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    try {
      setUploading(true);

      const ext = file.name.split(".").pop() || (item.media_type === "video" ? "mp4" : "png");
      const fileName = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage.from("product-images").upload(fileName, file, {
        cacheControl: "3600",
        upsert: true,
      });

      if (error) throw error;

      const { data } = supabase.storage.from("product-images").getPublicUrl(fileName);

      onChange({ url: data.publicUrl });
      toast.success(item.media_type === "video" ? "Video uploaded" : "Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border border-gold/15 bg-[#0D0D0D] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-white/50">
          {item.media_type === "video" ? "Video" : "Image"} #{index + 1}
        </p>

        <button type="button" onClick={onRemove} className="text-white/40 hover:text-red-400">
          <X size={16} />
        </button>
      </div>

      <input
        type="file"
        accept={item.media_type === "video" ? "video/*" : "image/*"}
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="w-full border border-gold/20 bg-black px-3 py-2 text-sm text-white"
      />

      <input
        type="url"
        value={item.url}
        onChange={(e) => onChange({ url: e.target.value })}
        placeholder={item.media_type === "video" ? "Video URL" : "Image URL"}
        className="mt-2 w-full border border-gold/20 bg-black px-3 py-2 text-sm text-white outline-none focus:border-gold"
      />

      {uploading && <p className="mt-1 text-xs text-gold">Uploading...</p>}

      {item.url && item.media_type === "video" && (
        <video src={item.url} controls className="mt-3 h-32 w-full border border-gold/20 object-cover" />
      )}

      {item.url && item.media_type === "image" && (
        <img src={item.url} alt="" className="mt-3 h-32 w-32 border border-gold/20 object-cover" />
      )}
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 pt-16">
      <div className="w-full max-w-3xl border border-gold/30 bg-[#1A1A1A]">
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