import { api } from "@/lib/api";

import { proxy } from "../_proxy";

export async function GET() {
  return proxy((token) => api.notificationsUnread(token));
}
