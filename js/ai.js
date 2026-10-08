// Conexión con Claude (API de Anthropic) compartida por toda la app.
import { db } from './store.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.127.0/+esm';

export const MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5 (el más listo)' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5 (equilibrado)' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5 (rápido y barato)' },
];

export const hasKey = () => !!db().settings.anthropicKey;

let sdk = null;
async function client() {
  sdk ??= (await import(SDK_URL)).default;
  return new sdk({ apiKey: db().settings.anthropicKey, dangerouslyAllowBrowser: true });
}

function friendly(e) {
  const A = sdk;
  if (!A) return e;
  if (e instanceof A.AuthenticationError) return new Error('La clave de API no es válida. Revísala en Ajustes.');
  if (e instanceof A.RateLimitError) return new Error('Demasiadas peticiones; espera un momento.');
  if (e instanceof A.APIConnectionError) return new Error('Sin conexión con Claude. ¿Tienes internet?');
  if (e instanceof A.APIError) return new Error(`Error de la API (${e.status}): ${e.message}`);
  return e;
}

// Llamada base. Devuelve la respuesta completa de la API.
export async function createMessage({ system, messages, tools, maxTokens = 4000, effort = 'low', schema }) {
  if (!hasKey()) throw new Error('Añade tu clave de Anthropic en Ajustes para usar esta función.');
  const c = await client();
  const model = db().settings.model;
  const output_config = { effort };
  if (schema) output_config.format = { type: 'json_schema', schema };
  const params = { model, max_tokens: maxTokens, system, messages, output_config };
  if (tools) params.tools = tools;
  try {
    // Opus y Sonnet: si la petición se rechaza por seguridad, la API reintenta con otro modelo
    return model === 'claude-haiku-5-5'
      ? await c.messages.create(params)
      : await c.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  } catch (e) {
    throw friendly(e);
  }
}

const textOf = (resp) => resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();

// Respuesta de texto. content: string o lista de bloques (texto/imagen).
export async function askText({ system, content, maxTokens, effort }) {
  const resp = await createMessage({ system, messages: [{ role: 'user', content }], maxTokens, effort });
  if (resp.stop_reason === 'refusal') throw new Error('Claude no puede ayudar con esta petición.');
  return textOf(resp);
}

// Respuesta en JSON validada contra un esquema.
export async function askJSON({ system, content, schema, maxTokens = 6000, effort }) {
  const resp = await createMessage({ system, messages: [{ role: 'user', content }], schema, maxTokens, effort });
  if (resp.stop_reason === 'refusal') throw new Error('Claude no puede ayudar con esta petición.');
  if (resp.stop_reason === 'max_tokens') throw new Error('La respuesta salió demasiado larga; inténtalo de nuevo.');
  try {
    return JSON.parse(textOf(resp));
  } catch {
    throw new Error('No se pudo leer la respuesta de Claude.');
  }
}

export const imageBlock = (base64) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } });

// Esquemas: todos los campos obligatorios y sin propiedades extra
export const objSchema = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

// Leer en voz alta
export function speak(text) {
  if (!('speechSynthesis' in window)) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-ES';
  const es = speechSynthesis.getVoices().find((v) => v.lang?.startsWith('es'));
  if (es) u.voice = es;
  speechSynthesis.speak(u);
  return true;
}
