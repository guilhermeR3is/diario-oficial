-- CreateTable
CREATE TABLE "chunk" (
    "id" SERIAL NOT NULL,
    "edition_id" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "act_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "secretariat" TEXT,
    "date" DATE NOT NULL,
    "page" INTEGER NOT NULL,
    "page_end" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,

    CONSTRAINT "chunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chunk_edition_id_ordinal_key" ON "chunk"("edition_id", "ordinal");

-- AddForeignKey
ALTER TABLE "chunk" ADD CONSTRAINT "chunk_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

