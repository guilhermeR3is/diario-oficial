import { describe, expect, it } from "vitest";
import { liveDay } from "./live-limits";
import { hashVisitor, visitorIp } from "./visitor";

const SECRET = "segredo-de-teste-".repeat(2);

describe("visitorIp", () => {
  it("takes the first address the proxy forwarded", () => {
    const headers = new Headers({
      "x-forwarded-for": " 203.0.113.7 , 10.0.0.1",
    });

    expect(visitorIp(headers)).toBe("203.0.113.7");
  });

  it("groups requests without a forwarded address under one key", () => {
    expect(visitorIp(new Headers())).toBe("unknown");
    expect(visitorIp(new Headers({ "x-forwarded-for": " " }))).toBe("unknown");
  });
});

describe("hashVisitor", () => {
  it("never contains the address and is the same for the same visitor on the same day", () => {
    const hash = hashVisitor("203.0.113.7", "2026-10-15", SECRET);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("203");
    expect(hashVisitor("203.0.113.7", "2026-10-15", SECRET)).toBe(hash);
  });

  it("changes with the day, the address and the secret", () => {
    const hash = hashVisitor("203.0.113.7", "2026-10-15", SECRET);

    expect(hashVisitor("203.0.113.7", "2026-10-16", SECRET)).not.toBe(hash);
    expect(hashVisitor("203.0.113.8", "2026-10-15", SECRET)).not.toBe(hash);
    expect(hashVisitor("203.0.113.7", "2026-10-15", `${SECRET}x`)).not.toBe(
      hash,
    );
  });
});

describe("liveDay", () => {
  it("turns the day at midnight in Brasília, not in UTC", () => {
    expect(liveDay(new Date("2026-10-16T02:59:59Z"))).toBe("2026-10-15");
    expect(liveDay(new Date("2026-10-16T03:00:00Z"))).toBe("2026-10-16");
  });
});
