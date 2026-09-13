/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
declare module '*?worker&url' { const url: string; export default url; }
/** The build this bundle came from: a commit sha on Cloudflare, a timestamp locally. */
declare const __BUILD_ID__: string;
