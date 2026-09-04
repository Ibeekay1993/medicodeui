// deno-shim.d.ts
//
// Minimal Deno environment declarations so the Supabase Edge Function sources
// can be type-checked locally with plain `tsc` (the deployed Deno runtime
// provides the real globals). This file is NOT imported by the function code
// and is ignored by the Supabase deploy bundler.

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(
    handler: (req: Request) => Promise<Response> | Response,
  ): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export function createClient(
    url: string,
    key: string,
    options?: Record<string, unknown>,
  ): any;
}