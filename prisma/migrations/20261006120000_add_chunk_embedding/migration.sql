-- AlterTable
ALTER TABLE "chunk" ADD COLUMN     "embedding" vector(768),
ADD COLUMN     "embedding_model" TEXT;
