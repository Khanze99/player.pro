import { Navbar } from "@/components/Navbar";
import { Sidebar } from "@/components/Sidebar";
import { api } from "@/lib/api";
import { requireSession } from "@/lib/session";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { token, user } = await requireSession();
  // Лого в шапке (docs/design-player-passport-theme.md) — общее на всю
  // админку, читается тут, а не на отдельных страницах.
  const branding = await api.branding(token);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar name={user.name} role={user.role} orgName={branding.org_name} hasLogo={!!branding.logo_url} />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 max-w-6xl mx-auto px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
