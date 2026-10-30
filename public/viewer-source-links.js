// Source locations are lexical, so inspection never evaluates JavaScript.
const TOKENS = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\[\s\S]|[^`\\])*`|@@@[\s\S]*?@@@|@[^@\n]*@|<[^<>\n]*>|[A-Za-z_$][\w$:.]*|[{}()[\]]/g;
const TYPE = /^(?:rel|bool|uchar|u?int(?:64)?|half|float|double|timecode|string|token|asset|opaque|dictionary|frame4d|matrix[234]d|quat[dfh]|(?:color|point|normal|vector|texCoord)[234][dfh]|(?:double|float|half|int)[234])$/;
const quoted = value => /^["'`]/.test(value);
const unquote = value => value.slice(1, -1).replace(/\\([\\"'])/g, '$1');

export function absolutePrimPath(value, owner = '/') {
  if (!value) return '';
  if (value.startsWith('/')) return value;
  const parts = owner.split('/').filter(Boolean);
  for (const part of value.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') {
      if (part.startsWith('.')) return '/' + parts.join('/') + part;
      parts.push(part);
    }
  }
  return '/' + parts.join('/');
}

export function sourceLocations(text, language) {
  const links = new Map(), definitions = new Map(), stack = [];
  const list = [...text.matchAll(TOKENS)].map(match => ({value: match[0], start: match.index, end: match.index + match[0].length}));
  let pending;
  const owner = () => '/' + stack.filter(frame => frame.name).map(frame => frame.name).join('/');
  for (let i = 0; i < list.length; i++) {
    const token = list[i], value = token.value;
    if (/^(?:\/\/|\/\*|#)/.test(value)) continue;
    if (language === 'usda') {
      if (/^(def|over|class)$/.test(value)) {
        const name = quoted(list[i + 1]?.value || '') ? list[i + 1] : list[i + 2];
        if (name && quoted(name.value)) {
          pending = {name: unquote(name.value), paren: 0};
          definitions.set(name.start, absolutePrimPath(pending.name, owner()));
        }
      }
      if (pending && value === '(') pending.paren++;
      if (pending && value === ')') pending.paren--;
      if (value === '{') {
        if (pending && pending.paren === 0) { stack.push(pending); pending = undefined; }
        else stack.push({});
      }
      if (value === '}') stack.pop();
      if (TYPE.test(value) && stack.at(-1)?.name) {
        let at = i + 1;
        if (list[at]?.value === '[' && list[at + 1]?.value === ']') at += 2;
        const name = list[at];
        if (name && /^[A-Za-z_][\w:]*(?:\.(?:connect|timeSamples))?$/.test(name.value))
          definitions.set(name.start, owner() + '.' + name.value.replace(/\.(connect|timeSamples)$/, ''));
      }
      if (value.startsWith('@')) {
        const width = value.startsWith('@@@') ? 3 : 1, target = value.slice(width, -width);
        if (target) links.set(token.start, {kind: 'asset', target});
      } else if (value.startsWith('<')) {
        const target = value.slice(1, -1), previous = list[i - 1];
        const asset = previous?.value.startsWith('@') && /^\s*$/.test(text.slice(previous.end, token.start)) ? links.get(previous.start)?.target : undefined;
        if (target) links.set(token.start, {kind: 'prim', target: absolutePrimPath(target, pending ? absolutePrimPath(pending.name, owner()) : owner()), asset});
      }
    }
    if (quoted(value) && !/^["']{3}/.test(value)) {
      const target = unquote(value);
      if (/^https?:\/\/[^\s]+$/i.test(target)) links.set(token.start, {kind: 'url', target});
      else if (language === 'javascript' && !/\\|\$\{/.test(target)) {
        if (target.startsWith('/') && !/\.(?:usd[acz]?|usdz|js|mjs|png|jpe?g|exr|hdr|ktx2|mtlx|mdl)$/i.test(target)) links.set(token.start, {kind:'prim',target});
        else if (/^(?:\.{1,2}\/|\/)|\.(?:usd[acz]?|usdz|js|mjs|png|jpe?g|exr|hdr|ktx2|mtlx|mdl)$/i.test(target)) links.set(token.start, {kind:'file',target});
      }
    }
  }
  return {links, definitions};
}

export function canonicalSourcePath(path) {
  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path);
    path = url.pathname.startsWith('/test-fixtures/') ? url.pathname.slice(15) : url.host + url.pathname;
  }
  try { path = decodeURIComponent(path); } catch {}
  return String(path || '').replace(/\\/g, '/').replace(/^\/?needle\/\d+\//, '').replace(/^\/+/, '');
}

function relativeFile(target, anchor) {
  if (/^[a-z][a-z\d+.-]*:/i.test(target)) return target;
  if (/^https?:\/\//i.test(anchor)) return new URL(target, anchor).href;
  // Paths inside a package are relative to the containing package layer.
  const packaged = anchor.match(/^(.*?\[)([^\]]+)(\])$/);
  if (packaged && !target.startsWith('/')) return packaged[1] + relativeFile(target, packaged[2]) + ']';
  const absolute = target.startsWith('/') || anchor.startsWith('/');
  const parts = (target.startsWith('/') ? target : anchor.slice(0, anchor.lastIndexOf('/') + 1) + target).split('/'), result = [];
  for (const part of parts) {
    if (part === '..' && result.length && result.at(-1) !== '..') result.pop();
    else if (part === '..' && !absolute) result.push(part);
    else if (part && part !== '.') result.push(part);
  }
  return (absolute ? '/' : '') + result.join('/');
}

export function referencePaths(target, source, resolveUrl) {
  const paths = new Set();
  for (const anchor of [source.identifier, source.path, source.url].filter(Boolean)) {
    const path = relativeFile(target, anchor); paths.add(path);
    try { const url = resolveUrl?.(path); if (/^https?:\/\//i.test(url || '')) paths.add(url); } catch {}
  }
  return [...paths];
}

export function referencedSource(target, source, sources, resolveUrl) {
  // Compare complete anchored paths, never just filenames: projects routinely
  // contain different geometry and material files with the same basename.
  for (const path of referencePaths(target, source, resolveUrl)) {
    const key = canonicalSourcePath(path);
    const match = sources.find(candidate => [candidate.identifier, candidate.path, candidate.url].filter(Boolean).some(value => canonicalSourcePath(value) === key));
    if (match) return match;
  }
}
