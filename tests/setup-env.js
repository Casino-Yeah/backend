// Las pruebas usan una base de datos aparte (casino_test) para no tocar los datos de desarrollo
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'casino_test';
process.env.JWT_SECRET ??= 'secreto_de_pruebas';
