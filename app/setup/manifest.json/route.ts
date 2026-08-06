import { getApiBase } from "@/lib/api-base";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return Response.json({
    version: "2.0.0",
    apiBase: getApiBase(request),
    exchangeUrl: "/api/setup/exchange",
  });
}
