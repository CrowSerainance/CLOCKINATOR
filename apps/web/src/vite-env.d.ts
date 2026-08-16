/// <reference types="vite/client" />

declare module "*.sql?raw" {
  const src: string;
  export default src;
}

declare module "*.wasm?url" {
  const src: string;
  export default src;
}
