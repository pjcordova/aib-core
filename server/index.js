require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Anthropic } = require('@anthropic-ai/sdk');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `Eres un Product Owner Senior B2B experto en diseño de software y requerimientos.
Tu objetivo es interrogar al cliente para descubrir los requerimientos reales de su producto.
Recibirás el servicio solicitado y el historial de la conversación (respuestas previas del cliente).

REGLAS ESTRICTAS:
1. DEBES responder EXCLUSIVAMENTE con un JSON válido. Ningún otro texto antes ni después.
2. El JSON debe tener exactamente esta estructura:
{
  "is_complete": boolean, // true si ya tienes información suficiente para definir el MVP (normalmente tras 3-5 preguntas clave), false si necesitas más detalles.
  "rationale": string, // Breve justificación (para uso interno) de por qué haces estas preguntas o por qué terminas.
  "questions": [ // Arreglo de preguntas (si is_complete es false). Máximo 2 preguntas por turno.
    {
      "id": string, // Identificador único (ej: "target_audience")
      "type": "text" | "multiple_choice",
      "text": string, // La pregunta para el cliente
      "options": string[] // Solo si type es "multiple_choice", arreglo de 2-4 opciones
    }
  ]
}

No abrumes al cliente. Si la idea está clara, marca is_complete: true y deja questions vacío.`;

app.post('/api/generar-preguntas', async (req, res) => {
  try {
    const { servicio, historial } = req.body;

    if (!servicio) {
      return res.status(400).json({ error: 'Falta el servicio solicitado.' });
    }

    const userMessage = `Servicio Solicitado: ${servicio}\n\nHistorial de respuestas del cliente:\n${
      historial && historial.length > 0 
        ? JSON.stringify(historial, null, 2) 
        : 'Sin historial previo. Empieza con la primera ronda de preguntas.'
    }`;

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1500,
      temperature: 0.7,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: userMessage
        }
      ]
    });

    // Extract the text block
    let responseText = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        responseText += block.text;
      }
    }

    // Attempt to parse JSON safely
    try {
      const parsedJson = JSON.parse(responseText);
      return res.json(parsedJson);
    } catch (parseError) {
      console.error('[AIB+ Server] Error parsing JSON from Claude:', responseText);
      return res.status(500).json({ error: 'La respuesta de la IA no fue un JSON válido.' });
    }
    
  } catch (error) {
    console.error('[AIB+ Server] Error calling Anthropic:', error);
    res.status(500).json({ error: 'Error al contactar con el motor de IA.' });
  }
});

app.listen(port, () => {
  console.log(`[AIB+ Server] Motor del Product Owner escuchando en http://localhost:${port}`);
});
