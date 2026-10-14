import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ScanLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/authStore";
import { getWarehouseAccess } from "@/lib/warehouse.functions";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
export function WarehouseMenuItem() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const access = useServerFn(getWarehouseAccess);
  const { data } = useQuery({
    queryKey: ["warehouse-access", user?.id],
    queryFn: () => access(),
    enabled: !!user,
    retry: false,
    refetchInterval: 30000,
  });
  if (!data?.permissions.length) return null;
  return (
    <DropdownMenuItem asChild className="rounded-lg px-3 py-3">
      <Link to="/warehouse">
        <ScanLine size={16} />
        {t("warehouse.title")}
      </Link>
    </DropdownMenuItem>
  );
}
