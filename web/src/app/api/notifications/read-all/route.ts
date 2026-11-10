import { api } from "@/lib/api";

import { proxy } from "../_proxy";

export async function POST() {
  return proxy((token) => api.markAllNotificationsRead(token), 204);
}
