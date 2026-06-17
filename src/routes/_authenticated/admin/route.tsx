import { createFileRoute, Outlet, Link, redirect, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Package, FolderTree, ShoppingCart, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageLayout } from "@/components/layout/PageLayout";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();
    if (!profile || profile.role !== "admin") {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({ meta: [{ title: "Admin — KAPTAN" }] }),
  component: AdminLayout,
});

const nav: { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/categories", label: "Categories", icon: FolderTree },
  { to: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { to: "/admin/customers", label: "Customers", icon: Users },
];

function AdminLayout() {
  const { isAdmin } = useAuthStore();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // SSR-safe hydration check
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <PageLayout>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 md:grid-cols-[220px_1fr] md:px-6">
        <aside className="h-fit border border-gold/20 bg-[#0D0D0D] p-4">
          <p className="mb-4 font-serif text-xs uppercase tracking-[0.2em] text-gold">Admin</p>
          <nav className="flex flex-col gap-1">
            {nav.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to as "/admin"}
                  className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    active ? "bg-gold/10 text-gold" : "text-white/70 hover:bg-white/5 hover:text-gold"
                  }`}
                >
                  <item.icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <section>
          {ready && !isAdmin ? (
            <p className="text-white/60">You are not an admin.</p>
          ) : (
            <Outlet />
          )}
        </section>
      </div>
    </PageLayout>
  );
}
