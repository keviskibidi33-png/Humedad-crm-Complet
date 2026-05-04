import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Download, Loader2, Trash2 } from "lucide-react"
import toast from "react-hot-toast"
import FormatConfirmModal from "@/components/FormatConfirmModal"
import {
  deleteHumedadCompleteDemoEnsayo,
  getHumedadCompleteDemoEnsayoDetail,
  saveAndDownloadHumedadCompleteDemoExcel,
  saveHumedadCompleteDemoEnsayo,
} from "@/services/api"
import type { HumedadCompleteDemoPayload, HumedadCompleteDemoDetail, MetodoPrueba, SiNo } from "@/types"

const INITIAL_STATE: HumedadCompleteDemoPayload = {
  cliente: "",
  direccion: "",
  proyecto: "",
  ubicacion: "",
  recepcion_n: "",
  f_emision: "",
  ot_n: "",
  codigo_muestra: "",
  fecha_recepcion: "",
  fecha_ejecucion: "",
  cantera_sondaje: "",
  n_muestra: "",
  tipo_muestra: "",
  realizado_por: "",
  condicion_masa_menor: "-",
  condicion_capas: "-",
  condicion_temperatura: "-",
  condicion_excluido: "-",
  descripcion_material_excluido: "",
  condicion_muestra: "",
  tamano_maximo_particula: "",
  forma_particula: "",
  metodo_prueba: "-",
  metodo_a: false,
  metodo_b: false,
  numero_ensayo: 1,
  recipiente_numero: "",
  masa_recipiente_muestra_humeda: undefined,
  masa_recipiente_muestra_seca: undefined,
  masa_recipiente_muestra_seca_constante: undefined,
  masa_recipiente: undefined,
  masa_agua: undefined,
  masa_muestra_seca: undefined,
  contenido_humedad: undefined,
  equipo_balanza_01: "-",
  equipo_balanza_001: "-",
  equipo_horno: "-",
  observaciones: "",
  revisado_por: "-",
  revisado_fecha: "",
  aprobado_por: "-",
  aprobado_fecha: "",
}

const DRAFT_KEY_PREFIX = "humedad_complete_demo_draft_v1"

const clean = (value: string) => value.replace(/\s+/g, " ").trim()

const num = (value: string): number | undefined => {
  const v = value.trim()
  if (!v) return undefined
  const parsed = Number(v)
  return Number.isFinite(parsed) ? parsed : undefined
}

const metodoFrom = (form: HumedadCompleteDemoPayload): MetodoPrueba => {
  if (form.metodo_prueba === "A" || form.metodo_prueba === "B") return form.metodo_prueba
  if (form.metodo_a && !form.metodo_b) return "A"
  if (form.metodo_b && !form.metodo_a) return "B"
  if (form.metodo_a && form.metodo_b) return "A"
  return "-"
}

const buildFilenamePreview = (payload: HumedadCompleteDemoPayload) => {
  const code = clean(payload.codigo_muestra || "SIN_CODIGO")
  const ot = clean(payload.ot_n || "SIN_OT")
  return `HUMEDAD_${code}_${ot}.xlsx`
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</span>
      {children}
    </label>
  )
}

function MapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 py-2 last:border-b-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</span>
      <span className="text-right text-xs font-medium text-slate-900">{value}</span>
    </div>
  )
}

const inputClass = "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20"
const selectClass = inputClass

