import type { ErrorResponse, LoginBody, Profile, RegisterInput } from "@fitness/shared";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string
  ) {
    super(code);
  }
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network");
  }

  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, (data as ErrorResponse | null)?.error ?? "generic");
  }
  return data as T;
}

export const api = {
  me: () => request<{ profile: Profile }>("GET", "/api/v1/me"),
  register: (body: RegisterInput) => request<{ profile: Profile }>("POST", "/api/v1/auth/register", body),
  login: (body: LoginBody) => request<{ profile: Profile }>("POST", "/api/v1/auth/login", body),
  logout: () => request<void>("POST", "/api/v1/auth/logout"),
};
