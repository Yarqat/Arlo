// Point all tests at the isolated yarqat_test database and provide dummy secrets.
// DATABASE_URL is injected from the shell (sourced from shared/.env); we swap the db name.
const main = process.env.DATABASE_URL ?? "";
if (!main.includes("/yarqat_test")) {
  process.env.DATABASE_URL = main.replace("/yarqat?", "/yarqat_test?");
}
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY ?? "0".repeat(64);
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "x".repeat(40);
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379/5";
process.env.TZ = "Asia/Karachi";
