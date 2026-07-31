import { motion } from "framer-motion";

/**
 * Scroll-reveal wrapper (fade + rise on first viewport entry). Shared
 * across the homepage and journal pages — pulled out of index.tsx so it
 * isn't duplicated per-page.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: "easeOut", delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
