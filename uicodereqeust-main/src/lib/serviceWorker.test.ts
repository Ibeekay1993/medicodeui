import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const serviceWorkerSource = readFileSync("public/sw.js", "utf8");

describe("service worker module asset caching", () => {
  it("does not answer a failed .mjs worker request with cached app HTML", async () => {
    type FetchEventLike = {
      request: { method: string; url: string };
      respondWith: (response: Promise<Response>) => void;
    };
    const listeners = new Map<string, (event: FetchEventLike) => void>();
    const workerUrl = "https://app.ronsbergerhmo.io/assets/pdf.worker-hashed.mjs";
    const request = { method: "GET", url: workerUrl };
    const cacheMatch = vi.fn(async (key: unknown) => {
      if (key === "/index.html") {
        return new Response("<html>app shell</html>", {
          headers: { "Content-Type": "text/html" },
        });
      }
      return undefined;
    });
    const staticCacheMatch = vi.fn(async () => undefined);
    const staticCache = {
      match: staticCacheMatch,
      put: vi.fn(async () => undefined),
      delete: vi.fn(async () => true),
      addAll: vi.fn(async () => undefined),
    };
    const cacheOpen = vi.fn(async () => staticCache);
    const fetchAsset = vi.fn(async () => {
      throw new Error("offline");
    });
    let responsePromise: Promise<Response> | undefined;

    runInNewContext(serviceWorkerSource, {
      URL,
      caches: { open: cacheOpen, match: cacheMatch },
      fetch: fetchAsset,
      self: {
        location: new URL("https://app.ronsbergerhmo.io/"),
        addEventListener: (type: string, listener: (event: FetchEventLike) => void) => {
          listeners.set(type, listener);
        },
        skipWaiting: vi.fn(),
      },
    });

    const fetchListener = listeners.get("fetch");
    expect(fetchListener).toBeDefined();
    fetchListener?.({
      request,
      respondWith: (response: Promise<Response>) => {
        responsePromise = response;
      },
    });

    await expect(responsePromise).rejects.toMatchObject({ message: "offline" });
    expect(fetchAsset).toHaveBeenCalledTimes(1);
    expect(cacheOpen).toHaveBeenCalledTimes(1);
    expect(staticCacheMatch).toHaveBeenCalledWith(request);
    expect(cacheMatch).not.toHaveBeenCalled();
  });
});
