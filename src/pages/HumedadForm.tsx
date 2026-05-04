import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Beaker, Download, Loader2, Trash2 } from 'lucide-react'
import {


  getContHumedadEnsayoDetail,
  saveAndDownloadContHumedadExcel,
  saveContHumedadEnsayo,
} from '@/services/api'
import type { ContHumedadPayload, SiNoSelect } from '@/types'
import FormatConfirmModal from '../components/FormatConfirmModal'

const buildFormatPreview = (sampleCode: string | undefined, materialCode: 'SU' | 'AG', ensayo: string) => {
    const currentYear = new Date().getFullYear().toString().slice(-2)
    const normalized = (sampleCode || '').trim().toUpperCase()
    const fullMatch = normalized.match(/^(\d+)(?:-[A-Z0-9. ]+)?-(\d{2,4})$/)
    const partialMatch = normalized.match(/^(\d+)(?:-(\d{2,4}))?$/)
    const match = fullMatch || partialMatch
    const numero = match?.[1] || 'xxxx'
    const year = (match?.[2] || currentYear).slice(-2)
  return `Formato N-${numero}-${materialCode}-${year} ${ensayo}`
}


const DRAFT_KEY = 'cont_humedad_form_draft_v1'
const DEBOUNCE_MS = 700
const REVISORES = ['-', 'FABIAN LA ROSA'] as const
const APROBADORES = ['-', 'IRMA COAQUIRA'] as const

const EQUIPO_OPTIONS = {
  balanza_01g_codigo: ['-', 'EQP-0046'],
  horno_110c_codigo: ['-', 'EQP-0049'],
} as const

const withCurrentOption = (value: string | null | undefined, base: readonly string[]) => {
  const current = (value ?? '').trim()
  if (!current || base.includes(current)) return base
  return [...base, current]
}

const parseNum = (value: string) => {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const yy = () => new Date().getFullYear().toString().slice(-2)

const normalizeMuestra = (raw: string) => {
  const value = raw.trim().toUpperCase()
  if (!value) return ''
  const compact = value.replace(/\s+/g, '')
  const match = compact.match(/^(\d+)(?:-(?:SU|AG))?(?:-(\d{2}))?$/)
  return match ? `${match[1]}-SU-${match[2] || yy()}` : value
}

const normalizeOt = (raw: string) => {
  const value = raw.trim().toUpperCase()
  if (!value) return ''
  const compact = value.replace(/\s+/g, '')
  const patterns = [/^(?:N?OT-)?(\d+)(?:-(\d{2}))?$/, /^(\d+)(?:-(?:N?OT))?(?:-(\d{2}))?$/]
  for (const pattern of patterns) {
    const match = compact.match(pattern)
    if (match) return `${match[1]}-${match[2] || yy()}`
  }
  return value
}

const normalizeDate = (raw: string): string => {
    const value = raw.trim()
    if (!value) return ''
    const digits = value.replace(/\D/g, '')
    const currentYear = String(new Date().getFullYear())
    const pad2 = (part: string) => part.padStart(2, '0').slice(-2)
    const normalizeYear = (part: string) => {
        const clean = part.replace(/\D/g, '')
        if (clean.length >= 4) return clean.slice(0, 4)
        if (clean.length === 2) return `20${clean}`
        if (clean.length === 1) return `200${clean}`
        return currentYear
    }
    const build = (y: string, m: string, d: string) => `${normalizeYear(y)}/${pad2(m)}/${pad2(d)}`

    if (value.includes('/') || value.includes('-')) {
        const [a = '', b = '', c = ''] = value.split(/[/-]/).map((part) => part.trim())
        if (!a || !b) return value
        if (a.length === 4) return build(a, b, c || '01')
        if (c) return build(c, b, a)
        return value
    }

    if (digits.length === 8) {
        if (digits.startsWith('19') || digits.startsWith('20')) return build(digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8))
        return build(digits.slice(4, 8), digits.slice(2, 4), digits.slice(0, 2))
    }
    if (digits.length === 6) return build(digits.slice(4, 6), digits.slice(2, 4), digits.slice(0, 2))
    if (digits.length === 5) return build(digits.slice(3, 5), digits.slice(1, 3), digits[0])
    if (digits.length === 4) return build(currentYear, digits.slice(0, 2), digits.slice(2, 4))
    if (digits.length === 3) return build(currentYear, digits[0], digits.slice(1, 3))
    if (digits.length === 2) return build(currentYear, digits[0], digits[1])

    return value
}

