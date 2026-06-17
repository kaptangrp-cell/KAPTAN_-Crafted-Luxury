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
    queryFn: () => getProducts({ data: { search: search.q, categorySlug: search.category, limit: 48 } }),
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
  const { data: prodData } = useSuspenseQuery(productsQueryOptions({ q: search.q, category: search.category }));
  const { data: catData } = useSuspenseQuery(categoriesQueryOptions);

  const products = prodData?.products ?? [];
  const categories = catData?.categories ?? [];

  return (
    <PageLayout>
      <section className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-serif text-4xl font-semibold text-white md:text-5xl">Shop</h1>
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
                navigate({ search: { ...search, q: (e.target as HTMLInputElement).value || undefined } });
              }
            }}
            className="w-full border border-gold/30 bg-black px-3 py-2 text-sm text-white outline-none focus:border-gold md:w-72"
          />
        </div>

        <div className="grid gap-8 md:grid-cols-[200px_1fr]">
          <aside>
            <h2 className="mb-3 font-serif text-sm uppercase tracking-wider text-gold">Categories</h2>
            <ul className="space-y-2 text-sm">
              <li>
                <button
                  onClick={() => navigate({ search: { ...search, category: undefined } })}
                  className={`text-left ${!search.category ? "text-gold" : "text-white/70 hover:text-gold"}`}
                >
                  All Products
                </button>
              </li>
              {categories.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => navigate({ search: { ...search, category: c.slug } })}
                    className={`text-left ${search.category === c.slug ? "text-gold" : "text-white/70 hover:text-gold"}`}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {products.length === 0 ? (
            <div className="flex min-h-[300px] items-center justify-center border border-dashed border-gold/20 text-white/60">
              No products match your filters.
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
