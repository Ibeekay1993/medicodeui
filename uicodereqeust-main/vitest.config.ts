import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  define: {
    // Explicit, non-production values for unit tests. Production builds use
    // deployment environment variables and fail when either value is absent.
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://api.ronsbergerhmo.io"),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("test-only-publishable-key"),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "supabase/functions/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "https://esm.sh/@supabase/supabase-js@2": "@supabase/supabase-js",
      "https://esm.sh/@supabase/supabase-js": "@supabase/supabase-js",
    },
  },
});
