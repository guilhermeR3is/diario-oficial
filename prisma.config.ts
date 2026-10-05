import "dotenv/config";
import { defineConfig } from "prisma/config";

// A URL é opcional aqui para que `prisma generate` rode sem .env; o migrate falha sozinho se ela faltar
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DATABASE_URL"] },
});
