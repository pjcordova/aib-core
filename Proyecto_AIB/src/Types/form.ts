export type PasoTipo =
  | "opciones"
  | "multiseleccion"
  | "rango"
  | "texto"
  | "accion";

export interface PasoBase {
  id: string;
  tipo: PasoTipo;
  pregunta?: string;
  opciones?: string[];
  valores?: string[];
  minSeleccion?: number;
  placeholder?: string;
  accion?: string;
  siguiente?: string | Record<string, string>;
}

export interface FormularioGusano {
  [clave: string]: PasoBase;
}

export interface Respuestas {
  [pasoId: string]: string | string[];
}

export interface PaqueteProyecto {
  resumen: {
    solucion: string;
    objetivo: string;
    presupuesto: string;
    tiempo: string;
  };
  funciones: string[];
  experiencia: string[];
  tecnologiaPreferida: string;
  sostenibilidad: {
    habilitada: boolean;
    metricas: string[];
  };
  feedback?: string;
  artefactos: {
    mockupUrl?: string;
    diagramaUrl?: string;
    descripcion?: string;
  };
}