const getEnsayoId = () => {
  const n = Number(new URLSearchParams(window.location.search).get('ensayo_id'))
  return Number.isInteger(n) && n > 0 ? n : null
}

const initialState = (): ContHumedadPayload => ({
  muestra: '',
  numero_ot: '',
  fecha_ensayo: '',
  realizado_por: '',
  numero_ensayo: 1,
  recipiente_numero: '',
  masa_recipiente_muestra_humedo_g: null,
  masa_recipiente_muestra_seco_g: null,
  masa_recipiente_muestra_seco_constante_g: null,
  masa_agua_g: null,
  masa_recipiente_g: null,
  masa_muestra_seco_g: null,
  contenido_humedad_pct: null,
  tipo_muestra: '',
  tamano_maximo_muestra_visual_in: '',
  cumple_masa_minima_norma: '-',
  se_excluyo_material: '-',
  descripcion_material_excluido: '',
  balanza_01g_codigo: '-',
  horno_110c_codigo: '-',
  observaciones: '',
  revisado_por: '-',
  revisado_fecha: '',
  aprobado_por: '-',
  aprobado_fecha: '',
})

const hydrateForm = (payload?: Partial<ContHumedadPayload> | null): ContHumedadPayload => ({
  ...initialState(),
  ...payload,
  muestra: normalizeMuestra(payload?.muestra ?? ''),
})

const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const computePayload = (payload: ContHumedadPayload): ContHumedadPayload => {
  const next = { ...payload }
  const row3 = n(next.masa_recipiente_muestra_humedo_g)
  const row4 = n(next.masa_recipiente_muestra_seco_g)
  const row5 = n(next.masa_recipiente_muestra_seco_constante_g)
  const row7 = n(next.masa_recipiente_g)

  if (row3 != null && row4 != null) next.masa_agua_g = Number((row3 - row4).toFixed(1))
  if (row5 != null && row7 != null) next.masa_muestra_seco_g = Number((row5 - row7).toFixed(1))
  if (n(next.masa_agua_g) != null && n(next.masa_muestra_seco_g) != null && next.masa_muestra_seco_g !== 0) {
    next.contenido_humedad_pct = Number(((next.masa_agua_g! / next.masa_muestra_seco_g!) * 100).toFixed(1))
  }

  // if (next.se_excluyo_material !== 'SI') next.descripcion_material_excluido = ''
  return next
}

