"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/api";
import { formatDateTime, creditColorClass } from "@/lib/utils";

export default function AdminUserDetailPage({ params }: { params: { id: string } }) {
  const [grantAmount, setGrantAmount] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: user, isLoading } = useQuery({ queryKey: ["admin-user", params.id], queryFn: () => adminApi.user(params.id).then((r) => r.data) });

  const grantCredits = useMutation({
    mutationFn: () => adminApi.grantCredits(params.id, parseInt(grantAmount), grantReason),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-user", params.id] }); setGrantAmount(""); setGrantReason(""); },
  });

  const deleteUser = useMutation({
    mutationFn: () => adminApi.deleteUser(params.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-users"] }); router.push("/admin/users"); },
  });

  if (isLoading) return <div className="text-center py-20 text-gray-400">Loading...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{user?.username}</h1>
          <p className="text-gray-500 text-sm">{user?.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-2xl font-bold ${creditColorClass(user?.creditsBalance ?? 0)}`}>{user?.creditsBalance} credits</span>
          <button
            onClick={() => {
              if (window.confirm(`Permanently delete "${user?.username}"? This cannot be undone — all their URLs, credits, and data will be erased.`)) {
                deleteUser.mutate();
              }
            }}
            disabled={deleteUser.isPending}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {deleteUser.isPending ? "Deleting..." : "Delete Account"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Grant/Deduct Credits */}
        <div className="bg-white border rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Adjust Credits</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (positive = grant, negative = deduct)</label>
              <input value={grantAmount} onChange={(e) => setGrantAmount(e.target.value)} type="number" placeholder="e.g. 50 or -10" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
              <input value={grantReason} onChange={(e) => setGrantReason(e.target.value)} type="text" placeholder="Reason for credit change" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <button onClick={() => grantCredits.mutate()} disabled={!grantAmount || !grantReason || grantCredits.isPending} className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {grantCredits.isPending ? "Processing..." : "Apply Credit Adjustment"}
            </button>
          </div>
        </div>

        {/* User Info */}
        <div className="bg-white border rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Account Info</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Role</span><span className="font-medium">{user?.role}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Email Verified</span><span>{user?.emailVerified ? "✅ Yes" : "❌ No"}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Status</span><span className={user?.isActive ? "text-green-600" : "text-red-600"}>{user?.isActive ? "Active" : "Banned"}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Total URLs</span><span className="font-medium">{user?._count?.urls}</span></div>
          </div>
        </div>
      </div>

      {/* Credit History */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b"><h2 className="font-semibold text-gray-900">Recent Credit History</h2></div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Date</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Type</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Amount</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Balance After</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {user?.creditTransactions?.map((tx: any) => (
              <tr key={tx.id}>
                <td className="px-4 py-3 text-gray-400 text-xs">{formatDateTime(tx.createdAt)}</td>
                <td className="px-4 py-3 text-gray-600">{tx.type.replace(/_/g, " ")}</td>
                <td className={`px-4 py-3 font-semibold ${tx.amount > 0 ? "text-green-600" : "text-red-600"}`}>{tx.amount > 0 ? `+${tx.amount}` : tx.amount}</td>
                <td className="px-4 py-3 text-gray-700">{tx.balanceAfter}</td>
                <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{tx.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
