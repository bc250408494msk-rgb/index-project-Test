"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { urlApi } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { SignalStatusIcons } from "../signals/SignalStatusIcons";
import { toast } from "@/hooks/use-toast";

const CHECK_ICONS: Record<string, string> = { pass: "✅", warn: "⚠️", fail: "❌" };
const STATUS_COLORS: Record<string, string> = {
  indexed: "bg-green-100 text-green-700",
  submitted: "bg-blue-100 text-blue-700",
  health_failed: "bg-red-100 text-red-700",
  refunded: "bg-gray-100 text-gray-700",
};

interface Props {
  urlId: string | null;
  onClose: () => void;
}

export function UrlDetailDrawer({ urlId, onClose }: Props) {
  const qc = useQueryClient();
  const [resubmitDone, setResubmitDone] = useState(false);

  const { data: url, isLoading } = useQuery({
    queryKey: ["url-detail", urlId],
    queryFn: () => urlApi.get(urlId!).then((r) => r.data),
    enabled: !!urlId,
  });

  const resubmit = useMutation({
    mutationFn: () => urlApi.resubmit(urlId!),
    onSuccess: () => {
      setResubmitDone(true);
      qc.invalidateQueries({ queryKey: ["url-detail", urlId] });
      qc.invalidateQueries({ queryKey: ["urls-recent"] });
      toast({ title: "Resubmitted", description: "All 6 indexing signals have been re-fired.", variant: "success" });
    },
    onError: (err: any) => {
      toast({ title: "Resubmit failed", description: err?.response?.data?.error ?? "Please try again.", variant: "destructive" });
    },
  });

  const verify = useMutation({
    mutationFn: () => urlApi.verify(urlId!),
    onSuccess: (res) => {
      const isIndexed = res.data?.isIndexed;
      qc.invalidateQueries({ queryKey: ["url-detail", urlId] });
      qc.invalidateQueries({ queryKey: ["urls-recent"] });
      toast({
        title: isIndexed ? "Confirmed indexed ✅" : "Not indexed yet",
        description: isIndexed
          ? "Google has this URL in its index."
          : "Google hasn't confirmed this URL yet. With double-verify on, two positive checks are required before it's marked indexed.",
        variant: isIndexed ? "success" : "default",
      });
    },
    onError: (err: any) => {
      toast({ title: "Verification failed", description: err?.response?.data?.error ?? "Try again shortly (max 5 checks/hour).", variant: "destructive" });
    },
  });

  if (!urlId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white shadow-xl flex flex-col h-full overflow-y-auto">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">URL Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">Loading...</div>
        ) : url ? (
          <div className="p-6 space-y-8">
            {/* URL + Status */}
            <div>
              <a href={url.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm break-all">{url.url}</a>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[url.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {url.status.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-gray-400">Submitted {formatDateTime(url.createdAt)}</span>
                {url.status !== "indexed" && url.status !== "health_failed" && (
                  <button
                    onClick={() => resubmit.mutate()}
                    disabled={resubmit.isPending || resubmitDone}
                    className="ml-auto text-xs px-3 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50 font-medium"
                  >
                    {resubmit.isPending ? "Resubmitting…" : resubmitDone ? "Resubmitted ✓" : "Resubmit"}
                  </button>
                )}
              </div>
            </div>

            {/* Section 1: Health Check */}
            <section>
              <h3 className="font-semibold text-gray-900 mb-3">Health Check</h3>
              {url.healthChecks?.[0] ? (
                <div className="space-y-2">
                  {[
                    { label: "HTTP Status", value: url.healthChecks[0].httpStatus, ok: url.healthChecks[0].httpStatus === 200 },
                    { label: "SSL Certificate", value: url.healthChecks[0].sslValid ? `Valid — ${url.healthChecks[0].sslExpiryDays} days remaining` : "Invalid", ok: url.healthChecks[0].sslValid },
                    { label: "Robots.txt", value: url.healthChecks[0].robotsBlocked ? "Blocked" : "Not blocked", ok: !url.healthChecks[0].robotsBlocked },
                    { label: "Noindex", value: url.healthChecks[0].hasNoindex ? `Found (${url.healthChecks[0].noindexSource})` : "None found", ok: !url.healthChecks[0].hasNoindex },
                    { label: "Canonical", value: url.healthChecks[0].canonicalMismatch ? `Mismatch: ${url.healthChecks[0].canonicalUrl}` : "OK", ok: !url.healthChecks[0].canonicalMismatch },
                    { label: "Content", value: `${url.healthChecks[0].pageSizeKb}KB HTML`, ok: url.healthChecks[0].hasContent },
                    { label: "Response Time", value: `${url.healthChecks[0].responseTimeMs}ms`, ok: (url.healthChecks[0].responseTimeMs ?? 0) < 5000 },
                  ].map(({ label, value, ok }) => (
                    <div key={label} className="flex items-center gap-3 text-sm">
                      <span className="w-4">{ok ? "✅" : "❌"}</span>
                      <span className="w-32 text-gray-500 font-medium">{label}</span>
                      <span className="text-gray-700">{String(value)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-gray-400">No health check data</p>}
            </section>

            {/* Section 2: Signals */}
            <section>
              <h3 className="font-semibold text-gray-900 mb-3">Indexing Signals</h3>
              {url.signals?.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b">
                      <th className="text-left pb-2">Signal</th>
                      <th className="text-left pb-2">Status</th>
                      <th className="text-left pb-2">Time</th>
                      <th className="text-left pb-2">Response</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {url.signals.map((s: any) => (
                      <tr key={s.id}>
                        <td className="py-2 text-gray-700">{s.signalType.replace(/_/g, " ")}</td>
                        <td className="py-2">
                          <span className={`text-xs font-medium ${s.status === "success" ? "text-green-600" : s.status === "failed" ? "text-red-500" : "text-gray-400"}`}>
                            {s.status === "success" ? "✅" : s.status === "failed" ? "❌" : "⏳"} {s.status}
                          </span>
                        </td>
                        <td className="py-2 text-gray-400">{s.durationMs ? `${s.durationMs}ms` : "—"}</td>
                        <td className="py-2 text-gray-500 truncate max-w-[150px]">{s.responseSummary ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-sm text-gray-400">No signals fired yet</p>}
            </section>

            {/* Section 3: Verification History */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Verification History</h3>
                {url.status !== "indexed" && (
                  <button
                    onClick={() => verify.mutate()}
                    disabled={verify.isPending}
                    className="text-xs px-3 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 font-medium"
                  >
                    {verify.isPending ? "Checking…" : "Verify now"}
                  </button>
                )}
              </div>
              {url.verifications?.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b">
                      <th className="text-left pb-2">Date</th>
                      <th className="text-left pb-2">Method</th>
                      <th className="text-left pb-2">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {url.verifications.map((v: any) => (
                      <tr key={v.id}>
                        <td className="py-2 text-gray-400">{formatDateTime(v.checkedAt)}</td>
                        <td className="py-2 text-gray-600">{v.method.replace(/_/g, " ")}</td>
                        <td className="py-2">
                          <span className={v.isIndexed ? "text-green-600" : "text-gray-400"}>
                            {v.isIndexed ? "✅ Indexed" : "Not indexed"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-sm text-gray-400">No verification checks yet</p>}
            </section>

            {/* Section 4: Timeline */}
            <section>
              <h3 className="font-semibold text-gray-900 mb-3">Timeline</h3>
              <div className="space-y-2">
                {[
                  { label: "Submitted", date: url.createdAt, done: true },
                  { label: "Signals Fired", date: url.signalsFiredAt, done: !!url.signalsFiredAt },
                  { label: "First Check", date: url.firstCheckAt, done: !!url.firstCheckAt },
                  { label: "Indexed", date: url.indexedAt, done: !!url.indexedAt },
                  { label: "Refunded", date: url.refundedAt, done: !!url.refundedAt },
                ].filter(Boolean).map(({ label, date, done }) => (
                  <div key={label} className="flex items-center gap-3 text-sm">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${done ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-400"}`}>
                      {done ? "•" : "○"}
                    </span>
                    <span className="text-gray-700 w-28">{label}</span>
                    <span className="text-gray-400">{date ? formatDateTime(date) : "—"}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
