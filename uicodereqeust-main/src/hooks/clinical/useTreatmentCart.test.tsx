import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTreatmentCart } from "./useTreatmentCart";

const mockRequest = {
  id: "req-123",
  approved_items: [
    {
      code: "DRUG-001",
      name: "Paracetamol 500mg",
      category: "drug",
      unit_price: 50,
      amount: 100,
      quantity: 2,
    },
  ],
};

describe("useTreatmentCart hook", () => {
  it("initializes and syncs recovered treatment correctly", async () => {
    const { result, rerender } = renderHook(
      ({ recoveredTreatment }) =>
        useTreatmentCart({
          open: true,
          request: mockRequest,
          canManageClinicalCart: true,
          isHospitalDirected: false,
          recoveredTreatment,
        }),
      { initialProps: { recoveredTreatment: "" } }
    );

    await waitFor(() => {
      expect(result.current.approvedItems).toHaveLength(1);
    });

    expect(result.current.editTreatment).toBe("");

    rerender({ recoveredTreatment: "Amoxicillin 500mg TDS x 5 days" });

    expect(result.current.editTreatment).toBe("Amoxicillin 500mg TDS x 5 days");

    act(() => {
      result.current.setEditTreatment("Updated treatment plan");
    });

    expect(result.current.editTreatment).toBe("Updated treatment plan");
  });
});
