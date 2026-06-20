import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const SubscribeSchema = z.object({
  email: z.string().email(),
});

export const subscribeNewsletter = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SubscribeSchema.parse(input))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();

    const { error } = await supabase
      .from("newsletter_subscribers")
      .insert({ email });

    if (error) {
      if (error.code === "23505") {
        return { ok: true, message: "You are already subscribed." };
      }

      throw new Error(error.message);
    }

    return { ok: true, message: "Thank you for subscribing!" };
  });