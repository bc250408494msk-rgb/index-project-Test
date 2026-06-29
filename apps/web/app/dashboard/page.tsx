"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { userApi, creditApi, urlApi, projectApi } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { HealthCheckTable, type HealthCheckResult } from "@/components/health/HealthCheckTable";

const STATUS_COLORS: Record<string, string> = {
  indexed: "bg-green-100 text-green-700",
  submitted: "bg-blue-100 text-blue-700",
  health_failed: "bg-red-100 text-red-700",
  refunded: "bg-gray-100 text-gray-700",
  not_indexed: "bg-orange-100 text-orange-700",
  signals_firing: "bg-purple-100 text-purple-700",
};

export default function DashboardPage() {
  const qc = useQueryClient();
  const [urlInput, setUrlInput] = useState("");
  const [projectId, setProjectId] = useState("");
  const [step, setStep] = useState<"input" | "review">("input");
  const [healthResults, setHealthResults] = useState<HealthCheckResult[]>([]);
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [showSitemap, setShowSitemap] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const { data: user } = useQuery({ queryKey: ["me"], queryFn: () => userApi.me().then((r) => r.data) });
  const { data: balance } = useQuery({ queryKey: ["balance"], queryFn: () => creditApi.balance().then((r) => r.data) });
  const { data: urlsData } = useQuery({ queryKey: ["urls-recent"], queryFn: () => urlApi.list({ limit: 10 }).then((r) => r.data) });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => projectApi.list().then((r) => r.data) });

  const check = useMutation({
    mutationFn: () => {
      const urls = urlInput.split("\n").map((u) => u.trim()).filter(Boolean);
      return urlApi.healthCheck(urls);
    },
    onSuccess: (res) => {
      setHealthResults(res.data);
      setStep("review");
    },
    onError: (err: any) => {
      toast({ title: "Health check failed", description: err?.response?.data?.error ?? "Please try again.", variant: "destructive" });
    },
  });

  const submit = useMutation({
    mutationFn: () => {
      const urls = urlInput.split("\n").map((u) => u.trim()).filter(Boolean);
      return urlApi.submit({ urls, projectId: projectId || projects?.[0]?.id });
    },
    onSuccess: (res) => {
      const { submitted, healthFailed, creditsUsed } = res.data;
      toast({ title: `${submitted} URL(s) submitted`, description: `${creditsUsed} credit(s) used. ${healthFailed} failed health check.`, variant: "success" });
      setUrlInput("");
      setStep("input");
      setHealthResults([]);
      qc.invalidateQueries({ queryKey: ["urls-recent"] });
      qc.invalidateQueries({ queryKey: ["balance"] });
    },
    onError: (err: any) => {
      const details = err?.response?.data?.details;
      const detail = Array.isArray(details) && details.length > 0 ? ` (${details[0].field}: ${details[0].message})` : "";
      toast({ title: "Submission failed", description: (err?.response?.data?.error ?? "Please try again.") + detail, variant: "destructive" });
    },
  });

  const submitCsv = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      if (projectId) fd.append("projectId", projectId);
      return urlApi.submitCsv(fd);
    },
    onSuccess: (res) => {
      const { submitted, healthFailed, creditsUsed } = res.data;
      toast({ title: `${submitted} URL(s) submitted via CSV`, description: `${creditsUsed} credit(s) used. ${healthFailed} failed health check.`, variant: "success" });
      qc.invalidateQueries({ queryKey: ["urls-recent"] });
      qc.invalidateQueries({ queryKey: ["balance"] });
    },
    onError: (err: any) => {
      toast({ title: "CSV upload failed", description: err?.response?.data?.error ?? "Please try again.", variant: "destructive" });
    },
  });

  const submitSitemap = useMutation({
    mutationFn: () => urlApi.submitSitemap({ sitemapUrl: sitemapUrl.trim(), projectId: projectId || projects?.[0]?.id }),
    onSuccess: (res) => {
      const { submitted, healthFailed, creditsUsed, total } = res.data;
      toast({ title: `${submitted} of ${total} URLs submitted from sitemap`, description: `${creditsUsed} credit(s) used. ${healthFailed} failed health check.`, variant: "success" });
      setSitemapUrl("");
      setShowSitemap(false);
      qc.invalidateQueries({ queryKey: ["urls-recent"] });
      qc.invalidateQueries({ queryKey: ["balance"] });
    },
    onError: (err: any) => {
      toast({ title: "Sitemap import failed", description: err?.response?.data?.error ?? "Check the URL and try again.", variant: "destructive" });
    },
  });

  const stats = [
    { label: "Credits", value: balance?.credits ?? user?.creditsBalance ?? 0, icon: "💳", color: "text-blue-600" },
    { label: "Submitted", value: urlsData?.total ?? urlsData?.length ?? 0, icon: "🔗", color: "text-gray-700" },
    { label: "Indexed", value: urlsData?.indexed ?? urlsData?.filter((u: any) => u.status === "indexed").length ?? 0, icon: "✅", color: "text-green-600" },
    { label: "Pending", value: urlsData?.pending ?? urlsData?.filter((u: any) => ["submitted", "signals_firing"].includes(u.status)).length ?? 0, icon: "⏳", color: "text-yellow-600" },
    { label: "Refunded", value: urlsData?.filter?.((u: any) => u.status === "refunded").length ?? 0, icon: "🔄", color: "text-orange-600" },
  ];

  const recentUrls = Array.isArray(urlsData) ? urlsData : (urlsData?.urls ?? []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Welcome back, {user?.username}</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {stats.map(({ label, value, icon, color }) => (
          <div key={label} className="bg-white rounded-xl border p-4">
            <div className="text-2xl mb-2">{icon}</div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Submit */}
        <div className="lg:col-span-1 bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Submit</h2>
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm h-32 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Paste URLs here, one per line..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
          <div className="mt-3 space-y-2">
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Select Project (optional)...</option>
              {projects?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button
            className="mt-3 w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            onClick={() => check.mutate()}
            disabled={!urlInput.trim() || check.isPending}
          >
            {check.isPending ? "Checking…" : "Check Health"}
          </button>

          <div className="relative flex items-center gap-2 mt-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) submitCsv.mutate(file);
              e.target.value = "";
            }}
          />
          <button
            className="mt-3 w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            onClick={() => csvInputRef.current?.click()}
            disabled={submitCsv.isPending}
          >
            {submitCsv.isPending ? "Uploading CSV…" : "Upload CSV File"}
          </button>

          <div className="relative flex items-center gap-2 mt-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          <button
            className="mt-3 w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
            onClick={() => setShowSitemap((v) => !v)}
          >
            {showSitemap ? "Cancel Sitemap Import" : "Import from Sitemap URL"}
          </button>

          {showSitemap && (
            <div className="mt-3 space-y-2">
              <input
                type="url"
                value={sitemapUrl}
                onChange={(e) => setSitemapUrl(e.target.value)}
                placeholder="https://yoursite.com/sitemap.xml"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => submitSitemap.mutate()}
                disabled={!sitemapUrl.trim() || submitSitemap.isPending}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {submitSitemap.isPending ? "Importing…" : "Import & Submit All URLs"}
              </button>
            </div>
          )}

          {!projects?.length && (
            <p className="text-xs text-amber-600 mt-2">⚠ Create a project first to submit URLs.</p>
          )}
        </div>

        {/* Stats panel */}
        <div className="lg:col-span-2 bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Indexing Overview</h2>
          {!recentUrls.length ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <p className="text-4xl mb-3">📊</p>
              <p className="text-gray-500 font-medium">No data yet</p>
              <p className="text-sm text-gray-400 mt-1">Submit your first URLs to see indexing stats</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 mt-2">
              {[
                { label: "Success rate", value: recentUrls.length ? `${Math.round((recentUrls.filter((u: any) => u.status === "indexed").length / recentUrls.length) * 100)}%` : "—", color: "text-green-600" },
                { label: "Health failed", value: recentUrls.filter((u: any) => u.status === "health_failed").length, color: "text-red-500" },
                { label: "Auto-refunded", value: recentUrls.filter((u: any) => u.status === "refunded").length, color: "text-orange-500" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className={`text-2xl font-bold ${color}`}>{value}</div>
                  <div className="text-xs text-gray-500 mt-1">{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Health Check Review */}
      {step === "review" && (
        <HealthCheckTable
          results={healthResults}
          onConfirm={() => submit.mutate()}
          onBack={() => setStep("input")}
          isSubmitting={submit.isPending}
        />
      )}

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        </div>
        <div className="divide-y">
          {!recentUrls.length && (
            <div className="px-6 py-8 text-center text-gray-500 text-sm">No URLs submitted yet.</div>
          )}
          {recentUrls.map((url: any) => (
            <div key={url.id} className="px-6 py-3 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate">{url.url}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(url.createdAt)}</p>
              </div>
              <span className={`ml-4 text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[url.status] ?? "bg-gray-100 text-gray-600"}`}>
                {url.status.replace(/_/g, " ")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
