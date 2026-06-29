"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { urlApi, projectApi } from "@/lib/api";
import { formatDate, truncateUrl } from "@/lib/utils";
import { SignalStatusIcons } from "@/components/signals/SignalStatusIcons";
import { HealthBadge } from "@/components/health/HealthBadge";
import { UrlDetailDrawer } from "@/components/urls/UrlDetailDrawer";
import { toast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  indexed: "bg-green-100 text-green-700",
  submitted: "bg-blue-100 text-blue-700",
  health_failed: "bg-red-100 text-red-700",
  refunded: "bg-gray-100 text-gray-600",
  not_indexed: "bg-orange-100 text-orange-700",
  signals_firing: "bg-purple-100 text-purple-700",
  queued: "bg-gray-100 text-gray-600",
};

const FILTERS = ["all", "submitted", "indexed", "health_failed", "not_indexed", "refunded"];

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const [filter, setFilter] = useState("all");
  const [selectedUrlId, setSelectedUrlId] = useState<string | null>(null);

  const qc = useQueryClient();
  const { data: project } = useQuery({ queryKey: ["project", params.id], queryFn: () => projectApi.get(params.id).then((r) => r.data) });
  const { data: urlsData, isLoading } = useQuery({
    queryKey: ["urls", params.id, filter],
    queryFn: () => urlApi.list({ projectId: params.id, status: filter === "all" ? undefined : filter, limit: 100 }).then((r) => r.data),
  });
  const urls: any[] = urlsData?.urls ?? [];

  const deleteUrl = useMutation({
    mutationFn: (id: string) => urlApi.delete(id),
    onSuccess: () => {
      toast({ title: "URL deleted", variant: "success" });
      qc.invalidateQueries({ queryKey: ["urls"] });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err?.response?.data?.error ?? "Please try again.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{project?.name ?? "Project"}</h1>
        <p className="text-gray-500 text-sm mt-1">{project?.description}</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 border-b">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`pb-2 px-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${filter === f ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {f.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* URL Table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">URL</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Health</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Signals</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Submitted</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Indexed</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Retries</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Loading URLs...</td></tr>
            )}
            {!isLoading && urls.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">No URLs found.</td></tr>
            )}
            {urls?.map((url: any) => (
              <tr key={url.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 max-w-xs">
                  <a href={url.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs" title={url.url}>
                    {truncateUrl(url.url)}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <HealthBadge status={url.healthChecks?.[0]?.isIndexable === true ? "pass" : url.healthChecks?.[0]?.isIndexable === false ? "fail" : null} />
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[url.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {url.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <SignalStatusIcons signals={url.signals ?? []} />
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(url.createdAt)}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{url.indexedAt ? formatDate(url.indexedAt) : "—"}</td>
                <td className="px-4 py-3 text-gray-400 text-xs text-center">{url.retryCount}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setSelectedUrlId(url.id)} className="text-xs text-blue-600 hover:underline">Details</button>
                    <button
                      onClick={() => { if (window.confirm("Delete this URL permanently? This cannot be undone.")) deleteUrl.mutate(url.id); }}
                      disabled={deleteUrl.isPending}
                      className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* URL Detail Drawer */}
      <UrlDetailDrawer urlId={selectedUrlId} onClose={() => setSelectedUrlId(null)} />
    </div>
  );
}
