import { create } from "zustand";
import { persist } from "zustand/middleware";
import i18n from "@/lib/i18n";

export type Theme = "dark" | "light";
export type Language = "en" | "de";

interface PreferencesState {
  theme: Theme;
  language: Language;
  hasHydrated: boolean;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setLanguage: (l: Language) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      language: "en",
      hasHydrated: false,
      setTheme: (theme) => {
        set({ theme });
        if (typeof document !== "undefined") {
          document.documentElement.classList.toggle("light", theme === "light");
          document.documentElement.classList.toggle("dark", theme === "dark");
        }
      },
      toggleTheme: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        get().setTheme(next);
      },
      setLanguage: (language) => {
        set({ language });
        i18n.changeLanguage(language);
        if (typeof document !== "undefined") {
          document.documentElement.lang = language;
        }
      },
    }),
    {
      name: "kaptan-prefs",
      // Skip auto-rehydration so first client render matches SSR defaults.
      // Hydration is triggered explicitly from a useEffect in the root component.
      skipHydration: true,
    },
  ),
);

