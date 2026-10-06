import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { getProducts, getCategories } from "@/lib/products.functions";
import { PageLayout } from "@/components/layout/PageLayout";
import { ProductCard } from "@/components/product/ProductCard";

const searchSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).optional(),
  q: z.string().optional(),
  category: z.string().optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "popular"]).optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  inStock: z.coerce.boolean().optional(),
});

type ProductsSearch = z.infer<typeof searchSchema>;

function productsQueryOptions(search: ProductsSearch) {
  return queryOptions({
    queryKey: ["products", search],
    queryFn: () =>
      getProducts({
        data: {
          search: search.q,
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

export const Route = createFileRoute("/products")({
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(productsQueryOptions(deps)),
      context.queryClient.ensureQueryData(categoriesQueryOptions),
    ]),
  head: () => ({
    meta: [
      { title: "Shop — KAPTAN" },
      { name: "description", content: "Browse premium leather goods and Himalayan salt lamps." },
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
  const search = Route.useSearch();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const navigate = Route.useNavigate();

  const { data: prodData } = useSuspenseQuery(productsQueryOptions(search));
  const { data: catData } = useSuspenseQuery(categoriesQueryOptions);

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
      search: {
        ...search,
        category: slug,
        page: undefined,
      },
    });
  }

  function updateFilter(patch: Partial<ProductsSearch>) {
    navigate({ search: { ...search, page: undefined, ...patch } });
  }

  const hasActiveFilters =
    Boolean(search.minPrice) ||
    Boolean(search.maxPrice) ||
    Boolean(search.inStock) ||
    Boolean(search.sort);

  function clearFilters() {
    navigate({
      search: {
        ...search,
        page: undefined,
        sort: undefined,
        minPrice: undefined,
        maxPrice: undefined,
        inStock: undefined,
      },
    });
  }

  const emptyTitle = search.category
    ? t("products.emptyTitleCategory", {
        category: activeCategory?.name ?? t("products.thisCategory"),
      })
    : t("products.emptyTitleDefault");

  const emptyDescription = search.category
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
            <p className="mt-2 text-sm text-white/60">
              {t("products.productsFound", { count: prodData.total })}
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
                type="search"
                name="q"
                aria-label={t("products.searchPlaceholder")}
                defaultValue={search.q ?? ""}
                placeholder={t("products.searchPlaceholder")}
                className="w-full border border-gold/30 bg-black px-3 py-2 text-sm text-white outline-none focus:border-gold sm:w-56"
              />
              <button type="submit" className="border border-gold px-3 py-2 text-sm text-gold">
                {t("products.searchAction")}
              </button>
            </form>

            <select
              value={search.sort ?? "newest"}
              onChange={(e) => updateFilter({ sort: e.target.value as ProductsSearch["sort"] })}
              className="w-full border border-gold/30 bg-black px-3 py-2 text-sm text-white outline-none focus:border-gold sm:w-48"
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
          className="mb-5 border border-gold px-4 py-3 text-gold md:hidden"
        >
          {t("products.filters")}
        </button>
        <div className="grid gap-8 md:grid-cols-[240px_1fr]">
          <aside id="product-filters" className={`${filtersOpen ? "block" : "hidden"} md:block`}>
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

            <div className="mb-8">
              <h2 className="mb-3 font-serif text-sm uppercase tracking-wider text-gold">
                {t("products.priceRange")}
              </h2>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  aria-label={t("products.minPriceLabel")}
                  placeholder={t("products.min")}
                  defaultValue={search.minPrice ?? ""}
                  onBlur={(e) =>
                    updateFilter({ minPrice: e.target.value ? Number(e.target.value) : undefined })
                  }
                  className="w-full border border-gold/20 bg-black px-2 py-1.5 text-sm text-white outline-none focus:border-gold"
                />
                <span className="text-white/40">–</span>
                <input
                  type="number"
                  min={0}
                  aria-label={t("products.maxPriceLabel")}
                  placeholder={t("products.max")}
                  defaultValue={search.maxPrice ?? ""}
                  onBlur={(e) =>
                    updateFilter({ maxPrice: e.target.value ? Number(e.target.value) : undefined })
                  }
                  className="w-full border border-gold/20 bg-black px-2 py-1.5 text-sm text-white outline-none focus:border-gold"
                />
              </div>
            </div>

            <label className="mb-8 flex cursor-pointer items-center gap-2 text-sm text-white/70 hover:text-gold">
              <input
                type="checkbox"
                checked={Boolean(search.inStock)}
                onChange={(e) => updateFilter({ inStock: e.target.checked || undefined })}
                className="accent-gold"
              />
              {t("products.inStockOnly")}
            </label>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mb-8 text-xs font-semibold uppercase tracking-wider text-gold/70 hover:text-gold"
              >
                {t("products.clearFilters")}
              </button>
            )}
          </aside>

          {products.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center border border-dashed border-gold/20 bg-[#1A1A1A] px-6 text-center">
              <h2 className="font-serif text-3xl text-white">{emptyTitle}</h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-white/60">
                {emptyDescription}
              </p>
              <button
                onClick={() => selectCategory(undefined)}
                className="mt-6 border border-gold px-4 py-2 text-sm font-semibold text-gold hover:bg-gold hover:text-black"
              >
                {t("products.viewAllProducts")}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => (
                <ProductCard key={p.id} product={p as never} />
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
    <div className="mb-8">
      <h2 className="mb-3 font-serif text-sm uppercase tracking-wider text-gold">{title}</h2>

      <ul className="space-y-2 text-sm">
        {categories.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.slug)}
              className={`text-left ${
                activeCategory === c.slug ? "text-gold" : "text-white/70 hover:text-gold"
              }`}
            >
              {c.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
