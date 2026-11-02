export function installViewerStyle() {
  const href = new URL('./style.css', import.meta.url).href;
  // A host may version its stylesheet URL. It still owns the same stylesheet;
  // do not append an unversioned copy after its product/theme overrides.
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => {
    const existing=new URL(link.href),requested=new URL(href);
    return existing.origin===requested.origin&&existing.pathname===requested.pathname;
  })) return;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.append(link);
}
