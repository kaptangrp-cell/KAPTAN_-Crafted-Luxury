import { COLLECTIONS, collectionForCategory, collectionLabel } from "@/lib/catalog-collections";
import { moveMedia } from "@/lib/media-order";
import { ProductCard } from "@/components/product/ProductCard";
import { mediaDetails } from "@/lib/product-media";
import { OptionMultiSelect } from "@/components/admin/OptionMultiSelect";
import { optionParts } from "@/lib/product-options";
import { ProductOptionsEditor } from "@/components/admin/ProductOptionsEditor";
import type { ProductOption } from "@/lib/product-options";
import { formatEuro } from "@/lib/currency";
import { AdminFeedback } from "@/components/admin/AdminFeedback";
import type { Json } from "@/integrations/supabase/types";
import { useEffect, useRef, useState } from "react";
import { AdminModal as Modal } from "@/components/admin/AdminModal";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Palette, Plus, Pencil, Trash2, ImageIcon, Video, X, Upload, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  color?: string;
  view?: string;
  alt?: string;
  url: string;
  media_type: "image" | "video";
  sort_order: number;
};

type ProductRow = {
  product_variants: ProductOption[];
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  cost_price: number | null;
  short_description: string | null;
  full_description: string | null;
  specifications: Json;
  stock_quantity: number;
  low_stock_threshold: number | null;
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
  specifications: {} as Record<string, Json | undefined>,
  price: 0,
  compare_at_price: null as number | null,
  cost_price: null as number | null,
  stock_quantity: 0,
  is_available: true,
  is_featured: false,
  media_items: [] as MediaItem[],
  colors: [] as string[],
  sizes: [] as string[],
  optionsChanged: false,
};

function AdminProductsPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const listFn = useServerFn(adminListProducts);
  const catsFn = useServerFn(adminListCategories);
  const upsertFn = useServerFn(adminUpsertProduct);
  const deleteFn = useServerFn(adminDeleteProduct);
  const bulkCreateFn = useServerFn(adminBulkCreateProducts);

  const {
    data: prodData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => listFn(),
  });

  const { data: catData } = useQuery({
    queryKey: ["admin-cats"],
    queryFn: () => catsFn(),
  });

  const [optionsProductId, setOptionsProductId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [collection, setCollection] = useState("all");
  const [sort, setSort] = useState("name");
  const initialDraft = useRef("");
  const [batchUploading, setBatchUploading] = useState(false);
  const [draggedMedia, setDraggedMedia] = useState<number | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const l = (en: string, de: string) => (i18n.language.startsWith("de") ? de : en);
  const [showPreview, setShowPreview] = useState(false);
  const [editing, setEditing] = useState<typeof empty | null>(null);

  const dirty = editing !== null && JSON.stringify(editing) !== initialDraft.current;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function closeEditor() {
    if (batchUploading || upsert.isPending) return;
    if (
      dirty &&
      !window.confirm(
        l("Discard unsaved product changes?", "Ungespeicherte Produktänderungen verwerfen?"),
      )
    )
      return;
    setEditing(null);
  }
  function newProduct() {
    initialDraft.current = JSON.stringify(empty);
    setShowPreview(false);
    setEditing({ ...empty });
  }

  const upsert = useMutation({
    mutationFn: (form: typeof empty) =>
      upsertFn({
        data: {
          id: form.id,
          option_selections: form.optionsChanged
            ? { colors: form.colors, sizes: form.sizes }
            : undefined,
          name: form.name,
          slug: form.slug,
          category_id: form.category_id || null,
          short_description: form.short_description || null,
          full_description: form.full_description || null,
          specifications: {
            ...form.specifications,
            _media: form.media_items
              .filter((m) => m.url)
              .map((m) => ({
                url: m.url,
                color: m.color ?? "",
                view: m.view ?? "",
                alt: m.alt ?? "",
              })),
          } as Record<string, Json>,
          price: Number(form.price),
          compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null,
          cost_price: form.cost_price ? Number(form.cost_price) : null,
          stock_quantity: Number(form.stock_quantity),
          is_available: form.is_available,
          is_featured: form.is_featured,
          media_items: form.media_items
            .filter((m) => m.url.trim())
            .map((m, index) => ({
              url: m.url,
              media_type: m.media_type,
              sort_order: index,
            })),
        },
      }),
    onSuccess: () => {
      toast.success(t("adminProducts.productSavedToast"));
      setEditing(null);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkCreate = useMutation({
    mutationFn: (products: BulkProductInput[]) =>
      bulkCreateFn({
        data: { products },
      }),
    onSuccess: (result) => {
      toast.success(t("adminProducts.importedToast", { count: result.created }));
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("adminProducts.deletedToast"));
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function startEdit(p: ProductRow) {
    const draft: typeof empty = {
      id: p.id,
      colors: [
        ...new Set(
          (p.product_variants ?? [])
            .filter((v) => v.is_available !== false)
            .map((v) => optionParts(v).color)
            .filter((v): v is string => Boolean(v)),
        ),
      ],
      sizes: [
        ...new Set(
          (p.product_variants ?? [])
            .filter((v) => v.is_available !== false)
            .map((v) => optionParts(v).size)
            .filter((v): v is string => Boolean(v)),
        ),
      ],
      optionsChanged: false,
      name: p.name,
      slug: p.slug,
      category_id: p.category_id,
      short_description: p.short_description ?? "",
      full_description: p.full_description ?? "",
      specifications:
        p.specifications && typeof p.specifications === "object" && !Array.isArray(p.specifications)
          ? p.specifications
          : {},
      price: Number(p.price),
      compare_at_price: p.compare_at_price ? Number(p.compare_at_price) : null,
      cost_price: p.cost_price ? Number(p.cost_price) : null,
      stock_quantity: p.stock_quantity,
      is_available: p.is_available ?? true,
      is_featured: p.is_featured ?? false,
      media_items: [...(p.product_images ?? [])]
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
        .map((m, index) => ({
          ...mediaDetails(p.specifications).find((d) => d.url === m.url),
          url: m.url,
          media_type: m.media_type === "video" ? "video" : "image",
          sort_order: index,
        })),
    };
    initialDraft.current = JSON.stringify(draft);
    setShowPreview(false);
    setEditing(draft);
  }

  async function uploadPhotos(files: FileList | File[] | null) {
    if (!files?.length || batchUploading) return;
    if (
      Array.from(files).some(
        (file) => !file.type.startsWith("image/") || file.size > 10 * 1024 * 1024,
      )
    ) {
      toast.error(t("catalog.fileLimit"));
      return;
    }
    setBatchUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024)
          throw new Error(t("catalog.fileLimit"));
        const path = `products/${crypto.randomUUID()}.${file.name.split(".").pop()}`;
        const { error } = await supabase.storage.from("product-images").upload(path, file);
        if (error) throw error;
        const { data } = supabase.storage.from("product-images").getPublicUrl(path);
        setEditing((current) =>
          current
            ? {
                ...current,
                media_items: [
                  ...current.media_items,
                  {
                    url: data.publicUrl,
                    media_type: "image",
                    sort_order: current.media_items.length,
                    view: "",
                    color: "",
                    alt: "",
                  },
                ],
              }
            : current,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("adminProducts.uploadFailedToast"));
    } finally {
      setBatchUploading(false);
    }
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
        toast.error(t("adminProducts.excelNoSheetsToast"));
        return;
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });

      if (rows.length === 0) {
        toast.error(t("adminProducts.excelNoRowsToast"));
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
      toast.error(err instanceof Error ? err.message : t("adminProducts.invalidExcelToast"));
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
        full_description:
          "Premium handcrafted leather wallet with durable stitching and elegant finish.",
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
  const matchesStock = (p: ProductRow, filter: string) =>
    filter === "all" ||
    (filter === "hidden"
      ? !p.is_available
      : filter === "out"
        ? p.stock_quantity === 0
        : filter === "featured"
          ? !!p.is_featured
          : p.is_available &&
            p.stock_quantity > 0 &&
            p.stock_quantity <= (p.low_stock_threshold ?? 5));
  const visibleProducts = products
    .filter(
      (p) =>
        `${p.name} ${p.slug} ${p.categories?.name ?? ""}`
          .toLowerCase()
          .includes(searchTerm.trim().toLowerCase()) &&
        (collection === "all" || collectionForCategory(p.categories ?? {}) === collection) &&
        matchesStock(p, stockFilter),
    )
    .sort((a, b) =>
      sort === "stock"
        ? a.stock_quantity - b.stock_quantity
        : sort === "price"
          ? Number(a.price) - Number(b.price)
          : a.name.localeCompare(b.name, i18n.language),
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="font-serif text-3xl text-white">{t("adminProducts.title")}</h1>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={newProduct}
            className="flex items-center gap-2 bg-gold px-4 py-2 text-sm font-bold text-black hover:bg-gold-vivid"
          >
            <Plus size={16} /> {t("adminProducts.newProduct")}
          </button>

          <button
            type="button"
            onClick={() => document.getElementById("excel-upload")?.click()}
            disabled={bulkCreate.isPending}
            className="flex items-center gap-2 border border-gold px-4 py-2 text-sm font-bold text-gold hover:bg-gold hover:text-black disabled:opacity-50"
          >
            <Upload size={16} />{" "}
            {bulkCreate.isPending ? t("adminProducts.importing") : t("adminProducts.uploadExcel")}
          </button>

          <button
            type="button"
            onClick={downloadTemplate}
            className="flex items-center gap-2 border border-gold/40 px-4 py-2 text-sm font-bold text-gold hover:bg-gold hover:text-black"
          >
            <Download size={16} /> {t("adminProducts.template")}
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

      <div className="flex flex-wrap gap-3 rounded-xl border border-gold/15 bg-[#0D0D0D] p-4">
        <label className="min-w-48 flex-1 text-xs text-white/60">
          {t("adminWorkspace.searchProducts")}
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="mt-2 w-full border border-gold/20 bg-black px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="text-xs text-white/60">
          {l("Collection", "Kollektion")}
          <select
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            className="mt-2 block min-h-11 rounded-lg border border-gold/20 bg-black px-3 text-sm text-white"
          >
            <option value="all">{t("products.allProducts")}</option>
            {COLLECTIONS.map((value) => (
              <option key={value} value={value}>
                {collectionLabel(value, i18n.language.startsWith("de"))}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-white/60">
          {l("Sort by", "Sortieren nach")}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="mt-2 block min-h-11 rounded-lg border border-gold/20 bg-black px-3 text-sm text-white"
          >
            <option value="name">{l("Product name", "Produktname")}</option>
            <option value="stock">{l("Lowest stock first", "Niedrigster Bestand zuerst")}</option>
            <option value="price">{l("Lowest price first", "Niedrigster Preis zuerst")}</option>
          </select>
        </label>
        <div className="flex w-full flex-wrap gap-2" aria-label={t("adminWorkspace.inventory")}>
          {[
            ["all", t("products.allProducts")],
            ["low", t("products.lowStock")],
            ["out", t("products.outOfStock")],
            ["hidden", t("adminProducts.hidden")],
            ["featured", t("adminProducts.featured")],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={stockFilter === value}
              onClick={() => setStockFilter(value)}
              className={`min-h-11 rounded-full border px-3 text-xs ${stockFilter === value ? "border-gold bg-gold text-black" : "border-gold/20 text-white/70 hover:border-gold"}`}
            >
              {label}{" "}
              <span className="ml-1 tabular-nums">
                {products.filter((p) => matchesStock(p, value)).length}
              </span>
            </button>
          ))}
        </div>
        <div className="flex w-full items-center justify-between text-xs text-white/60">
          <span aria-live="polite">
            {visibleProducts.length} / {products.length} {t("adminProducts.title")}
          </span>
          {(searchTerm || collection !== "all" || stockFilter !== "all") && (
            <button
              type="button"
              className="min-h-11 px-2 text-gold"
              onClick={() => {
                setSearchTerm("");
                setCollection("all");
                setStockFilter("all");
              }}
            >
              {l("Clear filters", "Filter zurücksetzen")}
            </button>
          )}
        </div>
        <details className="w-full text-xs text-white/50">
          <summary className="cursor-pointer text-gold">{t("adminWorkspace.importHelp")}</summary>
          <p className="mt-3">
            {t("adminProducts.excelUploadHint")} {t("adminProducts.excelRequiredCols")} name, slug,
            category_slug, price, stock_quantity.
          </p>
        </details>
      </div>

      {isError && <AdminFeedback retry={() => void refetch()} />}
      <div className="overflow-x-auto rounded-2xl border border-gold/15 bg-[#0D0D0D]">
        <table className="admin-product-table w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-white/50">
            <tr>
              <th className="p-3">{t("adminProducts.colProduct")}</th>
              <th className="p-3">{t("adminProducts.colCategory")}</th>
              <th className="p-3">{t("adminProducts.colMedia")}</th>
              <th className="p-3">{t("adminProducts.colPrice")}</th>
              <th className="p-3">{t("adminProducts.colStock")}</th>
              <th className="p-3">{t("adminProducts.colStatus")}</th>
              <th className="p-3">
                <span className="sr-only">{t("adminWorkspace.actions")}</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-white/50">
                  {t("adminProducts.loading")}
                </td>
              </tr>
            )}

            {visibleProducts.map((p) => {
              const sortedMedia = [...(p.product_images ?? [])].sort(
                (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
              );
              const firstImage =
                sortedMedia.find((m) => m.media_type !== "video") ?? sortedMedia[0];

              return (
                <tr key={p.id} className="border-t border-gold/5">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {firstImage?.url && firstImage.media_type === "video" ? (
                        <video src={firstImage.url} className="h-10 w-10 object-cover" muted />
                      ) : firstImage?.url ? (
                        <img src={firstImage.url} alt="" className="h-10 w-10 object-cover" />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        className="text-left font-medium text-white underline-offset-4 hover:text-gold hover:underline"
                      >
                        {p.name}
                      </button>
                    </div>
                  </td>

                  <td data-label={t("adminProducts.colCategory")} className="p-3 text-white/60">
                    {p.categories?.name ?? "—"}
                  </td>
                  <td data-label={t("adminProducts.colMedia")} className="p-3 text-white/60">
                    {sortedMedia.length}
                  </td>
                  <td data-label={t("adminProducts.colPrice")} className="p-3 font-mono text-gold">
                    {formatEuro(Number(p.price), i18n.language)}
                  </td>
                  <td
                    data-label={t("adminProducts.colStock")}
                    className="p-3 font-mono text-white/70"
                  >
                    {p.stock_quantity}
                  </td>

                  <td className="p-3 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        p.is_available
                          ? "bg-green-500/20 text-green-300"
                          : "bg-red-500/20 text-red-300"
                      }`}
                    >
                      {p.is_available ? t("adminProducts.active") : t("adminProducts.hidden")}
                    </span>

                    {p.is_featured && (
                      <span className="ml-1 rounded-full bg-gold/20 px-2 py-0.5 text-gold">
                        {t("adminProducts.featured")}
                      </span>
                    )}
                  </td>

                  <td className="p-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        onClick={() => setOptionsProductId(p.id)}
                        aria-label={t("options.manage")}
                        title={t("options.manage")}
                        className="flex min-h-11 items-center gap-1 rounded-lg border border-gold/20 px-3 text-gold/70 hover:text-gold"
                      >
                        <Palette size={16} />
                        <span className="ml-1 hidden text-xs lg:inline">{t("options.manage")}</span>
                      </button>
                      <button
                        onClick={() => startEdit(p)}
                        aria-label={t("adminWorkspace.edit")}
                        className="flex min-h-11 items-center gap-1 rounded-lg border border-gold/20 px-3 text-gold/70 hover:text-gold"
                      >
                        <Pencil size={14} />
                        <span className="text-xs">{t("adminWorkspace.edit")}</span>
                      </button>

                      <Link
                        to="/products/$slug"
                        params={{ slug: p.slug }}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-11 items-center rounded-lg border border-gold/20 px-3 text-xs text-gold"
                      >
                        {l("View", "Ansehen")}
                      </Link>
                      <button
                        onClick={() =>
                          confirm(t("adminProducts.deleteConfirm", { name: p.name })) &&
                          del.mutate(p.id)
                        }
                        aria-label={t("adminWorkspace.delete")}
                        className="p-2 text-white/40 hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {!isLoading && !isError && !visibleProducts.length && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-white/50">
                  {t("adminWorkspace.noMatches")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {optionsProductId && (
        <Modal
          onClose={() => setOptionsProductId(null)}
          title={`${t("options.manage")} · ${products.find((p) => p.id === optionsProductId)?.name ?? ""}`}
        >
          <ProductOptionsEditor
            productId={optionsProductId}
            options={products.find((p) => p.id === optionsProductId)?.product_variants ?? []}
          />
        </Modal>
      )}

      {editing && (
        <Modal
          onClose={closeEditor}
          title={editing.id ? t("adminProducts.editProduct") : t("adminProducts.newProduct")}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!batchUploading) upsert.mutate(editing);
            }}
            className="grid gap-3 md:grid-cols-2"
            id="product-editor-form"
          >
            <nav
              aria-label={l("Product form sections", "Produktformular-Bereiche")}
              className="sticky top-12 z-10 flex flex-wrap gap-2 bg-[#1A1A1A] py-2 md:col-span-2"
            >
              {[
                ["product-basics", l("Details & price", "Details & Preis")],
                ["product-options-editor", l("Colours & sizes", "Farben & Größen")],
                ["product-media", l("Photos & video", "Fotos & Video")],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className="rounded-full border border-gold/30 px-3 py-2 text-xs text-gold"
                  onClick={() => document.getElementById(id)?.scrollIntoView({ block: "start" })}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div
              id="product-basics"
              className="scroll-mt-32 rounded-lg border border-gold/25 bg-gold/5 p-4 md:col-span-2"
            >
              <p className="font-medium text-gold">{t("catalog.adminGuide")}</p>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{t("catalog.adminHelp")}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/70">
                <span>
                  {editing.name ? "✓" : "○"} {t("adminProducts.nameLabel")}
                </span>
                <span>
                  {editing.media_items.some((m) => m.url) ? "✓" : "○"}{" "}
                  {t("adminProducts.photosVideosLabel")}
                </span>
                <span>
                  {editing.colors.length ? "✓" : "○"} {t("options.color")}
                </span>
              </div>
            </div>
            <F
              label={t("adminProducts.nameLabel")}
              value={editing.name}
              onChange={(v) =>
                setEditing({
                  ...editing,
                  name: v,
                  slug:
                    !editing.id && (!editing.slug || editing.slug === slugify(editing.name))
                      ? slugify(v)
                      : editing.slug,
                })
              }
              required
            />

            <F
              label={t("adminProducts.slugLabel")}
              value={editing.slug}
              onChange={(v) => setEditing({ ...editing, slug: v })}
              required
            />

            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">
                {t("adminProducts.categoryLabel")}
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
              label={t("adminProducts.priceLabel")}
              type="number"
              value={String(editing.price)}
              onChange={(v) => setEditing({ ...editing, price: Number(v) })}
              required
            />

            <F
              label={t("adminProducts.compareAtPriceLabel")}
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
              label={t("adminProducts.costPriceLabel")}
              type="number"
              value={editing.cost_price?.toString() ?? ""}
              onChange={(v) =>
                setEditing({
                  ...editing,
                  cost_price: v ? Number(v) : null,
                })
              }
            />

            <F
              label={t("adminProducts.stockLabel")}
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
                {t("adminProducts.shortDescLabel")}
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
                {t("adminProducts.fullDescLabel")}
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

            <div
              id="product-options-editor"
              className="scroll-mt-32 grid gap-3 md:col-span-2 md:grid-cols-2"
            >
              <OptionMultiSelect
                label={t("options.color")}
                presets={["Black", "Brown", "Tan", "White", "Beige", "Blue", "Red", "Green"]}
                values={editing.colors}
                onChange={(colors) => setEditing({ ...editing, colors, optionsChanged: true })}
              />
              <OptionMultiSelect
                label={t("options.size")}
                presets={["XS", "S", "Medium", "Large", "XL", "XXL", "One size"]}
                values={editing.sizes}
                onChange={(sizes) => setEditing({ ...editing, sizes, optionsChanged: true })}
              />
              <p className="text-xs leading-relaxed text-white/60 md:col-span-2">
                {t("options.multiHelp")}
              </p>
            </div>

            {[
              { key: "Material", label: "material" },
              { key: "Use", label: "use" },
              { key: "Dimensions", label: "dimensions" },
              { key: "Care", label: "care" },
            ].map(({ key, label }) => {
              const existingKey =
                Object.keys(editing.specifications).find(
                  (name) =>
                    name.toLowerCase() === key.toLowerCase() ||
                    (key === "Colour" && name.toLowerCase() === "color"),
                ) ?? key;
              const value = editing.specifications[existingKey];
              return (
                <label key={key} className="block">
                  <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">
                    {key === "Dimensions" ? t("options.measurements") : t(`productFacts.${label}`)}
                  </span>
                  <input
                    maxLength={500}
                    value={
                      typeof value === "string" || typeof value === "number" ? String(value) : ""
                    }
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        specifications: {
                          ...editing.specifications,
                          [existingKey]: event.target.value,
                        },
                      })
                    }
                    className="w-full border border-gold/20 bg-[#0D0D0D] px-3 py-2 text-sm text-white"
                  />
                </label>
              );
            })}

            <div className="md:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-gold/70">
                  {t("adminProducts.photosVideosLabel")}
                </span>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => addMedia("image")}
                    className="flex items-center gap-1 border border-gold/30 px-3 py-1 text-xs text-gold hover:bg-gold hover:text-black"
                  >
                    <ImageIcon size={14} /> {t("adminProducts.addImage")}
                  </button>

                  <button
                    type="button"
                    onClick={() => addMedia("video")}
                    className="flex items-center gap-1 border border-gold/30 px-3 py-1 text-xs text-gold hover:bg-gold hover:text-black"
                  >
                    <Video size={14} /> {t("adminProducts.addVideo")}
                  </button>
                </div>
              </div>

              <label
                id="product-media"
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!batchUploading) setDropActive(true);
                }}
                onDragLeave={() => setDropActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropActive(false);
                  void uploadPhotos(e.dataTransfer.files);
                }}
                className={`scroll-mt-32 mb-4 block cursor-pointer rounded-lg border border-dashed p-4 text-sm text-gold ${dropActive ? "border-gold bg-gold/20" : "border-gold/40 bg-gold/5"}`}
              >
                <span className="mb-2 block font-medium">
                  {l("Drop photos here, or choose files", "Fotos hier ablegen oder Dateien wählen")}
                </span>
                {batchUploading ? t("adminProducts.uploading") : t("catalog.uploadMany")}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={batchUploading}
                  onChange={(e) => {
                    void uploadPhotos(e.target.files);
                    e.target.value = "";
                  }}
                  className="mt-2 block w-full text-xs text-white/60"
                />
              </label>
              <div className="space-y-4">
                {editing.media_items.length === 0 && (
                  <p className="border border-dashed border-gold/20 p-4 text-center text-sm text-white/50">
                    {t("adminProducts.noMediaYet")}
                  </p>
                )}

                {editing.media_items.map((item, index) => (
                  <div
                    key={`${index}-${item.url}`}
                    onDragOver={(e) => {
                      if (draggedMedia !== null) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (draggedMedia === null) return;
                      e.preventDefault();
                      setEditing((current) =>
                        current
                          ? {
                              ...current,
                              media_items: moveMedia(current.media_items, draggedMedia, index),
                            }
                          : current,
                      );
                      setDraggedMedia(null);
                    }}
                    className={draggedMedia === index ? "opacity-50" : ""}
                  >
                    <div className="flex items-center justify-between gap-2 border border-gold/20 bg-black px-3 py-2 text-xs text-gold">
                      <span
                        draggable={!batchUploading}
                        onDragStart={(e) => {
                          setDraggedMedia(index);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", String(index));
                        }}
                        onDragEnd={() => setDraggedMedia(null)}
                        className="cursor-grab"
                        title={l(
                          "Drag to reorder; use arrow buttons on touch or keyboard",
                          "Zum Sortieren ziehen; alternativ Pfeiltasten nutzen",
                        )}
                      >
                        {l("Drag to reorder", "Zum Sortieren ziehen")} · {index + 1}
                      </span>
                      <button
                        type="button"
                        disabled={index === 0 || batchUploading}
                        onClick={() =>
                          setEditing((current) =>
                            current
                              ? {
                                  ...current,
                                  media_items: moveMedia(current.media_items, index, 0),
                                }
                              : current,
                          )
                        }
                        className="min-h-9 rounded px-2 hover:bg-gold/10 disabled:opacity-40"
                      >
                        {index === 0
                          ? l("Cover photo", "Titelbild")
                          : l("Make cover", "Als Titelbild")}
                      </button>
                    </div>
                    <MediaUpload
                      colors={editing.colors}
                      onMove={(direction) =>
                        setEditing((current) =>
                          current
                            ? {
                                ...current,
                                media_items: moveMedia(
                                  current.media_items,
                                  index,
                                  index + direction,
                                ),
                              }
                            : current,
                        )
                      }
                      isLast={index === editing.media_items.length - 1}
                      item={item}
                      index={index}
                      onChange={(patch) => updateMedia(index, patch)}
                      onRemove={() => removeMedia(index)}
                    />
                  </div>
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
              {t("adminProducts.availableLabel")}
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
              {t("adminProducts.featured")}
            </label>

            <div className="md:col-span-2">
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="border border-gold/30 px-4 py-2 text-sm text-gold"
              >
                {t("catalog.preview")}
              </button>
              {showPreview && (
                <div className="mt-3 max-w-sm pointer-events-none" inert>
                  <ProductCard
                    product={
                      {
                        ...editing,
                        sku: null,
                        low_stock_threshold: 5,
                        tags: [],
                        sold_count: 0,
                        meta_title: null,
                        meta_description: null,
                        created_at: null,
                        updated_at: null,
                        id: editing.id ?? "preview",
                        specifications: {
                          ...editing.specifications,
                          _media: editing.media_items.map((m) => ({
                            url: m.url,
                            color: m.color ?? "",
                            view: m.view ?? "",
                            alt: m.alt ?? "",
                          })),
                        },
                        product_images: editing.media_items,
                        product_variants: editing.colors.map((color) => ({
                          id: color,
                          variant_type: "Color",
                          variant_value: color,
                          is_available: true,
                        })),
                        categories: {
                          name:
                            (catData?.categories ?? []).find((c) => c.id === editing.category_id)
                              ?.name ?? "KAPTAN",
                          slug: "",
                        },
                        review_count: 0,
                        average_rating: 0,
                      } satisfies Parameters<typeof ProductCard>[0]["product"]
                    }
                  />
                </div>
              )}
            </div>
            <div className="sticky bottom-0 z-20 -mx-1 flex justify-end gap-2 border-t border-gold/20 bg-[#1A1A1A] px-1 py-3 md:col-span-2">
              <button
                type="button"
                disabled={batchUploading || upsert.isPending}
                onClick={closeEditor}
                className="border border-white/20 px-4 py-2 text-sm text-white/70"
              >
                {t("adminProducts.cancel")}
              </button>

              <button
                type="submit"
                disabled={upsert.isPending || batchUploading}
                className="bg-gold px-4 py-2 text-sm font-bold text-black hover:bg-gold-vivid disabled:opacity-50"
              >
                {upsert.isPending ? t("adminProducts.saving") : t("adminProducts.save")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
      <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">{label}</span>
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
  colors,
  onMove,
  isLast,
}: {
  colors: string[];
  onMove: (direction: number) => void;
  isLast: boolean;
  item: MediaItem;
  index: number;
  onChange: (patch: Partial<MediaItem>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
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
      toast.success(
        item.media_type === "video"
          ? t("adminProducts.videoUploadedToast")
          : t("adminProducts.imageUploadedToast"),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminProducts.uploadFailedToast"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border border-gold/15 bg-[#0D0D0D] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-white/50">
          {item.media_type === "video"
            ? t("adminProducts.videoLabelHash")
            : t("adminProducts.imageLabelHash")}{" "}
          #{index + 1}
        </p>

        <button
          type="button"
          onClick={onRemove}
          aria-label={t("adminWorkspace.delete")}
          className="p-2 text-white/40 hover:text-red-400"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-white/70">
          {t("options.color")}
          <select
            value={item.color ?? ""}
            onChange={(e) => onChange({ color: e.target.value })}
            className="mt-1 w-full border border-gold/20 bg-black p-2 text-white"
          >
            <option value="">{t("catalog.allColors")}</option>
            {[...new Set([...colors, ...(item.color ? [item.color] : [])])].map((color) => (
              <option key={color}>{color}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-white/70">
          {t("catalog.view")}
          <input
            value={item.view ?? ""}
            onChange={(e) => onChange({ view: e.target.value })}
            placeholder={t("catalog.viewExample")}
            maxLength={100}
            className="mt-1 w-full border border-gold/20 bg-black p-2 text-white"
          />
        </label>
        <label className="text-xs text-white/70 sm:col-span-2">
          {t("catalog.alt")}
          <input
            value={item.alt ?? ""}
            onChange={(e) => onChange({ alt: e.target.value })}
            maxLength={300}
            className="mt-1 w-full border border-gold/20 bg-black p-2 text-white"
          />
        </label>
      </div>
      <div className="mb-3 flex items-center gap-3 text-xs text-gold">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          className="border border-gold/30 p-2 disabled:opacity-30"
        >
          {t("catalog.moveUp")}
        </button>
        <button
          type="button"
          disabled={isLast}
          onClick={() => onMove(1)}
          className="border border-gold/30 p-2 disabled:opacity-30"
        >
          {t("catalog.moveDown")}
        </button>
        {index === 0 && <span>{t("catalog.cover")}</span>}
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
        placeholder={
          item.media_type === "video"
            ? t("adminProducts.videoUrlPlaceholder")
            : t("adminProducts.imageUrlPlaceholder")
        }
        className="mt-2 w-full border border-gold/20 bg-black px-3 py-2 text-sm text-white outline-none focus:border-gold"
      />

      {uploading && <p className="mt-1 text-xs text-gold">{t("adminProducts.uploading")}</p>}

      {item.url && item.media_type === "video" && (
        <video
          src={item.url}
          controls
          className="mt-3 h-32 w-full border border-gold/20 object-cover"
        />
      )}

      {item.url && item.media_type === "image" && (
        <img src={item.url} alt="" className="mt-3 h-32 w-32 border border-gold/20 object-cover" />
      )}
    </div>
  );
}
