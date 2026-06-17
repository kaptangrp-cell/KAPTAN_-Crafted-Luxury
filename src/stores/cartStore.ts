import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product, ProductVariant } from "@/types";

interface CartItem {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  name: string;
  price: number;
  imageUrl: string;
  variantLabel: string | null;
}

interface CartState {
  items: CartItem[];
  addItem: (product: Product, variant: ProductVariant | null, quantity: number, imageUrl: string) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: () => number;
  subtotal: () => number;
}

function generateCartItemId(productId: string, variantId: string | null) {
  return variantId ? `${productId}::${variantId}` : productId;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (product, variant, quantity, imageUrl) => {
        const id = generateCartItemId(product.id, variant?.id ?? null);
        const existing = get().items.find((i) => i.id === id);
        const unitPrice = product.price + (variant?.price_modifier ?? 0);
        const variantLabel = variant ? `${variant.variant_type}: ${variant.variant_value}` : null;

        if (existing) {
          set({
            items: get().items.map((i) =>
              i.id === id ? { ...i, quantity: i.quantity + quantity } : i
            ),
          });
        } else {
          set({
            items: [
              ...get().items,
              {
                id,
                productId: product.id,
                variantId: variant?.id ?? null,
                quantity,
                name: product.name,
                price: unitPrice,
                imageUrl,
                variantLabel,
              },
            ],
          });
        }
      },
      removeItem: (cartItemId) => {
        set({ items: get().items.filter((i) => i.id !== cartItemId) });
      },
      updateQuantity: (cartItemId, quantity) => {
        if (quantity <= 0) {
          set({ items: get().items.filter((i) => i.id !== cartItemId) });
        } else {
          set({
            items: get().items.map((i) =>
              i.id === cartItemId ? { ...i, quantity } : i
            ),
          });
        }
      },
      clearCart: () => set({ items: [] }),
      totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
      subtotal: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    }),
    {
      name: "kaptan-cart",
    }
  )
);
