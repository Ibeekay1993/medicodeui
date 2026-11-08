import { describe, expect, it } from "vitest";
import { corsHeaders } from "./cors";

describe("shared edge-function CORS policy", () => {
  it("allows only the canonical production portal origin", () => {
    expect(corsHeaders["Access-Control-Allow-Origin"]).toBe("https://app.ronsbergerhmo.io");
    expect(corsHeaders["Access-Control-Allow-Origin"]).not.toBe("*");
    expect(corsHeaders.Vary).toBe("Origin");
  });
});
