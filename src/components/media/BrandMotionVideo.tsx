import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Original brand films: load near the viewport; never crop their embedded typography. */
export function BrandMotionVideo({
  name,
  title,
  square = false,
}: {
  name: string;
  title: string;
  square?: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [manual, setManual] = useState<boolean | null>(null);
  const [saveData, setSaveData] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const allowed = manual ?? (!reduced && !saveData);
  const load = near && (manual !== null || (!reduced && !saveData));
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setSaveData(
      Boolean(
        (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
      ),
    );
    const nearby = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setNear(true);
      },
      { rootMargin: "200px" },
    );
    const onscreen = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.15,
    });
    nearby.observe(element);
    onscreen.observe(element);
    const visibility = () => setPageVisible(!document.hidden);
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      nearby.disconnect();
      onscreen.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (load && allowed && visible && pageVisible)
      void element.play().catch(() => setPlaying(false));
    else element.pause();
  }, [load, allowed, visible, pageVisible, name, manual]);
  return (
    <figure className="relative overflow-hidden rounded-xl border border-gold/20 bg-black">
      <video
        ref={ref}
        src={load ? `/website-motion/KAPTAN-${name}.mp4` : undefined}
        poster={`/website-motion/KAPTAN-${name}-poster.jpg`}
        className={`block max-h-[70svh] w-full object-contain ${square ? "aspect-square" : "aspect-video"}`}
        aria-label={title}
        muted
        loop
        playsInline
        preload="none"
        onPlaying={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => {
          setFailed(true);
          setPlaying(false);
        }}
      />
      <figcaption className="flex items-center justify-between gap-3 border-t border-gold/15 px-4 py-3 text-sm text-gold">
        <span>{title}</span>
        {!failed && (
          <button
            type="button"
            onClick={() => {
              setNear(true);
              setManual(!playing);
            }}
            aria-label={t(playing ? "brandFilms.pause" : "brandFilms.play", { title })}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-gold/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
        )}
      </figcaption>
    </figure>
  );
}
