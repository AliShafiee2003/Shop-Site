-- Audit P2: drop dead tables — no application code references them
-- (PaymentEvent webhook idempotency is handled in-memory in the SANDBOX
-- checkout; saved payment methods and redirect maps were never wired).
DROP TABLE IF EXISTS "PaymentEvent";
DROP TABLE IF EXISTS "SavedPaymentMethod";
DROP TABLE IF EXISTS "Redirect";
