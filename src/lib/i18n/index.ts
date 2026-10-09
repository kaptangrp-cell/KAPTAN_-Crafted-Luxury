import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import de from "./de.json";

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      de: { translation: de },
    },
    lng: "en",
    fallbackLng: "en",
    supportedLngs: ["en", "de"],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
} else {
  i18n.addResourceBundle("en", "translation", en, true, true);
  i18n.addResourceBundle("de", "translation", de, true, true);
}

export default i18n;
