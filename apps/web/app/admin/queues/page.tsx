"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";

export default function AdminQueuesPage() {
  const { data: queues, isLoading, refetch } = useQuery({
    queryKey: ["admin-queues"],
    queryFn: () => adminApi.queues().then((r) => r.data),
    refetchInterval: 10000,
  });

  const retryJob = useMutation({
    mutationFn: ({ queue, jobId }: any) => adminApi.retryJob(queue, jobId),
    onSuccess: () => refetch(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Job Queue Monitor</h1>
        <span className="text-xs text-gray-400">Auto-refreshes every 10s</span>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-400 py-20">Loading queue stats...</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(queues ?? {}).map(([queueName, stats]: [string, any]) => (
            <div key={queueName} className="bg-white border rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">{queueName}</h2>
                <div className="flex gap-4 text-sm">
                  <span className="text-yellow-600">{stats.waiting} waiting</span>
                  <span className="text-blue-600">{stats.active} active</span>
                  <span className="text-green-600">{stats.completed} done</span>
                  <span className="text-red-600">{stats.failed} failed</span>
                </div>
              </div>

              {stats.failedJobs?.length > 0 && (
                <div className="divide-y">
                  <div className="px-6 py-2 bg-red-50 text-xs font-medium text-red-700">Failed Jobs</div>
                  {stats.failedJobs.map((job: any) => (
                    <div key={job.id} className="px-6 py-3 flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">Job #{job.id}</p>
                        <p className="text-xs text-red-500 mt-0.5">{job.reason}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{JSON.stringify(job.data).slice(0, 100)}...</p>
                      </div>
                      <button onClick={() => retryJob.mutate({ queue: queueName, jobId: job.id })} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                        Retry
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!stats.failedJobs?.length && (
                <div className="px-6 py-4 text-sm text-gray-400">No failed jobs</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
