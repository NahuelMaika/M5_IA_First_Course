-- CreateIndex
CREATE INDEX "expenses_user_id_when_created_at_idx" ON "expenses"("user_id", "when" DESC, "created_at" DESC);
