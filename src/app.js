import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import rutas from './routes/index.js';
import { manejarErrores, rutaNoEncontrada } from './middlewares/errores.js';
import { env } from './config/env.js';

const especificacion = parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'));

export const app = express();
app.set('trust proxy', true);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '100kb' }));
if (env.entorno !== 'test') app.use(morgan('dev'));

app.get('/api/salud', (_req, res) => res.json({ estado: 'ok' }));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(especificacion, { customSiteTitle: 'Casino Online API' }));
app.get('/api/openapi.json', (_req, res) => res.json(especificacion));
app.use('/api', rutas);

app.use(rutaNoEncontrada);
app.use(manejarErrores);
