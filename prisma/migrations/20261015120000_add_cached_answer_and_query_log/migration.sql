-- CreateTable
CREATE TABLE "cached_answer" (
    "id" SERIAL NOT NULL,
    "question_slug" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "citations" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cached_answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_log" (
    "id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "search_mode" TEXT NOT NULL,
    "retrieved_chunk_ids" INTEGER[],
    "answer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cached_answer_question_slug_key" ON "cached_answer"("question_slug");

-- CreateIndex
CREATE UNIQUE INDEX "cached_answer_position_key" ON "cached_answer"("position");

