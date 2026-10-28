import 'dotenv/config';

const requerida = (nombre, porDefecto) => {
  const valor = process.env[nombre] ?? porDefecto;
  if (valor === undefined) throw new Error(`Falta la variable de entorno ${nombre}. Revisa tu archivo .env`);
  return valor;
};

export const env = {
  entorno: process.env.NODE_ENV ?? 'development',
  puerto: Number(process.env.PORT ?? 3000),
  db: {
    host: requerida('DB_HOST', 'localhost'),
    puerto: Number(process.env.DB_PORT ?? 3306),
    usuario: requerida('DB_USER'),
    password: requerida('DB_PASSWORD'),
    nombre: requerida('DB_NAME'),
  },
  jwt: {
    secreto: requerida('JWT_SECRET'),
    expira: process.env.JWT_EXPIRES_IN ?? '8h',
  },
};
