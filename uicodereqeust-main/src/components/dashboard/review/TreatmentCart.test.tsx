import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TreatmentCart } from "@/components/dashboard/review/TreatmentCart";

describe("TreatmentCart manual quantity review", () => {
  it("calculates the amount and leaves quantity verification to the approver", () => {
    const changeItemQuantity = vi.fn();

    render(
      <TreatmentCart
        request={{}}
        editTreatment=""
        setEditTreatment={vi.fn()}
        parseLoading={false}
        parseStatus=""
        parseTreatmentText={vi.fn().mockResolvedValue(undefined)}
        approvedItems={[
          {
            code: "NHIA-12-04-05",
            name: "Amlodipine 10mg tablet",
            category: "drug",
            price: 7500,
            unitPrice: 250,
            quantity: 30,
            quantityNeedsReview: true,
          },
        ]}
        editingQuantities={{}}
        updateApprovedItemQuantity={vi.fn()}
        commitQuantity={vi.fn()}
        changeItemQuantity={changeItemQuantity}
        removeApprovedItem={vi.fn()}
        tariffSearch=""
        setTariffSearch={vi.fn()}
        tariffOptions={[]}
        setTariffOptions={vi.fn()}
        tariffSearchLoading={false}
        addApprovedItem={vi.fn()}
        cartCollapsed={false}
        setCartCollapsed={vi.fn()}
      />,
    );

    expect(screen.getByText("Check each item and quantity against the submitted request before approval.")).toBeInTheDocument();
    expect(screen.queryByText(/Provisional/)).not.toBeInTheDocument();
    expect(screen.getByText("Total Approved Amount")).toBeInTheDocument();
    expect(changeItemQuantity).not.toHaveBeenCalled();
  });
});
