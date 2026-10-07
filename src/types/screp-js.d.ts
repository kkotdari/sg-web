declare module "screp-js" {
  interface ScrepParseOptions {
    header?: boolean;
    computed?: boolean;
    mapData?: boolean;
    mapTiles?: boolean;
    mapResLoc?: boolean;
    cmds?: boolean;
  }
  interface Screp {
    parseBuffer(buf: Uint8Array, options?: ScrepParseOptions): Promise<unknown>;
    getVersion(): string;
  }
  const screp: Screp;
  export default screp;
}
