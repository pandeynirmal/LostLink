import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Shield, LayoutDashboard, Users, PackageSearch, Blocks } from "lucide-react";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import { verifyToken } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) redirect("/signin");

  const decoded = verifyToken(token);
  if (!decoded) redirect("/signin");

  await dbConnect();
  const user = await User.findById(decoded.userId);

  if (!user || user.role !== "admin") {
    redirect("/signin");
  }

  const navItems = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/claims", label: "Claims", icon: Shield },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/items", label: "Items", icon: PackageSearch },
    { href: "/admin/blockchain", label: "Blockchain", icon: Blocks },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-64 flex-col border-r border-neutral-800 bg-black/90 backdrop-blur">
          <div className="px-6 py-5 flex items-center gap-3 border-b border-neutral-800">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 text-white">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">
                LostLink Admin
              </p>
              <p className="text-xs text-neutral-400">Secure control center</p>
            </div>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800/90 hover:text-white transition-colors"
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="px-6 py-4 border-t border-neutral-800 text-xs text-neutral-400">
            Signed in as{" "}
            <span className="font-medium text-white">
              {user.fullName || user.email}
            </span>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col">
          {/* Top bar (mobile + main) */}
          <header className="border-b border-neutral-800 bg-black/90 backdrop-blur">
            <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 text-white lg:hidden">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-tight">
                    Admin Panel
                  </p>
                  <p className="text-xs text-neutral-400">
                    Monitor items, users, claims & blockchain activity.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-xs text-neutral-300">
                  {user.email}
                </span>
                <Link
                  href="/"
                  className="inline-flex items-center rounded-lg bg-yellow-500 px-4 py-1.5 text-xs font-medium text-black shadow-sm hover:bg-yellow-400 transition-colors"
                >
                  Back to Home
                </Link>
              </div>
            </div>
          </header>

          <main className="flex-1 bg-black">
            <div className="mx-auto max-w-7xl px-4 py-6 lg:py-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
