import type { MuApi } from "./lib/mu-api";

declare global {
  interface Window {
    muApi?: MuApi;
  }
}

export {};
