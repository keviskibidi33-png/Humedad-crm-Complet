
import { useState, useMemo, useCallback, useEffect } from 'react'
import toast from 'react-hot-toast'
import { ChevronDown, Download, Loader2, FlaskConical, Gauge } from 'lucide-react'
import {
    getCBREnsayoDetail,
    saveAndDownloadCBRExcel,
    saveCBREnsayo,
} from '@/services/api'
import type {
    CBRPayload,
    CBREnsayoDetail,
    CBRLecturaPenetracionRow,
    CBRHinchamientoRow,
} from '@/types'
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


const getCurrentYearShort = () => new Date().getFullYear().toString().slice(-2)
const formatTodayShortDate = () => {
    const [yyyy = '', mm = '', dd = ''] = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Lima' }).split('-')
    return `${dd}/${mm}/${yyyy.slice(-2)}`
}

const normalizeMuestraCode = (raw: string): string => {
    const value = raw.trim().toUpperCase()
    if (!value) return ''

    const compact = value.replace(/\s+/g, '')
    const year = getCurrentYearShort()
    const match = compact.match(/^(\d+)(?:-SU)?(?:-(\d{2}))?$/)
    if (match) {
        return `${match[1]}-SU-${match[2] || year}`
    }
    return value
}

const normalizeNumeroOtCode = (raw: string): string => {
    const value = raw.trim().toUpperCase()
    if (!value) return ''

    const compact = value.replace(/\s+/g, '')
    const year = getCurrentYearShort()
    const patterns = [
        /^(?:N?OT-)?(\d+)(?:-(\d{2}))?$/,
        /^(\d+)(?:-(?:N?OT))?(?:-(\d{2}))?$/,
    ]

    for (const pattern of patterns) {
        const match = compact.match(pattern)
        if (match) {
            return `${match[1]}-${match[2] || year}`
        }
    }

    return value
}

