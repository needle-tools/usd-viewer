/** Detect volume documents without importing the optional node renderer. */
export function hasMaterialXVolume(xml) {
  return /<volumematerial(?:\s|\/?>)/.test(xml);
}
