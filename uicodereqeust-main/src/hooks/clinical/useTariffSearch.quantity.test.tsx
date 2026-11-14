import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTariffSearch } from "./useTariffSearch";

const itemCode = "NHIA-12-04-03";
const request = {
  approved_items: [
    {
      code: itemCode,
      name: "Amlodipine 10mg",
      category: "drug",
      unit_price: 70,
      amount: 70,
      quantity: 1,
      quantity_requires_review: false,
      price_requires_review: false,
    },
  ],
};

describe("useTariffSearch quantity editing", () => {
  it("keeps a multi-digit typed quantity as a draft until blur commits it", async () => {
    const { result } = renderHook(() => useTariffSearch(true, "", request, false));

    await waitFor(() => expect(result.current.approvedItems).toHaveLength(1));

    act(() => {
      result.current.updateApprovedItemQuantity(itemCode, "2");
      result.current.updateApprovedItemQuantity(itemCode, "20");
    });

    expect(result.current.editingQuantities[itemCode]).toBe("20");
    expect(result.current.approvedItems[0].quantity).toBe(1);

    act(() => result.current.commitQuantity(itemCode));

    expect(result.current.editingQuantities[itemCode]).toBeUndefined();
    expect(result.current.approvedItems[0].quantity).toBe(20);
    expect(result.current.approvedItems[0].price).toBe(1400);
  });

  it("preserves the saved quantity when an empty field is committed", async () => {
    const { result } = renderHook(() => useTariffSearch(true, "", request, false));

    await waitFor(() => expect(result.current.approvedItems).toHaveLength(1));

    act(() => result.current.updateApprovedItemQuantity(itemCode, ""));
    act(() => result.current.commitQuantity(itemCode));

    expect(result.current.approvedItems[0].quantity).toBe(1);
    expect(result.current.approvedItems[0].price).toBe(70);
  });

  it("treats stored items with confirmed quantities as ready for approval", async () => {
    const { result } = renderHook(() => useTariffSearch(true, "", request, false));

    await waitFor(() => expect(result.current.approvedItems).toHaveLength(1));
    expect(result.current.approvedItems[0].quantityNeedsReview).toBe(false);
  });
});
