import { Link } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";
import type { Product } from "@/types";

interface ProductCardProps {
  product: Product & { categories?: { name: string; slug: string } | null; product_images?: { url: string }[] | null };
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const imageUrl = product.product_images?.[0]?.url ?? "https://images.unsplash.com/photo-1602028915047-37269d1a73f7?w=400&q=80";
  const categoryName = product.categories?.name ?? "Product";

  function handleAddToCart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    addItem(product, null, 1, imageUrl);
  }

  return (
    <div className="group relative flex flex-col overflow-hidden border border-gold/10 bg-[#1A1A1A] transition-all duration-300 hover:border-gold/30 hover:gold-glow">
      <Link to="/products/$slug" params={{ slug: product.slug }} className="relative block aspect-[4/3] overflow-hidden bg-black">
        <img
          src={imageUrl}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute left-2 top-2 bg-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
          {categoryName}
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <Link to="/products/$slug" params={{ slug: product.slug }}>
          <h3 className="font-serif text-base font-medium text-white transition-colors hover:text-gold">
            {product.name}
          </h3>
        </Link>
        <p className="mt-1 line-clamp-1 text-sm text-gold-dark/70">
          {product.short_description}
        </p>

        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-lg font-bold text-gold">
            €{product.price.toFixed(2)}
          </span>
          {(product.stock_quantity ?? 0) <= 5 && (product.stock_quantity ?? 0) > 0 && (
            <span className="text-xs text-amber-400">Low Stock</span>
          )}
          {(product.stock_quantity ?? 0) === 0 && (
            <span className="text-xs text-red-400">Out of Stock</span>
          )}
        </div>

        <button
          onClick={handleAddToCart}
          disabled={product.stock_quantity === 0}
          className="mt-4 flex w-full items-center justify-center gap-2 bg-gold py-2.5 text-sm font-bold text-black transition-colors hover:bg-gold-vivid disabled:opacity-50"
        >
          <ShoppingBag size={16} />
          {product.stock_quantity === 0 ? "Out of Stock" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}
