"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { userApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const ENDPOINTS = [
  { method: "POST", path: "/api/v1/submit", desc: "Submit URLs for indexing", body: '{\n  "urls": ["https://example.com/page"],\n  "project_id": "uuid (optional)"\n}' },
  { method: "GET", path: "/api/v1/balance", desc: "Get current credit balance", body: null },
  { method: "GET", path: "/api/v1/projects", desc: "List all your projects", body: null },
  { method: "POST", path: "/api/v1/urls/status", desc: "Check status of submitted URLs", body: '{\n  "url_ids": ["uuid1", "uuid2"]\n}' },
  { method: "GET", path: "/api/v1/urls/:id", desc: "Get full details for a URL", body: null },
  { method: "POST", path: "/api/v1/health-check", desc: "Run a health check on URLs (no credit deducted)", body: '{\n  "urls": ["https://example.com/page"]\n}' },
];

function copy(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export default function ApiDocsPage() {
  const qc = useQueryClient();
  const [showKey, setShowKey] = useState<string | null>(null);

  const { data: keys, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => userApi.getApiKeys().then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: () => userApi.createApiKey("Default"),
    onSuccess: (res) => { setShowKey(res.data.key); qc.invalidateQueries({ queryKey: ["api-keys"] }); },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => userApi.revokeApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  const methodColor: Record<string, string> = { GET: "bg-green-100 text-green-700", POST: "bg-blue-100 text-blue-700", DELETE: "bg-red-100 text-red-700" };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">API Reference</h1>
        <p className="text-sm text-gray-500 mt-1">Use the REST API to integrate IndexMeNow with your tools</p>
      </div>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>Use an API key in the <code className="bg-gray-100 px-1 rounded text-xs">X-API-KEY</code> header</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {showKey && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-xs font-medium text-green-700 mb-2">Copy your new key — it won&apos;t be shown again:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white border rounded px-3 py-2 text-sm font-mono break-all">{showKey}</code>
                <Button size="sm" variant="outline" onClick={() => { copy(showKey); toast({ title: "Copied!", variant: "success" }); }}>Copy</Button>
              </div>
            </div>
          )}

          {isLoading ? <p className="text-sm text-gray-400">Loading...</p> : keys?.length === 0 ? (
            <p className="text-sm text-gray-500">No API keys yet.</p>
          ) : (
            <div className="space-y-2">
              {keys?.map((k: any) => (
                <div key={k.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{k.label}</p>
                    <p className="text-xs text-gray-400">{k.keyPreview} · Used {k.requestCount} times · Created {new Date(k.createdAt).toLocaleDateString()}</p>
                  </div>
                  <Button size="sm" variant="destructive" onClick={() => revoke.mutate(k.id)}>Revoke</Button>
                </div>
              ))}
            </div>
          )}

          <Button variant="outline" onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? "Generating..." : "+ Generate API Key"}
          </Button>
        </CardContent>
      </Card>

      {/* Base URL */}
      <Card>
        <CardHeader><CardTitle>Base URL</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-50 border rounded px-3 py-2 text-sm font-mono">{BASE_URL}</code>
            <Button size="sm" variant="outline" onClick={() => { copy(BASE_URL); toast({ title: "Copied!" }); }}>Copy</Button>
          </div>
        </CardContent>
      </Card>

      {/* Endpoints */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Endpoints</h2>
        {ENDPOINTS.map((ep) => (
          <Card key={ep.path}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold px-2 py-1 rounded ${methodColor[ep.method]}`}>{ep.method}</span>
                <code className="text-sm font-mono text-gray-800">{ep.path}</code>
              </div>
              <p className="text-sm text-gray-600">{ep.desc}</p>
              {ep.body && (
                <div className="relative">
                  <pre className="bg-gray-950 text-green-400 text-xs rounded-lg p-4 overflow-x-auto">{ep.body}</pre>
                  <button onClick={() => { copy(ep.body!); toast({ title: "Copied!" }); }} className="absolute top-2 right-2 text-xs text-gray-400 hover:text-white bg-gray-800 px-2 py-1 rounded">Copy</button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
