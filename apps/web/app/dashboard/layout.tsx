"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { userApi, authApi, creditApi } from "@/lib/api";
import { creditColorClass, formatDateTime } from "@/lib/utils";

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/dashboard/projects", label: "Projects", icon: "📁" },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: "🎯" },
  { href: "/dashboard/credits", label: "Credits", icon: "💳" },
  { href: "/dashboard/account", label: "Account", icon: "⚙️" },
  { href: "/dashboard/api-docs", label: "API Docs", icon: "📄" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const [bellOpen, setBellOpen] = useState(false);

  const { data: user } = useQuery({ queryKey: ["me"], queryFn: () => userApi.me().then((r) => r.data) });
  const { data: balance } = useQuery({ queryKey: ["balance"], queryFn: () => creditApi.balance().then((r) => r.data) });
  const { data: notifications } = useQuery({ queryKey: ["notifications"], queryFn: () => userApi.getNotifications().then((r) => r.data), refetchInterval: 30000 });

  const markAll = useMutation({
    mutationFn: () => userApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markOne = useMutation({
    mutationFn: (id: string) => userApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unreadCount = notifications?.filter((n: any) => !n.isRead).length ?? 0;
  const credits = balance?.credits ?? user?.creditsBalance ?? 0;

  const handleLogout = async () => {
    await authApi.logout();
    if (typeof window !== "undefined") localStorage.removeItem("accessToken");
    qc.clear();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="px-6 py-5 border-b">
          <Link href="/" className="text-xl font-bold text-blue-600">IndexMeNow</Link>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navLinks.map(({ href, label, icon }) => (
            <Link key={href} href={href} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${pathname === href ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>
              <span>{icon}</span>
              {label}
            </Link>
          ))}
          {user?.role === "admin" && (
            <Link href="/admin" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <span>🛡️</span> Admin Panel
            </Link>
          )}
        </nav>
        <div className="px-3 py-4 border-t">
          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 w-full">
            <span>🚪</span> Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
          <div />
          <div className="flex items-center gap-4">
            {/* Credit balance */}
            <Link href="/dashboard/credits" className={`text-sm font-semibold ${creditColorClass(credits)}`}>
              Credits: {credits}
              {credits < 5 && <span className="ml-1 bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded-full">Low</span>}
            </Link>

            {/* Notification bell */}
            <div className="relative">
              <button onClick={() => setBellOpen((o) => !o)} className="text-gray-500 hover:text-gray-900 relative" aria-label="Notifications">
                🔔
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {bellOpen && (
                <>
                  {/* click-outside backdrop */}
                  <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} />
                  <div className="absolute right-0 mt-2 w-80 bg-white border rounded-xl shadow-lg z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b">
                      <span className="text-sm font-semibold text-gray-900">Notifications</span>
                      {unreadCount > 0 && (
                        <button onClick={() => markAll.mutate()} disabled={markAll.isPending} className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50">
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto divide-y">
                      {!notifications?.length ? (
                        <div className="px-4 py-8 text-center text-sm text-gray-400">No notifications yet</div>
                      ) : (
                        notifications.map((n: any) => (
                          <button
                            key={n.id}
                            onClick={() => { if (!n.isRead) markOne.mutate(n.id); }}
                            className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${n.isRead ? "" : "bg-blue-50/50"}`}
                          >
                            <div className="flex items-start gap-2">
                              {!n.isRead && <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                              <div className={n.isRead ? "pl-4" : ""}>
                                <p className="text-sm font-medium text-gray-900">{n.title}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                                <p className="text-xs text-gray-400 mt-1">{formatDateTime(n.createdAt)}</p>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* User menu */}
            <div className="text-sm text-gray-700 font-medium">
              {user?.username ?? "..."}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
