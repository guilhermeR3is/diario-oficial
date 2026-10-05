import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type EditionFixture = {
  file: string;
  title: string;
  date: string;
  contentHash: string;
  pages: string[];
};

const fixturesDir = fileURLToPath(new URL("./fixtures/", import.meta.url));

export function loadFixtures(): EditionFixture[] {
  return readdirSync(fixturesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => ({
      file,
      ...(JSON.parse(readFileSync(fixturesDir + file, "utf8")) as Omit<
        EditionFixture,
        "file"
      >),
    }));
}
