import { describe, expect, it } from "vitest";
import { parseEmbedArgs } from "./args";

describe("parseEmbedArgs", () => {
  it("embeds only what is pending and without a limit by default", () => {
    expect(parseEmbedArgs([])).toEqual({ force: false, limit: undefined });
  });

  it("reads --force and --limit", () => {
    expect(parseEmbedArgs(["--force", "--limit", "20"])).toEqual({
      force: true,
      limit: 20,
    });
  });

  it.each(["0", "-3", "1.5", "vinte"])("refuses --limit=%s", (limit) => {
    expect(() => parseEmbedArgs([`--limit=${limit}`])).toThrow(
      /Invalid arguments/,
    );
  });

  it("refuses a negative limit written with a space", () => {
    expect(() => parseEmbedArgs(["--limit", "-3"])).toThrow();
  });

  it("refuses an unknown option", () => {
    expect(() => parseEmbedArgs(["--forcar"])).toThrow();
  });
});
