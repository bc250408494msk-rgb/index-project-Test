"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { projectApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

const schema = z.object({ name: z.string().min(1), description: z.string().optional() });

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: projects, isLoading } = useQuery({ queryKey: ["projects"], queryFn: () => projectApi.list().then((r) => r.data) });
  const createMutation = useMutation({
    mutationFn: (data: any) => projectApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setShowForm(false);
      reset();
      toast({ title: "Project created", variant: "success" });
    },
    onError: (err: any) => toast({ title: "Could not create project", description: err?.response?.data?.error ?? "Please try again.", variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => projectApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Project deleted", variant: "success" });
    },
    onError: () => toast({ title: "Could not delete project", variant: "destructive" }),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          + New Project
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="bg-white border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Create Project</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input {...register("name")} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="My Website" />
            {errors.name && <p className="text-red-500 text-xs mt-1">Required</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <textarea {...register("description")} className="w-full border rounded-lg px-3 py-2 text-sm h-20 resize-none" placeholder="Optional description..." />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={createMutation.isPending} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {createMutation.isPending ? "Creating..." : "Create"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="text-center text-gray-500 py-12">Loading projects...</div>
      ) : projects?.length === 0 ? (
        <div className="text-center text-gray-500 py-12 bg-white rounded-xl border">
          <div className="text-4xl mb-3">📁</div>
          <p className="font-medium">No projects yet</p>
          <p className="text-sm mt-1">Create a project to organize your URL submissions.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects?.map((project: any) => (
            <div key={project.id} className="bg-white border rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-900">{project.name}</h3>
                <button onClick={() => deleteMutation.mutate(project.id)} className="text-red-400 hover:text-red-600 text-xs">Delete</button>
              </div>
              {project.description && <p className="text-sm text-gray-500 mb-3">{project.description}</p>}
              {/* Progress bar */}
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{project.indexedCount} indexed</span>
                  <span>{project.urlCount} total</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className="bg-green-500 rounded-full h-1.5" style={{ width: project.urlCount ? `${(project.indexedCount / project.urlCount) * 100}%` : "0%" }} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{formatDate(project.createdAt)}</span>
                <Link href={`/dashboard/projects/${project.id}`} className="text-sm text-blue-600 hover:underline">View URLs →</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
