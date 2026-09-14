-- CreateIndex
CREATE INDEX "MailMessage_sentAt_createdAt_idx" ON "MailMessage"("sentAt", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TasteSignal_userId_createdAt_idx" ON "TasteSignal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TasteSignal_sessionKey_createdAt_idx" ON "TasteSignal"("sessionKey", "createdAt");
