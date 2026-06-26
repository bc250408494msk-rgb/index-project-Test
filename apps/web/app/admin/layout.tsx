"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/users", label: "Users", icon: "👥" },
  { href: "/admin/urls", label: "URLs", icon: "🔗" },
  { href: "/admin/queues", label: "Job Queues", icon: "⚙️" },
  { href: "/admin/settings", label: "Settings", icon: "🔧" },
  { href: "/admin/blocklist", label: "Blocklist", icon: "🚫" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="px-6 py-5 border-b flex items-center gap-2">
          <Link href="/" className="text-xl font-bold text-blue-600">IndexMeNow</Link>
          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Admin</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navLinks.map(({ href, label, icon }) => (
            <Link key={href} href={href} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${pathname === href ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
              <span>{icon}</span>{label}
            </Link>
          ))}
          <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 mt-4 border-t pt-4">
            <span>←</span> User Dashboard
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
