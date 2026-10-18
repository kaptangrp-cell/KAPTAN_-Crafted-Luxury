import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Compatibility endpoint for older browser bundles. Tracking is retired.
export const logVisit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.unknown().parse(input))
  .handler(async () => ({ ok: true, tracking: false }));
