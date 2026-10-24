/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for API calls. Use "/api" with the dev proxy or a Vercel rewrite. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
