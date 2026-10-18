-- CreateEnum
CREATE TYPE "VoteStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "quorumPercent" INTEGER NOT NULL DEFAULT 50,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "status" "VoteStatus" NOT NULL DEFAULT 'OPEN',
    "projectId" TEXT,
    "createdById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ballot" (
    "id" TEXT NOT NULL,
    "voteId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ballot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vote_groupId_createdAt_idx" ON "Vote"("groupId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ballot_voteId_membershipId_key" ON "Ballot"("voteId", "membershipId");

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ballot" ADD CONSTRAINT "Ballot_voteId_fkey" FOREIGN KEY ("voteId") REFERENCES "Vote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ballot" ADD CONSTRAINT "Ballot_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

