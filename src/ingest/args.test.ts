import { describe, expect, it } from "vitest";
import { parseIngestArgs } from "./args";

describe("parseIngestArgs", () => {
  it("reads the period and defaults force to false", () => {
    expect(
      parseIngestArgs(["--from", "2026-07-01", "--to", "2026-09-30"]),
    ).toEqual({
      range: { from: "2026-07-01", to: "2026-09-30" },
      force: false,
    });
  });

  it("accepts --force", () => {
    const args = parseIngestArgs([
      "--from",
      "2026-07-01",
      "--to",
      "2026-07-01",
      "--force",
    ]);

    expect(args.force).toBe(true);
  });

  it.each([
    ["a missing --to", ["--from", "2026-07-01"]],
    ["an impossible date", ["--from", "2026-02-30", "--to", "2026-03-31"]],
    [
      "a date in another format",
      ["--from", "01/07/2026", "--to", "2026-09-30"],
    ],
    [
      "a period that ends before it starts",
      ["--from", "2026-09-30", "--to", "2026-07-01"],
    ],
    [
      "an unknown option",
      ["--from", "2026-07-01", "--to", "2026-09-30", "--fast"],
    ],
  ])("rejects %s", (_, argv) => {
    expect(() => parseIngestArgs(argv)).toThrow();
  });
});
