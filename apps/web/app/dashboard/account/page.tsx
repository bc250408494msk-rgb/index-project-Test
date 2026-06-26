"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { userApi } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

export default function AccountPage() {
  const [activeTab, setActiveTab] = useState("profile");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ["me"], queryFn: () => userApi.me().then((r) => r.data) });
  const { data: keys } = useQuery({ queryKey: ["api-keys"], queryFn: () => userApi.getApiKeys().then((r) => r.data) });
  const { data: prefs } = useQuery({ queryKey: ["preferences"], queryFn: () => userApi.getPreferences().then((r) => r.data) });

  const updateProfile = useMutation({
    mutationFn: userApi.updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast({ title: "Profile updated", variant: "success" });
    },
    onError: (err: any) => toast({ title: "Update failed", description: err?.response?.data?.error ?? "Please try again.", variant: "destructive" }),
  });
  const changePassword = useMutation({
    mutationFn: userApi.changePassword,
    onSuccess: () => toast({ title: "Password changed", description: "Your password has been updated successfully.", variant: "success" }),
    onError: (err: any) => toast({ title: "Password change failed", description: err?.response?.data?.error ?? "Please try again.", variant: "destructive" }),
  });
  const updatePrefs = useMutation({
    mutationFn: userApi.updatePreferences,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
      toast({ title: "Preferences saved", variant: "success" });
    },
  });
  const createKey = useMutation({
    mutationFn: (label: string) => userApi.createApiKey(label),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      const key = res.data.key;
      if (key) {
        setCopiedKey(key);
        navigator.clipboard?.writeText(key);
      }
      toast({ title: "API key generated", description: "Copy it now — it won't be shown again.", variant: "success" });
    },
    onError: (err: any) => toast({ title: "Failed to generate key", description: err?.response?.data?.error ?? "Please try again.", variant: "destructive" }),
  });
  const revokeKey = useMutation({
    mutationFn: userApi.revokeApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "API key revoked", variant: "success" });
    },
    onError: () => toast({ title: "Failed to revoke key", variant: "destructive" }),
  });

  const tabs = [
    { id: "profile", label: "Profile" },
    { id: "password", label: "Password" },
    { id: "notifications", label: "Notifications" },
    { id: "apikeys", label: "API Keys" },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>

      <div className="flex border-b gap-4">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`pb-2 text-sm font-medium border-b-2 -mb-px ${activeTab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border rounded-xl p-6">
        {/* Profile Tab */}
        {activeTab === "profile" && (
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.target as HTMLFormElement); updateProfile.mutate(Object.fromEntries(fd)); }} className="space-y-4">
            <h2 className="font-semibold text-gray-900">Profile</h2>
            {[
              { name: "username", label: "Username", defaultValue: user?.username },
              { name: "email", label: "Email", defaultValue: user?.email, readOnly: true },
              { name: "timezone", label: "Timezone", defaultValue: user?.timezone },
            ].map(({ name, label, defaultValue, readOnly }) => (
              <div key={name}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input name={name} defaultValue={defaultValue} readOnly={readOnly} className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" />
              </div>
            ))}
            <button type="submit" disabled={updateProfile.isPending} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {updateProfile.isPending ? "Saving..." : "Save Changes"}
            </button>
          </form>
        )}

        {/* Password Tab */}
        {activeTab === "password" && (
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.target as HTMLFormElement); changePassword.mutate({ currentPassword: fd.get("currentPassword"), newPassword: fd.get("newPassword") }); }} className="space-y-4">
            <h2 className="font-semibold text-gray-900">Change Password</h2>
            {[
              { name: "currentPassword", label: "Current Password" },
              { name: "newPassword", label: "New Password" },
            ].map(({ name, label }) => (
              <div key={name}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input name={name} type="password" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="••••••••" />
              </div>
            ))}
            <button type="submit" disabled={changePassword.isPending} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {changePassword.isPending ? "Updating..." : "Update Password"}
            </button>
          </form>
        )}

        {/* Notifications Tab */}
        {activeTab === "notifications" && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900">Email Notifications</h2>
            {[
              { key: "notifyOnIndexed", label: "URL Indexed" },
              { key: "notifyOnRefund", label: "Credit Refunded" },
              { key: "notifyOnRetry", label: "URL Retry Triggered" },
              { key: "notifyOnHealthFail", label: "Health Check Failed" },
              { key: "notifyOnLowCredits", label: "Low Credits" },
              { key: "notifyOnCreditsGranted", label: "Credits Granted" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="text-sm text-gray-700">{label}</span>
                <button
                  onClick={() => updatePrefs.mutate({ [key]: !prefs?.[key] })}
                  className={`relative inline-flex w-10 h-6 rounded-full transition-colors ${prefs?.[key] ? "bg-blue-600" : "bg-gray-200"}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${prefs?.[key] ? "translate-x-4" : ""}`} />
                </button>
              </div>
            ))}
            <div className="pt-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Low Credit Alert Threshold</label>
              <input type="number" defaultValue={prefs?.lowCreditThreshold ?? 5} onBlur={(e) => updatePrefs.mutate({ lowCreditThreshold: parseInt(e.target.value) })} className="w-24 border rounded-lg px-3 py-2 text-sm" min={1} max={100} />
            </div>
          </div>
        )}

        {/* API Keys Tab */}
        {activeTab === "apikeys" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">API Keys</h2>
              <button onClick={() => { const label = prompt("Key label?"); if (label) createKey.mutate(label); }} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
                + Generate Key
              </button>
            </div>

            {copiedKey && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                <p className="font-medium text-green-800 mb-1">Your API key (save this — shown only once):</p>
                <code className="text-green-700 break-all">{copiedKey}</code>
                <button onClick={() => setCopiedKey(null)} className="ml-3 text-xs text-green-600 underline">Dismiss</button>
              </div>
            )}

            <div className="divide-y">
              {keys?.map((key: any) => (
                <div key={key.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{key.label}</p>
                    <p className="text-xs text-gray-400">Prefix: {key.keyPrefix}... · {key.requestCount} requests · Created {new Date(key.createdAt).toLocaleDateString()}</p>
                  </div>
                  <button onClick={() => revokeKey.mutate(key.id)} className="text-xs text-red-500 hover:text-red-700">Revoke</button>
                </div>
              ))}
              {keys?.length === 0 && <p className="text-sm text-gray-400 py-4">No API keys yet.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
