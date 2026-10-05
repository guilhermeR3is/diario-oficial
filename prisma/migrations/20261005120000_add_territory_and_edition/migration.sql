-- CreateEnum
CREATE TYPE "edition_status" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "territory" (
    "id" SERIAL NOT NULL,
    "ibge_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uf" TEXT NOT NULL,

    CONSTRAINT "territory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edition" (
    "id" SERIAL NOT NULL,
    "territory_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "source_url" TEXT NOT NULL,
    "content_hash" TEXT,
    "page_count" INTEGER,
    "status" "edition_status" NOT NULL DEFAULT 'PENDING',
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "territory_ibge_code_key" ON "territory"("ibge_code");

-- CreateIndex
CREATE UNIQUE INDEX "edition_source_url_key" ON "edition"("source_url");

-- CreateIndex
CREATE INDEX "edition_territory_id_date_idx" ON "edition"("territory_id", "date");

-- AddForeignKey
ALTER TABLE "edition" ADD CONSTRAINT "edition_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "territory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

