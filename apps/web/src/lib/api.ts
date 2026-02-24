import { ApiClient } from '@tfsdc/ui-web';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

let _token: string | null = null;

export function setToken(token: string | null): void {
  _token = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('tfsdc_token', token);
    } else {
      localStorage.removeItem('tfsdc_token');
    }
  }
}

export function getToken(): string | null {
  if (_token) return _token;
  if (typeof window !== 'undefined') {
    _token = localStorage.getItem('tfsdc_token');
  }
  return _token;
}

export const apiClient = new ApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: getToken,
});
