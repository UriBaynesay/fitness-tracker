import type {
  CreateExerciseInput,
  ErrorResponse,
  Exercise,
  LoginBody,
  Plan,
  PlanSummary,
  Profile,
  RegisterInput,
  UpdateDayInput,
  UpdateMeInput,
  UpdatePlanExerciseInput,
  UpdatePlanInput,
} from "@fitness/shared";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string
  ) {
    super(code);
  }
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
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

type PlanResult = Promise<{ plan: Plan }>;

export const api = {
  me: () => request<{ profile: Profile }>("GET", "/api/v1/me"),
  updateMe: (body: UpdateMeInput) => request<{ profile: Profile }>("PATCH", "/api/v1/me", body),
  register: (body: RegisterInput) => request<{ profile: Profile }>("POST", "/api/v1/auth/register", body),
  login: (body: LoginBody) => request<{ profile: Profile }>("POST", "/api/v1/auth/login", body),
  logout: () => request<void>("POST", "/api/v1/auth/logout"),

  exercises: {
    list: () => request<{ exercises: Exercise[] }>("GET", "/api/v1/exercises"),
    create: (body: CreateExerciseInput) => request<{ exercise: Exercise }>("POST", "/api/v1/exercises", body),
  },

  plans: {
    list: () => request<{ plans: PlanSummary[] }>("GET", "/api/v1/plans"),
    create: (name: string): PlanResult => request("POST", "/api/v1/plans", { name }),
    get: (id: string): PlanResult => request("GET", `/api/v1/plans/${id}`),
    update: (id: string, body: UpdatePlanInput): PlanResult => request("PATCH", `/api/v1/plans/${id}`, body),
    remove: (id: string) => request<void>("DELETE", `/api/v1/plans/${id}`),
  },

  // The plan-structure endpoints all answer with the whole updated plan, so the
  // editor just replaces its state with whatever comes back.
  days: {
    create: (planId: string, name: string): PlanResult => request("POST", `/api/v1/plans/${planId}/days`, { name }),
    update: (id: string, body: UpdateDayInput): PlanResult => request("PATCH", `/api/v1/plan-days/${id}`, body),
    remove: (id: string): PlanResult => request("DELETE", `/api/v1/plan-days/${id}`),
  },

  planExercises: {
    create: (dayId: string, exerciseId: string): PlanResult =>
      request("POST", `/api/v1/plan-days/${dayId}/exercises`, { exerciseId }),
    update: (id: string, body: UpdatePlanExerciseInput): PlanResult =>
      request("PATCH", `/api/v1/plan-exercises/${id}`, body),
    remove: (id: string): PlanResult => request("DELETE", `/api/v1/plan-exercises/${id}`),
  },
};
