import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const modules = [
  "supabase/functions/whatsapp-worker/intent-triage.ts",
  "supabase/functions/whatsapp-worker/response-dispatcher.ts",
  "supabase/functions/whatsapp-worker/authorizations-intake.ts",
  "supabase/functions/whatsapp-worker/notification-dispatcher.ts",
];

describe("whatsapp-worker decomposed modules syntax", () => {
  it.each(modules)("has valid TypeScript syntax: %s", (modulePath) => {
    const source = readFileSync(path.resolve(modulePath), "utf8");
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
