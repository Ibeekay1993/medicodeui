import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as ExcelJS from "exceljs";
import ReportsPage from "./ReportsPage";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  pageHandler: vi.fn(),
  saveAs: vi.fn(),
  hospitalRows: [] as Array<{ id: string; name: string; code?: string }>,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock("file-saver", () => ({ saveAs: mocks.saveAs }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: "admin", user: { id: "admin-1" } }) }));
vi.mock("@/hooks/use-tab-visibility-refresh", () => ({ useTabVisibilityRefresh: () => undefined }));

vi.mock("@/components/reports/ReportFilters", () => ({
  default: ({ filters, onChange, onExport }: any) => (
    <div>
      <button onClick={() => onExport("payment_advice")}>Export payment advice</button>
      <button onClick={() => onExport("full")}>Export premium dashboard</button>
      <label>
        Status
        <select aria-label="Status" value={filters.statusFilter} onChange={(event) => onChange({ statusFilter: event.target.value })}>
          <option value="all">All statuses</option>
          <option value="partially_approved">Partially Approved</option>
        </select>
      </label>
      <label>
        Hospital
        <select aria-label="Hospital" value={filters.hospitalFilter} onChange={(event) => onChange({ hospitalFilter: event.target.value })}>
          <option value="all">All hospitals</option>
          {mocks.hospitalRows.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.name}</option>)}
        </select>
      </label>
    </div>
  ),
}));

vi.mock("@/components/reports/KPIStatsGrid", () => ({
  default: ({ stats }: any) => <div data-testid="report-metrics">
    <span>Total Codes: {stats.totalCodes}</span>
    <span>Approved: {stats.approvedCodes}</span>
    <span>Pending: {stats.pendingCodes}</span>
    <span>Rejected: {stats.rejectedCodes}</span>
    <span>Average: {stats.avgProcessingTime}</span>
  </div>,
}));
vi.mock("@/components/reports/StatusDistributionChart", () => ({ default: () => <div>Status chart</div> }));
vi.mock("@/components/reports/MonthlyTrendChart", () => ({ default: ({ data }: any) => <div data-testid="monthly-trend">{JSON.stringify(data)}</div> }));
vi.mock("@/components/reports/HospitalPerformanceTable", () => ({ default: ({ data }: any) => <div data-testid="hospital-breakdown">{JSON.stringify(data)}</div> }));

