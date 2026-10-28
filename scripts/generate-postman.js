// Genera docs/postman/casino.postman_collection.json a partir de openapi.yaml
// Uso: npm run postman:generate
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';

const spec = parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'));
const resolver = (obj) => {
  if (obj?.$ref) return resolver(obj.$ref.split('/').slice(1).reduce((o, k) => o[k], spec));
  return obj;
};
function ejemplo(schema) {
  const s = resolver(schema);
  if (!s) return undefined;
  if (s.example !== undefined) return s.example;
  if (s.type === 'object') return Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, ejemplo(v)]).filter(([, v]) => v !== undefined));
  if (s.type === 'array') return [];
  if (s.enum) return s.enum[0];
  return { string: '', integer: 1, number: 100, boolean: true }[s.type];
}

const carpetas = {};
for (const [ruta, metodos] of Object.entries(spec.paths)) {
  for (const [metodo, op] of Object.entries(metodos)) {
    if (metodo === 'parameters') continue;
    const params = [...(metodos.parameters ?? []), ...(op.parameters ?? [])].map(resolver);
    const query = params.filter((p) => p.in === 'query').map((p) => ({ key: p.name, value: String(p.example ?? ''), disabled: !p.required }));
    const segmentos = ruta.split('/').filter(Boolean).map((s) => (s.startsWith('{') ? `:${s.slice(1, -1)}` : s));
    const variables = params.filter((p) => p.in === 'path').map((p) => ({ key: p.name, value: '1' }));
    const cuerpo = op.requestBody ? ejemplo(op.requestBody.content['application/json'].schema) : undefined;
    const peticion = {
      name: op.summary,
      request: {
        method: metodo.toUpperCase(),
        header: cuerpo ? [{ key: 'Content-Type', value: 'application/json' }] : [],
        ...(op.security?.length === 0 ? { auth: { type: 'noauth' } } : {}),
        url: { raw: `{{baseUrl}}/${segmentos.join('/')}`, host: ['{{baseUrl}}'], path: segmentos, query, variable: variables },
        ...(cuerpo ? { body: { mode: 'raw', raw: JSON.stringify(cuerpo, null, 2) } } : {}),
      },
    };
    if (ruta === '/auth/login' || ruta === '/auth/registro') {
      peticion.event = [{ listen: 'test', script: { exec: [
        "pm.test('Respuesta correcta', () => pm.expect(pm.response.code).to.be.oneOf([200, 201]));",
        "const t = pm.response.json().token; if (t) pm.collectionVariables.set('token', t);",
      ] } }];
    }
    (carpetas[op.tags[0]] ??= []).push(peticion);
  }
}

const coleccion = {
  info: {
    name: 'Casino Online - Equipo 08',
    description: 'Los 25 endpoints de la API. Ejecuta primero "2. Iniciar sesión": guarda el token automáticamente.\nUsuarios de prueba: admin@casino.test / sofia.hernandez@correo.test (contraseña Casino123).',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
  variable: [{ key: 'baseUrl', value: 'http://localhost:3000/api' }, { key: 'token', value: '' }],
  item: Object.entries(carpetas).map(([name, item]) => ({ name, item })),
};
writeFileSync(new URL('../docs/postman/casino.postman_collection.json', import.meta.url), JSON.stringify(coleccion, null, 2) + '\n');
console.log(`Colección generada con ${Object.values(carpetas).flat().length} peticiones`);
