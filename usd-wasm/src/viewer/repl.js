import { installViewerStyle } from './style.js';
import { viewerIcon } from './icons.js';
import {attachArrayInput} from './arrayEditor.js';

const OUTPUT_LIMIT = 160, TEXT_LIMIT = 8000, HISTORY_LIMIT = 100;
const HELP = Object.freeze({
  symbols: 'USD, stage, handle, scene, selection, panel, api, three, context',
  commands: 'await edit(async stage => { … }); select(identity); follow(identity); await inspect(identity); print(value); clear()',
  persistence: 'scratch.name = value persists for this document; let/const/var are command-local.',
  keys: 'Ctrl/Cmd+Enter runs; Enter inserts a newline; Alt+Up/Down browses history.',
});
const objectLike = value => value !== null && (typeof value === 'object' || typeof value === 'function');
const staleError = () => new Error('REPL document is no longer current.');

// Bounded previews inspect data descriptors only: no native toString/toJSON/getters.
function preview(value, seen = new WeakSet(), depth = 0) {
  if (typeof value === 'string') return value.slice(0, TEXT_LIMIT);
  if (!objectLike(value)) return String(value);
  if (typeof value === 'function') return '[Function]';
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  try {
    if (value instanceof Error) return `${value.name}: ${value.message}`.slice(0, TEXT_LIMIT);
    const proto = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return '[Object]';
    if (depth >= 3) return Array.isArray(value) ? '[Array]' : '[Object]';
    const keys = Object.keys(value), parts = [];
    for (const key of keys.slice(0, 20)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      const text = descriptor && 'value' in descriptor ? preview(descriptor.value, seen, depth + 1) : '[Getter]';
      parts.push(Array.isArray(value) ? text : `${key}: ${text}`);
    }
    if (keys.length > 20) parts.push('…');
    return (Array.isArray(value) ? `[${parts.join(', ')}]` : `{${parts.join(', ')}}`).slice(0, TEXT_LIMIT);
  } catch { return '[Unavailable]'; }
}

// Selection is data, never a Prim/Object3D. Ignore accessors and non-plain objects.
function identityCopy(value, seen = new WeakSet(), depth = 0) {
  if (!objectLike(value)) return typeof value === 'function' ? undefined : value;
  if (depth > 8 || seen.has(value)) return undefined;
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return undefined;
  seen.add(value);
  const copy = Array.isArray(value) ? [] : Object.create(null);
  for (const key of Object.keys(value).slice(0, 100)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) copy[key] = identityCopy(descriptor.value, seen, depth + 1);
  }
  return Object.freeze(copy);
}

function compile(source) {
  // Let the JS parser decide expression vs. statements. Never rewrite source or
  // retry after execution: a thrown SyntaxError may itself be a runtime result.
  const build = body => new Function('scope', `with (scope) { return (async function () { "use strict";\n${body}\n}).call(undefined); }`);
  try { return build(`return (\n${source}\n);`); }
  catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  return build(source);
}

