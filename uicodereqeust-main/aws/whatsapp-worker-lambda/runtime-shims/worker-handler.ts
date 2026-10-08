type RequestHandler = (request: Request) => Response | Promise<Response>;

let workerImport: Promise<typeof import("../../../supabase/functions/whatsapp-worker/index.ts")> | undefined;

export async function resolveWorkerHandler(): Promise<RequestHandler> {
  workerImport ??= import("../../../supabase/functions/whatsapp-worker/index.ts");
  await workerImport;
  const handler = globalThis.__whatsappWorkerHttpHandler;
  if (!handler) throw new Error("WhatsApp worker did not register its HTTP handler.");
  return handler;
}
