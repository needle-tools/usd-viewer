declare module "../../tests/fixtures/test-asset-library.js" {
  export const fixtureBasePath: string;
  export const testAssetLibrary: Array<{
    group: string;
    label: string;
    root: string;
    files?: string[];
  }>;
  export function fixtureUrl(path: string, basePath?: string): string;
}
