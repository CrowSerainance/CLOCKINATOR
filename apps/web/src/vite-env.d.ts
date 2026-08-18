/// <reference types="vite/client" />

declare module "*.sql?raw" {
  const src: string;
  export default src;
}

declare module "sql.js/dist/sql-asm.js" {
  import type { SqlJsStatic } from "sql.js";
  const initSqlJs: (config?: object) => Promise<SqlJsStatic>;
  export default initSqlJs;
}
