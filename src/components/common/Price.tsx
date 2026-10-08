import { useTranslation } from "react-i18next";
import { formatEuro } from "@/lib/currency";

export function Price({ amount, className }: { amount: number; className?: string }) {
  const { i18n } = useTranslation();
  return <span className={className}>{formatEuro(amount, i18n.language)}</span>;
}
