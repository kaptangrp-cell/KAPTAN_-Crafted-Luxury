-- ============================================
-- REMEMBER LAST-USED PAYMENT METHOD (checkout UX)
-- ============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_payment_method text;

COMMENT ON COLUMN public.profiles.last_payment_method IS
  'Customer''s most recently used checkout payment method (card, paypal, cod, bank_transfer) — used to pre-select the option on their next checkout.';
