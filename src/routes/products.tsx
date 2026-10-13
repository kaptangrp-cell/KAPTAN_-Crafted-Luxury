import { motion, useReducedMotion } from "framer-motion";
import { CatalogText } from "@/components/common/CatalogText";
import { useState } from "react";
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { CatalogSearchSchema } from "@/lib/catalog-filters";
import { colorHex } from "@/lib/product-media";
import { SlidersHorizontal, X, Check, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getProducts, getCategories, getCatalogColors } from "@/lib/products.functions";
import { PageLayout } from "@/components/layout/PageLayout";
import { ProductCard } from "@/components/product/ProductCard";

const searchSchema = CatalogSearchSchema;

type ProductsSearch = z.infer<typeof searchSchema>;

function productsQueryOptions(search: ProductsSearch) {
  return queryOptions({
    queryKey: ["products", search],
    queryFn: () =>
      getProducts({
        data: {
          search: search.q,
          colors: search.colors,
          categorySlug: search.category,
          sort: search.sort,
          minPrice: search.minPrice,
          maxPrice: search.maxPrice,
          inStockOnly: search.inStock,
          limit: 24,
          offset: ((search.page ?? 1) - 1) * 24,
        },
      }),
  });
}

const categoriesQueryOptions = queryOptions({
  queryKey: ["categories"],
  queryFn: () => getCategories(),
});

const colorsQueryOptions = queryOptions({
  queryKey: ["catalog-colors"],
  queryFn: () => getCatalogColors(),
  staleTime: 60000,
});

export const Route = createFileRoute("/products")({
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(productsQueryOptions(deps)),
      context.queryClient.ensureQueryData(categoriesQueryOptions),
      context.queryClient.ensureQueryData(colorsQueryOptions),
    ]),
  head: () => ({
    meta: [
      { title: "Shop — KAPTAN" },
      {
        name: "description",
        content:
          "Shop leather accessories and home lighting. Explore prices, materials, colours and practical details.",
      },
    ],
  }),
  component: ProductsPage,
});

const SORT_OPTIONS: { value: NonNullable<ProductsSearch["sort"]>; labelKey: string }[] = [
  { value: "newest", labelKey: "products.sortNewest" },
  { value: "popular", labelKey: "products.sortMostPopular" },
  { value: "price_asc", labelKey: "products.sortPriceLowHigh" },
  { value: "price_desc", labelKey: "products.sortPriceHighLow" },
];

function ProductsPage() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const search = Route.useSearch();
  const filtering = useRouterState({ select: (state) => state.isLoading });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const navigate = Route.useNavigate();

  const { data: prodData } = useSuspenseQuery(productsQueryOptions(search));
  const { data: catData } = useSuspenseQuery(categoriesQueryOptions);
  const { data: colorData } = useSuspenseQuery(colorsQueryOptions);

  const products = prodData?.products ?? [];
  const categories = catData?.categories ?? [];

  const activeCategory = categories.find((c) => c.slug === search.category);

  const leatherCategories = categories.filter((c) => c.slug.toLowerCase().includes("leather"));

  const saltCategories = categories.filter((c) => c.slug.toLowerCase().includes("salt"));

  const otherCategories = categories.filter(
    (c) => !c.slug.toLowerCase().includes("leather") && !c.slug.toLowerCase().includes("salt"),
  );

  function selectCategory(slug?: string) {
    navigate({
      resetScroll: false,
      search: {
        ...search,
        category: slug,
        page: undefined,
      },
    });
  }

  function updateFilter(patch: Partial<ProductsSearch>) {
    navigate({ resetScroll: false, search: { ...search, page: undefined, ...patch } });
  }

  const chips = [
    ...(search.q ? [{ label: `“${search.q}”`, patch: { q: undefined } }] : []),
    ...(search.category
      ? [{ label: activeCategory?.name ?? search.category, patch: { category: undefined } }]
      : []),
    ...(search.colors ?? []).map((color) => ({
      label: colorData.colors.find((c) => c.value === color)?.label ?? color,
      patch: { colors: search.colors?.filter((c) => c !== color) },
    })),
    ...(search.minPrice !== undefined || search.maxPrice !== undefined
      ? [
          {
            label: `€${search.minPrice ?? 0} – ${search.maxPrice !== undefined ? `€${search.maxPrice}` : "∞"}`,
            patch: { minPrice: undefined, maxPrice: undefined },
          },
        ]
      : []),
    ...(search.inStock
      ? [{ label: t("products.inStockOnly"), patch: { inStock: undefined } }]
      : []),
  ];
  function clearFilters() {
    navigate({ resetScroll: false, search: { sort: search.sort } });
  }
  function toggleColor(color: string) {
    const selected = search.colors ?? [];
    updateFilter({
      colors: selected.includes(color) ? selected.filter((c) => c !== color) : [...selected, color],
    });
  }

  const emptyTitle = chips.length
    ? t("filters.noMatches")
    : search.category
      ? t("products.emptyTitleCategory", {
          category: activeCategory?.name ?? t("products.thisCategory"),
        })
      : t("products.emptyTitleDefault");

  const emptyDescription = chips.length
    ? t("filters.tryAgain")
    : search.category
      ? t("products.emptyDescCategory")
      : t("products.emptyDescDefault");

  return (
    <PageLayout>
      <section className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-serif text-4xl font-semibold text-white md:text-5xl">
              {t("products.title")}
            </h1>
            <p aria-live="polite" className="mt-2 text-sm text-white/60">
              {filtering
                ? t("filters.updating")
                : t("products.productsFound", { count: prodData.total })}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const query = new FormData(e.currentTarget).get("q")?.toString().trim();
                updateFilter({ q: query || undefined, page: undefined });
              }}
            >
              <input
                key={search.q ?? ""}
                type="search"
                name="q"
                aria-label={t("products.searchPlaceholder")}
                defaultValue={search.q ?? ""}
                placeholder={t("products.searchPlaceholder")}
                className="min-w-0 w-full rounded-xl border border-gold/30 bg-black px-3 py-3 text-sm text-white outline-none focus:border-gold sm:w-56"
              />
              <button
                type="submit"
                className="rounded-xl border border-gold/40 px-4 py-2 text-sm text-gold hover:bg-gold/10"
              >
                {t("products.searchAction")}
              </button>
            </form>

            <select
              value={search.sort ?? "newest"}
              onChange={(e) => updateFilter({ sort: e.target.value as ProductsSearch["sort"] })}
              className="min-w-0 w-full rounded-xl border border-gold/30 bg-black px-3 py-3 text-sm text-white outline-none focus:border-gold sm:w-48"
              aria-label={t("products.sortAriaLabel")}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-black">
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="product-filters"
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-gold md:hidden"
        >
          <SlidersHorizontal size={17} />
          {t("products.filters")}{" "}
          {chips.length > 0 && (
            <span className="rounded-full bg-gold px-2 text-xs text-black">{chips.length}</span>
          )}
        </button>
        {chips.length > 0 && (
          <div
            className="mb-6 flex flex-wrap items-center gap-2"
            aria-label={t("filters.selected")}
          >
            {chips.map((chip, index) => (
              <button
                key={`${chip.label}-${index}`}
                onClick={() => updateFilter(chip.patch)}
                className="flex items-center gap-2 rounded-full border border-gold/25 bg-gold/10 px-3 py-2 text-xs text-gold"
                aria-label={t("filters.remove", { filter: chip.label })}
              >
                <CatalogText text={chip.label} />
                <X size={13} />
              </button>
            ))}
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-xs text-white/60 underline underline-offset-4 hover:text-gold"
            >
              {t("products.clearFilters")}
            </button>
          </div>
        )}
        <div aria-busy={filtering} className="grid items-start gap-8 md:grid-cols-[240px_1fr]">
          <aside
            id="product-filters"
            className={`${filtersOpen ? "block" : "hidden"} rounded-2xl border border-gold/15 bg-[#0D0D0D] p-5 md:block`}
          >
            <div className="mb-5 flex items-center justify-between text-gold">
              <h2 className="flex items-center gap-2 font-serif text-lg">
                <SlidersHorizontal size={16} />
                {t("products.filters")}
              </h2>
              {chips.length > 0 && (
                <button
                  aria-label={t("products.clearFilters")}
                  onClick={clearFilters}
                  className="text-xs underline"
                >
                  {t("filters.reset")}
                </button>
              )}
            </div>
            <button
              onClick={() => selectCategory(undefined)}
              className={`mb-6 text-left text-sm font-semibold ${
                !search.category ? "text-gold" : "text-white/70 hover:text-gold"
              }`}
            >
              {t("products.allProducts")}
            </button>

            <CategoryGroup
              title={t("products.leatherProducts")}
              categories={leatherCategories}
              activeCategory={search.category}
              onSelect={selectCategory}
            />

            <CategoryGroup
              title={t("products.saltLamps")}
              categories={saltCategories}
              activeCategory={search.category}
              onSelect={selectCategory}
            />

            {otherCategories.length > 0 && (
              <CategoryGroup
                title={t("products.other")}
                categories={otherCategories}
                activeCategory={search.category}
                onSelect={selectCategory}
              />
            )}

            <details open className="mb-6 border-t border-gold/10 pt-4">
              <summary className="cursor-pointer text-sm font-medium text-gold">
                {t("products.priceRange")}
              </summary>
              <PriceFilter
                key={`${search.minPrice}-${search.maxPrice}`}
                min={search.minPrice}
                max={search.maxPrice}
                onApply={(minPrice, maxPrice) => updateFilter({ minPrice, maxPrice })}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { label: t("filters.under", { price: 25 }), min: undefined, max: 25 },
                  { label: "€25 – €50", min: 25, max: 50 },
                  { label: "€50 – €100", min: 50, max: 100 },
                  { label: "€100+", min: 100, max: undefined },
                ].map((range) => (
                  <button
                    key={range.label}
                    onClick={() => updateFilter({ minPrice: range.min, maxPrice: range.max })}
                    aria-pressed={search.minPrice === range.min && search.maxPrice === range.max}
                    className={`rounded-full border px-2.5 py-1.5 text-xs ${search.minPrice === range.min && search.maxPrice === range.max ? "border-gold bg-gold/10 text-gold" : "border-gold/15 text-white/60 hover:border-gold/40"}`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-white/50">{t("filters.priceHelp")}</p>
            </details>
            {colorData.colors.length > 0 && (
              <details open className="mb-6 border-t border-gold/10 pt-4">
                <summary className="cursor-pointer text-sm font-medium text-gold">
                  {t("options.color")}
                </summary>
                <p className="mt-2 text-xs text-white/50">{t("filters.colorHelp")}</p>
                <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
                  {colorData.colors.map((color) => (
                    <label
                      key={color.value}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-white/80 hover:bg-gold/5"
                    >
                      <input
                        type="checkbox"
                        disabled={filtering}
                        checked={search.colors?.includes(color.value) ?? false}
                        onChange={() => toggleColor(color.value)}
                        className="h-4 w-4 accent-gold"
                      />
                      <span
                        aria-hidden="true"
                        className="h-5 w-5 rounded-full border border-white/30"
                        style={{ background: colorHex(color.label) }}
                      />
                      <span>{color.label}</span>
                    </label>
                  ))}
                </div>
              </details>
            )}

            <label className="mb-8 flex cursor-pointer items-center gap-2 text-sm text-white/70 hover:text-gold">
              <input
                type="checkbox"
                checked={Boolean(search.inStock)}
                onChange={(e) => updateFilter({ inStock: e.target.checked || undefined })}
                className="accent-gold"
              />
              {t("products.inStockOnly")}
            </label>

            <button
              onClick={() => setFiltersOpen(false)}
              className="w-full rounded-full bg-gold py-3 text-sm font-semibold text-black md:hidden"
            >
              {t("filters.showResults", { count: prodData.total })}
            </button>
          </aside>

          {products.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-gold/20 bg-[#1A1A1A] px-6 text-center">
              <Search size={28} className="mb-4 text-gold/60" />
              <h2 className="font-serif text-3xl text-white">{emptyTitle}</h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-white/60">
                {emptyDescription}
              </p>
              <button
                onClick={clearFilters}
                className="mt-6 border border-gold px-4 py-2 text-sm font-semibold text-gold hover:bg-gold hover:text-black"
              >
                {t("products.viewAllProducts")}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => (
                <motion.div
                  key={p.id}
                  layout={!reducedMotion}
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.22 }}
                >
                  <ProductCard product={p as never} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
        {(prodData.total > 24 || (search.page ?? 1) > 1) && (
          <nav
            aria-label={t("products.pagination")}
            className="mt-8 flex justify-end gap-4 text-gold"
          >
            <button
              disabled={(search.page ?? 1) <= 1}
              onClick={() => updateFilter({ page: (search.page ?? 1) - 1 })}
              className="border border-gold px-4 py-2 disabled:opacity-40"
            >
              {t("products.previous")}
            </button>
            <span className="py-2">
              {search.page ?? 1} / {Math.max(1, Math.ceil(prodData.total / 24))}
            </span>
            <button
              disabled={(search.page ?? 1) * 24 >= prodData.total}
              onClick={() => updateFilter({ page: (search.page ?? 1) + 1 })}
              className="border border-gold px-4 py-2 disabled:opacity-40"
            >
              {t("products.next")}
            </button>
          </nav>
        )}
      </section>
    </PageLayout>
  );
}

function CategoryGroup({
  title,
  categories,
  activeCategory,
  onSelect,
}: {
  title: string;
  categories: { id: string; name: string; slug: string }[];
  activeCategory?: string;
  onSelect: (slug: string) => void;
}) {
  if (categories.length === 0) return null;

  return (
    <details
      open={categories.some((category) => category.slug === activeCategory)}
      className="mb-5 border-t border-gold/10 pt-4"
    >
      <summary className="mb-3 cursor-pointer text-sm font-medium text-gold">{title}</summary>

      <ul className="space-y-2 text-sm">
        {categories.map((c) => (
          <li key={c.id}>
            <button
              aria-pressed={activeCategory === c.slug}
              onClick={() => onSelect(c.slug)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left ${
                activeCategory === c.slug ? "bg-gold/10 text-gold" : "text-white/70 hover:text-gold"
              }`}
            >
              <CatalogText text={c.name} />
              {activeCategory === c.slug && <Check size={14} className="shrink-0" />}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function PriceFilter({
  min,
  max,
  onApply,
}: {
  min?: number;
  max?: number;
  onApply: (min?: number, max?: number) => void;
}) {
  const { t } = useTranslation();
  const [low, setLow] = useState(min?.toString() ?? "");
  const [high, setHigh] = useState(max?.toString() ?? "");
  const [error, setError] = useState(false);
  return (
    <form
      className="mt-3"
      onSubmit={(event) => {
        event.preventDefault();
        const a = low === "" ? undefined : Number(low);
        const b = high === "" ? undefined : Number(high);
        if (a !== undefined && b !== undefined && a > b) {
          setError(true);
          return;
        }
        setError(false);
        onApply(a, b);
      }}
    >
      <div className="flex gap-2">
        <label className="min-w-0 flex-1 text-xs text-white/60">
          {t("products.min")}
          <input
            type="number"
            min="0"
            max="100000"
            step="0.01"
            value={low}
            onChange={(e) => {
              setLow(e.target.value);
              setError(false);
            }}
            aria-label={t("products.minPriceLabel")}
            className="mt-1 w-full min-w-0 rounded-lg border border-gold/20 bg-black px-2 py-2 text-sm text-white outline-none focus:border-gold"
          />
        </label>
        <label className="min-w-0 flex-1 text-xs text-white/60">
          {t("products.max")}
          <input
            type="number"
            min="0"
            max="100000"
            step="0.01"
            value={high}
            onChange={(e) => {
              setHigh(e.target.value);
              setError(false);
            }}
            aria-label={t("products.maxPriceLabel")}
            className="mt-1 w-full min-w-0 rounded-lg border border-gold/20 bg-black px-2 py-2 text-sm text-white outline-none focus:border-gold"
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {t("filters.priceError")}
        </p>
      )}
      <button
        type="submit"
        className="mt-3 w-full rounded-lg border border-gold/30 py-2 text-xs font-semibold text-gold hover:bg-gold/10"
      >
        {t("filters.applyPrice")}
      </button>
    </form>
  );
}
