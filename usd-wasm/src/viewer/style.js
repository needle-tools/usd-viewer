export function installViewerStyle() {
  const href = new URL('./style.css', import.meta.url).href;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href === href)) return;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.append(link);
}
