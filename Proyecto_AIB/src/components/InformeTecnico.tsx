import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from '../styles/InformeTecnico.module.css';

interface DatosFormulario {
  tipoSistema: string;
  objetivo: string;
  escalabilidad: string;
  sostenible: boolean;
  tiempoEntrega: number;
  presupuesto: number;
  tematica: string;
  nivelSostenibilidad: string;
  impactoAmbiental: string[];
}

const InformeTecnico: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const datos = location.state as DatosFormulario;

  // Guardar informe en localStorage
  useEffect(() => {
    if (datos) {
      const nuevosInformes = JSON.parse(localStorage.getItem('informes') || '[]');
      nuevosInformes.push({ ...datos, fecha: new Date().toLocaleString() });
      localStorage.setItem('informes', JSON.stringify(nuevosInformes));
    }
  }, [datos]);

  if (!datos) {
    return (
      <div className={styles.contenedor}>
        <div className={styles.card}>
          <p>No se encontraron datos. Regresa al formulario.</p>
          <button className={styles.volver} onClick={() => navigate('/')}>
            Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.contenedor}>
      <div className={styles.card}>
        <h2 className={styles.titulo}>Informe técnico preliminar</h2>

        <ul className={styles.lista}>
          <li><strong>Tipo de sistema:</strong> {datos.tipoSistema}</li>
          <li><strong>Objetivo:</strong> {datos.objetivo}</li>
          <li><strong>Escalabilidad:</strong> {datos.escalabilidad}</li>
          <li><strong>Tiempo de entrega solicitado:</strong> {datos.tiempoEntrega} semanas</li>
          <li><strong>Presupuesto disponible:</strong> ${datos.presupuesto}</li>
          <li><strong>Temática de la empresa:</strong> {datos.tematica}</li>
          <li><strong>Nivel de sostenibilidad esperado:</strong> {datos.nivelSostenibilidad}</li>
          <li><strong>Impacto ambiental esperado:</strong> {datos.impactoAmbiental.length > 0 ? datos.impactoAmbiental.join(', ') : 'Ninguno'}</li>
          <li><strong>Recomendaciones sostenibles:</strong> {datos.sostenible ? 'Sí' : 'No'}</li>
        </ul>

        <hr />

        <h4 className={styles.subtitulo}>Recomendaciones dinámicas:</h4>

        {/* Arquitectura según tipo de sistema */}
        {datos.tipoSistema === 'Web' && (
          <p><strong>Arquitectura sugerida:</strong> SPA con React + Node.js + PostgreSQL.</p>
        )}
        {datos.tipoSistema === 'App' && (
          <p><strong>Arquitectura sugerida:</strong> App híbrida con React Native + Firebase.</p>
        )}
        {datos.tipoSistema === 'Backend' && (
          <p><strong>Arquitectura sugerida:</strong> Microservicios con Node.js + Docker + MongoDB.</p>
        )}

        {/* Tiempo estimado según escalabilidad */}
        {datos.escalabilidad === 'Alto' && (
          <p><strong>Tiempo estimado:</strong> 6 a 8 semanas por la complejidad.</p>
        )}
        {datos.escalabilidad === 'Medio' && (
          <p><strong>Tiempo estimado:</strong> 3 a 5 semanas para MVP funcional.</p>
        )}
        {datos.escalabilidad === 'Bajo' && (
          <p><strong>Tiempo estimado:</strong> 1 a 2 semanas para prototipo simple.</p>
        )}

        {/* Validación contra tiempo solicitado */}
        {datos.tiempoEntrega < 3 && datos.escalabilidad === 'Alto' && (
          <p style={{ color: 'red' }}>
            ⚠️ El tiempo solicitado es menor al estimado. Se recomienda ajustar expectativas.
          </p>
        )}

        {/* Validación contra presupuesto */}
        {datos.presupuesto < 2000 && datos.escalabilidad !== 'Bajo' && (
          <p style={{ color: 'red' }}>
            ⚠️ El presupuesto es insuficiente para la escalabilidad seleccionada.
          </p>
        )}

        {/* Impacto ambiental */}
        {datos.impactoAmbiental.includes('Reducir huella de carbono') && (
          <p><strong>Impacto ambiental:</strong> Se recomienda optimizar servidores y usar proveedores cloud verdes.</p>
        )}
        {datos.impactoAmbiental.includes('Optimizar consumo energético') && (
          <p><strong>Impacto ambiental:</strong> Implementar balanceo de carga y eficiencia en consultas.</p>
        )}
        {datos.impactoAmbiental.includes('Uso de cloud verde') && (
          <p><strong>Impacto ambiental:</strong> Contratar servicios cloud con certificación de energía renovable.</p>
        )}

        <div className={styles.botones}>
          <button className={styles.volver} onClick={() => navigate('/')}>
            Volver al formulario
          </button>
          <button className={styles.dashboard} onClick={() => navigate('/dashboard')}>
            Ir al Dashboard del ingeniero
          </button>
        </div>
      </div>
    </div>
  );
};

export default InformeTecnico;
