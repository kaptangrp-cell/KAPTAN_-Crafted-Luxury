import { Link } from "@tanstack/react-router";
import { X, Minus, Plus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useUIStore } from "@/stores/uiStore";
import { useCartStore } from "@/stores/cartStore";

export function CartDrawer() {
  const { isCartOpen, closeCart } = useUIStore();
  const { items, removeItem, updateQuantity, subtotal, clearCart } = useCartStore();

  return (
    <Sheet open={isCartOpen} onOpenChange={closeCart}>
      <SheetContent className="flex w-full flex-col border-l border-gold/20 bg-[#0D0D0D] sm:max-w-md">
        <SheetHeader className="border-b border-gold/10 pb-4">
          <SheetTitle className="font-serif text-lg text-white">
            Your Cart ({items.reduce((s, i) => s + i.quantity, 0)} items)
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-gold/20">
              <span className="text-2xl text-gold">🛍</span>
            </div>
            <p className="text-white/70">Your cart is empty.</p>
            <button
              onClick={closeCart}
              className="border border-gold px-4 py-2 text-sm font-semibold text-gold transition-colors hover:bg-gold hover:text-black"
            >
              Shop Now
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto py-4">
              <div className="space-y-4">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex gap-3 rounded-sm border border-gold/10 bg-black/40 p-3"
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-20 w-20 flex-shrink-0 rounded-sm bg-[#1A1A1A] object-cover"
                    />
                    <div className="flex flex-1 flex-col justify-between">
                      <div>
                        <p className="font-serif text-sm font-medium text-white">{item.name}</p>
                        {item.variantLabel && (
                          <p className="text-xs text-gold-dark">{item.variantLabel}</p>
                        )}
                        <p className="mt-1 font-mono text-sm text-gold">€{item.price.toFixed(2)}</p>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 border border-gold/20">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="px-2 py-1 text-gold/80 hover:text-gold"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="min-w-[1.5ch] text-center text-sm text-white">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="px-2 py-1 text-gold/80 hover:text-gold"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-white/40 transition-colors hover:text-red-400"
                          aria-label="Remove item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gold/10 pt-4">
              <div className="mb-4 flex justify-between font-mono text-white">
                <span>Subtotal</span>
                <span className="text-gold">€{subtotal().toFixed(2)}</span>
              </div>
              <Link
                to="/cart"
                onClick={closeCart}
                className="block w-full bg-gold py-3 text-center text-sm font-bold text-black transition-colors hover:bg-gold-vivid"
              >
                Proceed to Checkout
              </Link>
              <button
                onClick={closeCart}
                className="mt-2 block w-full py-2 text-center text-xs text-gold/70 hover:text-gold"
              >
                Continue Shopping
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
