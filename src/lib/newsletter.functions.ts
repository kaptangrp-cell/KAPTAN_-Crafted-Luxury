import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Disabled until a separate, evidenced double-opt-in workflow is configured.
export const subscribeNewsletter = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ email: z.string().email() }).parse(input))
  .handler(async () => {
    throw new Error("Newsletter registration is currently unavailable.");
  });
