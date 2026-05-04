import type {
  HumedadCompleteDemoDetail,
  HumedadCompleteDemoPayload,
  HumedadCompleteDemoSaveResponse,
  HumedadCompleteDemoSummary,
} from "@/types"

const API_URL = import.meta.env.VITE_API_URL || "https://api.geofal.com.pe"
const TOKEN_REFRESH_TIMEOUT_MS = 2500

const getStoredToken = (): string | null => {
  if (typeof window === "undefined") return null
  const token = localStorage.getItem("token")?.trim()
  return token || null
}

const persistToken = (token: string | null) => {
  if (typeof window === "undefined") return
  if (token) localStorage.setItem("token", token)
  else localStorage.removeItem("token")
}

const isJwtExpiringSoon = (token: string | null, skewMs = 60_000): boolean => {
  if (!token) return true
  try {
    const [, payload] = token.split(".")
    if (!payload) return true
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
    const decoded = JSON.parse(window.atob(padded))
    return typeof decoded?.exp === "number" ? decoded.exp * 1000 <= Date.now() + skewMs : true
  } catch {
    return true
  }
}

const requestTokenFromParent = async (reason: string): Promise<string | null> => {
  const existingToken = getStoredToken()
  if (typeof window === "undefined" || window.parent === window) return existingToken

  const requestId = `humedad-complete-demo-${reason}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return new Promise((resolve) => {
    let settled = false
    const cleanup = () => {
      window.removeEventListener("message", onMessage)
      clearTimeout(timeoutId)
    }
    const finish = (token: string | null) => {
      if (settled) return
      settled = true
      cleanup()
      if (token) persistToken(token)
      resolve(token ?? getStoredToken())
    }
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "TOKEN_REFRESH") return
      const responseRequestId = typeof event.data?.requestId === "string" ? event.data.requestId : null
      if (responseRequestId && responseRequestId !== requestId) return
      const token = typeof event.data?.token === "string" && event.data.token.trim() ? event.data.token.trim() : null
      finish(token)
    }
    const timeoutId = window.setTimeout(() => finish(existingToken), TOKEN_REFRESH_TIMEOUT_MS)
    window.addEventListener("message", onMessage)
    try {
      window.parent.postMessage({ type: "TOKEN_REFRESH_REQUEST", requestId, source: "humedad-complete-demo-api", reason }, "*")
    } catch {
      finish(existingToken)
    }
  })
}

const resolveAccessToken = async (reason: string): Promise<string | null> => {
  const stored = getStoredToken()
  if (!isJwtExpiringSoon(stored)) return stored
  return (await requestTokenFromParent(reason)) ?? stored
}

async function apiRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await resolveAccessToken(path)
  const headers = new Headers(init.headers || {})
  headers.set("Accept", "application/json")
  if (token) headers.set("Authorization", `Bearer ${token}`)
  if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(`${API_URL}${path}`, { ...init, headers })
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const data = await response.json()
      if (typeof data?.detail === "string") message = data.detail
    } catch {}
    throw new Error(message)
  }
  return (await response.json()) as T
}

const extractFilename = (contentDisposition?: string | null): string | undefined => {
  if (!contentDisposition) return undefined
  const match = contentDisposition.match(/filename=\"?([^\";]+)\"?/i)
  return match?.[1]
}

export async function saveHumedadCompleteDemoEnsayo(
  payload: HumedadCompleteDemoPayload,
  ensayoId?: number,
): Promise<HumedadCompleteDemoSaveResponse> {
  const params = new URLSearchParams()
  params.set("download", "false")
  if (ensayoId) params.set("ensayo_id", String(ensayoId))
  return await apiRequest<HumedadCompleteDemoSaveResponse>(`/api/humedad-complete-demo/excel?${params.toString()}`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function saveAndDownloadHumedadCompleteDemoExcel(
  payload: HumedadCompleteDemoPayload,
  ensayoId?: number,
): Promise<{ blob: Blob; filename?: string; ensayoId?: number }> {
  const params = new URLSearchParams()
  params.set("download", "true")
  if (ensayoId) params.set("ensayo_id", String(ensayoId))

  const token = await resolveAccessToken("download")
  const headers = new Headers()
  if (token) headers.set("Authorization", `Bearer ${token}`)
  headers.set("Content-Type", "application/json")

  const response = await fetch(`${API_URL}/api/humedad-complete-demo/excel?${params.toString()}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const data = await response.json()
      if (typeof data?.detail === "string") message = data.detail
    } catch {}
    throw new Error(message)
  }

  const blob = await response.blob()
  const responseEnsayoId = Number(response.headers.get("x-humedad-complete-demo-id"))
  return {
    blob,
    ensayoId: Number.isFinite(responseEnsayoId) ? responseEnsayoId : undefined,
    filename: extractFilename(response.headers.get("content-disposition")),
  }
}

export async function getHumedadCompleteDemoEnsayoDetail(ensayoId: number): Promise<HumedadCompleteDemoDetail> {
  return await apiRequest<HumedadCompleteDemoDetail>(`/api/humedad-complete-demo/${ensayoId}`)
}

export async function listHumedadCompleteDemoEnsayos(limit = 100): Promise<HumedadCompleteDemoSummary[]> {
  const params = new URLSearchParams()
  params.set("limit", String(limit))
  return await apiRequest<HumedadCompleteDemoSummary[]>(`/api/humedad-complete-demo/?${params.toString()}`)
}

export async function deleteHumedadCompleteDemoEnsayo(ensayoId: number): Promise<void> {
  await apiRequest(`/api/humedad-complete-demo/${ensayoId}`, { method: "DELETE" })
}
