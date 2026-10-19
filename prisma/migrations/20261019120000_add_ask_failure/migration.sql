-- CreateTable
CREATE TABLE "ask_failure" (
    "id" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "search_mode" TEXT NOT NULL,
    "visitor_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ask_failure_pkey" PRIMARY KEY ("id")
);
