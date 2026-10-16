-- AlterTable
ALTER TABLE "query_log" ADD COLUMN     "total_tokens" INTEGER,
ADD COLUMN     "visitor_hash" TEXT;

-- CreateTable
CREATE TABLE "live_usage" (
    "day" DATE NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "live_usage_pkey" PRIMARY KEY ("day","key")
);
