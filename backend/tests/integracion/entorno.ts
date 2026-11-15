/**
 * Debe ser el PRIMER import de cada prueba de integración: apunta la
 * conexión a la base de prueba antes de que se cree el pool.
 * Por defecto usa "parkway_test" en el mismo servidor de backend/.env.
 */
process.env.DB_NAME = process.env.DB_NAME_PRUEBAS || "parkway_test";
delete process.env.DATABASE_URL;
process.env.TZ ||= "America/Bogota";
process.env.JWT_SECRET ||= "secreto-de-pruebas";
