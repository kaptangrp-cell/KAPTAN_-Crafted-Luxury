import { createFileRoute } from "@tanstack/react-router";
import { InventoryAdmin } from "@/components/warehouse/InventoryAdmin";
export const Route = createFileRoute("/_authenticated/admin/staff")({
  component: () => <InventoryAdmin staffOnly />,
});
