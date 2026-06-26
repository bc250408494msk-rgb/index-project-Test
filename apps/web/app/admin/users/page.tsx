"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", search],
    queryFn: () => adminApi.users({ search: search || undefined }).then((r) => r.data),
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, isActive }: any) => adminApi.setUserStatus(id, isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Users ({data?.total ?? 0})</h1>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by email or username..." className="border rounded-lg px-3 py-2 text-sm w-72" />
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">User</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Credits</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading...</td></tr>}
            {data?.users?.map((user: any) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{user.username}</p>
                  <p className="text-xs text-gray-400">{user.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${user.role === "admin" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"}`}>{user.role}</span>
                </td>
                <td className="px-4 py-3 font-semibold text-blue-600">{user.creditsBalance}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${user.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {user.isActive ? "Active" : "Banned"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(user.createdAt)}</td>
                <td className="px-4 py-3 flex gap-2">
                  <Link href={`/admin/users/${user.id}`} className="text-xs text-blue-600 hover:underline">View</Link>
                  <button onClick={() => toggleStatus.mutate({ id: user.id, isActive: !user.isActive })} className={`text-xs ${user.isActive ? "text-red-500 hover:text-red-700" : "text-green-600 hover:text-green-800"}`}>
                    {user.isActive ? "Ban" : "Activate"}
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
