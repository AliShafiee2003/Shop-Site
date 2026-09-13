-- Audit SEC-004: sliding idle timeout for sessions (lastSeenAt) + rotation on
-- login. The column is nullable — every existing session keeps working and
-- falls back to createdAt for its first idle computation.
ALTER TABLE "Session" ADD COLUMN "lastSeenAt" DATETIME;
