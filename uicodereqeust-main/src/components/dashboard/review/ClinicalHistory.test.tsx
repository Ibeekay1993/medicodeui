import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClinicalHistory } from "./ClinicalHistory";

describe("ClinicalHistory approved treatment display", () => {
  it("shows saved approved items and quantities instead of the raw treatment string", () => {
    render(
      <ClinicalHistory
        request={{}}
        visibleHistory={[
          {
            id: "approved-1",
            patient_name: "Afolayan Kayode",
            policy_number: "1639554",
            beneficiary_number: "1639554-1",
            status: "approved",
            treatment: "NHIA-12-04-05 - raw treatment summary",
            approved_items: [
              {
                code: "NHIA-12-04-05",
                name: "Amlodipine 10mg tablet",
                category: "Medication",
                quantity: 30,
                quantity_requires_review: false,
                frequency: "Once daily",
                duration: "30 days",
              },
              { name: "Declined item", quantity: 5, declined: true },
            ],
          },
        ]}
        historyPage={1}
        setHistoryPage={() => undefined}
        requestPatientName="Afolayan Kayode"
        requestPolicyNumber="1639554"
        requestBeneficiaryNumber="1639554-1"
      />,
    );

    const treatmentList = screen.getByRole("list", { name: "Approved treatment items" });
    expect(within(treatmentList).getByText("Amlodipine 10mg tablet")).toBeVisible();
    expect(within(treatmentList).getByText("Approved qty")).toBeVisible();
    expect(within(treatmentList).getByText("30")).toBeVisible();
    expect(within(treatmentList).getByText(/Once daily · 30 days/)).toBeVisible();
    expect(within(treatmentList).queryByText("Declined item")).not.toBeInTheDocument();
    expect(screen.queryByText("NHIA-12-04-05 - raw treatment summary")).not.toBeInTheDocument();
  });

  it("does not present pending request drafts as approved items", () => {
    render(
      <ClinicalHistory
        request={{}}
        visibleHistory={[
          {
            id: "pending-1",
            patient_name: "Afolayan Kayode",
            policy_number: "1639554",
            beneficiary_number: "1639554-1",
            status: "pending",
            treatment: "Amlodipine requested",
            approved_items: [{ name: "Draft cart item", quantity: 30 }],
          },
        ]}
        historyPage={1}
        setHistoryPage={() => undefined}
        requestPatientName="Afolayan Kayode"
        requestPolicyNumber="1639554"
        requestBeneficiaryNumber="1639554-1"
      />,
    );

    expect(screen.getByText("Treatment requested")).toBeVisible();
    expect(screen.getByText("Amlodipine requested")).toBeVisible();
    expect(screen.queryByText("Draft cart item")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Approved treatment items" })).not.toBeInTheDocument();
  });

  it("labels legacy quantities without a confirmation marker as recorded and unverified", () => {
    render(
      <ClinicalHistory
        request={{}}
        visibleHistory={[{
          id: "legacy-1",
          patient_name: "Afolayan Kayode",
          policy_number: "1639554",
          beneficiary_number: "1639554-1",
          status: "approved",
          approved_items: [{ name: "Amlodipine 10mg tablet", quantity: 1 }],
        }]}
        historyPage={1}
        setHistoryPage={() => undefined}
        requestPatientName="Afolayan Kayode"
        requestPolicyNumber="1639554"
        requestBeneficiaryNumber="1639554-1"
      />,
    );

    expect(screen.getByText("Recorded qty")).toBeVisible();
    expect(screen.getByText(/no quantity confirmation marker/i)).toBeVisible();
  });
});
