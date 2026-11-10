import { useEffect, useRef, useState } from "react";

/**
 * Full-bleed, muted, looping background video for the home hero.
 * - Poster paints first (no layout shift); the video only loads after mount.
 * - Skipped entirely for prefers-reduced-motion and Save-Data users.
 * - Pauses while the hero is off screen.
 */
export function HeroVideo({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [play, setPlay] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData;
    if (!reduced && !saveData) setPlay(true);
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!play || !v) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) void v.play().catch(() => {});
      else v.pause();
    });
    io.observe(v);
    return () => io.disconnect();
  }, [play]);

  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`}>
      <img
        src="/videos/kaptan-hero-poster.webp"
        alt=""
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-[72%_50%]"
      />
      {play && (
        <video
          ref={ref}
          className={`absolute inset-0 h-full w-full object-cover object-[72%_50%] transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}
          onPlaying={() => setReady(true)}
          poster="/videos/kaptan-hero-poster.webp"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        >
          <source src="/videos/kaptan-hero-loop.webm" type="video/webm" />
          <source src="/videos/kaptan-hero-loop.mp4" type="video/mp4" />
        </video>
      )}
    </div>
  );
}
