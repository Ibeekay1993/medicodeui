import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CheckCircle2 } from "lucide-react";
import { ClaimStatusMetricCard } from "./ClaimStatusMetricCard";

describe("ClaimStatusMetricCard", () => {
  it("labels the claim count and claim value separately", () => {
    render(
      <ClaimStatusMetricCard
        label="Approved"
        count={0}
        value="₦0"
        Icon={CheckCircle2}
        iconBg="text-emerald-700"
        activeBorder="ring-emerald-500"
        selected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("claims")).toBeInTheDocument();
    expect(screen.getByText("Claim value")).toBeInTheDocument();
    expect(screen.getByText("₦0")).toBeInTheDocument();
  });

  it("exposes the active filter state and responds to button activation", () => {
    const onSelect = vi.fn();
    render(
      <ClaimStatusMetricCard
        label="Approved"
        count={2}
        value="₦4,500"
        Icon={CheckCircle2}
        iconBg="text-emerald-700"
        activeBorder="ring-emerald-500"
        selected
        onSelect={onSelect}
      />,
    );

    const button = screen.getByRole("button", { name: "Filter by Approved: 2 claims, claim value ₦4,500" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
