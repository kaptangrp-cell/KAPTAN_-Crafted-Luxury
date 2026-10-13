import { useState } from "react";
import { UserRound } from "lucide-react";

export function ProfileAvatar({
  url,
  className = "h-9 w-9",
}: {
  url?: string | null;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gold/10 text-gold ${className}`}
    >
      {url && failedUrl !== url ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <UserRound size={20} strokeWidth={1.5} />
      )}
    </span>
  );
}
