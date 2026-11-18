import { useEffect, useRef, type ReactNode } from "react";

/** Progressive enhancement: content is visible before JS and with reduced motion. */
export function CollectionMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element || !("IntersectionObserver" in window)) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    const setup = () => {
      observer?.disconnect();
      const targets = element.querySelectorAll<HTMLElement>("[data-scroll-reveal]");
      targets.forEach((target) => target.classList.remove("motion-waiting", "motion-arrived"));
      if (preference.matches) return;
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("motion-arrived");
            entry.target.classList.remove("motion-waiting");
            observer?.unobserve(entry.target);
          });
        },
        { threshold: 0.08 },
      );
      targets.forEach((target) => {
        // Never hide content already on screen (or previously scrolled past).
        if (target.getBoundingClientRect().top < window.innerHeight) return;
        target.classList.add("motion-waiting");
        observer?.observe(target);
      });
    };
    setup();
    preference.addEventListener("change", setup);
    return () => {
      observer?.disconnect();
      preference.removeEventListener("change", setup);
    };
  }, []);

  return (
    <div ref={root} className="collection-motion">
      {children}
    </div>
  );
}

/** A quiet, drawn gold thread connects the collection chapters. */
export function CollectionTransition() {
  return (
    <div data-scroll-reveal className="collection-transition" aria-hidden="true">
      <svg viewBox="0 0 1000 100" fill="none" preserveAspectRatio="xMidYMid meet">
        <path
          className="collection-thread"
          pathLength="1"
          d="M0 50H350C420 50 430 20 470 20C510 20 510 80 550 80C590 80 600 50 670 50H1000"
        />
        <path
          className="collection-thread collection-thread-secondary"
          pathLength="1"
          d="M0 50H350C420 50 430 80 470 80C510 80 510 20 550 20C590 20 600 50 670 50H1000"
        />
        <path className="collection-jewel" d="m510 38 12 12-12 12-12-12Z" />
      </svg>
    </div>
  );
}
