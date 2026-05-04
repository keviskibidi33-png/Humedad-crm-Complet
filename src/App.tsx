import { useEffect, useState, type ReactNode } from "react"
import { Toaster } from "react-hot-toast"
import HumedadForm from "./pages/HumedadForm"
import { SessionGuard } from "./components/SessionGuard"

const CRM_LOGIN_URL = import.meta.env.VITE_CRM_LOGIN_URL || "http://localhost:3000/login"

function AccessGate({ children }: { children: ReactNode }) {
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tokenFromUrl = params.get("token")
    if (tokenFromUrl) {
      localStorage.setItem("token", tokenFromUrl)
      setAuthorized(true)
      return
    }

    if (localStorage.getItem("token")) {
      setAuthorized(true)
      return
    }

    if (window.parent === window) {
      setAuthorized(false)
      return
    }

    let settled = false
    const requestId = `access-gate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const cleanup = () => {
      window.removeEventListener("message", onMessage)
      clearTimeout(timeoutId)
    }
    const finish = (ok: boolean, token?: string | null) => {
      if (settled) return
      settled = true
      cleanup()
      if (token) localStorage.setItem("token", token)
      setAuthorized(ok)
    }
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "TOKEN_REFRESH") return
      const responseRequestId = typeof event.data?.requestId === "string" ? event.data.requestId : null
      if (responseRequestId && responseRequestId !== requestId) return
      const token = typeof event.data?.token === "string" && event.data.token.trim() ? event.data.token.trim() : null
      finish(!!token, token)
    }
    const timeoutId = window.setTimeout(() => finish(false), 2500)
    window.addEventListener("message", onMessage)
    try {
      window.parent.postMessage({ type: "TOKEN_REFRESH_REQUEST", requestId, source: "access_gate", reason: "mount-auth" }, "*")
    } catch {
      finish(false)
    }
  }, [])

  if (authorized === null) return null
  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="w-full max-w-sm text-center">
          <img src="/geofal.svg" alt="Geofal" className="mx-auto h-14" />
          <h1 className="mt-6 text-xl font-bold uppercase tracking-wide text-black">Acceso denegado</h1>
          <p className="mt-3 text-xs leading-relaxed text-neutral-500">Se requiere autenticación válida desde el CRM para usar este módulo.</p>
          <button className="mt-8 w-full bg-black px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white" onClick={() => window.location.assign(CRM_LOGIN_URL)}>
            Ir al CRM
          </button>
        </div>
      </div>
    )
  }
  return <>{children}</>
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-100 font-sans antialiased">
      <AccessGate>
        <SessionGuard />
        <HumedadForm />
      </AccessGate>
      <Toaster position="top-right" />
    </div>
  )
}
