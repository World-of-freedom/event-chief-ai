import { supabase } from "@/lib/supabase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/** Turn FastAPI error details (a string, or a list of validation errors) into readable text. */
function formatErrorDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item: { loc?: unknown[]; msg?: string }) => {
        const field = item.loc?.filter((part) => part !== "body" && typeof part === "string").join(".");
        const message = (item.msg ?? "Invalid value").replace(/^Value error, /, "");
        return field ? `${field.replace(/_/g, " ")}: ${message}` : message;
      })
      .join("; ");
  }
  return JSON.stringify(detail);
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");

  // Retrieve current Supabase access token if session exists
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch {
      // Session retrieval failure — proceed without auth header
    }
  }

  const url = `${API_BASE_URL.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    let errorData = null;
    try {
      errorData = await response.json();
      if (errorData?.detail) {
        errorDetail = formatErrorDetail(errorData.detail);
      }
    } catch {
      // JSON parse error — use status text
      errorDetail = response.statusText || errorDetail;
    }
    throw new ApiError(response.status, errorDetail, errorData);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

/** Retrieve a non-JSON API response while applying the same authenticated request setup. */
export async function apiBlob(endpoint: string): Promise<Blob> {
  const headers = new Headers();
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.set("Authorization", `Bearer ${token}`);
    } catch {
      // The request will return the API's normal unauthorized response.
    }
  }
  const url = `${API_BASE_URL.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.detail) message = formatErrorDetail(data.detail);
    } catch {
      message = response.statusText || message;
    }
    throw new ApiError(response.status, message);
  }
  return response.blob();
}
