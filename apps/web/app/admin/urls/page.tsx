"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { formatDateTime, truncateUrl } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";

const STATUS_VARIANT: Record<string, any> = {
  indexed: "success",
  submitted: "default",
  signals_firing: "default",
  health_failed: "destructive",
  not_indexed: "warning",
  refunded: "outline",
};

const STATUSES = ["all", "indexed", "submitted", "health_failed", "not_indexed", "refunded"];

export default function AdminUrlsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-urls", status, search],
    queryFn: () => adminApi.urls({ status: status === "all" ? undefined : status, search: search || undefined }).then((r) => r.data),
  });

  const reindex = useMutation({
    mutationFn: (id: string) => adminApi.reindexUrl(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-urls"] }); toast({ title: "Reindex queued", variant: "success" }); },
    onError: () => toast({ title: "Reindex failed", variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">URL Management</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search URLs..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        <div className="flex gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${status === s ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Loading URLs...</div>
        ) : !data?.length ? (
          <div className="text-center py-16 text-gray-400">No URLs found</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Indexed At</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((url: any) => (
                <TableRow key={url.id}>
                  <TableCell className="max-w-xs">
                    <a href={url.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm" title={url.url}>
                      {truncateUrl(url.url, 50)}
                    </a>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{url.user?.email ?? "—"}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[url.status] ?? "secondary"}>{url.status.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell className="text-sm text-gray-500">{formatDateTime(url.createdAt)}</TableCell>
                  <TableCell className="text-sm text-gray-500">{url.indexedAt ? formatDateTime(url.indexedAt) : "—"}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => reindex.mutate(url.id)} disabled={reindex.isPending}>
                      Force Reindex
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
