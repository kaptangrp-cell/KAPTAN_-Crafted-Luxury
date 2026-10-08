import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePreferencesStore } from "@/stores/preferencesStore";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

export function LanguageSwitcher() {
  const { t } = useTranslation();
  const { language, setLanguage } = usePreferencesStore();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("language.switch")}
          title={t("language.switch")}
          className="flex h-9 w-9 items-center justify-center rounded-md text-gold/80 transition-colors hover:bg-gold/10 hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
        >
          <Languages size={20} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40 border-gold/20 bg-black text-white">
        <DropdownMenuRadioGroup
          value={language}
          onValueChange={(value) => {
            if (value === "en" || value === "de") setLanguage(value);
          }}
        >
          <DropdownMenuRadioItem value="en" lang="en">
            English
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="de" lang="de">
            Deutsch
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
