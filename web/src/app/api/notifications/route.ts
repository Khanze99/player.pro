import { api } from "@/lib/api";

import { proxy } from "./_proxy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 30, 1), 50);
  return proxy((token) => api.notifications(token, limit, searchParams.get("cursor")));
}
