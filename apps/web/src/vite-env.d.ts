// CSS diproses Vite; deklarasi ini hanya untuk TypeScript.
declare module '*.css';
declare module '*.css?inline' {
  const css: string;
  export default css;
}
