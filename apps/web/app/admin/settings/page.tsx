"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ["admin-settings"], queryFn: () => adminApi.getSettings().then((r) => r.data) });

  const updateSettings = useMutation({
    mutationFn: adminApi.updateSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-settings"] }),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const updates: Record<string, string> = {};
    for (const [key, value] of fd.entries()) {
      updates[key] = value as string;
    }
    updateSettings.mutate(updates);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading settings...</div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-6 space-y-5">
          {settings?.map((s: any) => (
            <div key={s.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {s.key.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                {s.description && <span className="ml-1 text-xs text-gray-400 font-normal">— {s.description}</span>}
              </label>
              <input name={s.key} defaultValue={s.value} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          ))}
          <button type="submit" disabled={updateSettings.isPending} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {updateSettings.isPending ? "Saving..." : "Save Settings"}
          </button>
          {updateSettings.isSuccess && <p className="text-sm text-green-600">Settings saved.</p>}
        </form>
      )}
    </div>
  );
}
