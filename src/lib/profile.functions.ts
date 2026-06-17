import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ProfileSchema = z.object({
  full_name: z.string().min(1).max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  date_of_birth: z.string().nullable().optional(),
  email_marketing: z.boolean().optional(),
});

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, role, full_name, phone, avatar_url, date_of_birth, email_marketing")
      .eq("id", context.userId)
      .single();
    if (error) throw new Error(error.message);
    return { profile: data };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProfileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update(data)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const AddressSchema = z.object({
  label: z.string().max(40).optional(),
  full_name: z.string().min(1).max(120),
  phone: z.string().max(40).optional(),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional().nullable(),
  city: z.string().min(1).max(80),
  state: z.string().max(80).optional().nullable(),
  postal_code: z.string().min(1).max(20),
  country: z.string().min(2).max(60),
  is_default: z.boolean().optional(),
});

export const getMyAddresses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("addresses")
      .select("*")
      .order("is_default", { ascending: false });
    if (error) throw new Error(error.message);
    return { addresses: data ?? [] };
  });

export const saveAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddressSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("addresses")
      .insert({ ...data, user_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });
