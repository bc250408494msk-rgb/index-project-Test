"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { creditApi } from "@/lib/api";
import { formatDateTime, creditColorClass } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  admin_grant: "Admin Grant",
  admin_deduct: "Admin Deduction",
  charge: "URL Charge",
  auto_refund: "Auto Refund",
  manual_refund: "Manual Refund",
};

const TYPE_COLORS: Record<string, string> = {
  admin_grant: "text-green-600",
  charge: "text-red-600",
  auto_refund: "text-blue-600",
  manual_refund: "text-blue-600",
  admin_deduct: "text-orange-600",
};

export default function CreditsPage() {
  const [filter, setFilter] = useState<string>("all");

  const { data: balance } = useQuery({ queryKey: ["balance"], queryFn: () => creditApi.balance().then((r) => r.data) });
  const { data: transactions } = useQuery({
    queryKey: ["transactions", filter],
    queryFn: () => creditApi.transactions({ type: filter === "all" ? undefined : filter, limit: 100 }).then((r) => r.data),
  });

  const credits = balance?.credits ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Credits</h1>

      {/* Balance display */}
      <div className="bg-white border rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm mb-2">Current Balance</p>
        <p className={`text-6xl font-bold ${creditColorClass(credits)}`}>{credits}</p>
        <p className="text-gray-400 text-sm mt-2">Credits are assigned by your administrator.</p>
        {credits < 5 && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
            Low credit balance! Contact your administrator to add more credits.
          </div>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {["all", "charge", "admin_grant", "auto_refund"].map((t) => (
          <button key={t} onClick={() => setFilter(t)} className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${filter === t ? "bg-blue-600 text-white border-blue-600" : "text-gray-600 hover:bg-gray-50"}`}>
            {t === "all" ? "All" : TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Transactions table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Balance After</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {transactions?.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No transactions yet.</td></tr>
            )}
            {transactions?.map((tx: any) => (
              <tr key={tx.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-400 text-xs">{formatDateTime(tx.createdAt)}</td>
                <td className="px-4 py-3 text-gray-700">{TYPE_LABELS[tx.type] ?? tx.type}</td>
                <td className={`px-4 py-3 font-semibold ${TYPE_COLORS[tx.type] ?? "text-gray-700"}`}>
                  {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                </td>
                <td className="px-4 py-3 text-gray-700">{tx.balanceAfter}</td>
                <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{tx.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
