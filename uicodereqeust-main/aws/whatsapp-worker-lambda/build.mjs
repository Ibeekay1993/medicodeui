import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const packageDir = dirname(fileURLToPath(import.meta.url));
const outputFile = resolve(packageDir, "dist", "index.js");
const projectRequire = createRequire(resolve(packageDir, "../../package.json"));
const { build } = projectRequire("esbuild");

await mkdir(dirname(outputFile), { recursive: true });
await build({
  entryPoints: [resolve(packageDir, "index.ts")],
  outfile: outputFile,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: false,
  legalComments: "none",
  plugins: [
    {
      name: "deno-worker-runtime-adapter",
      setup(buildContext) {
        buildContext.onResolve(
          { filter: /^https:\/\/deno\.land\/std@0\.168\.0\/http\/server\.ts$/ },
          () => ({ path: resolve(packageDir, "runtime-shims/http-server.ts") }),
        );
        buildContext.onResolve(
          { filter: /^https:\/\/esm\.sh\/@supabase\/supabase-js@2$/ },
          () => ({ path: projectRequire.resolve("@supabase/supabase-js") }),
        );
      },
    },
  ],
});

console.log(`Built ${outputFile}`);
