import type { Task, TaskInput, TaskPatch, TaskReorderItem } from '../../shared/eisenflow.js'

type MessageResponse = {
  message?: string
}

type SessionResponse = {
  authenticated: boolean
}

type TasksResponse = {
  tasks: Task[]
}

type TaskResponse = {
  task: Task
}

export class ApiRequestError extends Error {
  readonly status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

function isMessageResponse(value: unknown): value is MessageResponse {
  return typeof value === 'object' && value !== null && 'message' in value
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (response.status === 204) {
    return undefined as T
  }

  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false
  const payload: unknown = isJson ? await response.json() : null

  if (!response.ok) {
    const message =
      isJson && isMessageResponse(payload) && typeof payload.message === 'string'
        ? payload.message
        : `La solicitud fallo con estado ${response.status}.`
    throw new ApiRequestError(message, response.status)
  }

  return payload as T
}

export async function fetchSession(): Promise<SessionResponse> {
  return request<SessionResponse>('/api/auth/session')
}

export async function login(password: string): Promise<SessionResponse> {
  return request<SessionResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

export async function logout(): Promise<void> {
  await request<void>('/api/auth/logout', {
    method: 'POST',
  })
}

export async function fetchTasks(): Promise<Task[]> {
  const response = await request<TasksResponse>('/api/tasks')
  return response.tasks
}

export async function createTask(input: TaskInput): Promise<Task> {
  const response = await request<TaskResponse>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return response.task
}

export async function updateTask(taskId: string, patch: TaskPatch): Promise<Task> {
  const response = await request<TaskResponse>(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return response.task
}

export async function deleteTask(taskId: string): Promise<void> {
  await request<void>(`/api/tasks/${taskId}`, {
    method: 'DELETE',
  })
}

export async function reorderTasks(items: TaskReorderItem[]): Promise<Task[]> {
  const response = await request<TasksResponse>('/api/tasks/reorder', {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
  return response.tasks
}

export async function clearCompletedTasks(): Promise<void> {
  await request<void>('/api/tasks?status=done', {
    method: 'DELETE',
  })
}

export async function seedStarterTasks(): Promise<void> {
  await request<void>('/api/tasks/seed', {
    method: 'POST',
  })
}
