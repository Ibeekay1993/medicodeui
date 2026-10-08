type RequestHandler = (request: Request) => Response | Promise<Response>;

declare global {
  // Set by the AWS Lambda adapter after the worker module registers its handler.
  var __whatsappWorkerHttpHandler: RequestHandler | undefined;
}

export function serve(handler: RequestHandler): void {
  globalThis.__whatsappWorkerHttpHandler = handler;
}
