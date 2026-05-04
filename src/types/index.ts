export type SiNo = "-" | "SI" | "NO"
export type MetodoPrueba = "-" | "A" | "B"

export interface HumedadCompleteDemoPayload {
  cliente: string
  direccion: string
  proyecto: string
  ubicacion: string
  recepcion_n: string
  f_emision: string
  ot_n: string
  codigo_muestra: string
  fecha_recepcion: string
  fecha_ejecucion: string
  cantera_sondaje: string
  n_muestra: string
  tipo_muestra: string
  realizado_por: string
  condicion_masa_menor: SiNo
  condicion_capas: SiNo
  condicion_temperatura: SiNo
  condicion_excluido: SiNo
  descripcion_material_excluido?: string
  condicion_muestra?: string
  tamano_maximo_particula?: string
  forma_particula?: string
  metodo_prueba: MetodoPrueba
  metodo_a: boolean
  metodo_b: boolean
  numero_ensayo?: number
  recipiente_numero?: string
  masa_recipiente_muestra_humeda?: number
  masa_recipiente_muestra_seca?: number
  masa_recipiente_muestra_seca_constante?: number
  masa_recipiente?: number
  masa_agua?: number
  masa_muestra_seca?: number
  contenido_humedad?: number
  equipo_balanza_01?: string
  equipo_balanza_001?: string
  equipo_horno?: string
  observaciones?: string
  revisado_por?: string
  revisado_fecha?: string
  aprobado_por?: string
  aprobado_fecha?: string
}

export interface HumedadCompleteDemoSummary {
  id: number
  numero_ensayo: string
  ot_n: string
  cliente?: string | null
  codigo_muestra?: string | null
  fecha_documento?: string | null
  estado: string
  contenido_humedad?: number | null
  bucket?: string | null
  object_key?: string | null
  fecha_creacion?: string | null
  fecha_actualizacion?: string | null
}

export interface HumedadCompleteDemoDetail extends HumedadCompleteDemoSummary {
  payload?: HumedadCompleteDemoPayload | null
}

export interface HumedadCompleteDemoSaveResponse {
  id: number
  numero_ensayo: string
  ot_n: string
  codigo_muestra?: string | null
  estado: string
  contenido_humedad?: number | null
  bucket?: string | null
  object_key?: string | null
  fecha_creacion?: string | null
  fecha_actualizacion?: string | null
}