/** Mount an inline console. The host owns stage lifetime and synchronized edits. */
export function mountRepl({ container, getContext, edit, stateKey, style = true }) {
  if (!container || typeof getContext !== 'function' || typeof edit !== 'function') throw new TypeError('mountRepl requires container, getContext and edit.');
  if (style) installViewerStyle();
  const doc = container.ownerDocument;
  const node = (tag, className) => { const el = doc.createElement(tag); el.className = className; return el; };
  const root = node('div', 'usd-repl'), output = node('div', 'usd-repl-output'), input = node('textarea', 'usd-repl-input');
  output.setAttribute('role', 'log'); output.setAttribute('aria-label', 'JavaScript output'); output.setAttribute('aria-live', 'polite');
  input.setAttribute('aria-label', 'JavaScript input'); input.setAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter');
  input.placeholder = 'help'; input.spellcheck = false; input.rows = 5;
  const actions = node('div', 'usd-repl-actions');
  function button(label, icon) {
    const el = node('button', 'usd-repl-action'); el.type = 'button'; el.title = label; el.setAttribute('aria-label', label);
    if (icon) el.append(viewerIcon(icon)); el.append(doc.createTextNode(label)); actions.append(el); return el;
  }
  const arrayButton=button('Array');
  const runButton = button('Run', 'play_arrow'), clearButton = button('Clear');
  root.append(output, input, actions); container.append(root);
  const arrayInput=attachArrayInput(input,arrayButton,root);
  let disposed = false, current = null, queue = Promise.resolve(), history = [], cursor = 0, draft = '';
  let scrollFrame = 0, pinned = true, lastScrollTop = output.scrollTop;
  function scrollOutputToEnd() { output.scrollTop = output.scrollHeight; lastScrollTop = output.scrollTop; }
  function scrollToEnd() {
    if (disposed || !pinned) return;
    doc.defaultView.cancelAnimationFrame(scrollFrame);
    scrollFrame = doc.defaultView.requestAnimationFrame(() => {
      scrollFrame = 0;
      if (!disposed && pinned) scrollOutputToEnd();
    });
  }
  function onScroll() {
    const top = output.scrollTop;
    // Our scroll event can arrive after a resize changes the bottom distance.
    // Only movement, not that delayed event, can change the reading position.
    if (top === lastScrollTop) return;
    lastScrollTop = top;
    if (!scrollFrame) pinned = output.scrollHeight - output.clientHeight - top <= 2;
  }
  function readingHistory() { pinned = false; }
  output.addEventListener('scroll', onScroll, {passive: true});
  output.addEventListener('wheel', readingHistory, {passive: true});
  output.addEventListener('pointerdown', readingHistory);
  // Docked panels can be hidden when evaluation completes. Scroll only the
  // output and only outside ResizeObserver delivery, once it has real bounds.
  const outputSize = new doc.defaultView.ResizeObserver(scrollToEnd);
  outputSize.observe(output);
  if (stateKey) try {
    const saved = JSON.parse(doc.defaultView.localStorage.getItem(stateKey));
    if (Array.isArray(saved)) history = saved.filter(item => typeof item === 'string' && item.length <= TEXT_LIMIT).slice(-HISTORY_LIMIT);
  } catch { /* Storage may be unavailable or corrupt. */ }
  cursor = history.length;
  function append(kind, text) {
    if (disposed) return;
    const row = node('pre', `usd-repl-entry usd-repl-${kind}`); row.textContent = text.slice(0, TEXT_LIMIT); output.append(row);
    while (output.childElementCount > OUTPUT_LIMIT) output.firstElementChild.remove();
    pinned = true; scrollOutputToEnd(); scrollToEnd();
  }
  function remember(source) {
    if (source.length <= TEXT_LIMIT && history.at(-1) !== source) history.push(source);
    history = history.slice(-HISTORY_LIMIT); cursor = history.length; draft = '';
    if (stateKey) try { doc.defaultView.localStorage.setItem(stateKey, JSON.stringify(history)); } catch {}
  }
  function invalidate(token) {
    if (!token || token.invalid) return;
    token.invalid = true;
    for (const reference of token.refs.values()) {
      const cell = reference.deref(); if (cell) cell.value = undefined;
    }
    token.refs.clear();
    for (const key of Reflect.ownKeys(token.scratch)) delete token.scratch[key];
    token.cancel(staleError());
    if (current === token) current = null;
  }
  function contextFor(token) {
    if (disposed || token.invalid) throw staleError();
    const context = getContext();
    if (!context || context.handle !== token.handle.deref() || context.stage !== token.stage.deref() || context.generation !== token.generation) {
      invalidate(token); throw staleError();
    }
    return context;
  }
  function tokenForContext() {
    if (disposed) throw new Error('REPL is disposed.');
    if (current) { try { contextFor(current); return current; } catch { invalidate(current); } }
    const context = getContext();
    if (!context || !objectLike(context.handle) || !objectLike(context.stage)) throw new Error('No USD stage is open.');
    const token = { handle: new WeakRef(context.handle), stage: new WeakRef(context.stage), generation: context.generation, refs: new Map(), cache: new WeakMap(), reverse: new WeakMap(), callbacks: new WeakMap(), scratch: Object.create(null), invalid: false };
    token.cancelled = new Promise(resolve => { token.cancel = resolve; });
    current = token; return token;
  }
  // Only live proxies retain their reference cells; printed results do not.
  // Weakly tracked cells are cleared on close/reload/dispose, including those
  // captured by saved methods and callbacks. Every SDK access checks the document.
  function wrap(token, value) {
    contextFor(token);
    if (!objectLike(value)) return value;
    if (token.reverse.has(value)) return value;
    if (value instanceof Promise) return value.then(result => { contextFor(token); return wrap(token, result); });
    if (token.cache.has(value)) return token.cache.get(value);
    const cell = { value }; token.refs.set(token.refs.size, new WeakRef(cell));
    const read = () => { contextFor(token); return cell.value; };
    const unwrap = value => { contextFor(token); return token.reverse.has(value) ? token.reverse.get(value).value : value; };
    const argument = value => {
      if (typeof value !== 'function' || token.reverse.has(value)) return unwrap(value);
      if (!token.callbacks.has(value)) {
        const callbackCell = { value }; token.refs.set(token.refs.size, new WeakRef(callbackCell));
        token.callbacks.set(value, function (...args) {
          contextFor(token);
          const result = Reflect.apply(callbackCell.value, wrap(token, this), args.map(value => wrap(token, value)));
          if (result instanceof Promise) return result.then(unwrap);
          return unwrap(result);
        });
      }
      return token.callbacks.get(value);
    };
    const target = typeof value === 'function' ? function () {}.bind(null) : Array.isArray(value) ? [] : Object.create(null);
    const proxy = new Proxy(target, {
      get(_target, key) {
        const object = read();
        if (key === Symbol.hasInstance && typeof object === 'function') return candidate => unwrap(candidate) instanceof read();
        return wrap(token, Reflect.get(object, key, object));
      },
      set(_target, key, next) { return Reflect.set(read(), key, unwrap(next)); },
      has(_target, key) { return key in read(); },
      ownKeys() { return Reflect.ownKeys(read()); },
      getOwnPropertyDescriptor(_target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(read(), key);
        if (!descriptor) return undefined;
        if (key === 'length' && Array.isArray(target)) return { value: descriptor.value, writable: true, enumerable: false, configurable: false };
        return { value: 'value' in descriptor ? wrap(token, descriptor.value) : '[Getter]', writable: true, enumerable: descriptor.enumerable, configurable: true };
      },
      getPrototypeOf() { const proto = Reflect.getPrototypeOf(read()); return proto === null || proto === Object.prototype ? proto : wrap(token, proto); },
      deleteProperty(_target, key) { return Reflect.deleteProperty(read(), key); },
      defineProperty(_target, key, descriptor) {
        if (!('value' in descriptor) || descriptor.configurable === false) throw new TypeError('Use ordinary property assignments in the REPL.');
        return Reflect.defineProperty(read(), key, { ...descriptor, value: unwrap(descriptor.value) });
      },
      preventExtensions() { throw new TypeError('Cannot freeze SDK references.'); },
      apply(_target, receiver, args) { return wrap(token, Reflect.apply(read(), unwrap(receiver), args.map(argument))); },
      construct(_target, args) { return wrap(token, Reflect.construct(read(), args.map(argument))); },
    });
    token.cache.set(value, proxy); token.reverse.set(proxy, cell); return proxy;
  }
  function makeScope(token) {
    const assert = () => contextFor(token);
    const print = (...values) => { assert(); append('result', values.map(value => preview(value)).join(' ')); };
    const helpers = {
      help: HELP, scratch: token.scratch,
      print, console: Object.freeze({ log: print, info: print, warn: print, error: print, dir: print }),
      clear: () => { assert(); output.replaceChildren(); },
      edit: async callback => {
        assert();
        if (typeof callback !== 'function') throw new TypeError('edit expects a function.');
        const result = await edit(async stage => {
          assert(); const value = await callback(wrap(token, stage)); assert(); return value;
        });
        assert(); return wrap(token, result);
      },
    };
    for (const name of ['select', 'follow', 'inspect']) helpers[name] = (...args) => {
      const context = assert(), owner = typeof context[name] === 'function' ? context : context.api;
      if (typeof owner?.[name] !== 'function') throw new Error(`${name} is not supplied by this viewer.`);
      return wrap(token, owner)[name](...args);
    };
    return new Proxy(Object.create(null), {
      has(_target, key) { return key === 'context' || key in helpers || key in assert(); },
      get(_target, key) {
        if (key === Symbol.unscopables) return undefined;
        const context = assert();
        if (key === 'context') return new Proxy(Object.create(null), { get: (_target, name) => name === 'selection' ? identityCopy(assert().selection) : wrap(token, assert()[name]) });
        if (key === 'selection') return identityCopy(context.selection);
        if (key in helpers) return helpers[key];
        return wrap(token, context[key]);
      },
      set() { throw new TypeError('Store persistent values on scratch.'); },
    });
  }
  async function evaluate(source, token) {
    contextFor(token);
    const evaluate = compile(source), scope = makeScope(token);
    const result = await Promise.race([evaluate(scope), token.cancelled.then(error => { throw error; })]);
    contextFor(token); return result;
  }
  function run(source) {
    if (disposed) return Promise.reject(new Error('REPL is disposed.'));
    source = String(source);
    if (!source.trim()) return Promise.resolve(undefined);
    remember(source); append('source', source);
    let token;
    try { token = tokenForContext(); }
    catch (error) { append('error', preview(error)); return Promise.reject(error); }
    const operation = queue.then(() => evaluate(source, token));
    const result = operation.then(value => { append('result', preview(value)); return value; }, error => {
      append('error', preview(error)); throw error;
    });
    queue = result.then(() => {}, () => {}); return result;
  }
  function submit() { arrayInput.close(); const source = input.value; input.value = ''; void run(source).catch(() => {}); }
  function onKey(event) {
    if (event.isComposing) return;
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); submit(); }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault(); arrayInput.close(); if (cursor === history.length) draft = input.value;
      cursor = Math.max(0, Math.min(history.length, cursor + (event.key === 'ArrowUp' ? -1 : 1)));
      input.value = cursor === history.length ? draft : history[cursor]; input.setSelectionRange(input.value.length, input.value.length);
    }
  }
  input.addEventListener('keydown', onKey); runButton.addEventListener('click', submit);
  clearButton.onclick = () => output.replaceChildren();
  const watcher = setInterval(() => { if (current) try { contextFor(current); } catch { invalidate(current); } }, 50);
  return {
    run,
    focus() { if (!disposed) input.focus(); },
    dispose() {
      if (disposed) return; disposed = true; clearInterval(watcher); invalidate(current);
      doc.defaultView.cancelAnimationFrame(scrollFrame); outputSize.disconnect();
      output.removeEventListener('scroll', onScroll); output.removeEventListener('wheel', readingHistory); output.removeEventListener('pointerdown', readingHistory);
      input.removeEventListener('keydown', onKey); runButton.removeEventListener('click', submit); clearButton.onclick = null;
      arrayInput.dispose(); history = []; root.remove();
    },
  };
}
