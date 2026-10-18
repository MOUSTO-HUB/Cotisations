-- AlterTable
ALTER TABLE "Due" ADD COLUMN     "penaltyOfId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Due_penaltyOfId_key" ON "Due"("penaltyOfId");

-- AddForeignKey
ALTER TABLE "Due" ADD CONSTRAINT "Due_penaltyOfId_fkey" FOREIGN KEY ("penaltyOfId") REFERENCES "Due"("id") ON DELETE SET NULL ON UPDATE CASCADE;

