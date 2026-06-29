import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Attach access token from localStorage (for SSR-agnostic auth)
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshBase = process.env.NEXT_PUBLIC_API_URL ?? "";
        const { data } = await axios.post(`${refreshBase}/api/auth/refresh`, {}, { withCredentials: true });
        if (data.accessToken && typeof window !== "undefined") {
          localStorage.setItem("accessToken", data.accessToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
        }
        return api(original);
      } catch {
        if (typeof window !== "undefined") {
          localStorage.removeItem("accessToken");
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

// Typed API helpers
export const authApi = {
  login: (email: string, password: string) => api.post("/api/auth/login", { email, password }),
  register: (data: { username: string; email: string; password: string; confirmPassword: string }) => api.post("/api/auth/register", data),
  logout: () => api.post("/api/auth/logout"),
  forgotPassword: (email: string) => api.post("/api/auth/forgot-password", { email }),
  resetPassword: (token: string, password: string) => api.post("/api/auth/reset-password", { token, password }),
  verifyEmail: (token: string) => api.get(`/api/auth/verify-email/${token}`),
  resendVerification: (email: string) => api.post("/api/auth/resend-verification", { email }),
};

export const userApi = {
  me: () => api.get("/api/user/me"),
  updateProfile: (data: any) => api.put("/api/user/profile", data),
  changePassword: (data: any) => api.put("/api/user/password", data),
  getNotifications: () => api.get("/api/user/notifications"),
  markAllRead: () => api.put("/api/user/notifications/read-all"),
  markRead: (id: string) => api.put(`/api/user/notifications/${id}/read`),
  getPreferences: () => api.get("/api/user/preferences"),
  updatePreferences: (data: any) => api.put("/api/user/preferences", data),
  getApiKeys: () => api.get("/api/user/api-keys"),
  createApiKey: (label: string) => api.post("/api/user/api-keys", { label }),
  revokeApiKey: (id: string) => api.delete(`/api/user/api-keys/${id}`),
};

export const projectApi = {
  list: () => api.get("/api/projects"),
  create: (data: any) => api.post("/api/projects", data),
  get: (id: string) => api.get(`/api/projects/${id}`),
  update: (id: string, data: any) => api.put(`/api/projects/${id}`, data),
  delete: (id: string) => api.delete(`/api/projects/${id}`),
  stats: (id: string) => api.get(`/api/projects/${id}/stats`),
};

export const campaignApi = {
  list: () => api.get("/api/campaigns"),
  create: (data: any) => api.post("/api/campaigns", data),
  get: (id: string) => api.get(`/api/campaigns/${id}`),
  update: (id: string, data: any) => api.put(`/api/campaigns/${id}`, data),
  delete: (id: string) => api.delete(`/api/campaigns/${id}`),
};

export const urlApi = {
  healthCheck: (urls: string[]) => api.post("/api/urls/health-check", { urls }),
  submit: (data: any) => api.post("/api/urls/submit", data),
  submitCsv: (formData: FormData) => api.post("/api/urls/submit/csv", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  submitSitemap: (data: { sitemapUrl: string; projectId?: string; campaignId?: string }) => api.post("/api/urls/submit/sitemap", data),
  list: (params?: any) => api.get("/api/urls", { params }),
  get: (id: string) => api.get(`/api/urls/${id}`),
  signals: (id: string) => api.get(`/api/urls/${id}/signals`),
  verifications: (id: string) => api.get(`/api/urls/${id}/verifications`),
  health: (id: string) => api.get(`/api/urls/${id}/health`),
  resubmit: (id: string) => api.post(`/api/urls/${id}/resubmit`),
  verify: (id: string) => api.post(`/api/urls/${id}/verify`),
  delete: (id: string) => api.delete(`/api/urls/${id}`),
  export: (params?: any) => api.get("/api/urls/export", { params, responseType: "blob" }),
};

export const creditApi = {
  balance: () => api.get("/api/credits/balance"),
  transactions: (params?: any) => api.get("/api/credits/transactions", { params }),
};

export const adminApi = {
  stats: () => api.get("/api/admin/stats"),
  users: (params?: any) => api.get("/api/admin/users", { params }),
  user: (id: string) => api.get(`/api/admin/users/${id}`),
  grantCredits: (id: string, amount: number, reason: string) => api.post(`/api/admin/users/${id}/credits`, { amount, reason }),
  setUserStatus: (id: string, isActive: boolean) => api.put(`/api/admin/users/${id}/status`, { isActive }),
  deleteUser: (id: string) => api.delete(`/api/admin/users/${id}`),
  urls: (params?: any) => api.get("/api/admin/urls", { params }),
  reindexUrl: (id: string) => api.post(`/api/admin/urls/${id}/reindex`),
  queues: () => api.get("/api/admin/queues"),
  retryJob: (queue: string, jobId: string) => api.post(`/api/admin/queues/${queue}/retry/${jobId}`),
  getSettings: () => api.get("/api/admin/settings"),
  updateSettings: (data: any) => api.put("/api/admin/settings", data),
  getBlocklist: () => api.get("/api/admin/blocklist"),
  addBlocklist: (domain: string, reason?: string) => api.post("/api/admin/blocklist", { domain, reason }),
  removeBlocklist: (id: string) => api.delete(`/api/admin/blocklist/${id}`),
};
