import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { getProducts, getCategories } from "@/lib/products.functions";
import { PageLayout } from "@/components/layout/PageLayout";
import { ProductCard } from "@/components/product/ProductCard";

const searchSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
});

function productsQueryOptions(search: { q?: string; category?: string }) {
  return queryOptions({
    queryKey: ["products", search],
    queryFn: () =>
      getProducts({
        data: {
          search: search.q,
          categorySlug: search.category,
          limit: 48,
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
  loaderDeps: ({ search }) => ({ q: search.q, category: search.category }),
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

function ProductsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data: prodData } = useSuspenseQuery(
    productsQueryOptions({ q: search.q, category: search.category }),
  );
  const { data: catData } = useSuspenseQuery(categoriesQueryOptions);

  const products = prodData?.products ?? [];
  const categories = catData?.categories ?? [];

  const activeCategory = categories.find((c) => c.slug === search.category);

  const leatherCategories = categories.filter((c) =>
    c.slug.toLowerCase().includes("leather"),
  );

  const saltCategories = categories.filter((c) =>
    c.slug.toLowerCase().includes("salt"),
  );

  const otherCategories = categories.filter(
    (c) =>
      !c.slug.toLowerCase().includes("leather") &&
      !c.slug.toLowerCase().includes("salt"),
  );

  function selectCategory(slug?: string) {
    navigate({
      search: {
        ...search,
        category: slug,
      },
    });
  }

  const emptyTitle = search.category
    ? `${activeCategory?.name ?? "This category"} is coming soon`
    : "No products available";

  const emptyDescription = search.category
    ? "We are preparing products for this category. Please check again soon."
    : "Products will be added soon.";

  return (
    <PageLayout>
      <section className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-serif text-4xl font-semibold text-white md:text-5xl">
              Shop
            </h1>
            <p className="mt-2 text-sm text-white/60">
              {products.length} {products.length === 1 ? "product" : "products"} found
            </p>
          </div>

          <input
            type="search"
            defaultValue={search.q ?? ""}
            placeholder="Search products..."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                navigate({
                  search: {
                    ...search,
                    q: (e.target as HTMLInputElement).value || undefined,
                  },
                });
              }
            }}
            className="w-full border border-gold/30 bg-black px-3 py-2 text-sm text-white outline-none focus:border-gold md:w-72"
          />
        </div>

        <div className="grid gap-8 md:grid-cols-[240px_1fr]">
          <aside>
            <button
              onClick={() => selectCategory(undefined)}
              className={`mb-6 text-left text-sm font-semibold ${
                !search.category ? "text-gold" : "text-white/70 hover:text-gold"
              }`}
            >
              All Products
            </button>

            <CategoryGroup
              title="Leather Products"
              categories={leatherCategories}
              activeCategory={search.category}
              onSelect={selectCategory}
            />

            <CategoryGroup
              title="Salt Lamps"
              categories={saltCategories}
              activeCategory={search.category}
              onSelect={selectCategory}
            />

            {otherCategories.length > 0 && (
              <CategoryGroup
                title="Other"
                categories={otherCategories}
                activeCategory={search.category}
                onSelect={selectCategory}
              />
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
                View All Products
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
      <h2 className="mb-3 font-serif text-sm uppercase tracking-wider text-gold">
        {title}
      </h2>

      <ul className="space-y-2 text-sm">
        {categories.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.slug)}
              className={`text-left ${
                activeCategory === c.slug
                  ? "text-gold"
                  : "text-white/70 hover:text-gold"
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