export const corsHeaders = {
  // The browser portal uses this canonical origin. Server-to-server calls do
  // not rely on CORS, so avoid granting arbitrary websites browser access.
  "Access-Control-Allow-Origin": "https://app.ronsbergerhmo.io",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-authorization",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};
