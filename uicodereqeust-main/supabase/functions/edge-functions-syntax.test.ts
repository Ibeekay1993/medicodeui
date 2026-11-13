import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const edgeEntries = [
  "supabase/functions/daily-report/index.ts",
  "supabase/functions/get-whatsapp-clinical-details/index.ts",
  "supabase/functions/send-push-notification/index.ts",
];

describe("production Edge Function entrypoints", () => {
  it.each(edgeEntries)("has valid TypeScript syntax: %s", (entry) => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- The path is selected from the fixed allowlist above.
    const source = readFileSync(path.resolve(entry), "utf8");
    const transpiled = ts.transpileModule(source, {
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
});
