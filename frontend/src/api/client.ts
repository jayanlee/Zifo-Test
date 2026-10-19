import { clearSession, setAccessToken, setUser, type AuthUser } from "../store/authSlice";
import { store } from "../store/store";

export type TaskStatus = "todo" | "in_progress" | "done";

export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
};

type TokenResponse = {
  access_token: string;
  expires_in: number;
};

type RequestOptions = {
  method?: string;
  body?: unknown;
  retry?: boolean;
};

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// One refresh at a time. Concurrent 401s wait for the same rotation.
let refreshInFlight: Promise<boolean> | null = null;

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") {
      return body.detail;
    }
    if (Array.isArray(body.detail)) {
      const messages = body.detail
        .map((item) => (item && typeof item === "object" && "msg" in item ? String(item.msg) : ""))
        .filter(Boolean);
      if (messages.length > 0) {
        return messages.join(", ");
      }
    }
  } catch {
    // The body was not JSON.
  }
  return `Request failed (${response.status})`;
}

async function performRefresh(): Promise<boolean> {
  const response = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    store.dispatch(clearSession());
    return false;
  }

  const body = (await response.json()) as TokenResponse;
  store.dispatch(setAccessToken(body.access_token));
  return true;
}

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers();
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  // The access token rides in a header. A foreign site cannot attach it, so there is no CSRF token.
  const accessToken = store.getState().auth.accessToken;
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401 && options.retry !== false && path !== "/api/auth/refresh") {
    const refreshed = await refreshSession();
    if (refreshed) {
      return request<T>(path, { ...options, retry: false });
    }
    throw new ApiError("Session expired");
  }

  if (!response.ok) {
    throw new ApiError(await readError(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function loadCurrentUser(): Promise<void> {
  const user = await request<AuthUser>("/api/auth/me");
  store.dispatch(setUser(user));
}

async function startSession(path: "/api/auth/login" | "/api/auth/register", body: unknown): Promise<void> {
  const tokens = await request<TokenResponse>(path, { method: "POST", body, retry: false });
  store.dispatch(setAccessToken(tokens.access_token));
  try {
    await loadCurrentUser();
  } catch (error) {
    store.dispatch(clearSession());
    throw error;
  }
}

// Called once on load, before the app decides to show login.
// The refresh token is the cookie the browser still has after a reload.
export async function restoreSession(): Promise<boolean> {
  if (store.getState().auth.accessToken) {
    return true;
  }
  const refreshed = await refreshSession();
  if (!refreshed) {
    return false;
  }
  try {
    await loadCurrentUser();
  } catch {
    store.dispatch(clearSession());
    return false;
  }
  return true;
}

export function login(email: string, password: string): Promise<void> {
  return startSession("/api/auth/login", { email, password });
}

export function register(name: string, email: string, password: string): Promise<void> {
  return startSession("/api/auth/register", { name, email, password });
}

export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } finally {
    store.dispatch(clearSession());
  }
}

export function listTasks(): Promise<Task[]> {
  return request<Task[]>("/api/tasks");
}

export function createTask(title: string, description: string): Promise<Task> {
  return request<Task>("/api/tasks", {
    method: "POST",
    body: { title, description: description || null },
  });
}

export function updateTask(id: string, changes: { status?: TaskStatus; title?: string }): Promise<Task> {
  return request<Task>(`/api/tasks/${id}`, { method: "PATCH", body: changes });
}

export function deleteTask(id: string): Promise<void> {
  return request<void>(`/api/tasks/${id}`, { method: "DELETE" });
}
