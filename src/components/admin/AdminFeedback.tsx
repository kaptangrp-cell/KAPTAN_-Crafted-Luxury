import { AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

export function AdminFeedback({ retry }: { retry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-5 text-white"
    >
      <AlertTriangle size={20} className="text-gold" />
      <p className="min-w-0 flex-1 basis-[75%] text-sm sm:basis-auto">
        {t("adminWorkspace.loadError")}
      </p>
      {retry && (
        <button
          onClick={retry}
          className="flex items-center gap-2 rounded-lg border border-gold/30 px-3 py-2 text-sm text-gold"
        >
          <RefreshCw size={14} />
          {t("common.tryAgain")}
        </button>
      )}
    </div>
  );
}
