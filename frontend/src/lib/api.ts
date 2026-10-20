import { supabase } from "@/lib/supabase";

/**
 * Typed API seam. Feature clients remain intentionally unwired, but every future
 * request can use this helper to forward the current Supabase access token.
 */
const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

export class ApiNotConfiguredError extends Error {
  constructor(feature: string) {
    super(`${feature} is not configured. Connect this client to the API when implementation begins.`);
  }
}

export const api = {
  baseUrl,
  async authorizedFetch(path: string, init: RequestInit = {}) {
    if (!supabase) throw new ApiNotConfiguredError("Supabase authentication");
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new ApiNotConfiguredError("An authenticated API session");
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
    });
  },
  async getDiscoveryRecommendations(): Promise<never> {
    throw new ApiNotConfiguredError("Sponsor discovery");
  },
};
