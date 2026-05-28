import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../styles/FormularioInicial.module.css';

type Escalabilidad = 'Bajo' | 'Medio' | 'Alto';
type TipoSistema = 'Web' | 'App' | 'Backend';
type Tematica = 'Restaurante' | 'Joyería' | 'Construcción' | 'Educación' | 'Salud' | 'Otro';
type NivelSostenibilidad = 'Bajo' | 'Medio' | 'Alto';

const FormularioInicial: React.FC = () => {
  const [tipoSistema, setTipoSistema] = useState<TipoSistema>('Web');
  const [escalabilidad, setEscalabilidad] = useState<Escalabilidad>('Medio');
  const [sostenible, setSostenible] = useState<boolean>(false);
  const [tiempoEntrega, setTiempoEntrega] = useState<number>(4);
  const [presupuesto, setPresupuesto] = useState<number>(3000);
  const [tematica, setTematica] = useState<Tematica>('Restaurante');
  const [nivelSostenibilidad, setNivelSostenibilidad] = useState<NivelSostenibilidad>('Medio');
  const [impactoAmbiental, setImpactoAmbiental] = useState<string[]>([]);

  const navigate = useNavigate();

  const handleCheckboxChange = (opcion: string) => {
    setImpactoAmbiental((prev) =>
      prev.includes(opcion) ? prev.filter((i) => i !== opcion) : [...prev, opcion]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const datos = {
      tipoSistema,
      objetivo: 'Ventas',
      escalabilidad,
      sostenible,
      tiempoEntrega,
      presupuesto,
      tematica,
      nivelSostenibilidad,
      impactoAmbiental,
    };
    navigate('/informe', { state: datos });
  };

  return (
    <div className={styles.contenedorCentral}>
      <div className={styles.cardFormulario}>
        <h2 className={styles.titulo}>Especificación inicial del proyecto</h2>

        <form onSubmit={handleSubmit}>
          {/* Tipo de sistema */}
          <div className={styles.seccion}>
            <label>Tipo de sistema:</label>
            <div className={styles.opciones}>
              {(['Web', 'App', 'Backend'] as TipoSistema[]).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  className={`${styles.pill} ${tipoSistema === tipo ? styles.activo : ''}`}
                  onClick={() => setTipoSistema(tipo)}
                >
                  {tipo}
                </button>
              ))}
            </div>
          </div>

          {/* Objetivo */}
          <div className={styles.seccion}>
            <label>Objetivo:</label>
            <p className={styles.objetivo}>Ventas (por defecto)</p>
          </div>

          {/* Escalabilidad */}
          <div className={styles.seccion}>
            <label>Nivel de escalabilidad:</label>
            <select
              className={styles.select}
              value={escalabilidad}
              onChange={(e) => setEscalabilidad(e.target.value as Escalabilidad)}
            >
              <option value="Bajo">Bajo</option>
              <option value="Medio">Medio</option>
              <option value="Alto">Alto</option>
            </select>
          </div>

          {/* Tiempo de entrega */}
          <div className={styles.seccion}>
            <label>Tiempo de entrega deseado (semanas):</label>
            <input
              type="number"
              min={1}
              value={tiempoEntrega}
              onChange={(e) => setTiempoEntrega(Number(e.target.value))}
              className={styles.input}
            />
          </div>

          {/* Presupuesto */}
          <div className={styles.seccion}>
            <label>Presupuesto disponible (USD):</label>
            <input
              type="number"
              min={500}
              step={500}
              value={presupuesto}
              onChange={(e) => setPresupuesto(Number(e.target.value))}
              className={styles.input}
            />
          </div>

          {/* Temática de la empresa */}
          <div className={styles.seccion}>
            <label>Temática de la empresa:</label>
            <select
              className={styles.select}
              value={tematica}
              onChange={(e) => setTematica(e.target.value as Tematica)}
            >
              <option value="Restaurante">Restaurante</option>
              <option value="Joyería">Joyería</option>
              <option value="Construcción">Construcción</option>
              <option value="Educación">Educación</option>
              <option value="Salud">Salud</option>
              <option value="Otro">Otro</option>
            </select>
          </div>

          {/* Nivel de sostenibilidad */}
          <div className={styles.seccion}>
            <label>Nivel de sostenibilidad esperado:</label>
            <select
              className={styles.select}
              value={nivelSostenibilidad}
              onChange={(e) => setNivelSostenibilidad(e.target.value as NivelSostenibilidad)}
            >
              <option value="Bajo">Bajo</option>
              <option value="Medio">Medio</option>
              <option value="Alto">Alto</option>
            </select>
          </div>

          {/* Impacto ambiental */}
          <div className={styles.seccion}>
            <label>Impacto ambiental esperado:</label>
            <div className={styles.opcionesVertical}>
              {['Reducir huella de carbono', 'Optimizar consumo energético', 'Uso de cloud verde'].map((opcion) => (
                <label key={opcion} className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={impactoAmbiental.includes(opcion)}
                    onChange={() => handleCheckboxChange(opcion)}
                  />
                  {opcion}
                </label>
              ))}
            </div>
          </div>

          {/* Recomendaciones sostenibles */}
          <div className={styles.seccion}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={sostenible}
                onChange={() => setSostenible(!sostenible)}
              />
              ¿Desea recomendaciones sostenibles?
            </label>
          </div>

          <button type="submit" className={styles.submit}>
            Generar bosquejo técnico
          </button>
        </form>
      </div>
    </div>
  );
};

export default FormularioInicial;
