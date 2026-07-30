import { useTranslation } from "react-i18next";

function WhatsAppIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.6 6.32A8.86 8.86 0 0 0 12.05 3.5c-4.86 0-8.82 3.96-8.82 8.82 0 1.56.41 3.08 1.18 4.42L3.5 20.5l3.87-1.02a8.8 8.8 0 0 0 4.68 1.35h.01c4.86 0 8.82-3.96 8.82-8.82 0-2.35-.92-4.57-2.28-5.69Zm-5.55 13.57h-.01a7.32 7.32 0 0 1-3.74-1.03l-.27-.16-2.78.73.75-2.71-.18-.28a7.34 7.34 0 0 1-1.13-3.92c0-4.05 3.3-7.35 7.36-7.35a7.3 7.3 0 0 1 5.2 2.16 7.3 7.3 0 0 1 2.15 5.19c0 4.06-3.3 7.37-7.35 7.37Zm4.03-5.52c-.22-.11-1.31-.65-1.51-.72-.2-.07-.35-.11-.5.11-.15.22-.57.72-.7.87-.13.15-.26.16-.48.05-.22-.11-.94-.35-1.79-1.11-.66-.59-1.11-1.32-1.24-1.54-.13-.22-.01-.34.1-.45.1-.1.22-.26.33-.39.11-.13.15-.22.22-.37.07-.15.04-.28-.02-.39-.06-.11-.5-1.2-.68-1.65-.18-.43-.36-.37-.5-.38h-.43c-.15 0-.39.06-.59.28-.2.22-.77.75-.77 1.84 0 1.08.79 2.13.9 2.28.11.15 1.55 2.37 3.76 3.32.53.23.94.36 1.26.47.53.17 1.01.14 1.39.09.43-.06 1.31-.53 1.49-1.05.19-.51.19-.95.13-1.05-.06-.09-.2-.15-.42-.26Z" />
    </svg>
  );
}

const WHATSAPP_NUMBER = "491757134333";

export function WhatsAppButton() {
  const { t } = useTranslation();
  const message = encodeURIComponent(t("whatsapp.prefill", "Hi KAPTAN, I have a question about your products."));

  return (
    <a
      href={`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("whatsapp.label", "Chat with us on WhatsApp")}
      title={t("whatsapp.label", "Chat with us on WhatsApp")}
      className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/40 transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
    >
      <WhatsAppIcon />
    </a>
  );
}
