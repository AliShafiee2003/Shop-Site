-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'PERSEPIX_SANDBOX',
    "providerIntentId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL,
    "cardBrand" TEXT,
    "cardLast4" TEXT,
    "failureReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("amountMinor", "cardBrand", "cardLast4", "createdAt", "currency", "failureReason", "id", "orderId", "provider", "providerIntentId", "status") SELECT "amountMinor", "cardBrand", "cardLast4", "createdAt", "currency", "failureReason", "id", "orderId", "provider", "providerIntentId", "status" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE UNIQUE INDEX "Payment_providerIntentId_key" ON "Payment"("providerIntentId");
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishAt" DATETIME,
    "publicationDate" DATETIME,
    "publisher" TEXT NOT NULL DEFAULT 'Persepix',
    "series" TEXT,
    "seriesSlug" TEXT,
    "coverUrl" TEXT,
    "audience" TEXT,
    "safetyNote" TEXT,
    "fixedPrice" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Product" ("audience", "coverUrl", "createdAt", "fixedPrice", "id", "isFeatured", "publicationDate", "publishAt", "publisher", "safetyNote", "series", "seriesSlug", "slug", "status", "updatedAt") SELECT "audience", "coverUrl", "createdAt", "fixedPrice", "id", "isFeatured", "publicationDate", "publishAt", "publisher", "safetyNote", "series", "seriesSlug", "slug", "status", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
CREATE INDEX "Product_status_idx" ON "Product"("status");
CREATE INDEX "Product_isFeatured_idx" ON "Product"("isFeatured");
CREATE TABLE "new_SavedPaymentMethod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'PERSEPIX_SANDBOX',
    "providerMethodId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "expiryMonth" INTEGER NOT NULL,
    "expiryYear" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedPaymentMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SavedPaymentMethod" ("brand", "createdAt", "expiryMonth", "expiryYear", "id", "isDefault", "last4", "provider", "providerMethodId", "userId") SELECT "brand", "createdAt", "expiryMonth", "expiryYear", "id", "isDefault", "last4", "provider", "providerMethodId", "userId" FROM "SavedPaymentMethod";
DROP TABLE "SavedPaymentMethod";
ALTER TABLE "new_SavedPaymentMethod" RENAME TO "SavedPaymentMethod";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
