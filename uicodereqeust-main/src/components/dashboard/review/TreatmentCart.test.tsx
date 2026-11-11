import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TreatmentCart } from "@/components/dashboard/review/TreatmentCart";

describe("TreatmentCart quantity review notice", () => {
  it("keeps the provisional quantity warning compact and confirms the displayed amount", () => {
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
            price: 250,
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

    expect(screen.getByText("Provisional · verify against request or prescription")).toBeInTheDocument();
    const confirmButton = screen.getByRole("button", {
      name: "Confirm quantity 30 against the request or prescription",
    });
    expect(confirmButton).toHaveTextContent("Confirm 30");

    fireEvent.click(confirmButton);
    expect(changeItemQuantity).toHaveBeenCalledWith("NHIA-12-04-05", 30);
  });
});
