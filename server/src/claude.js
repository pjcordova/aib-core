// ---------------------------------------------------------------------------
// Cliente Claude — un único punto por el que pasan todas las llamadas.
// ---------------------------------------------------------------------------
// Centraliza tres cosas que antes estaban duplicadas o directamente ausentes:
// el registro del consumo real de tokens, la detección de truncado por límite,
// y el streaming (obligatorio para max_tokens altos: sin él el SDK corta por
// timeout HTTP).
// ---------------------------------------------------------------------------

const { Anthropic } = require('@anthropic-ai/sdk');
const { config } = require('./config');

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

/** Error de dominio: la generación se cortó por alcanzar el techo de tokens. */
class TruncatedError extends Error {
  constructor(label) {
    super(`La IA alcanzó el límite de tokens antes de terminar (${label}).`);
    this.name = 'TruncatedError';
    this.code = 'TRUNCATED';
  }
}

/**
 * Ejecuta una llamada a Claude y devuelve el texto plano de la respuesta.
 * Lanza TruncatedError si la salida quedó a medias.
 */
async function generateText({ label, system, prompt, maxTokens, temperature = 0.7 }) {
  const startedAt = Date.now();

  const stream = anthropic.messages.stream({
    model: config.model,
    max_tokens: maxTokens,
    temperature,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: prompt }],
  });

  const response = await stream.finalMessage();
  const elapsed = Date.now() - startedAt;

  console.log(
    `[AIB+] ${label} — in: ${response.usage.input_tokens} tok, ` +
      `out: ${response.usage.output_tokens} tok, ` +
      `stop: ${response.stop_reason}, ${elapsed}ms`
  );

  if (response.stop_reason === 'max_tokens') {
    throw new TruncatedError(label);
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return {
    text,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

/** Quita las vallas de markdown que el modelo a veces añade pese al prompt. */
function stripMarkdownFences(raw) {
  return raw
    .replace(/^\s*```[a-zA-Z]*\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .replaceAll('```tsx', '')
    .replaceAll('```jsx', '')
    .replaceAll('```javascript', '')
    .replaceAll('```json', '')
    .replaceAll('```', '')
    .trim();
}

module.exports = { generateText, stripMarkdownFences, TruncatedError };
