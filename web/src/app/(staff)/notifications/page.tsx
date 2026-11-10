import { NotificationFeed } from "@/components/NotificationFeed";
import { api } from "@/lib/api";
import { requireSession } from "@/lib/session";

export default async function NotificationsPage() {
  const { token } = await requireSession();
  const initial = await api.notifications(token, 30);

  return (
    <div>
      <h1 className="text-xl font-semibold text-[var(--text)] mb-6">Уведомления</h1>
      <NotificationFeed initial={initial} />
    </div>
  );
}
