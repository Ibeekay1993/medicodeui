import { describe, expect, it } from "vitest";
import { parseReportRecipientFields, parseReportRecipients, splitReportRecipientValues } from "./report-recipients";

describe("daily report recipients", () => {
  it("splits legacy comma, semicolon, and newline settings into unique addresses", () => {
    expect(splitReportRecipientValues("one@example.com, TWO@example.com;one@example.com\nthree@example.com")).toEqual([
      "one@example.com",
      "TWO@example.com",
      "three@example.com",
    ]);
  });

  it("normalizes valid recipients and reports invalid addresses", () => {
    expect(parseReportRecipients([" Admin@Example.com ", "bad-address", "admin@example.com"])).toEqual({
      recipients: ["Admin@Example.com"],
      invalid: ["bad-address"],
      tooMany: false,
    });
  });

  it("rejects recipient lists larger than the delivery limit", () => {
    const emails = Array.from({ length: 11 }, (_, index) => `person${index}@example.com`);
    expect(parseReportRecipients(emails).tooMany).toBe(true);
  });

  it("requires each editable recipient field to contain exactly one address", () => {
    expect(parseReportRecipientFields(["one@example.com", "two@example.com"])).toEqual({
      recipients: ["one@example.com", "two@example.com"],
      invalid: [],
      tooMany: false,
      multiple: [],
    });
    expect(parseReportRecipientFields(["one@example.com, two@example.com"])).toEqual({
      recipients: [],
      invalid: [],
      tooMany: false,
      multiple: ["one@example.com, two@example.com"],
    });
  });
});