const normalizeFlexibleDate = (raw: string): string => {
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

const normalizeTime = (raw: string): string => {
    const value = raw.trim()
    if (!value) return ''

    const digits = value.replace(/\D/g, '')
    const pad2 = (part: string) => part.padStart(2, '0').slice(-2)

    if (value.includes(':')) {
        const [h = '', m = '', s = ''] = value.split(':').map(part => part.trim())
        return `${pad2(h || '0')}:${pad2(m || '0')}:${pad2(s || '0')}`
    }

    if (digits.length <= 2) return `${pad2(digits)}:00:00`
    if (digits.length <= 4) return `${pad2(digits.slice(0, 2))}:${pad2(digits.slice(2, 4))}:00`
    return `${pad2(digits.slice(0, 2))}:${pad2(digits.slice(2, 4))}:${pad2(digits.slice(4, 6))}`
}

const PENETRACION_BASE = [
    { tiempo: '0:00', pulg: 0.0, mm: 0.0 },
    { tiempo: '0:30', pulg: 0.025, mm: 0.64 },
    { tiempo: '1:00', pulg: 0.05, mm: 1.3 },
    { tiempo: '1:30', pulg: 0.075, mm: 1.9 },
    { tiempo: '2:00', pulg: 0.1, mm: 2.5 },
    { tiempo: '2:30', pulg: 0.125, mm: 3.18 },
    { tiempo: '3:00', pulg: 0.15, mm: 3.8 },
    { tiempo: '3:30', pulg: 0.175, mm: 4.45 },
    { tiempo: '4:00', pulg: 0.2, mm: 5.1 },
    { tiempo: '6:00', pulg: 0.3, mm: 7.6 },
    { tiempo: '8:00', pulg: 0.4, mm: 10.0 },
    { tiempo: '10:00', pulg: 0.5, mm: 13.0 },
]

const SIX_COLUMN_LABELS = ['Esp.01 SS', 'Esp.01 SAT', 'Esp.02 SS', 'Esp.02 SAT', 'Esp.03 SS', 'Esp.03 SAT']
const THREE_SPECIMEN_LABELS = ['Especimen 01', 'Especimen 02', 'Especimen 03']

const EMPTY_SIX_NUMBERS = () => Array.from({ length: 6 }, () => null as number | null)
const EMPTY_SIX_STRINGS = () => Array.from({ length: 6 }, () => null as string | null)
const EMPTY_THREE_NUMBERS = () => [56, 25, 10].map(v => v as number | null)
const EMPTY_THREE_STRINGS = () => ['INS-000', 'INS-000', 'INS-000'].map(v => v as string | null)
const EMPTY_PENETRACION_ROWS = () => Array.from({ length: 12 }, (): CBRLecturaPenetracionRow => ({
    tension_standard: undefined,
    lectura_dial_esp_01: undefined,
    lectura_dial_esp_02: undefined,
    lectura_dial_esp_03: undefined,
}))
const EMPTY_HINCHAMIENTO_ROWS = () => Array.from({ length: 6 }, (): CBRHinchamientoRow => ({
    fecha: '',
    hora: '',
    esp_01: undefined,
    esp_02: undefined,
    esp_03: undefined,
}))

const buildInitialState = (): CBRPayload => ({
    muestra: '',
    numero_ot: '',
    fecha_ensayo: '',
    realizado_por: '',

    sobretamano_porcentaje: undefined,
    masa_grava_adicionada_g: undefined,
    condicion_muestra_saturado: '-',
    condicion_muestra_sin_saturar: '-',
    maxima_densidad_seca: undefined,
    optimo_contenido_humedad: undefined,
    temperatura_inicial_c: undefined,
    temperatura_final_c: undefined,
    tamano_maximo_visual_in: '',
    descripcion_muestra_astm: '',

    golpes_por_especimen: EMPTY_THREE_NUMBERS(),
    codigo_molde_por_especimen: EMPTY_THREE_STRINGS(),
    temperatura_inicio_c_por_columna: EMPTY_SIX_NUMBERS(),
    temperatura_final_c_por_columna: EMPTY_SIX_NUMBERS(),
    masa_molde_suelo_g_por_columna: EMPTY_SIX_NUMBERS(),
    codigo_tara_por_columna: EMPTY_SIX_STRINGS(),
    masa_tara_g_por_columna: EMPTY_SIX_NUMBERS(),
    masa_suelo_humedo_tara_g_por_columna: EMPTY_SIX_NUMBERS(),
    masa_suelo_seco_tara_g_por_columna: EMPTY_SIX_NUMBERS(),
    masa_suelo_seco_tara_constante_g_por_columna: EMPTY_SIX_NUMBERS(),

    lecturas_penetracion: EMPTY_PENETRACION_ROWS(),
    hinchamiento: EMPTY_HINCHAMIENTO_ROWS(),
    profundidad_hendidura_mm: undefined,

    equipo_cbr: '-',
    equipo_dial_deformacion: '-',
    equipo_dial_expansion: '-',
    equipo_horno_110: '-',
    equipo_pison: '-',
    equipo_balanza_1g: '-',
    equipo_balanza_01g: '-',

    observaciones: '',
    revisado_por: '-',
    revisado_fecha: formatTodayShortDate(),
    aprobado_por: '-',
    aprobado_fecha: formatTodayShortDate(),
})

type NumericArrayKey =
    | 'golpes_por_especimen'
    | 'temperatura_inicio_c_por_columna'
    | 'temperatura_final_c_por_columna'
    | 'masa_molde_suelo_g_por_columna'
    | 'masa_tara_g_por_columna'
    | 'masa_suelo_humedo_tara_g_por_columna'
    | 'masa_suelo_seco_tara_g_por_columna'
    | 'masa_suelo_seco_tara_constante_g_por_columna'

type StringArrayKey = 'codigo_molde_por_especimen' | 'codigo_tara_por_columna'
type DateFieldKey = 'fecha_ensayo' | 'revisado_fecha' | 'aprobado_fecha'
type PenetracionKey = keyof CBRLecturaPenetracionRow
type HinchamientoKey = keyof CBRHinchamientoRow
type EquipoKey =
    | 'equipo_cbr'
    | 'equipo_dial_deformacion'
    | 'equipo_dial_expansion'
    | 'equipo_horno_110'
    | 'equipo_pison'
    | 'equipo_balanza_1g'
    | 'equipo_balanza_01g'

const EQUIPO_OPTIONS: Record<EquipoKey, string[]> = {
    equipo_cbr: ['-', 'EQP-0026'],
    equipo_dial_deformacion: ['-', 'EQP-0080'],
    equipo_dial_expansion: ['-', 'EQP-0109'],
    equipo_horno_110: ['-', 'EQP-0150'],
    equipo_pison: ['-', 'INS-0196'],
    equipo_balanza_1g: ['-', 'EQP-0054'],
    equipo_balanza_01g: ['-', 'EQP-0046'],
}
const REVISADO_POR_OPTIONS = ['-', 'FABIAN LA ROSA']
const APROBADO_POR_OPTIONS = ['-', 'IRMA COAQUIRA']
const CBR_DRAFT_STORAGE_PREFIX = 'cbr_form_draft_v1'
const DRAFT_DEBOUNCE_MS = 700

const getDraftStorageKey = (ensayoId: number | null): string => {
    return `${CBR_DRAFT_STORAGE_PREFIX}:${ensayoId ?? 'new'}`
}

const toFiniteNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
}

const normalizeNullableNumberArray = (
    values: Array<number | null> | undefined,
    length: number,
): Array<number | null> => {
    return Array.from({ length }, (_, idx) => {
        const normalized = toFiniteNumber(values?.[idx])
        return normalized ?? null
    })
}

const normalizeNullableStringArray = (
    values: Array<string | null> | undefined,
    length: number,
    fallback: string | null = null,
): Array<string | null> => {
    return Array.from({ length }, (_, idx) => {
        const raw = values?.[idx]
        if (typeof raw !== 'string') return fallback
        const normalized = raw.trim()
        return normalized === '' ? fallback : normalized
    })
}

const normalizePenetracionRows = (rows: CBRLecturaPenetracionRow[] | undefined): CBRLecturaPenetracionRow[] => {
    return Array.from({ length: 12 }, (_, idx): CBRLecturaPenetracionRow => {
        const source = rows?.[idx]
        return {
            tension_standard: toFiniteNumber(source?.tension_standard),
            lectura_dial_esp_01: toFiniteNumber(source?.lectura_dial_esp_01),
            lectura_dial_esp_02: toFiniteNumber(source?.lectura_dial_esp_02),
            lectura_dial_esp_03: toFiniteNumber(source?.lectura_dial_esp_03),
        }
    })
}

const normalizeHinchamientoRows = (rows: CBRHinchamientoRow[] | undefined): CBRHinchamientoRow[] => {
    return Array.from({ length: 6 }, (_, idx): CBRHinchamientoRow => {
        const source = rows?.[idx]
        return {
            fecha: typeof source?.fecha === 'string' ? source.fecha : '',
            hora: typeof source?.hora === 'string' ? source.hora : '',
            esp_01: toFiniteNumber(source?.esp_01),
            esp_02: toFiniteNumber(source?.esp_02),
            esp_03: toFiniteNumber(source?.esp_03),
        }
    })
}

