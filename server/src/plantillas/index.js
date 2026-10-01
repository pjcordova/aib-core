// ---------------------------------------------------------------------------
// Registro de plantillas del lado servidor
// ---------------------------------------------------------------------------
// Solo las plantillas que figuran aquí pueden pedirse al endpoint: el cliente
// manda el id, nunca el esquema ni el prompt, así que no puede inflar la
// llamada ni cambiar lo que se le pide a la IA.
// ---------------------------------------------------------------------------

const modaBoutique = require('./moda-boutique');
const consultora = require('./consultora');
const restaurante = require('./restaurante');
const saludBelleza = require('./salud-belleza');
const institucional = require('./institucional');

const PLANTILLAS = Object.fromEntries([modaBoutique, consultora, restaurante, saludBelleza, institucional].map((p) => [p.id, p]));

function obtenerPlantilla(id) {
  return Object.prototype.hasOwnProperty.call(PLANTILLAS, id) ? PLANTILLAS[id] : null;
}

module.exports = { obtenerPlantilla };
