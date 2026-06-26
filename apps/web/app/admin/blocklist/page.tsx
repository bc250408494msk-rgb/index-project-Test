"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export default function AdminBlocklistPage() {
  const [domain, setDomain] = useState("");
  const [reason, setReason] = useState("");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-blocklist"],
    queryFn: () => adminApi.getBlocklist().then((r) => r.data),
  });

  const add = useMutation({
    mutationFn: () => adminApi.addBlocklist(domain.trim(), reason.trim() || undefined),
    onSuccess: () => {
      setDomain("");
      setReason("");
      qc.invalidateQueries({ queryKey: ["admin-blocklist"] });
      toast({ title: "Domain blocked", variant: "success" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to add domain", description: err?.response?.data?.error ?? "Please try again.", variant: "destructive" });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.removeBlocklist(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-blocklist"] });
      toast({ title: "Domain removed from blocklist", variant: "success" });
    },
    onError: () => {
      toast({ title: "Failed to remove domain", variant: "destructive" });
    },
  });

  const blocklist: any[] = data?.blocklist ?? data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Domain Blocklist ({blocklist.length})</h1>

      {/* Add form */}
      <div className="bg-white border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Block a Domain</h2>
        <div className="flex gap-3 flex-wrap">
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            className="border rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[180px] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => add.mutate()}
            disabled={!domain.trim() || add.isPending}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {add.isPending ? "Adding…" : "Block Domain"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Domain</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Reason</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Added By</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading...</td></tr>
            )}
            {!isLoading && blocklist.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No blocked domains yet.</td></tr>
            )}
            {blocklist.map((item: any) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{item.domain}</td>
                <td className="px-4 py-3 text-gray-500">{item.reason ?? "—"}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{item.addedBy ?? "—"}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(item.createdAt)}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => remove.mutate(item.id)}
                    disabled={remove.isPending}
                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
