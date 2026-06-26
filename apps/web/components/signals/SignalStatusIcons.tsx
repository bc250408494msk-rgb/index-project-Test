"use client";

const SIGNALS = [
  { key: "google_indexing_api", label: "Google API", short: "G" },
  { key: "gsc_url_inspect", label: "GSC Inspect", short: "C" },
  { key: "sitemap_ping", label: "Sitemap", short: "S" },
  { key: "rss_webSub", label: "RSS/Hub", short: "R" },
  { key: "indexnow", label: "IndexNow", short: "I" },
  { key: "crawl_trigger", label: "Crawl", short: "T" },
];

interface Props {
  signals: Array<{ signalType: string; status: string; isRetry: boolean }>;
}

const STATUS_COLOR: Record<string, string> = {
  success: "bg-green-100 text-green-700 border-green-200",
  failed: "bg-red-100 text-red-700 border-red-200",
  error: "bg-red-100 text-red-700 border-red-200",
  pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  skipped: "bg-gray-100 text-gray-500 border-gray-200",
};

export function SignalStatusIcons({ signals }: Props) {
  const latestByType: Record<string, (typeof signals)[0]> = {};
  for (const s of signals) {
    if (!latestByType[s.signalType] || s.isRetry) {
      latestByType[s.signalType] = s;
    }
  }

  return (
    <div className="flex gap-1">
      {SIGNALS.map(({ key, label, short }) => {
        const signal = latestByType[key];
        const colorClass = signal ? (STATUS_COLOR[signal.status] ?? "bg-gray-100 text-gray-400 border-gray-200") : "bg-gray-50 text-gray-300 border-gray-100";
        return (
          <div key={key} title={`${label}: ${signal?.status ?? "not fired"}`} className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center border ${colorClass} cursor-help`}>
            {short}
          </div>
        );
      })}
    </div>
  );
}
