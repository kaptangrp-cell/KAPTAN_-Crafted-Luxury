import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useReducedMotion } from "framer-motion";

export type PhotoSlide = { url: string; alt: string; slug?: string };
export function PhotoCarousel({
  slides,
  className = "aspect-square",
  priority = false,
  footer,
  children,
}: {
  slides: PhotoSlide[];
  className?: string;
  priority?: boolean;
  footer?: (index: number) => ReactNode;
  children?: ReactNode;
}) {
  const { i18n } = useTranslation();
  const de = i18n.language.startsWith("de");
  const l = (en: string, ger: string) => (de ? ger : en);
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const safeIndex = index % Math.max(slides.length, 1);
  const slide = slides[safeIndex];
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.15,
    });
    if (root.current) observer.observe(root.current);
    const visibility = () => setTabVisible(!document.hidden);
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (slides.length < 2 || paused || hover || focused || reduced || !visible || !tabVisible)
      return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % slides.length), 4000);
    return () => window.clearInterval(timer);
  }, [slides.length, paused, hover, focused, reduced, visible, tabVisible]);
  function move(delta: number) {
    setPaused(true);
    setIndex((i) => (i + delta + slides.length) % slides.length);
  }
  const control =
    "flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/75 text-white hover:bg-black focus-visible:outline-2 focus-visible:outline-gold";
  const photo = (
    <img
      src={slide?.url ?? "/product-placeholder.svg"}
      alt={slide?.alt ?? l("Product photo", "Produktfoto")}
      draggable={false}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority && safeIndex === 0 ? "high" : "auto"}
      className="h-full w-full object-contain p-3"
    />
  );
  return (
    <div
      ref={root}
      role="region"
      aria-roledescription={l("carousel", "Karussell")}
      aria-label={l("Product photos", "Produktbilder")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" && slides.length > 1) {
          e.preventDefault();
          move(1);
        }
        if (e.key === "ArrowLeft" && slides.length > 1) {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      <div
        className={`relative overflow-hidden bg-[#f3f0eb] ${className}`}
        style={{ touchAction: "pan-y" }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          pointer.current = { x: e.clientX, y: e.clientY };
          swiped.current = false;
        }}
        onPointerUp={(e) => {
          if (!pointer.current) return;
          const dx = e.clientX - pointer.current.x,
            dy = e.clientY - pointer.current.y;
          pointer.current = null;
          if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) && slides.length > 1) {
            swiped.current = true;
            move(dx < 0 ? 1 : -1);
          }
        }}
        onPointerCancel={() => {
          pointer.current = null;
        }}
        onClickCapture={(e) => {
          if (swiped.current) {
            e.preventDefault();
            e.stopPropagation();
            swiped.current = false;
          }
        }}
      >
        {slide?.slug ? (
          <Link
            to="/products/$slug"
            params={{ slug: slide.slug }}
            className="block h-full"
            onDragStart={(e) => e.preventDefault()}
          >
            {photo}
          </Link>
        ) : (
          photo
        )}
        {slides.length > 1 && (
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={control}
                aria-label={l("Previous photo", "Vorheriges Bild")}
                onClick={() => move(-1)}
              >
                <ChevronLeft size={17} />
              </button>
              <span className="rounded-full bg-black/75 px-3 py-1 text-xs text-white">
                {safeIndex + 1} / {slides.length}
              </span>
              <button
                type="button"
                className={control}
                aria-label={l("Next photo", "Nächstes Bild")}
                onClick={() => move(1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
            {!reduced && (
              <button
                type="button"
                className={control}
                aria-label={
                  paused
                    ? l("Play slideshow", "Diashow starten")
                    : l("Pause slideshow", "Diashow pausieren")
                }
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? <Play size={15} /> : <Pause size={15} />}
              </button>
            )}
          </div>
        )}
        {children}
      </div>
      {footer?.(safeIndex)}
    </div>
  );
}
