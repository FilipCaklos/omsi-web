import { describe, expect, it } from "vitest";
import { parseLocation } from "@/lib/geo";

describe("poloha mapy", () => {
  it("prázdne = bez polohy, platné sa zaokrúhlia, nezmysly sa odmietnu", () => {
    expect(parseLocation("", "")).toBeNull();
    expect(parseLocation(undefined, undefined)).toBeNull();
    expect(parseLocation("48.2871234", "17.2669876")).toEqual({ lat: 48.28712, lng: 17.26699 });
    expect(parseLocation("91", "17")).toBe("INVALID");
    expect(parseLocation("48", "")).toBe("INVALID");
    expect(parseLocation("abc", "17")).toBe("INVALID");
  });
});
