"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { campaignApi, projectApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, any> = {
  active: "success",
  paused: "warning",
  completed: "secondary",
  archived: "outline",
};

export default function CampaignsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => campaignApi.list().then((r) => r.data),
  });

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectApi.list().then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: () => campaignApi.create({ name, description, projectId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setOpen(false);
      setName("");
      setDescription("");
      setProjectId("");
      toast({ title: "Campaign created", variant: "success" });
    },
    onError: (err: any) => {
      toast({ title: "Could not create campaign", description: err?.response?.data?.error ?? "Please try again.", variant: "destructive" });
    },
  });

  const deleteCampaign = useMutation({
    mutationFn: (id: string) => campaignApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast({ title: "Campaign deleted", variant: "success" });
    },
    onError: () => toast({ title: "Could not delete campaign", variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-sm text-gray-500 mt-1">Group URLs by campaign for easier tracking</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>+ New Campaign</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Campaign</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Campaign Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q3 Blog Posts" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project">Project</Label>
                <select
                  id="project"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="">Select a project…</option>
                  {projects?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {!projects?.length && (
                  <p className="text-xs text-amber-600">Create a project first — campaigns belong to a project.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="desc">Description (optional)</Label>
                <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" />
              </div>
              <Button className="w-full" onClick={() => create.mutate()} disabled={!name || !projectId || create.isPending}>
                {create.isPending ? "Creating..." : "Create Campaign"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading campaigns...</div>
      ) : !campaigns?.length ? (
        <Card>
          <CardContent className="text-center py-16">
            <p className="text-4xl mb-4">🎯</p>
            <p className="text-gray-500 font-medium">No campaigns yet</p>
            <p className="text-sm text-gray-400 mt-1">Create a campaign to group and track URL submissions together</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c: any) => (
            <Card key={c.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  <Badge variant={STATUS_VARIANT[c.status] ?? "secondary"}>{c.status}</Badge>
                </div>
                {c.description && <p className="text-sm text-gray-500 mt-1">{c.description}</p>}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>Created {formatDate(c.createdAt)}</span>
                  <button
                    onClick={() => deleteCampaign.mutate(c.id)}
                    className="text-red-400 hover:text-red-600 text-xs"
                  >
                    Delete
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
