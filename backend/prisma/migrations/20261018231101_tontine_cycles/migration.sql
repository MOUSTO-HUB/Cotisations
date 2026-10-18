-- CreateEnum
CREATE TYPE "SwapStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "CashboxKind" ADD VALUE 'TONTINE';

-- AlterTable
ALTER TABLE "TontineCycle" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cashboxId" TEXT NOT NULL,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "createdById" TEXT NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TontineRound" ADD COLUMN     "paidOutById" TEXT,
ADD COLUMN     "receiptConfirmedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TontineShare" ADD COLUMN     "turn" INTEGER;

-- CreateTable
CREATE TABLE "TontineSwap" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "roundAId" TEXT NOT NULL,
    "roundBId" TEXT NOT NULL,
    "status" "SwapStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "acceptedById" TEXT,
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "TontineSwap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TontineCycle_cashboxId_key" ON "TontineCycle"("cashboxId");

-- AddForeignKey
ALTER TABLE "TontineCycle" ADD CONSTRAINT "TontineCycle_cashboxId_fkey" FOREIGN KEY ("cashboxId") REFERENCES "Cashbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TontineSwap" ADD CONSTRAINT "TontineSwap_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "TontineCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TontineSwap" ADD CONSTRAINT "TontineSwap_roundAId_fkey" FOREIGN KEY ("roundAId") REFERENCES "TontineRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TontineSwap" ADD CONSTRAINT "TontineSwap_roundBId_fkey" FOREIGN KEY ("roundBId") REFERENCES "TontineRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

