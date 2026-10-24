// Opt in with: /// <reference types="@nicodoggie/kingraph/vite/client" />
// Both URL and raw imports export strings, plus SVG viewBox dimensions.
declare module '*.yaml?kingraph' {
    const url: string;
    export default url;
    export const width: number;
    export const height: number;
}
declare module '*.yml?kingraph' {
    const url: string;
    export default url;
    export const width: number;
    export const height: number;
}
declare module '*.yaml?kingraph&raw' {
    const svg: string;
    export default svg;
    export const width: number;
    export const height: number;
}
declare module '*.yml?kingraph&raw' {
    const svg: string;
    export default svg;
    export const width: number;
    export const height: number;
}
