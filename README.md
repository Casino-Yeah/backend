# Backend · Casino Online (Equipo 08)

API REST con Node.js, Express y MySQL: 25 endpoints, JWT, roles, reglas de negocio RN-01 a RN-07,
apuesta transaccional y la lógica de Blackjack, Video Póker, Ruleta de la suerte y Billar 2D.

> Se ejecuta con Docker desde el repositorio **casino_containers** (ver su README).
> Necesita los repositorios `database`, `frontend` y `casino_containers` clonados en la misma carpeta.

| Carpeta | Contenido |
|---|---|
| `src/routes` → `src/controllers` → `src/services` | Capas de la API |
| `src/games/` | Lógica de los juegos en el servidor |
| `src/config/reglas.js` | Valores de las reglas de negocio |
| `shared/billar.js` | Motor de física del Billar; el frontend lo importa desde `../backend/shared` |
| `openapi.yaml` | Contrato de la API; Swagger en http://localhost:3000/api/docs |
| `tests/` | Jest + Supertest (unitarias e integración, 101 pruebas) |
| `docs/postman/` | Colección de Postman de los 25 endpoints |
| `scripts/` | Generadores de `seed.sql` (repositorio database) y de la colección de Postman |

Comandos (desde `casino_containers`):

```bash
docker compose exec backend npm test             # todas las pruebas
docker compose exec backend npm run test:unit    # solo la lógica de los juegos
docker compose exec backend npm run seed:generate     # regenera database/seed.sql
docker compose exec backend npm run postman:generate  # regenera docs/postman
```