const hydrateCBRFormSnapshot = (payload?: Partial<CBRPayload> | null): CBRPayload => {
    const merged: CBRPayload = { ...buildInitialState(), ...(payload ?? {}) }
    merged.golpes_por_especimen = normalizeNullableNumberArray(merged.golpes_por_especimen, 3)
    merged.codigo_molde_por_especimen = normalizeNullableStringArray(merged.codigo_molde_por_especimen, 3, 'INS-000')
    merged.temperatura_inicio_c_por_columna = normalizeNullableNumberArray(merged.temperatura_inicio_c_por_columna, 6)
    merged.temperatura_final_c_por_columna = normalizeNullableNumberArray(merged.temperatura_final_c_por_columna, 6)
    merged.masa_molde_suelo_g_por_columna = normalizeNullableNumberArray(merged.masa_molde_suelo_g_por_columna, 6)
    merged.codigo_tara_por_columna = normalizeNullableStringArray(merged.codigo_tara_por_columna, 6)
    merged.masa_tara_g_por_columna = normalizeNullableNumberArray(merged.masa_tara_g_por_columna, 6)
    merged.masa_suelo_humedo_tara_g_por_columna = normalizeNullableNumberArray(merged.masa_suelo_humedo_tara_g_por_columna, 6)
    merged.masa_suelo_seco_tara_g_por_columna = normalizeNullableNumberArray(merged.masa_suelo_seco_tara_g_por_columna, 6)
    merged.masa_suelo_seco_tara_constante_g_por_columna = normalizeNullableNumberArray(merged.masa_suelo_seco_tara_constante_g_por_columna, 6)
    merged.lecturas_penetracion = normalizePenetracionRows(merged.lecturas_penetracion)
    merged.hinchamiento = normalizeHinchamientoRows(merged.hinchamiento)
    return merged
}

