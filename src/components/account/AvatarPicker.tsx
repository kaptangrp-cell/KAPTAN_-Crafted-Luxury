import { useState } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AVATARS } from "@/lib/avatars";
import { ProfileAvatar } from "./ProfileAvatar";

export function AvatarPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <section
      className="mb-8 rounded-2xl border border-gold/20 bg-gold/5 p-4 sm:p-6"
      aria-label={t("buyer.avatarTitle")}
    >
      <div className="flex items-center gap-4">
        <ProfileAvatar url={value} className="h-16 w-16 ring-2 ring-gold/40" />
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-xl text-white">{t("buyer.avatarTitle")}</h2>
          <p className="mt-1 text-sm text-white/60">{t("buyer.avatarHelp")}</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-4 gap-3 sm:grid-cols-8 lg:grid-cols-12">
        {(expanded ? AVATARS : AVATARS.slice(0, 24)).map((avatar) => (
          <button
            key={avatar.id}
            type="button"
            aria-label={t("buyer.avatarNumber", { number: avatar.id })}
            aria-pressed={value === avatar.url}
            onClick={() => onChange(avatar.url)}
            className={`relative rounded-full border-2 p-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${value === avatar.url ? "border-gold bg-gold/20" : "border-transparent hover:border-gold/50"}`}
          >
            <img
              src={avatar.url}
              alt=""
              loading="lazy"
              className="aspect-square w-full rounded-full"
            />
            {value === avatar.url && (
              <span className="absolute bottom-0 right-0 rounded-full bg-gold p-1 text-black">
                <Check size={12} />
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-5 text-sm text-gold">
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {t(expanded ? "buyer.fewerAvatars" : "buyer.allAvatars")}
        </button>
        <button type="button" onClick={() => onChange(null)}>
          {t("buyer.resetAvatar")}
        </button>
      </div>
      <p className="mt-3 text-xs text-white/50">{t("buyer.avatarSave")}</p>
    </section>
  );
}
