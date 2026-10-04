import { describe, expect, it } from "vitest";
import { getSelectedVisibleClaims, reconcileClaimSelection, toggleVisibleClaimSelection } from "./claimSelection";

describe("payment claim selection", () => {
  it("drops claims hidden by a changed filter and does not restore them when filters clear", () => {
    const selected = reconcileClaimSelection(new Set(["a", "b"]), ["a"]);
    expect(selected).toEqual(new Set(["a"]));
    expect(reconcileClaimSelection(selected, ["a", "b"])).toEqual(new Set(["a"]));
  });

  it("selects all visible claims and deselects all when they are already selected", () => {
    expect(toggleVisibleClaimSelection(new Set(["a"]), ["a", "b"])).toEqual(new Set(["a", "b"]));
    expect(toggleVisibleClaimSelection(new Set(["a", "b"]), ["a", "b"])).toEqual(new Set());
    expect(toggleVisibleClaimSelection(new Set(["hidden"]), [])).toEqual(new Set());
  });

  it("limits the batch preview to visible selected claims", () => {
    const claims = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(getSelectedVisibleClaims(claims.slice(0, 2), new Set(["a", "c"]))).toEqual([{ id: "a" }]);
  });
});
