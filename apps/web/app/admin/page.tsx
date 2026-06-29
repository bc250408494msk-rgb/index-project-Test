"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const PIE_COLORS = ["#3b82f6", "#ef4444", "#6b7280"];

export default function AdminDashboardPage() {
  const { data: stats, isLoading } = useQuery({ queryKey: ["admin-stats"], queryFn: () => adminApi.stats().then((r) => r.data), refetchInterval: 30000 });

  if (isLoading) return <div className="text-gray-400 text-center py-20">Loading admin stats...</div>;

  const pieData = [
    { name: "Indexed", value: stats?.indexedUrls ?? 0 },
    { name: "Not Indexed", value: (stats?.totalUrls ?? 0) - (stats?.indexedUrls ?? 0) - (stats?.refundedUrls ?? 0) },
    { name: "Refunded", value: stats?.refundedUrls ?? 0 },
  ];

  const queueEntries = Object.entries(stats?.queueStats ?? {});

  const signalRates = Object.entries(
    (stats?.signalSuccessRates ?? []).reduce((acc: Record<string, { success: number; failed: number }>, item: any) => {
      if (!acc[item.signalType]) acc[item.signalType] = { success: 0, failed: 0 };
      if (item.status === "success") acc[item.signalType].success = item._count.id;
      if (item.status === "failed") acc[item.signalType].failed = item._count.id;
      return acc;
    }, {} as Record<string, { success: number; failed: number }>)
  ).map(([signalType, counts]) => {
    const total = counts.success + counts.failed;
    const rate = total > 0 ? Math.round((counts.success / total) * 100) : 0;
    return { signalType, rate, total };
  });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: stats?.totalUsers ?? 0, icon: "👥" },
          { label: "Total URLs", value: stats?.totalUrls ?? 0, icon: "🔗" },
          { label: "Indexed URLs", value: stats?.indexedUrls ?? 0, icon: "✅" },
          { label: "Submitted Today", value: stats?.submittedToday ?? 0, icon: "📨" },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-white border rounded-xl p-4">
            <div className="text-2xl mb-2">{icon}</div>
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart */}
        <div className="bg-white border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Indexing Status</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Signal success rates */}
        <div className="bg-white border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Signal Success Rates</h2>
          <div className="space-y-3">
            {signalRates.length === 0 && (
              <p className="text-sm text-gray-400">No signal data yet.</p>
            )}
            {signalRates.map(({ signalType, rate, total }) => (
              <div key={signalType}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{signalType.replace(/_/g, " ")}</span>
                  <span className={`font-medium ${rate >= 80 ? "text-green-600" : rate >= 50 ? "text-yellow-600" : "text-red-500"}`}>
                    {rate}% <span className="text-gray-400 font-normal">({total} fired)</span>
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`rounded-full h-2 transition-all ${rate >= 80 ? "bg-green-500" : rate >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${rate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Queue health */}
      <div className="bg-white border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Queue Health</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {queueEntries.map(([name, q]: [string, any]) => (
            <div key={name} className="border rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 mb-2">{name}</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Waiting</span><span className="font-medium text-yellow-600">{q.waiting}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Active</span><span className="font-medium text-blue-600">{q.active}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Failed</span><span className="font-medium text-red-600">{q.failed}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
