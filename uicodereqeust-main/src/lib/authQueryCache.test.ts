import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { clearPrivateQueryCacheIfIdentityChanged } from "./authQueryCache";

describe("clearPrivateQueryCacheIfIdentityChanged", () => {
  it("clears patient data when the authenticated identity changes", () => {
    const client = new QueryClient();
    client.setQueryData(["patient-search"], [{ patient_name: "Protected patient data" }]);

    clearPrivateQueryCacheIfIdentityChanged(client, "admin-a", "hospital-b");

    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it("keeps cache during token refresh for the same identity", () => {
    const client = new QueryClient();
    const rows = [{ patient_name: "Protected patient data" }];
    client.setQueryData(["patient-search"], rows);

    clearPrivateQueryCacheIfIdentityChanged(client, "admin-a", "admin-a");

    expect(client.getQueryData(["patient-search"])).toBe(rows);
  });
});
