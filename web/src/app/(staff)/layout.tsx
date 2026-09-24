import { Navbar } from "@/components/Navbar";
import { requireSession } from "@/lib/session";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession();

  return (
    <div className="min-h-screen">
      <Navbar name={user.name} role={user.role} />
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
