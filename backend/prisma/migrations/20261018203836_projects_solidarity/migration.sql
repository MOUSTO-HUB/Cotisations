-- CreateEnum
CREATE TYPE "SolidarityReason" AS ENUM ('HEALTH', 'DEATH', 'DISASTER', 'OTHER');

-- CreateEnum
CREATE TYPE "DonationStatus" AS ENUM ('RECORDED', 'REVERSED');

-- AlterTable
ALTER TABLE "ContributionPlan" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "budgetLineId" TEXT;

-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "donationId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "allocatedFunds" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "proposedById" TEXT NOT NULL,
ADD COLUMN     "subsidies" BIGINT NOT NULL DEFAULT 0,
ALTER COLUMN "targetAmount" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "SolidarityCampaign" ADD COLUMN     "beneficiaryMembershipId" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "mandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reasonCategory" "SolidarityReason" NOT NULL DEFAULT 'OTHER';

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "plannedAmount" BIGINT NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectUpdate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Donation" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "cashboxId" TEXT NOT NULL,
    "membershipId" TEXT,
    "donorName" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "channel" "PaymentChannel" NOT NULL,
    "status" "DonationStatus" NOT NULL DEFAULT 'RECORDED',
    "receiptNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Donation_receiptNumber_key" ON "Donation"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_idempotencyKey_key" ON "Donation"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionPlan_projectId_key" ON "ContributionPlan"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionPlan_campaignId_key" ON "ContributionPlan"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Movement_donationId_key" ON "Movement"("donationId");

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "Donation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "BudgetLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionPlan" ADD CONSTRAINT "ContributionPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionPlan" ADD CONSTRAINT "ContributionPlan_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SolidarityCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUpdate" ADD CONSTRAINT "ProjectUpdate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_cashboxId_fkey" FOREIGN KEY ("cashboxId") REFERENCES "Cashbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