export default function ContHumedadForm() {
  const [form, setForm] = useState<ContHumedadPayload>(() => initialState())
  const [loading, setLoading] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [ensayoId, setEnsayoId] = useState<number | null>(() => getEnsayoId())

  useEffect(() => {
    const raw = localStorage.getItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`)
    if (!raw) return
    try {
      setForm(hydrateForm(JSON.parse(raw)))
    } catch {
      // ignore corrupted draft
    }
  }, [ensayoId])

  useEffect(() => {
    const t = window.setTimeout(() => {
      localStorage.setItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`, JSON.stringify(form))
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [form, ensayoId])

  useEffect(() => {
    if (!ensayoId) return
    let disposed = false
    const run = async () => {
      setLoadingEdit(true)
      try {
        const detail = await getContHumedadEnsayoDetail(ensayoId)
        if (!disposed && detail.payload) {
          setForm(hydrateForm(detail.payload))
        }
      } catch {
        toast.error('No se pudo cargar ensayo de Contenido Humedad.')
      } finally {
        if (!disposed) setLoadingEdit(false)
      }
    }
    void run()
    return () => {
      disposed = true
    }
  }, [ensayoId])

  const computed = useMemo(() => computePayload(form), [form])

  const setField = useCallback(<K extends keyof ContHumedadPayload>(k: K, v: ContHumedadPayload[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }))
  }, [])

  const setSelect = useCallback((k: 'cumple_masa_minima_norma' | 'se_excluyo_material', v: SiNoSelect) => {
    setForm((prev) => ({ ...prev, [k]: v }))
  }, [])

  const clearAll = useCallback(() => {
    if (!window.confirm('Se limpiaran los datos no guardados. Deseas continuar?')) return
    localStorage.removeItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`)
    setForm(initialState())
  }, [ensayoId])
    const [pendingFormatAction, setPendingFormatAction] = useState<boolean | null>(null)


  const save = useCallback(async (download: boolean) => {
    if (!form.muestra || !form.numero_ot || !form.fecha_ensayo || !form.realizado_por) {
      return toast.error('Complete Muestra, N OT, Fecha y Realizado por.')
    }

    setLoading(true)
    try {
      const payload = computePayload(form)
      if (download) {
        const { blob, ensayoId: returnedId, filename } = await saveAndDownloadContHumedadExcel(payload, ensayoId ?? undefined)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename || `${buildFormatPreview(form.muestra, 'SU', 'HUM. SUELO')}.xlsx`
        a.click()
        URL.revokeObjectURL(url)
        if (returnedId) setEnsayoId(returnedId)
      } else {
        const saved = await saveContHumedadEnsayo(payload, ensayoId ?? undefined)
        setEnsayoId(saved.id)
      }

      const oldKey = `${DRAFT_KEY}:${ensayoId ?? 'new'}`
      localStorage.removeItem(oldKey)
      localStorage.removeItem(`${DRAFT_KEY}:new`)
      setForm(initialState())
      setEnsayoId(null)
      if (window.parent !== window) window.parent.postMessage({ type: 'CLOSE_MODAL' }, '*')
      toast.success(download ? 'Humedad suelo guardado y descargado.' : 'Humedad suelo guardado.')
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.detail || 'No se pudo generar Humedad suelo.'
        : 'No se pudo generar Humedad suelo.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [ensayoId, form])

  const inputClass = 'h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500/35'
  const roInputClass = `${inputClass} bg-slate-100`

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-[1280px] space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-slate-50">
            <Beaker className="h-5 w-5 text-slate-900" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 md:text-lg">HUMEDAD SUELO - ASTM D2216-19</h1>
            <p className="text-xs text-slate-600">Replica del formato Excel oficial</p>
          </div>
        </div>

        {loadingEdit ? (
          <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando ensayo...
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
          <div className="border-b border-slate-300 bg-slate-50 px-4 py-4 text-center">
            <p className="text-2xl font-semibold leading-tight text-slate-900">LABORATORIO DE ENSAYO DE MATERIALES</p>
            <p className="text-xl font-semibold leading-tight text-slate-900">FORMATO N° F-LEM-P-SU-20.01</p>
          </div>

          <div className="border-b border-slate-300 bg-white px-3 py-3">
            <table className="w-full table-fixed border border-slate-300 text-sm">
              <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                <tr>
                  <th className="border-r border-slate-300 py-1">MUESTRA</th>
                  <th className="border-r border-slate-300 py-1">N° OT</th>
                  <th className="border-r border-slate-300 py-1">FECHA DE ENSAYO</th>
                  <th className="py-1">REALIZADO</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border-r border-t border-slate-300 p-1"><input className={`${inputClass} text-center`} value={form.muestra} onChange={(e) => setField('muestra', e.target.value)} onBlur={() => setField('muestra', normalizeMuestra(form.muestra))} autoComplete="off" data-lpignore="true" /></td>
                  <td className="border-r border-t border-slate-300 p-1"><input className={`${inputClass} text-center`} value={form.numero_ot} onChange={(e) => setField('numero_ot', e.target.value)} onBlur={() => setField('numero_ot', normalizeOt(form.numero_ot))} autoComplete="off" data-lpignore="true" /></td>
                  <td className="border-r border-t border-slate-300 p-1"><input className={`${inputClass} text-center`} value={form.fecha_ensayo} onChange={(e) => setField('fecha_ensayo', e.target.value)} onBlur={() => setField('fecha_ensayo', normalizeDate(form.fecha_ensayo))} autoComplete="off" data-lpignore="true" placeholder="YYYY/MM/DD" /></td>
                  <td className="border-t border-slate-300 p-1"><input className={`${inputClass} text-center`} value={form.realizado_por} onChange={(e) => setField('realizado_por', e.target.value)} autoComplete="off" data-lpignore="true" /></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="border-b border-slate-300 bg-slate-100 px-4 py-3 text-center">
            <p className="text-2xl font-semibold leading-tight text-slate-900">Standard Test Method for Laboratory Determination of Water (Moisture) Content of Soil and Rock by Mass</p>
            <p className="text-2xl font-semibold text-slate-900">ASTM D2216-19</p>
          </div>

          <div className="space-y-3 p-3">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_340px]">
              <div className="overflow-hidden rounded-lg border border-slate-300">
                <table className="w-full table-fixed text-sm">
                <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                  <tr>
                    <th className="w-10 border-b border-r border-slate-300 py-1">#</th>
                    <th className="border-b border-r border-slate-300 px-2 py-1 text-left">DESCRIPCION</th>
                    <th className="w-20 border-b border-r border-slate-300 py-1">UND</th>
                    <th className="w-56 border-b border-slate-300 py-1">ENSAYO</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="border-t border-r border-slate-300 px-2 py-1 text-center">1</td><td className="border-t border-r border-slate-300 px-2 py-1">N° de ensayo</td><td className="border-t border-r border-slate-300 px-2 py-1 text-center">N°</td><td className="border-t border-slate-300 p-1"><input type="number" step="1" className={inputClass} value={computed.numero_ensayo ?? ''} onChange={(e) => setField('numero_ensayo', parseNum(e.target.value))} /></td></tr>
                  <tr><td className="border-t border-r border-slate-300 px-2 py-1 text-center">2</td><td className="border-t border-r border-slate-300 px-2 py-1">Recipiente N°</td><td className="border-t border-r border-slate-300 px-2 py-1 text-center">N°</td><td className="border-t border-slate-300 p-1"><input className={inputClass} value={form.recipiente_numero ?? ''} onChange={(e) => setField('recipiente_numero', e.target.value)} autoComplete="off" data-lpignore="true" /></td></tr>
                  <tr><td className="border-t border-r border-slate-300 px-2 py-1 text-center">3</td><td className="border-t border-r border-slate-300 px-2 py-1">Masa de recipiente + muestra humedo</td><td className="border-t border-r border-slate-300 px-2 py-1 text-center">g</td><td className="border-t border-slate-300 p-1"><input type="number" step="any" className={inputClass} value={computed.masa_recipiente_muestra_humedo_g ?? ''} onChange={(e) => setField('masa_recipiente_muestra_humedo_g', parseNum(e.target.value))} /></td></tr>
                  <tr><td className="border-t border-r border-slate-300 px-2 py-1 text-center">4</td><td className="border-t border-r border-slate-300 px-2 py-1">Masa de recipiente + muestra seco</td><td className="border-t border-r border-slate-300 px-2 py-1 text-center">g</td><td className="border-t border-slate-300 p-1"><input type="number" step="any" className={inputClass} value={computed.masa_recipiente_muestra_seco_g ?? ''} onChange={(e) => setField('masa_recipiente_muestra_seco_g', parseNum(e.target.value))} /></td></tr>
                  <tr><td className="border-t border-r border-slate-300 px-2 py-1 text-center">5</td><td className="border-t border-r border-slate-300 px-2 py-1">Masa de recipiente + muestra seco (constante)</td><td className="border-t border-r border-slate-300 px-2 py-1 text-center">g</td><td className="border-t border-slate-300 p-1"><input type="number" step="any" className={inputClass} value={computed.masa_recipiente_muestra_seco_constante_g ?? ''} onChange={(e) => setField('masa_recipiente_muestra_seco_constante_g', parseNum(e.target.value))} /></td></tr>
                  <tr><td className="border-t border-r border-slate-300 px-2 py-1 text-center">6</td><td className="border-t border-r border-slate-300 px-2 py-1">Masa de agua (3-4)</td><td className="border-t border-r border-slate-300 px-2 py-1 text-center">g</td><td className="border-t border-slate-300 p-1"><input type="number" step="any" readOnly className={roInputClass} value={computed.masa_agua_g ?? ''} /></td></tr>
                  <tr><td className="border-t border-r border-slate-300 px-2 py-1 text-center">7</td><td className="border-t border-r border-slate-300 px-2 py-1">Masa de recipiente</td><td className="border-t border-r border-slate-300 px-2 py-1 text-center">g</td><td className="border-t border-slate-300 p-1"><input type="number" step="any" className={inputClass} value={computed.masa_recipiente_g ?? ''} onChange={(e) => setField('masa_recipiente_g', parseNum(e.target.value))} /></td></tr>
                  <tr><td className="border-t border-r border-slate-300 px-2 py-1 text-center">8</td><td className="border-t border-r border-slate-300 px-2 py-1">Masa de muestra seco (5-7)</td><td className="border-t border-r border-slate-300 px-2 py-1 text-center">g</td><td className="border-t border-slate-300 p-1"><input type="number" step="any" readOnly className={roInputClass} value={computed.masa_muestra_seco_g ?? ''} /></td></tr>
                  <tr><td className="border-t border-r border-slate-300 px-2 py-1 text-center">9</td><td className="border-t border-r border-slate-300 px-2 py-1">Contenido de Humedad de la muestra (6/8*100)</td><td className="border-t border-r border-slate-300 px-2 py-1 text-center">%</td><td className="border-t border-slate-300 p-1"><input type="number" step="any" readOnly className={roInputClass} value={computed.contenido_humedad_pct ?? ''} /></td></tr>
                  <tr><td className="border-t border-r border-slate-300 px-2 py-1"></td><td colSpan={3} className="border-t border-r border-slate-300 px-2 py-1 text-xs text-slate-600">Fuente: Elaboracion propia basada en la Norma ASTM D2216-19. * Reporte al 0.1%.</td></tr>
                </tbody>
                </table>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-300 bg-white p-2">
                <img
                  src="/cont-humedad-masa-minima.png"
                  alt="Tabla de masa minima ASTM D2216-19"
                  className="w-full h-auto"
                  loading="lazy"
                />
                <div className="border-t border-slate-300 px-2 py-1 text-[10px] text-slate-600">Fuente: Elaboracion propia basada en la Norma ASTM D2216-19.</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_340px]">
              <div className="overflow-hidden rounded-lg border border-slate-300">
                <div className="border-b border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                  Descripción de la muestra
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    <tr><td className="w-[58%] border-b border-r border-slate-300 px-2 py-2">Tipo de muestra:</td><td className="border-b border-slate-300 p-1"><input className={inputClass} value={form.tipo_muestra ?? ''} onChange={(e) => setField('tipo_muestra', e.target.value)} autoComplete="off" data-lpignore="true" /></td></tr>
                    <tr><td className="border-b border-r border-slate-300 px-2 py-2">Condición de la muestra:</td><td className="border-b border-slate-300 p-1"><input className={inputClass} value={form.condicion_muestra ?? ''} onChange={(e) => setField('condicion_muestra', e.target.value)} autoComplete="off" data-lpignore="true" /></td></tr>
                    <tr><td className="border-b border-r border-slate-300 px-2 py-2">Tamaño máximo de la partícula (visual) (in):</td><td className="border-b border-slate-300 p-1"><input className={inputClass} value={form.tamano_maximo_muestra_visual_in ?? ''} onChange={(e) => setField('tamano_maximo_muestra_visual_in', e.target.value)} autoComplete="off" data-lpignore="true" /></td></tr>
                    <tr><td className="border-r border-slate-300 px-2 py-2">Forma de la partícula:</td><td className="p-1"><input className={inputClass} value={form.forma_particula ?? ''} onChange={(e) => setField('forma_particula', e.target.value)} autoComplete="off" data-lpignore="true" placeholder="Ej: Angular 12" /></td></tr>
                  </tbody>
                </table>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-300">
                <div className="border-b border-slate-300 bg-slate-50 px-4 py-3 text-center text-sm font-semibold text-slate-900">
                  MÉTODO PRUEBA
                </div>
                <div className="p-3">
                  <label className="mb-2 block text-sm text-center font-medium text-slate-700">MÉTODO &quot;A&quot; o &quot;B&quot;</label>
                  <select
                    className={inputClass}
                    value={form.metodo_prueba ?? '-'}
                    onChange={(e) => setField('metodo_prueba', e.target.value as ContHumedadPayload['metodo_prueba'])}
                    autoComplete="off"
                    data-lpignore="true"
                  >
                    {(['-', 'A', 'B'] as const).map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-300">
              <div className="border-b border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                Condiciones del ensayo
              </div>
              <div className="p-4">
                <table className="w-full text-sm">
                  <tbody>
                    <tr>
                      <td className="w-[80%] border-b border-r border-slate-300 px-2 py-3 align-top">- La muestra de ensayo tiene una masa menor que la mínima requerida por la norma. (Si/No)</td>
                      <td className="border-b border-slate-300 p-1 align-middle">
                        <select className={inputClass} value={form.cumple_masa_minima_norma ?? '-'} onChange={(e) => setSelect('cumple_masa_minima_norma', e.target.value as SiNoSelect)} autoComplete="off" data-lpignore="true">
                          {(['-', 'SI', 'NO'] as const).map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                      </td>
                    </tr>
                    <tr>
                      <td className="border-b border-r border-slate-300 px-2 py-3 align-top">- La muestra de ensayo presenta mas de un tipo de material (capas, etc.). (Si/No)</td>
                      <td className="border-b border-slate-300 p-1 align-middle">
                        <select className={inputClass} value={form.se_excluyo_material ?? '-'} onChange={(e) => setSelect('se_excluyo_material', e.target.value as SiNoSelect)} autoComplete="off" data-lpignore="true">
                          {(['-', 'SI', 'NO'] as const).map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                      </td>
                    </tr>
                    <tr>
                      <td className="border-b border-r border-slate-300 px-2 py-3 align-top">- La temperatura de secado es diferente a 110 ± 5°C. (Si/No)</td>
                      <td className="border-b border-slate-300 p-1 align-middle">
                        <select className={inputClass} value={form.condicion_temperatura ?? '-'} onChange={(e) => setSelect('condicion_temperatura', e.target.value as SiNoSelect)} autoComplete="off" data-lpignore="true">
                          {(['-', 'SI', 'NO'] as const).map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                      </td>
                    </tr>
                    <tr>
                      <td className="border-r border-slate-300 px-2 py-3 align-top">- Se excluyo algun material (tamano y cantidad) de la muestra de prueba. (Si/No)</td>
                      <td className="border-slate-300 p-1 align-middle">
                        <select className={inputClass} value={form.se_excluyo_material ?? '-'} onChange={(e) => setSelect('se_excluyo_material', e.target.value as SiNoSelect)} autoComplete="off" data-lpignore="true">
                          {(['-', 'SI', 'NO'] as const).map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                      </td>
                    </tr>
                    <tr>
                      <td className="border-r border-slate-300 px-2 py-3">Descripción material excluido</td>
                      <td className="p-1"><input className={inputClass} value={form.descripcion_material_excluido ?? ''} onChange={(e) => setField('descripcion_material_excluido', e.target.value)} autoComplete="off" data-lpignore="true" placeholder="Ej: Se excluyó grava > 3 in, aprox. 450 g" /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-300">
              <div className="border-b border-slate-300 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">Observaciones</div>
              <div className="p-2"><textarea className="w-full resize-none rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500/35" rows={3} value={form.observaciones ?? ''} onChange={(e) => setField('observaciones', e.target.value)} autoComplete="off" data-lpignore="true" /></div>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[280px_280px] xl:justify-end">
              <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-50">
                <div className="border-b border-slate-300 px-2 py-1 text-sm font-semibold">Revisado</div>
                <div className="space-y-2 p-2">
                  <select className={inputClass} value={form.revisado_por ?? '-'} onChange={(e) => setField('revisado_por', e.target.value)}>
                    {REVISORES.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <input className={inputClass} value={form.revisado_fecha ?? ''} onChange={(e) => setField('revisado_fecha', e.target.value)} onBlur={() => setField('revisado_fecha', normalizeDate(form.revisado_fecha ?? ''))} autoComplete="off" data-lpignore="true" placeholder="Fecha" />
                </div>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-50">
                <div className="border-b border-slate-300 px-2 py-1 text-sm font-semibold">Aprobado</div>
                <div className="space-y-2 p-2">
                  <select className={inputClass} value={form.aprobado_por ?? '-'} onChange={(e) => setField('aprobado_por', e.target.value)}>
                    {APROBADORES.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <input className={inputClass} value={form.aprobado_fecha ?? ''} onChange={(e) => setField('aprobado_fecha', e.target.value)} onBlur={() => setField('aprobado_fecha', normalizeDate(form.aprobado_fecha ?? ''))} autoComplete="off" data-lpignore="true" placeholder="Fecha" />
                </div>
              </div>
            </div>

            <div className="border-t-2 border-blue-900 px-3 py-2 text-center text-[11px] leading-tight text-slate-700">
              <p>WEB: www.geofal.com.pe E-MAIL: laboratorio@geofal.com.pe / geofal.sac@gmail.com</p>
              <p>Av. Maranon 763, Los Olivos-Lima / Telefono 01 522-1851</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <button onClick={clearAll} disabled={loading} className="flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"><Trash2 className="h-4 w-4" />Limpiar todo</button>
          <button onClick={() => setPendingFormatAction(false)} disabled={loading} className="h-11 rounded-lg border border-slate-900 bg-white font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar'}</button>
          <button onClick={() => setPendingFormatAction(true)} disabled={loading} className="flex h-11 items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Procesando...</> : <><Download className="h-4 w-4" />Guardar y Descargar</>}
          </button>
        </div>
      </div>
        <FormatConfirmModal
            open={pendingFormatAction !== null}
            formatLabel={buildFormatPreview(form.muestra, 'SU', 'HUM. SUELO')}
            actionLabel={pendingFormatAction ? 'Guardar y Descargar' : 'Guardar'}
            onClose={() => setPendingFormatAction(null)}
            onConfirm={() => {
                if (pendingFormatAction === null) return
                const shouldDownload = pendingFormatAction
                setPendingFormatAction(null)
                void save(shouldDownload)
            }}
        />

    </div>
  )
}
