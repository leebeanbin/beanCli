export interface ApiClientConfig {
  baseUrl: string;
  getAccessToken: () => string | null;
}

export interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export class ApiClient {
  constructor(private readonly config: ApiClientConfig) {}

  async get<T>(path: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
    const url = new URL(path, this.config.baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    return this.request<T>('GET', url.toString());
  }

  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    const url = new URL(path, this.config.baseUrl).toString();
    return this.request<T>('POST', url, body);
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.config.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { ok: false, status: response.status, error: (errorData as { error?: string }).error ?? response.statusText };
      }

      const data = await response.json() as T;
      return { ok: true, status: response.status, data };
    } catch (err) {
      return { ok: false, status: 0, error: (err as Error).message };
    }
  }
}
