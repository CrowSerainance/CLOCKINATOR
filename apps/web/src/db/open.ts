import { applyMigrations } from "./migrate";
import { createMemorySqlite, openSqlite } from "./client";
import { ClockinatorStore } from "./store";

export async function openClockinatorStore(): Promise<ClockinatorStore> {
  const db = await openSqlite();
  applyMigrations(db);
  const store = new ClockinatorStore(db);
  store.bootstrap();
  await store.flush();
  return store;
}

export async function openMemoryStore(): Promise<ClockinatorStore> {
  const db = await createMemorySqlite();
  applyMigrations(db);
  const store = new ClockinatorStore(db);
  store.bootstrap();
  return store;
}
