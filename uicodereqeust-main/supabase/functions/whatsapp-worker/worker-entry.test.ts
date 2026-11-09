import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const workerSource = readFileSync("supabase/functions/whatsapp-worker/index.ts", "utf8");

describe("WhatsApp worker entrypoint", () => {
  it("has no TypeScript syntax errors that would prevent the Edge Function from booting", () => {
    const transpiled = ts.transpileModule(workerSource, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
      reportDiagnostics: true,
    });
    const syntaxErrors = (transpiled.diagnostics || []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );

    expect(syntaxErrors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "))).toEqual([]);
  });

  it("does not route inbound queue work to the retired Lambda worker", () => {
    expect(workerSource).not.toMatch(/LAMBDA_WORKER_URL|lambda_worker|Lambda WhatsApp worker proxy/i);
  });
});
