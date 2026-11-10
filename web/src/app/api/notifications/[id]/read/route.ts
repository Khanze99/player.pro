import { api } from "@/lib/api";

import { proxy } from "../../_proxy";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxy((token) => api.markNotificationRead(id, token), 204);
}