function createQueryBuilder(table: string) {
  const conditions: Array<{ method: string; args: unknown[] }> = [];
  const builder: any = {};
  for (const method of ["select", "order", "eq", "in", "ilike", "gte", "lte", "or"]) {
    builder[method] = vi.fn((...args: unknown[]) => {
      conditions.push({ method, args });
      return builder;
    });
  }
  builder.range = vi.fn((from: number, to: number) => {
    if (table === "hospitals") return Promise.resolve({ data: mocks.hospitalRows, error: null });
    return mocks.pageHandler({ from, to, conditions });
  });
  return builder;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function row(id: string, status = "pending", hospital = "Central Hospital", ageMinutes = 0) {
  const created = new Date(Date.now() - ageMinutes * 60_000);
  const decisionOffset = status === "approved" ? 10 : status === "partially_approved" ? 20 : status === "rejected" ? 40 : null;
  return {
    id,
    request_id: id,
    created_at: created.toISOString(),
    patient_name: `Patient ${id}`,
    status,
    hospital_name: hospital,
    requesting_hospital: hospital,
    total_amount: status === "approved" || status === "partially_approved" ? 100 : 0,
    approved_items: [],
    decided_at: decisionOffset === null ? null : new Date(created.getTime() + decisionOffset * 60_000).toISOString(),
    treatment_submitted_at: created.toISOString(),
    is_historical: false,
  };
}

function setupPageHandler(handler: (request: any) => Promise<{ data: any[] | null; error: unknown | null }>) {
  mocks.pageHandler.mockImplementation(handler);
  mocks.from.mockImplementation((table: string) => createQueryBuilder(table));
  mocks.rpc.mockResolvedValue({ data: [], error: null });
}

function renderPage() {
  return render(<ReportsPage />);
}

async function readDownloadedWorkbook() {
  const blob = mocks.saveAs.mock.calls.at(-1)?.[0] as Blob;
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

describe("ReportsPage report integrity", () => {
  beforeEach(() => {
    mocks.hospitalRows = [
      { id: "hospital-a", name: "Hospital A" },
      { id: "hospital-b", name: "Hospital B" },
    ];
    setupPageHandler(async () => ({ data: [], error: null }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("shows an accessible initial loading status without final metrics", async () => {
    const request = deferred<{ data: any[] | null; error: unknown | null }>();
    setupPageHandler(() => request.promise);
    renderPage();

    expect(await screen.findByRole("status")).toHaveTextContent("Loading authorization report");
    expect(screen.queryByTestId("report-metrics")).not.toBeInTheDocument();
    await act(async () => { request.resolve({ data: [], error: null }); });
  });

  it("shows complete metrics, scope, SLA, and refresh time", async () => {
    vi.setSystemTime(new Date("2026-10-04T10:42:00.000Z"));
    setupPageHandler(async () => ({ data: [row("approved", "approved", "Hospital A", 10)], error: null }));
    renderPage();

    expect(await screen.findByTestId("report-metrics")).toHaveTextContent("Total Codes: 1");
    expect(screen.getByText(/Requests created:/)).toHaveTextContent("Status: All statuses");
    expect(screen.getByText(/Requests created:/)).toHaveTextContent("Hospital: All hospitals");
    expect(screen.getByText(/SLA metrics use this same filtered request set/)).toHaveTextContent("Data loaded:");
    expect(screen.getByText("SLA figures use the filtered request set shown above.")).toBeInTheDocument();
    expect(screen.getByText("Reviewed within 15 min").parentElement).toHaveTextContent("100%");
  });

  it("distinguishes successful empty results from errors and omits SLA rates", async () => {
    setupPageHandler(async () => ({ data: [row("deferred", "deferred")], error: null }));
    renderPage();

    expect(await screen.findByText("No authorization requests match the selected report filters.")).toBeInTheDocument();
    expect(screen.queryByTestId("report-metrics")).not.toBeInTheDocument();
    expect(screen.queryByText("Reviewed within 15 min")).not.toBeInTheDocument();
  });

  it("fails closed on a first-page error", async () => {
    setupPageHandler(async () => ({ data: null, error: new Error("network") }));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("The report could not be fully loaded. No report totals are available.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByTestId("report-metrics")).not.toBeInTheDocument();
  });

  it("discards all rows when a later page fails", async () => {
    setupPageHandler(async ({ from }) => from === 0
      ? { data: Array.from({ length: 1000 }, (_, i) => row(`partial-${i}`)), error: null }
      : { data: null, error: new Error("second page failed") });
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("The report could not be fully loaded");
    expect(screen.queryByText("Total Codes: 1000")).not.toBeInTheDocument();
    expect(screen.queryByText(/Patient partial/)).not.toBeInTheDocument();
  });

  it("retries from page zero with current filters and a fresh accumulator", async () => {
    let calls = 0;
    const observedStatuses: unknown[] = [];
    mocks.from.mockImplementation((table: string) => createQueryBuilder(table));
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    mocks.pageHandler.mockImplementation(({ from, conditions }) => {
      calls += 1;
      observedStatuses.push(conditions.find((condition: any) => condition.method === "eq" && condition.args[0] === "status")?.args[1]);
      if (calls < 3) return Promise.resolve({ data: [row("partial")], error: new Error("failed") });
      expect(from).toBe(0);
      return Promise.resolve({ data: [row("retry-result", "partially_approved", "Hospital A")], error: null });
    });
    renderPage();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "partially_approved" } });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByTestId("report-metrics")).toHaveTextContent("Total Codes: 1");
    expect(screen.getByText(/Status: Partially Approved/)).toBeInTheDocument();
    expect(calls).toBe(3);
    expect(observedStatuses).toEqual([undefined, "partially_approved", "partially_approved"]);
  });

  it("keeps the error and no partial result when retry fails", async () => {
    let calls = 0;
    setupPageHandler(async () => {
      calls += 1;
      return calls === 1
        ? { data: null, error: new Error("first failure") }
        : { data: [row("partial", "approved")], error: new Error("retry failure") };
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The report could not be fully loaded");
    expect(screen.queryByTestId("report-metrics")).not.toBeInTheDocument();
  });

  it("hides the previous report immediately when filters change", async () => {
    let requestCount = 0;
    const next = deferred<{ data: any[] | null; error: unknown | null }>();
    setupPageHandler(({ conditions }) => {
      requestCount += 1;
      const hospitalFilter = conditions.find((condition: any) => condition.method === "ilike")?.args[1];
      if (hospitalFilter === "%Hospital A%") return next.promise;
      if (hospitalFilter === "%Hospital B%") return Promise.resolve({ data: [row("b", "approved", "Hospital B")], error: null });
      return Promise.resolve({ data: [row("initial", "approved", "Central Hospital")], error: null });
    });
    renderPage();
    expect(await screen.findByTestId("report-metrics")).toHaveTextContent("Total Codes: 1");

    fireEvent.change(screen.getByRole("combobox", { name: "Hospital" }), { target: { value: "hospital-a" } });
    expect(screen.queryByTestId("report-metrics")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading authorization report");
    expect(screen.getByText(/Hospital: Hospital A/)).toBeInTheDocument();

    next.resolve({ data: [row("a", "approved", "Hospital A")], error: null });
    await waitFor(() => expect(screen.getByTestId("report-metrics")).toHaveTextContent("Total Codes: 1"));
    expect(requestCount).toBeGreaterThan(1);
  });

  it("ignores an older slower request after a newer filter request succeeds", async () => {
    const requestA = deferred<{ data: any[] | null; error: unknown | null }>();
    const requestB = deferred<{ data: any[] | null; error: unknown | null }>();
    setupPageHandler(({ conditions }) => {
      const hospitalFilter = conditions.find((condition: any) => condition.method === "ilike")?.args[1];
      if (hospitalFilter === "%Hospital A%") return requestA.promise;
      if (hospitalFilter === "%Hospital B%") return requestB.promise;
      return Promise.resolve({ data: [row("initial", "approved")], error: null });
    });
    renderPage();
    expect(await screen.findByTestId("report-metrics")).toHaveTextContent("Total Codes: 1");

    fireEvent.change(screen.getByRole("combobox", { name: "Hospital" }), { target: { value: "hospital-a" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Hospital" }), { target: { value: "hospital-b" } });
    requestB.resolve({ data: [row("newer-b", "approved", "Hospital B")], error: null });
    expect(await screen.findByTestId("hospital-breakdown")).toHaveTextContent("Hospital B");
    requestA.resolve({ data: [row("older-a", "rejected", "Hospital A")], error: null });

    await waitFor(() => expect(screen.getByText(/Hospital: Hospital B/)).toBeInTheDocument());
    expect(screen.getByTestId("hospital-breakdown")).toHaveTextContent("Hospital B");
    expect(screen.getByTestId("hospital-breakdown")).not.toHaveTextContent("Hospital A");
  });

  it("uses the exact status predicate for Partially Approved", async () => {
    let observedStatus: unknown;
    setupPageHandler(async ({ conditions }) => {
      observedStatus = conditions.find((condition: any) => condition.method === "eq" && condition.args[0] === "status")?.args[1];
      return { data: [row("partial", "partially_approved")], error: null };
    });
    renderPage();
    await screen.findByRole("status");

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "partially_approved" } });
    await screen.findByTestId("report-metrics");
    await waitFor(() => expect(observedStatus).toBe("partially_approved"));
  });

  it("shows last-refreshed time only after complete success", async () => {
    const response = deferred<{ data: any[] | null; error: unknown | null }>();
    setupPageHandler(() => response.promise);
    renderPage();

    expect(screen.queryByText(/Data loaded:/)).not.toBeInTheDocument();
    response.resolve({ data: [row("ok", "approved")], error: null });
    expect(await screen.findByText(/Data loaded:/)).toBeInTheDocument();
  });

  it("exports payment advice with a filtered-row total formula and its checks tab", async () => {
    setupPageHandler(async () => ({
      data: [
        row("advice-a", "approved", "Hospital A"),
        row("advice-b", "approved", "Hospital B"),
      ],
      error: null,
    }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Export payment advice" }));
    await waitFor(() => expect(mocks.saveAs).toHaveBeenCalledTimes(1));

    const workbook = await readDownloadedWorkbook();
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Payment Advice Schedule", "Payment Advice Checks"]);
    const schedule = workbook.getWorksheet("Payment Advice Schedule")!;
    expect(schedule.getCell("J6").value).toMatchObject({ formula: "SUBTOTAL(109,J4:J5)", result: 200 });
    expect(schedule.getCell("J4").value).toBe(100);
    expect(schedule.getCell("J5").value).toBe(100);
    expect(schedule.getCell("K2").value).toMatchObject({ formula: "SUBTOTAL(103,A4:A5)", result: 2 });
  });

  it("includes the payment advice schedule and amount in the premium export", async () => {
    setupPageHandler(async () => ({
      data: [row("premium-advice", "approved", "Hospital A")],
      error: null,
    }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Export premium dashboard" }));
    await waitFor(() => expect(mocks.saveAs).toHaveBeenCalledTimes(1));

    const workbook = await readDownloadedWorkbook();
    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain("Payment Advice Schedule");
    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain("Payment Advice Checks");
    const summary = workbook.getWorksheet("Executive Summary")!;
    const payableRow = summary.getColumn(1).values.findIndex((value) => value === "Payment Advice Payable");
    expect(payableRow).toBeGreaterThan(0);
    expect(summary.getCell(payableRow, 2).value).toBe(100);
  });
});