export default function HumedadForm() {
  const [form, setForm] = useState<HumedadCompleteDemoPayload>(INITIAL_STATE)
  const [loading, setLoading] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [confirmDownload, setConfirmDownload] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const draftKey = useMemo(() => `${DRAFT_KEY_PREFIX}:${editingId ?? "new"}`, [editingId])

  const masaAgua = useMemo(() => {
    const humeda = form.masa_recipiente_muestra_humeda
    const constante = form.masa_recipiente_muestra_seca_constante
    if (humeda != null && constante != null) return Math.round((humeda - constante) * 1000) / 1000
    return form.masa_agua ?? undefined
  }, [form.masa_agua, form.masa_recipiente_muestra_humeda, form.masa_recipiente_muestra_seca_constante])

  const masaMuestraSeca = useMemo(() => {
    const constante = form.masa_recipiente_muestra_seca_constante
    const recipiente = form.masa_recipiente
    if (constante != null && recipiente != null) return Math.round((constante - recipiente) * 1000) / 1000
    return form.masa_muestra_seca ?? undefined
  }, [form.masa_muestra_seca, form.masa_recipiente, form.masa_recipiente_muestra_seca_constante])

  const contenidoHumedad = useMemo(() => {
    if (masaAgua != null && masaMuestraSeca != null && masaMuestraSeca !== 0) {
      return Math.round((masaAgua / masaMuestraSeca) * 1000) / 10
    }
    return form.contenido_humedad ?? undefined
  }, [form.contenido_humedad, masaAgua, masaMuestraSeca])

  const buildPayload = (): HumedadCompleteDemoPayload => ({
    ...form,
    metodo_prueba: metodoFrom(form),
    metodo_a: metodoFrom(form) === "A",
    metodo_b: metodoFrom(form) === "B",
    masa_agua: masaAgua,
    masa_muestra_seca: masaMuestraSeca,
    contenido_humedad: contenidoHumedad,
    cliente: clean(form.cliente),
    direccion: clean(form.direccion),
    proyecto: clean(form.proyecto),
    ubicacion: clean(form.ubicacion),
    recepcion_n: clean(form.recepcion_n),
    f_emision: clean(form.f_emision),
    ot_n: clean(form.ot_n),
    codigo_muestra: clean(form.codigo_muestra),
    fecha_recepcion: clean(form.fecha_recepcion),
    fecha_ejecucion: clean(form.fecha_ejecucion),
    cantera_sondaje: clean(form.cantera_sondaje),
    n_muestra: clean(form.n_muestra),
    tipo_muestra: clean(form.tipo_muestra),
    realizado_por: clean(form.realizado_por),
    condicion_muestra: clean(form.condicion_muestra || ""),
    tamano_maximo_particula: clean(form.tamano_maximo_particula || ""),
    forma_particula: clean(form.forma_particula || ""),
    recipiente_numero: clean(form.recipiente_numero || ""),
    observaciones: clean(form.observaciones || ""),
    revisado_por: clean(form.revisado_por || "-"),
    aprobado_por: clean(form.aprobado_por || "-"),
    revisado_fecha: clean(form.revisado_fecha || ""),
    aprobado_fecha: clean(form.aprobado_fecha || ""),
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const raw = params.get("ensayo_id")
    const ensayoId = raw ? Number(raw) : null
    if (ensayoId && Number.isInteger(ensayoId) && ensayoId > 0) {
      setEditingId(ensayoId)
      setLoadingDetail(true)
      void getHumedadCompleteDemoEnsayoDetail(ensayoId)
        .then((detail: HumedadCompleteDemoDetail) => {
          if (detail.payload) {
            setForm({
              ...INITIAL_STATE,
              ...detail.payload,
              metodo_prueba: metodoFrom(detail.payload),
            })
          }
        })
        .catch((error) => toast.error(error instanceof Error ? error.message : "No se pudo cargar el ensayo."))
        .finally(() => setLoadingDetail(false))
      return
    }

    try {
      const rawDraft = localStorage.getItem(draftKey)
      if (rawDraft) {
        const draft = JSON.parse(rawDraft) as HumedadCompleteDemoPayload
        setForm({ ...INITIAL_STATE, ...draft })
      }
    } catch {
      localStorage.removeItem(draftKey)
    }
  }, [draftKey])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (loadingDetail) return
      localStorage.setItem(draftKey, JSON.stringify(form))
    }, 600)
    return () => window.clearTimeout(timeout)
  }, [draftKey, form, loadingDetail])

  const setField = <K extends keyof HumedadCompleteDemoPayload>(key: K, value: HumedadCompleteDemoPayload[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const setSiNo = (key: "condicion_masa_menor" | "condicion_capas" | "condicion_temperatura" | "condicion_excluido", value: SiNo) => {
    setField(key, value)
  }

  const save = async (download: boolean) => {
    const payload = buildPayload()
    setLoading(true)
    try {
      if (download) {
        const result = await saveAndDownloadHumedadCompleteDemoExcel(payload, editingId ?? undefined)
        const url = URL.createObjectURL(result.blob)
        const link = document.createElement("a")
        link.href = url
        link.download = result.filename || buildFilenamePreview(payload)
        link.click()
        URL.revokeObjectURL(url)
        if (result.ensayoId) setEditingId(result.ensayoId)
        toast.success("Excel generado correctamente.")
      } else {
        const saved = await saveHumedadCompleteDemoEnsayo(payload, editingId ?? undefined)
        setEditingId(saved.id)
        toast.success("Ensayo guardado correctamente.")
      }
      localStorage.removeItem(draftKey)
      if (window.parent !== window) window.parent.postMessage({ type: "CLOSE_MODAL" }, "*")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el ensayo.")
    } finally {
      setLoading(false)
    }
  }

  const clearAll = () => {
    if (!confirm("¿Limpiar todo el formulario?")) return
    setForm(INITIAL_STATE)
    localStorage.removeItem(draftKey)
    toast.success("Formulario limpiado.")
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <h1 className="text-base font-semibold text-slate-900 md:text-lg">HUMEDAD MULTITAB — TEMPLATE_HUMEDAD_COMPLETE</h1>
            <p className="text-xs text-slate-600">
              Inyección principal en <span className="font-semibold">Resumen</span>; las hojas
              <span className="font-semibold"> informe ASTM</span>, <span className="font-semibold">Datos ensayo</span>,
              <span className="font-semibold"> Incertidumbre</span>, <span className="font-semibold">Balanza</span> y
              <span className="font-semibold"> precision</span> se recalculan por fórmula.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {loadingDetail ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : null}
            {editingId ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Edición #{editingId}</span> : null}
          </div>
        </div>

        <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-800">Mapa de la plantilla Excel</h2>
              <p className="text-xs text-slate-600">Referencia visual para mantener el formulario alineado con la hoja Resumen.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide">
              {["Resumen", "informe ASTM", "Datos ensayo", "Incertidumbre", "Balanza", "precision"].map((sheet) => (
                <span key={sheet} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
                  {sheet}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <MapRow label="Hoja de inyección" value="Resumen (sheet2)" />
              <MapRow label="Encabezado" value="D11 / E11 / G11 / I11" />
              <MapRow label="Metadata lateral" value="P2, P3, P4, P5, P7, P8, P9, P12, P13, P15, P16, P17" />
              <MapRow label="Condiciones" value="J18:J21" />
              <MapRow label="Descripción" value="E25:E28" />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <MapRow label="Método" value="J26" />
              <MapRow label="Tabla principal" value="I31:I39" />
              <MapRow label="Observaciones" value="D52" />
              <MapRow label="Footer combinado" value="C55:E57 y G55:J57" />
              <MapRow label="Salida" value="XLSX nativo con fórmulas preservadas" />
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-800">Encabezado y metadata lateral</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {([
                ["Cliente", "cliente"],
                ["Dirección", "direccion"],
                ["Proyecto", "proyecto"],
                ["Ubicación", "ubicacion"],
                ["Recepción N°", "recepcion_n"],
                ["F. Emisión", "f_emision"],
                ["OT N°", "ot_n"],
                ["Código muestra", "codigo_muestra"],
                ["Fecha recepción", "fecha_recepcion"],
                ["Fecha ejecución", "fecha_ejecucion"],
                ["Cantera/Sondaje", "cantera_sondaje"],
                ["N° muestra", "n_muestra"],
                ["Tipo de muestra", "tipo_muestra"],
                ["Realizado por", "realizado_por"],
              ] as const).map(([label, key]) => (
                <Field key={key} label={label}>
                  <input
                    className={inputClass}
                    value={String(form[key] ?? "")}
                    onChange={(e) => setField(key, e.target.value as never)}
                    autoComplete="off"
                    data-lpignore="true"
                  />
                </Field>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-800">Footer y firmas</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Revisado por">
                <input className={inputClass} value={form.revisado_por || "-"} onChange={(e) => setField("revisado_por", e.target.value)} autoComplete="off" data-lpignore="true" />
              </Field>
              <Field label="Revisado fecha">
                <input className={inputClass} value={form.revisado_fecha || ""} onChange={(e) => setField("revisado_fecha", e.target.value)} autoComplete="off" data-lpignore="true" />
              </Field>
              <Field label="Aprobado por">
                <input className={inputClass} value={form.aprobado_por || "-"} onChange={(e) => setField("aprobado_por", e.target.value)} autoComplete="off" data-lpignore="true" />
              </Field>
              <Field label="Aprobado fecha">
                <input className={inputClass} value={form.aprobado_fecha || ""} onChange={(e) => setField("aprobado_fecha", e.target.value)} autoComplete="off" data-lpignore="true" />
              </Field>
            </div>
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              Los textos se escriben únicamente en las celdas superiores izquierdas de los rangos combinados del footer.
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-800">Condiciones, muestra y método</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Masa menor requerida">
                <select className={selectClass} value={form.condicion_masa_menor} onChange={(e) => setSiNo("condicion_masa_menor", e.target.value as SiNo)}>
                  {["-", "SI", "NO"].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </Field>
              <Field label="Más de un material">
                <select className={selectClass} value={form.condicion_capas} onChange={(e) => setSiNo("condicion_capas", e.target.value as SiNo)}>
                  {["-", "SI", "NO"].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </Field>
              <Field label="Temperatura distinta">
                <select className={selectClass} value={form.condicion_temperatura} onChange={(e) => setSiNo("condicion_temperatura", e.target.value as SiNo)}>
                  {["-", "SI", "NO"].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </Field>
              <Field label="Se excluyó material">
                <select className={selectClass} value={form.condicion_excluido} onChange={(e) => setSiNo("condicion_excluido", e.target.value as SiNo)}>
                  {["-", "SI", "NO"].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </Field>
              <Field label="Descripción excluida">
                <input className={inputClass} value={form.descripcion_material_excluido || ""} onChange={(e) => setField("descripcion_material_excluido", e.target.value)} autoComplete="off" data-lpignore="true" />
              </Field>
              <Field label="Condición muestra">
                <input className={inputClass} value={form.condicion_muestra || ""} onChange={(e) => setField("condicion_muestra", e.target.value)} autoComplete="off" data-lpignore="true" />
              </Field>
              <Field label="Tamaño máximo">
                <input className={inputClass} value={form.tamano_maximo_particula || ""} onChange={(e) => setField("tamano_maximo_particula", e.target.value)} autoComplete="off" data-lpignore="true" />
              </Field>
              <Field label="Forma partícula">
                <input className={inputClass} value={form.forma_particula || ""} onChange={(e) => setField("forma_particula", e.target.value)} autoComplete="off" data-lpignore="true" />
              </Field>
              <Field label="Método prueba">
                <select className={selectClass} value={form.metodo_prueba} onChange={(e) => setField("metodo_prueba", e.target.value as MetodoPrueba)}>
                  {["-", "A", "B"].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-800">Tabla principal del ensayo</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="N° de ensayo">
                <input className={inputClass} value={String(form.numero_ensayo ?? 1)} onChange={(e) => setField("numero_ensayo", num(e.target.value))} autoComplete="off" data-lpignore="true" />
              </Field>
              <Field label="Recipiente N°">
                <input className={inputClass} value={form.recipiente_numero || ""} onChange={(e) => setField("recipiente_numero", e.target.value)} autoComplete="off" data-lpignore="true" />
              </Field>
              <Field label="Masa recipiente + muestra húmeda">
                <input className={inputClass} value={form.masa_recipiente_muestra_humeda ?? ""} onChange={(e) => setField("masa_recipiente_muestra_humeda", num(e.target.value))} autoComplete="off" data-lpignore="true" />
              </Field>
              <Field label="Masa recipiente + muestra seca">
                <input className={inputClass} value={form.masa_recipiente_muestra_seca ?? ""} onChange={(e) => setField("masa_recipiente_muestra_seca", num(e.target.value))} autoComplete="off" data-lpignore="true" />
              </Field>
              <Field label="Masa seca constante">
                <input className={inputClass} value={form.masa_recipiente_muestra_seca_constante ?? ""} onChange={(e) => setField("masa_recipiente_muestra_seca_constante", num(e.target.value))} autoComplete="off" data-lpignore="true" />
              </Field>
              <Field label="Masa recipiente">
                <input className={inputClass} value={form.masa_recipiente ?? ""} onChange={(e) => setField("masa_recipiente", num(e.target.value))} autoComplete="off" data-lpignore="true" />
              </Field>
              <Field label="Masa agua">
                <input className={`${inputClass} bg-slate-100`} readOnly value={masaAgua ?? ""} />
              </Field>
              <Field label="Masa muestra seca">
                <input className={`${inputClass} bg-slate-100`} readOnly value={masaMuestraSeca ?? ""} />
              </Field>
              <Field label="Contenido humedad %">
                <input className={`${inputClass} bg-slate-100`} readOnly value={contenidoHumedad ?? ""} />
              </Field>
              <Field label="Balanza 0.1g">
                <input className={inputClass} value={form.equipo_balanza_01 || "-"} onChange={(e) => setField("equipo_balanza_01", e.target.value)} autoComplete="off" data-lpignore="true" />
              </Field>
              <Field label="Balanza 0.01g">
                <input className={inputClass} value={form.equipo_balanza_001 || "-"} onChange={(e) => setField("equipo_balanza_001", e.target.value)} autoComplete="off" data-lpignore="true" />
              </Field>
              <Field label="Horno 110°C">
                <input className={inputClass} value={form.equipo_horno || "-"} onChange={(e) => setField("equipo_horno", e.target.value)} autoComplete="off" data-lpignore="true" />
              </Field>
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-800">Observaciones</h2>
          <textarea className="min-h-28 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20" value={form.observaciones || ""} onChange={(e) => setField("observaciones", e.target.value)} autoComplete="off" data-lpignore="true" />
          <p className="mt-2 text-xs text-slate-500">Se escribe en D52; el contenido largo se preserva tal como en el libro original.</p>
        </section>

        <div className="flex flex-col gap-3 md:flex-row">
          <button onClick={clearAll} disabled={loading} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50">
            <Trash2 className="h-4 w-4" />
            Limpiar todo
          </button>
          <button onClick={() => void save(false)} disabled={loading} className="h-11 flex-1 rounded-lg border border-slate-900 bg-white font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50">
            {loading ? "Guardando..." : "Guardar"}
          </button>
          <button onClick={() => setConfirmDownload(true)} disabled={loading} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Procesando...</> : <><Download className="h-4 w-4" /> Guardar y descargar</>}
          </button>
        </div>
      </div>

      <FormatConfirmModal
        open={confirmDownload}
        formatLabel={buildFilenamePreview(buildPayload())}
        actionLabel="Guardar y descargar"
        onClose={() => setConfirmDownload(false)}
        onConfirm={() => {
          setConfirmDownload(false)
          void save(true)
        }}
      />
    </div>
  )
}
