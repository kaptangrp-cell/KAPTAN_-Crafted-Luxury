import { useEffect, useRef, useState } from "react";

/**
 * Muted, looping background video that fills its (relative) parent.
 * - The poster paints first; the video only loads after mount.
 * - Skipped for prefers-reduced-motion and Save-Data users (poster only).
 * - Pauses while off screen.
 * Expects /videos/<name>.webm, .mp4 and .webp (poster).
 */
export function HeroVideo({
  name,
  position = "50% 50%",
  className = "",
}: {
  name: string;
  position?: string;
  className?: string;
}) {
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

  const poster = `/videos/${name}.webp`;
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`}>
      <img
        src={poster}
        alt=""
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: position }}
      />
      {play && (
        <video
          ref={ref}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}
          style={{ objectPosition: position }}
          onPlaying={() => setReady(true)}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        >
          <source src={`/videos/${name}.webm`} type="video/webm" />
          <source src={`/videos/${name}.mp4`} type="video/mp4" />
        </video>
      )}
    </div>
  );
}
