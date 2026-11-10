import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PatientVerifyCard } from "./PatientVerifyCard";

describe("PatientVerifyCard family roster", () => {
  it("clearly tells staff where the family list is and shows every member when opened", () => {
    render(
      <PatientVerifyCard
        request={{ policy_number: "2870618" }}
        checking={false}
        patientMatchStatus="exact"
        matchedMemberId="principal"
        policyVerified={true}
        nhisVerified={true}
        familyMembers={[
          {
            id: "principal",
            full_name: "UGWU REGINA",
            member_type: "PRINCIPAL",
            beneficiary_number: "2870618-1",
            policy_number: "2870618",
          },
          {
            id: "dependent",
            surname: "UGWU",
            first_name: "CHINEDU",
            member_type: "DEPENDENT",
            beneficiary_number: "2870618-2",
            policy_number: "2870618",
          },
        ]}
        earlyRefill={null}
        requestPolicyNumber="2870618"
      />,
    );

    const detailsButton = screen.getByRole("button", { name: "Show family member names for 2 members" });
    expect(within(detailsButton).getByText("Tap to view member names")).toBeVisible();
    expect(detailsButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Family members on this policy" })).not.toBeInTheDocument();

    fireEvent.click(detailsButton);
    expect(detailsButton).toHaveAttribute("aria-expanded", "true");
    const familyRoster = screen.getByRole("region", { name: "Family members on this policy" });
    expect(within(familyRoster).getByText("UGWU REGINA")).toBeInTheDocument();
    expect(within(familyRoster).getByText("UGWU CHINEDU")).toBeInTheDocument();
    expect(within(familyRoster).getAllByText("Request")).toHaveLength(1);
    expect(within(familyRoster).getAllByText("UGWU REGINA")).toHaveLength(1);
  });
});
