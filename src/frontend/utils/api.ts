/**
 * API utilities for Electron and web environments
 */

let apiBaseUrl: string | null = null;

/**
 * Get the API base URL (handles both Electron and web)
 */
export async function getApiBaseUrl(): Promise<string> {
  // Return cached value if available
  if (apiBaseUrl) {
    return apiBaseUrl;
  }

  // Check if running in Electron
  if (window.electronAPI) {
    try {
      const port = await window.electronAPI.getServerPort();
      apiBaseUrl = `http://localhost:${port}/api`;
      console.log(`Electron mode: API base URL set to ${apiBaseUrl}`);
      return apiBaseUrl;
    } catch (error) {
      console.error('Failed to get Electron server port:', error);
      // Fall back to default
      apiBaseUrl = '/api';
      return apiBaseUrl;
    }
  }

  // Web mode - use relative path
  apiBaseUrl = '/api';
  return apiBaseUrl;
}

/**
 * Make an authenticated API request
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = await getApiBaseUrl();
  const token = localStorage.getItem('pcr_token');

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Authentication required');
    }
    // Backend error responses are { success: false, message: '...' } - surface
    // that specific reason instead of just the generic HTTP status text.
    let message = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const body = await response.clone().json();
      if (body?.message) message = body.message;
    } catch {
      // Response body wasn't JSON - fall back to the generic message above
    }
    throw new Error(message);
  }

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return await response.json();
  }

  return response as unknown as T;
}