const getEnsayoIdFromQuery = (): number | null => {
    const raw = new URLSearchParams(window.location.search).get('ensayo_id')
    if (!raw) return null
    const parsed = Number(raw)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function CBRForm() {
    const [form, setForm] = useState<CBRPayload>(() => buildInitialState())
    const [loading, setLoading] = useState(false)
    const [editingEnsayoId, setEditingEnsayoId] = useState<number | null>(() => getEnsayoIdFromQuery())
    const [loadingEnsayo, setLoadingEnsayo] = useState(false)
    const draftStorageKey = useMemo(() => getDraftStorageKey(editingEnsayoId), [editingEnsayoId])

    const set = useCallback(<K extends keyof CBRPayload>(key: K, value: CBRPayload[K]) => {
        setForm(prev => ({ ...prev, [key]: value }))
    }, [])

    const setNum = useCallback((key: keyof CBRPayload, raw: string) => {
        const val = raw === '' ? undefined : parseFloat(raw)
        setForm(prev => ({ ...prev, [key]: val }))
    }, [])

    const setArrayNum = useCallback((key: NumericArrayKey, index: number, raw: string) => {
        const val = raw === '' ? null : parseFloat(raw)
        setForm(prev => {
            const next = [...prev[key]]
            next[index] = Number.isFinite(val as number) ? (val as number) : null
            return { ...prev, [key]: next }
        })
    }, [])

    const setArrayText = useCallback((key: StringArrayKey, index: number, raw: string) => {
        const val = raw.trim() === '' ? null : raw
        setForm(prev => {
            const next = [...prev[key]]
            next[index] = val
            return { ...prev, [key]: next }
        })
    }, [])

    const setPenetracion = useCallback((index: number, field: PenetracionKey, raw: string) => {
        const numericVal = raw === '' ? undefined : parseFloat(raw)
        setForm(prev => {
            const nextRows = [...prev.lecturas_penetracion]
            const row = { ...nextRows[index] }
            row[field] = Number.isFinite(numericVal as number) ? (numericVal as number) : undefined
            nextRows[index] = row
            return { ...prev, lecturas_penetracion: nextRows }
        })
    }, [])

    const setHinchamiento = useCallback((index: number, field: HinchamientoKey, raw: string) => {
        setForm(prev => {
            const nextRows = [...prev.hinchamiento]
            const row = { ...nextRows[index] }

            if (field === 'fecha' || field === 'hora') {
                row[field] = raw
            } else {
                const numericVal = raw === '' ? undefined : parseFloat(raw)
                row[field] = Number.isFinite(numericVal as number) ? (numericVal as number) : undefined
            }

            nextRows[index] = row
            return { ...prev, hinchamiento: nextRows }
        })
    }, [])

    const applyFormattedField = useCallback((key: DateFieldKey, formatter: (raw: string) => string) => {
        setForm(prev => {
            const current = String(prev[key] ?? '')
            const formatted = formatter(current)
            if (formatted === current) return prev
            return { ...prev, [key]: formatted }
        })
    }, [])

    const masaSueloHumedoPorColumna = useMemo(() => {
        return form.masa_suelo_humedo_tara_g_por_columna.map((humedoTara, idx) => {
            const tara = form.masa_tara_g_por_columna[idx]
            if (humedoTara == null || tara == null) return null
            return Math.round((humedoTara - tara) * 100) / 100
        })
    }, [form.masa_suelo_humedo_tara_g_por_columna, form.masa_tara_g_por_columna])

    useEffect(() => {
        if (!editingEnsayoId) return

        let cancelled = false
        const loadForEdit = async () => {
            setLoadingEnsayo(true)
            try {
                const detail: CBREnsayoDetail = await getCBREnsayoDetail(editingEnsayoId)
                if (!detail.payload) {
                    toast.error('El ensayo seleccionado no tiene payload guardado para edicion.')
                    return
                }
                if (!cancelled) {
                    setForm(hydrateCBRFormSnapshot(detail.payload))
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Error desconocido'
                toast.error(`No se pudo cargar ensayo para edicion: ${msg}`)
            } finally {
                if (!cancelled) {
                    setLoadingEnsayo(false)
                }
            }
        }

        void loadForEdit()
        return () => {
            cancelled = true
        }
    }, [editingEnsayoId])

    useEffect(() => {
        if (editingEnsayoId || loadingEnsayo) return

        const raw = localStorage.getItem(draftStorageKey)
        if (!raw) return

        try {
            const parsed = JSON.parse(raw) as Partial<CBRPayload>
            setForm(hydrateCBRFormSnapshot(parsed))
            toast.success('Se restauró un borrador local de CBR.', { duration: 2500 })
        } catch {
            localStorage.removeItem(draftStorageKey)
        }
    }, [draftStorageKey, editingEnsayoId, loadingEnsayo])

    useEffect(() => {
        if (editingEnsayoId || loadingEnsayo) return

        const timeoutId = window.setTimeout(() => {
            localStorage.setItem(draftStorageKey, JSON.stringify(form))
        }, DRAFT_DEBOUNCE_MS)

        return () => window.clearTimeout(timeoutId)
    }, [draftStorageKey, editingEnsayoId, form, loadingEnsayo])

    const downloadBlob = useCallback((blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
    }, [])

    const closeParentModalIfEmbedded = useCallback(() => {
        if (window.parent !== window) {
            window.parent.postMessage({ type: 'CLOSE_MODAL' }, '*')
        }
    }, [])
    const [pendingFormatAction, setPendingFormatAction] = useState<boolean | null>(null)


    const handleSave = useCallback(async (withDownload: boolean) => {
        if (!form.muestra || !form.numero_ot || !form.realizado_por) {
            toast.error('Complete los campos obligatorios: Codigo de muestra, N OT y Realizado por')
            return
        }

        setLoading(true)
        try {
            const payload: CBRPayload = { ...form }
            if (withDownload) {
                const { blob, filename } = await saveAndDownloadCBRExcel(payload, editingEnsayoId ?? undefined)
                downloadBlob(blob, filename || `${buildFormatPreview(form.muestra, 'SU', 'CBR')}.xlsx`)
                toast.success(editingEnsayoId ? 'Formato CBR actualizado y descargado.' : 'Formato CBR guardado y descargado.')
            } else {
                await saveCBREnsayo(payload, editingEnsayoId ?? undefined)
                toast.success(editingEnsayoId ? 'Formato CBR actualizado correctamente.' : 'Formato CBR guardado correctamente.')
            }

            localStorage.removeItem(draftStorageKey)
            setForm(buildInitialState())
            setEditingEnsayoId(null)
            closeParentModalIfEmbedded()
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error desconocido'
            toast.error(`Error guardando formato CBR: ${msg}`)
        } finally {
            setLoading(false)
        }
    }, [closeParentModalIfEmbedded, downloadBlob, draftStorageKey, editingEnsayoId, form])

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-primary/10">
                    <Gauge className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-foreground">
                        California Bearing Ratio (CBR) - ASTM D1883-21
                    </h1>
                    <p className="text-sm text-muted-foreground">Generador de informe de laboratorio</p>
                    {editingEnsayoId && (
                        <p className="text-xs text-primary font-medium mt-1">Editando ensayo #{editingEnsayoId}</p>
                    )}
                </div>
            </div>

            {loadingEnsayo && (
                <div className="mb-4 h-10 rounded-lg border border-border bg-muted/40 px-3 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando datos guardados para edicion...
                </div>
            )}

            <div className="space-y-5">
                <Section title="Encabezado" icon={<FlaskConical className="h-4 w-4" />}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Input
                            label="Codigo de muestra *"
                            value={form.muestra}
                            onChange={v => set('muestra', v)}
                            onBlur={() => set('muestra', normalizeMuestraCode(form.muestra))}
                            placeholder="XXX-SU-26"
                        />
                        <Input
                            label="N OT *"
                            value={form.numero_ot}
                            onChange={v => set('numero_ot', v)}
                            onBlur={() => set('numero_ot', normalizeNumeroOtCode(form.numero_ot))}
                            placeholder="XXX-26"
                        />
                        <Input
                            label="Fecha de ensayo"
                            value={form.fecha_ensayo}
                            onChange={v => set('fecha_ensayo', v)}
                            onBlur={() => applyFormattedField('fecha_ensayo', normalizeFlexibleDate)}
                            placeholder="YYYY/MM/DD"
                        />
                        <Input
                            label="Realizado por *"
                            value={form.realizado_por}
                            onChange={v => set('realizado_por', v)}
                        />
                    </div>
                </Section>

                <Section title="Condiciones del Ensayo CBR">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                        <div className="space-y-3">
                            <NumberInput
                                label="Sobretamano mayor a 3/4 in (%)"
                                value={form.sobretamano_porcentaje}
                                onChange={v => setNum('sobretamano_porcentaje', v)}
                            />
                            <NumberInput
                                label="Masa de grava entre 3/4 in - No.4 adicionada (g)"
                                value={form.masa_grava_adicionada_g}
                                onChange={v => setNum('masa_grava_adicionada_g', v)}
                            />
                            <SelectField
                                label="Condicion de la muestra - saturado"
                                value={form.condicion_muestra_saturado}
                                options={['-', 'SI', 'NO']}
                                onChange={v => set('condicion_muestra_saturado', v as '-' | 'SI' | 'NO')}
                            />
                            <SelectField
                                label="Condicion de la muestra - sin saturar"
                                value={form.condicion_muestra_sin_saturar}
                                options={['-', 'SI', 'NO']}
                                onChange={v => set('condicion_muestra_sin_saturar', v as '-' | 'SI' | 'NO')}
                            />
                        </div>

                        <div className="space-y-3">
                            <NumberInput
                                label="Maxima Densidad Seca (g/cm3)"
                                value={form.maxima_densidad_seca}
                                onChange={v => setNum('maxima_densidad_seca', v)}
                            />
                            <NumberInput
                                label="Optimo Contenido de Humedad (%)"
                                value={form.optimo_contenido_humedad}
                                onChange={v => setNum('optimo_contenido_humedad', v)}
                            />
                            <NumberInput
                                label="Temperatura Inicial (C)"
                                value={form.temperatura_inicial_c}
                                onChange={v => setNum('temperatura_inicial_c', v)}
                            />
                            <NumberInput
                                label="Temperatura Final (C)"
                                value={form.temperatura_final_c}
                                onChange={v => setNum('temperatura_final_c', v)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                        <Input
                            label="Tamano maximo visual (in)"
                            value={form.tamano_maximo_visual_in || ''}
                            onChange={v => set('tamano_maximo_visual_in', v)}
                        />
                        <Input
                            label="Descripcion de muestra ASTM D2488"
                            value={form.descripcion_muestra_astm || ''}
                            onChange={v => set('descripcion_muestra_astm', v)}
                        />
                    </div>
                </Section>

                <Section title="Ensayo y Determinacion de Humedad">
                    <div className="space-y-4">
                        <div className="overflow-x-auto rounded-md border border-border">
                            <table className="w-full min-w-[700px] text-sm">
                                <thead className="bg-muted/40">
                                    <tr>
                                        <th className="px-3 py-2 text-left border-b border-r border-border">Campo</th>
                                        {THREE_SPECIMEN_LABELS.map((label) => (
                                            <th key={label} className="px-2 py-2 text-center border-b border-border">
                                                {label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="px-3 py-2 border-r border-b border-border">N Golpes (56-25-10)</td>
                                        {form.golpes_por_especimen.map((value, idx) => (
                                            <td key={`golpes-${idx}`} className="px-2 py-2 border-b border-border">
                                                <TableNumInput value={value} onChange={v => setArrayNum('golpes_por_especimen', idx, v)} />
                                            </td>
                                        ))}
                                    </tr>
                                    <tr>
                                        <td className="px-3 py-2 border-r border-border">Codigo de Moldes</td>
                                        {form.codigo_molde_por_especimen.map((value, idx) => (
                                            <td key={`molde-${idx}`} className="px-2 py-2 border-border">
                                                <TableTextInput value={value || ''} onChange={v => setArrayText('codigo_molde_por_especimen', idx, v)} />
                                            </td>
                                        ))}
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="overflow-x-auto rounded-md border border-border">
                            <table className="w-full min-w-[1100px] text-sm">
                                <thead className="bg-muted/40">
                                    <tr>
                                        <th className="px-3 py-2 text-left border-b border-r border-border">Campo</th>
                                        {SIX_COLUMN_LABELS.map((label) => (
                                            <th key={label} className="px-2 py-2 text-center border-b border-border">{label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    <ArrayNumberRow
                                        label="Temperatura de inicio (C)"
                                        values={form.temperatura_inicio_c_por_columna}
                                        onChange={(idx, raw) => setArrayNum('temperatura_inicio_c_por_columna', idx, raw)}
                                    />
                                    <ArrayNumberRow
                                        label="Temperatura final (C)"
                                        values={form.temperatura_final_c_por_columna}
                                        onChange={(idx, raw) => setArrayNum('temperatura_final_c_por_columna', idx, raw)}
                                    />
                                    <ArrayNumberRow
                                        label="Masa de molde + suelo moldeado (g)"
                                        values={form.masa_molde_suelo_g_por_columna}
                                        onChange={(idx, raw) => setArrayNum('masa_molde_suelo_g_por_columna', idx, raw)}
                                    />
                                    <ArrayTextRow
                                        label="Codigo tara"
                                        values={form.codigo_tara_por_columna}
                                        onChange={(idx, raw) => setArrayText('codigo_tara_por_columna', idx, raw)}
                                    />
                                    <ArrayNumberRow
                                        label="Masa de tara (g)"
                                        values={form.masa_tara_g_por_columna}
                                        onChange={(idx, raw) => setArrayNum('masa_tara_g_por_columna', idx, raw)}
                                    />
                                    <ArrayNumberRow
                                        label="Masa de suelo humedo + tara (g)"
                                        values={form.masa_suelo_humedo_tara_g_por_columna}
                                        onChange={(idx, raw) => setArrayNum('masa_suelo_humedo_tara_g_por_columna', idx, raw)}
                                    />
                                    <tr>
                                        <td className="px-3 py-2 border-r border-b border-border font-medium">Masa de suelo humedo (g) (*) Formula fila 32</td>
                                        {masaSueloHumedoPorColumna.map((value, idx) => (
                                            <td key={`calc-32-${idx}`} className="px-2 py-2 border-b border-border">
                                                <TableComputedValue value={value} />
                                            </td>
                                        ))}
                                    </tr>
                                    <ArrayNumberRow
                                        label="Masa de suelo seco + tara (g)"
                                        values={form.masa_suelo_seco_tara_g_por_columna}
                                        onChange={(idx, raw) => setArrayNum('masa_suelo_seco_tara_g_por_columna', idx, raw)}
                                    />
                                    <ArrayNumberRow
                                        label="Masa de suelo seco + tara (g) constante"
                                        values={form.masa_suelo_seco_tara_constante_g_por_columna}
                                        onChange={(idx, raw) => setArrayNum('masa_suelo_seco_tara_constante_g_por_columna', idx, raw)}
                                    />
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Section>

                <Section title="Lectura de Penetracion">
                    <div className="overflow-x-auto rounded-md border border-border">
                        <table className="w-full min-w-[1100px] text-sm">
                            <thead className="bg-muted/40">
                                <tr>
                                    <th className="px-2 py-2 border-b border-r border-border text-center">Tiempo</th>
                                    <th className="px-2 py-2 border-b border-r border-border text-center">Penetracion (in)</th>
                                    <th className="px-2 py-2 border-b border-r border-border text-center">Penetracion (mm)</th>
                                    <th className="px-2 py-2 border-b border-r border-border text-center">Tension estandar</th>
                                    <th className="px-2 py-2 border-b border-r border-border text-center">Dial Esp 01</th>
                                    <th className="px-2 py-2 border-b border-r border-border text-center">Dial Esp 02</th>
                                    <th className="px-2 py-2 border-b border-border text-center">Dial Esp 03</th>
                                </tr>
                            </thead>
                            <tbody>
                                {PENETRACION_BASE.map((base, idx) => (
                                    <tr key={base.tiempo}>
                                        <td className="px-2 py-2 border-b border-r border-border text-center bg-muted/20">{base.tiempo}</td>
                                        <td className="px-2 py-2 border-b border-r border-border text-center bg-muted/20">{base.pulg.toFixed(3)}</td>
                                        <td className="px-2 py-2 border-b border-r border-border text-center bg-muted/20">{base.mm.toFixed(2)}</td>
                                        <td className="px-2 py-2 border-b border-r border-border">
                                            <TableNumInput value={form.lecturas_penetracion[idx]?.tension_standard} onChange={v => setPenetracion(idx, 'tension_standard', v)} />
                                        </td>
                                        <td className="px-2 py-2 border-b border-r border-border">
                                            <TableNumInput value={form.lecturas_penetracion[idx]?.lectura_dial_esp_01} onChange={v => setPenetracion(idx, 'lectura_dial_esp_01', v)} />
                                        </td>
                                        <td className="px-2 py-2 border-b border-r border-border">
                                            <TableNumInput value={form.lecturas_penetracion[idx]?.lectura_dial_esp_02} onChange={v => setPenetracion(idx, 'lectura_dial_esp_02', v)} />
                                        </td>
                                        <td className="px-2 py-2 border-b border-border">
                                            <TableNumInput value={form.lecturas_penetracion[idx]?.lectura_dial_esp_03} onChange={v => setPenetracion(idx, 'lectura_dial_esp_03', v)} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>

                <Section title="Hinchamiento y Equipos">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <div>
                            <div className="overflow-x-auto rounded-md border border-border">
                                <table className="w-full min-w-[650px] text-sm">
                                    <thead className="bg-muted/40">
                                        <tr>
                                            <th className="px-2 py-2 border-b border-r border-border text-center">Fecha</th>
                                            <th className="px-2 py-2 border-b border-r border-border text-center">Hora</th>
                                            <th className="px-2 py-2 border-b border-r border-border text-center">Esp 01</th>
                                            <th className="px-2 py-2 border-b border-r border-border text-center">Esp 02</th>
                                            <th className="px-2 py-2 border-b border-border text-center">Esp 03</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: 6 }, (_, idx) => (
                                            <tr key={`hinch-${idx}`}>
                                                <td className="px-2 py-2 border-b border-r border-border">
                                                    <TableTextInput
                                                        value={form.hinchamiento[idx]?.fecha || ''}
                                                        onChange={v => setHinchamiento(idx, 'fecha', v)}
                                                        onBlur={() => setHinchamiento(idx, 'fecha', normalizeFlexibleDate(form.hinchamiento[idx]?.fecha || ''))}
                                                        placeholder="YYYY/MM/DD"
                                                    />
                                                </td>
                                                <td className="px-2 py-2 border-b border-r border-border">
                                                    <TableTextInput
                                                        value={form.hinchamiento[idx]?.hora || ''}
                                                        onChange={v => setHinchamiento(idx, 'hora', v)}
                                                        onBlur={() => setHinchamiento(idx, 'hora', normalizeTime(form.hinchamiento[idx]?.hora || ''))}
                                                        placeholder="00:00:00"
                                                    />
                                                </td>
                                                <td className="px-2 py-2 border-b border-r border-border">
                                                    <TableNumInput value={form.hinchamiento[idx]?.esp_01} onChange={v => setHinchamiento(idx, 'esp_01', v)} />
                                                </td>
                                                <td className="px-2 py-2 border-b border-r border-border">
                                                    <TableNumInput value={form.hinchamiento[idx]?.esp_02} onChange={v => setHinchamiento(idx, 'esp_02', v)} />
                                                </td>
                                                <td className="px-2 py-2 border-b border-border">
                                                    <TableNumInput value={form.hinchamiento[idx]?.esp_03} onChange={v => setHinchamiento(idx, 'esp_03', v)} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-3">
                                <NumberInput
                                    label="Profundidad de la hendidura (mm)"
                                    value={form.profundidad_hendidura_mm}
                                    onChange={v => setNum('profundidad_hendidura_mm', v)}
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <EquipmentSelect
                                label="Equipo CBR"
                                value={form.equipo_cbr || '-'}
                                options={EQUIPO_OPTIONS.equipo_cbr}
                                onChange={v => set('equipo_cbr', v)}
                            />
                            <EquipmentSelect
                                label="Dial deformacion"
                                value={form.equipo_dial_deformacion || '-'}
                                options={EQUIPO_OPTIONS.equipo_dial_deformacion}
                                onChange={v => set('equipo_dial_deformacion', v)}
                            />
                            <EquipmentSelect
                                label="Dial expansion"
                                value={form.equipo_dial_expansion || '-'}
                                options={EQUIPO_OPTIONS.equipo_dial_expansion}
                                onChange={v => set('equipo_dial_expansion', v)}
                            />
                            <EquipmentSelect
                                label="Horno 110 C"
                                value={form.equipo_horno_110 || '-'}
                                options={EQUIPO_OPTIONS.equipo_horno_110}
                                onChange={v => set('equipo_horno_110', v)}
                            />
                            <EquipmentSelect
                                label="Pison"
                                value={form.equipo_pison || '-'}
                                options={EQUIPO_OPTIONS.equipo_pison}
                                onChange={v => set('equipo_pison', v)}
                            />
                            <EquipmentSelect
                                label="Balanza 1 g"
                                value={form.equipo_balanza_1g || '-'}
                                options={EQUIPO_OPTIONS.equipo_balanza_1g}
                                onChange={v => set('equipo_balanza_1g', v)}
                            />
                            <EquipmentSelect
                                label="Balanza 0.1 g"
                                value={form.equipo_balanza_01g || '-'}
                                options={EQUIPO_OPTIONS.equipo_balanza_01g}
                                onChange={v => set('equipo_balanza_01g', v)}
                            />
                        </div>
                    </div>
                </Section>

                <Section title="Observaciones">
                    <textarea
                        value={form.observaciones || ''}
                        onChange={e => set('observaciones', e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="Observaciones del ensayo..."
                    />
                </Section>

                <Section title="Revisado / Aprobado">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <SelectField
                            label="Revisado por"
                            value={form.revisado_por || '-'}
                            options={REVISADO_POR_OPTIONS}
                            onChange={v => {
                                set('revisado_por', v)
                                if (v !== '-') {
                                    set('revisado_fecha', formatTodayShortDate())
                                }
                            }}
                        />
                        <Input
                            label="Fecha revision"
                            value={form.revisado_fecha || ''}
                            onChange={v => set('revisado_fecha', v)}
                            onBlur={() => applyFormattedField('revisado_fecha', normalizeFlexibleDate)}
                            placeholder="YYYY/MM/DD"
                        />
                        <SelectField
                            label="Aprobado por"
                            value={form.aprobado_por || '-'}
                            options={APROBADO_POR_OPTIONS}
                            onChange={v => {
                                set('aprobado_por', v)
                                if (v !== '-') {
                                    set('aprobado_fecha', formatTodayShortDate())
                                }
                            }}
                        />
                        <Input
                            label="Fecha aprobacion"
                            value={form.aprobado_fecha || ''}
                            onChange={v => set('aprobado_fecha', v)}
                            onBlur={() => applyFormattedField('aprobado_fecha', normalizeFlexibleDate)}
                            placeholder="YYYY/MM/DD"
                        />
                    </div>
                </Section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                        onClick={() => setPendingFormatAction(false)}
                        disabled={loading}
                        className="h-11 rounded-lg bg-secondary text-secondary-foreground font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</>
                            : 'Guardar'
                        }
                    </button>
                    <button
                        onClick={() => setPendingFormatAction(true)}
                        disabled={loading}
                        className="h-11 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> Procesando...</>
                            : <><Download className="h-4 w-4" /> Guardar y Descargar</>
                        }
                    </button>
                </div>
            </div>
        <FormatConfirmModal
            open={pendingFormatAction !== null}
            formatLabel={buildFormatPreview(form.muestra, 'SU', 'CBR')}
            actionLabel={pendingFormatAction ? 'Guardar y Descargar' : 'Guardar'}
            onClose={() => setPendingFormatAction(null)}
            onConfirm={() => {
                if (pendingFormatAction === null) return
                const shouldDownload = pendingFormatAction
                setPendingFormatAction(null)
                void handleSave(shouldDownload)
            }}
        />
        </div>
    )
}

function Section({ title, icon, children }: {
    title: string
    icon?: React.ReactNode
    children: React.ReactNode
}) {
    return (
        <div className="bg-card border border-border rounded-lg shadow-sm">
            <div className="px-4 py-2.5 border-b border-border bg-muted/50 rounded-t-lg flex items-center gap-2">
                {icon}
                <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            </div>
            <div className="p-4">{children}</div>
        <FormatConfirmModal
            open={pendingFormatAction !== null}
            formatLabel={buildFormatPreview(form.muestra, 'SU', 'CBR')}
            actionLabel={pendingFormatAction ? 'Guardar y Descargar' : 'Guardar'}
            onClose={() => setPendingFormatAction(null)}
            onConfirm={() => {
                if (pendingFormatAction === null) return
                const shouldDownload = pendingFormatAction
                setPendingFormatAction(null)
                void handleSave(shouldDownload)
            }}
        />
        </div>
    )
}

function Input({ label, value, onChange, placeholder, onBlur }: {
    label: string
    value: string
    onChange: (v: string) => void
    placeholder?: string
    onBlur?: () => void
}) {
    return (
        <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                onBlur={onBlur}
                placeholder={placeholder}
                autoComplete="off"
                data-lpignore="true"
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
        <FormatConfirmModal
            open={pendingFormatAction !== null}
            formatLabel={buildFormatPreview(form.muestra, 'SU', 'CBR')}
            actionLabel={pendingFormatAction ? 'Guardar y Descargar' : 'Guardar'}
            onClose={() => setPendingFormatAction(null)}
            onConfirm={() => {
                if (pendingFormatAction === null) return
                const shouldDownload = pendingFormatAction
                setPendingFormatAction(null)
                void handleSave(shouldDownload)
            }}
        />
        </div>
    )
}

function NumberInput({ label, value, onChange }: {
    label: string
    value: number | undefined | null
    onChange: (raw: string) => void
}) {
    return (
        <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
            <input
                type="number"
                step="any"
                value={value ?? ''}
                onChange={e => onChange(e.target.value)}
                autoComplete="off"
                data-lpignore="true"
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
        <FormatConfirmModal
            open={pendingFormatAction !== null}
            formatLabel={buildFormatPreview(form.muestra, 'SU', 'CBR')}
            actionLabel={pendingFormatAction ? 'Guardar y Descargar' : 'Guardar'}
            onClose={() => setPendingFormatAction(null)}
            onConfirm={() => {
                if (pendingFormatAction === null) return
                const shouldDownload = pendingFormatAction
                setPendingFormatAction(null)
                void handleSave(shouldDownload)
            }}
        />
        </div>
    )
}

function SelectField({ label, value, onChange, options }: {
    label: string
    value: string
    onChange: (v: string) => void
    options: string[]
}) {
    return (
        <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
            <div className="relative">
                <select
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className="w-full h-9 pl-3 pr-8 rounded-md border border-input bg-background text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
                >
                    {options.map(option => (
                        <option key={option} value={option}>{option}</option>
                    ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
        <FormatConfirmModal
            open={pendingFormatAction !== null}
            formatLabel={buildFormatPreview(form.muestra, 'SU', 'CBR')}
            actionLabel={pendingFormatAction ? 'Guardar y Descargar' : 'Guardar'}
            onClose={() => setPendingFormatAction(null)}
            onConfirm={() => {
                if (pendingFormatAction === null) return
                const shouldDownload = pendingFormatAction
                setPendingFormatAction(null)
                void handleSave(shouldDownload)
            }}
        />
        </div>
    )
}

function EquipmentSelect({ label, value, onChange, options }: {
    label: string
    value: string
    onChange: (v: string) => void
    options: string[]
}) {
    return <SelectField label={label} value={value} onChange={onChange} options={options} />
}

function TableTextInput({ value, onChange, onBlur, placeholder }: {
    value: string
    onChange: (raw: string) => void
    onBlur?: () => void
    placeholder?: string
}) {
    return (
        <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder={placeholder}
            autoComplete="off"
            data-lpignore="true"
            className="w-full h-8 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
    )
}

function TableNumInput({ value, onChange }: {
    value: number | undefined | null
    onChange: (raw: string) => void
}) {
    return (
        <input
            type="number"
            step="any"
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            autoComplete="off"
            data-lpignore="true"
            className="w-full h-8 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
    )
}

function TableComputedValue({ value }: {
    value: number | null
}) {
    return (
        <div className="h-8 px-2 rounded-md border border-input bg-muted/30 text-sm flex items-center justify-center text-foreground font-medium">
            {value != null ? value : '-'}
        <FormatConfirmModal
            open={pendingFormatAction !== null}
            formatLabel={buildFormatPreview(form.muestra, 'SU', 'CBR')}
            actionLabel={pendingFormatAction ? 'Guardar y Descargar' : 'Guardar'}
            onClose={() => setPendingFormatAction(null)}
            onConfirm={() => {
                if (pendingFormatAction === null) return
                const shouldDownload = pendingFormatAction
                setPendingFormatAction(null)
                void handleSave(shouldDownload)
            }}
        />
        </div>
    )
}

function ArrayNumberRow({
    label,
    values,
    onChange,
}: {
    label: string
    values: Array<number | null>
    onChange: (idx: number, raw: string) => void
}) {
    return (
        <tr>
            <td className="px-3 py-2 border-r border-b border-border">{label}</td>
            {values.map((value, idx) => (
                <td key={`${label}-${idx}`} className="px-2 py-2 border-b border-border">
                    <TableNumInput value={value} onChange={raw => onChange(idx, raw)} />
                </td>
            ))}
        </tr>
    )
}

function ArrayTextRow({
    label,
    values,
    onChange,
}: {
    label: string
    values: Array<string | null>
    onChange: (idx: number, raw: string) => void
}) {
    return (
        <tr>
            <td className="px-3 py-2 border-r border-b border-border">{label}</td>
            {values.map((value, idx) => (
                <td key={`${label}-${idx}`} className="px-2 py-2 border-b border-border">
                    <TableTextInput value={value || ''} onChange={raw => onChange(idx, raw)} />
                </td>
            ))}
        </tr>
    )
}
