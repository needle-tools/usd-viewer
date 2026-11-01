import { createDockview } from 'dockview-core';
import { viewerIcon } from './usd/viewer/icons.js';
import { mountExamplesBrowser } from './viewer-examples.js';
import { mountDownloadButton } from './usd/viewer/downloadButton.js';
import { mountLazyCodePane } from './viewer-lazy-code.js';

const STORAGE = 'needle-usd-workspace-v2';
const PRODUCT_MODE = 'needle-usd-product-mode';
const THEME = 'needle-usd-theme';
const dimension = (name, fallback) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--usd-${name}`)) || fallback;
const COMPACT_WIDTH = dimension('compact-breakpoint', 800);
const navigationWidth = dimension('navigation-width', 280), inspectorWidth = dimension('inspector-width', 320);
const navigationMinimum = dimension('navigation-min-width', 200), inspectorMinimum = dimension('inspector-min-width', 280);
const timelineHeight = dimension('timeline-height', 84), consoleHeight = dimension('console-height', 200);
const definitions = {
  viewport: ['Viewport', inspectorMinimum, 160], stage: ['Stage', navigationMinimum, 120], properties: ['Properties', inspectorMinimum, 120],
  settings: ['Settings', inspectorMinimum, 180], layers: ['Layers', navigationMinimum, 120], timeline: ['Timeline', inspectorMinimum, timelineHeight], console: ['Console', inspectorMinimum, 100],
  simulation: ['Simulation', inspectorMinimum, 120], examples: ['Examples', dimension('examples-min-width',240), 180], code: ['Code', inspectorMinimum, 120],
};
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
function codeIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox','0 0 16 16'); svg.setAttribute('width','16'); svg.setAttribute('height','16');
  svg.setAttribute('class','usd-icon'); svg.dataset.icon='code'; svg.setAttribute('aria-hidden','true'); svg.setAttribute('focusable','false');
  svg.innerHTML='<path fill="currentColor" stroke="none" transform="translate(0 16) scale(0.016666666667)" d="M320-240 80-480l240-240 57 57-184 184 183 183-56 56Zm320 0-57-57 184-184-183-183 56-56 240 240-240 240Z"/>';
  return svg;
}
const commandIcons = { 'Open…': 'folder_open', 'Frame selection': 'filter_center_focus', 'Viewport': 'web_asset', 'Float active panel': 'web_asset', 'Maximize / restore': 'fullscreen', 'Open panel in window': 'open_in_new', 'Reset layout': 'restart_alt', 'Save': 'save' };
function commandIcon(node, name) {
  node.querySelectorAll(':scope > svg, :scope > img').forEach(icon => icon.remove());
  node.prepend(viewerIcon(name)); node.classList.add('usd-menu-command');
  return node;
}
function button(text, action, title, icon = commandIcons[text]) { const node = element('button', 'header-tool-button', text); node.type = 'button'; if (title) node.title = title; node.onclick = action; if(icon)commandIcon(node,icon); return node; }

export async function mountWorkbench() {
  const previousWorkspace = read(STORAGE, null);
  const requestedMode = new URLSearchParams(location.search).get('workspace');
  const rememberedMode = read(PRODUCT_MODE, null);
  const validMode = value => value === 'viewer' || value === 'studio';
  const hasSavedWorkspace = previousWorkspace?.current || read('needle-usd-workspace-v1', null)?.current;
  let productMode = validMode(requestedMode) ? requestedMode : validMode(rememberedMode) ? rememberedMode : hasSavedWorkspace ? 'studio' : 'viewer';
  save(PRODUCT_MODE, productMode);
  document.body.classList.add('usd-product');
  const root = element('div', 'usd-workbench'); root.id = 'usd-workbench'; root.dataset.loaded = 'false';
  root.dataset.mode = productMode;
  const parking = element('div'); parking.hidden = true; root.append(parking);
  const header = document.getElementById('container');
  const identity = element('div', 'header-tool-leading');
  const logo = document.querySelector('.needle-logo-link');
  logo.querySelector('img').src = '/brand/logos/logo_needle_black_no_padding.svg';
  const title = element('div', 'header-tool-title-group');
  const productSelect = element('select', 'usd-product-mode'); productSelect.setAttribute('aria-label', 'Workspace mode');
  for (const [value, text] of [['viewer', 'USD Viewer'], ['studio', 'USD Studio']]) { const option = element('option', '', text); option.value = value; productSelect.append(option); }
  productSelect.value = productMode; productSelect.onchange = () => setProductMode(productSelect.value); title.append(productSelect);
  const fileContext = element('span', 'usd-file-context', 'Untitled'); identity.append(logo, title);
  const actions = element('nav', 'header-tool-actions usd-menubar'); actions.setAttribute('aria-label', 'Application menus');
  actions.id = 'usd-application-menus';
  const menuToggle = button('Menu', () => setMenubarOpen(root.dataset.menuOpen !== 'true'), 'Application menus');
  menuToggle.classList.add('usd-menubar-toggle'); menuToggle.setAttribute('aria-label', 'Application menus'); menuToggle.setAttribute('aria-controls', actions.id); menuToggle.setAttribute('aria-expanded', 'false');
  function setMenubarOpen(open) { root.dataset.menuOpen = String(open); menuToggle.setAttribute('aria-expanded', String(open)); if (open) positionMenus(); }
  const samplePicker = document.querySelector('.usd-examples-browser');
  const examplesSearch = samplePicker.querySelector('#examples-search');
  const searchSlots = new Map();
  const engine = document.getElementById('viewer-mode-toggle'); engine.classList.add('segmented-control');
  const share = document.getElementById('export-gltf');
  const about = document.getElementById('about-link'); about.classList.add('header-tool-button');
  const feedback = document.querySelector('#feedback-link');
  commandIcon(share,'share'); commandIcon(about,'info'); if(feedback)commandIcon(feedback,'chat_bubble');
  const input = element('input'); input.type = 'file'; input.multiple = true; input.accept = '.usd,.usda,.usdc,.usdz,.gltf,.glb'; input.hidden = true;
  input.onchange = () => { if (!input.files.length) return; const data = new DataTransfer(); for (const file of input.files) data.items.add(file); window.dispatchEvent(new DragEvent('drop', { dataTransfer: data, cancelable: true })); input.value = ''; };
  const open = button('Open…', () => input.click(), 'Open a USD, USDZ or glTF file'); open.disabled = input.disabled = true;
  const menus = [], menuUpdates = new Map();
  let downloadControl, downloadSource = null;
  function openMenu(disclosure) {
    if (disclosure === downloadControl?.menuElement) { downloadControl.openMenu(); return; }
    downloadControl?.closeMenu(); menuUpdates.get(disclosure)?.(); disclosure.open = true; positionMenus();
  }
  function menuIsOpen() { return menus.some(menu => menu.open) || downloadControl?.menuOpen; }
  function followMenu(trigger) {
    if (!menuIsOpen() || trigger.matches(':disabled,[aria-disabled=true]')) return;
    closeMenus(true);
    if (trigger.tagName === 'SUMMARY') openMenu(trigger.parentElement);
  }
  function positionMenus() {
    const width = root.clientWidth, bottom = header.getBoundingClientRect().bottom;
    root.style.setProperty('--usd-header-bottom', `${bottom}px`);
    const top = (menuToggle.getClientRects().length && root.dataset.menuOpen === 'true' ? actions.getBoundingClientRect().bottom : bottom) + 4;
    root.style.setProperty('--usd-menu-top', `${top}px`);
    for (const disclosure of menus) {
      if (!disclosure.open) continue;
      const body = disclosure.lastElementChild, trigger = disclosure.firstElementChild.getBoundingClientRect();
      body.style.left = `${Math.max(8, Math.min(trigger.left, width - body.offsetWidth - 8))}px`;
    }
  }
  function nextMenu(trigger, direction, open) {
    const triggers = [...header.querySelectorAll('.usd-menu > summary, .usd-examples-menu, .usd-download-trigger')].filter(item => item.getClientRects().length && !item.matches('[aria-disabled=true]'));
    const next = triggers[(triggers.indexOf(trigger) + direction + triggers.length) % triggers.length];
    closeMenus(true); next.focus();
    if (open && next.tagName === 'SUMMARY') openMenu(next.parentElement);
  }
  function createMenu(label, parent = actions) {
    const disclosure = element('details', 'usd-menu'); disclosure.dataset.usdMenu = label.toLowerCase();
    const trigger = element('summary', 'header-tool-button', label);
    const body = element('div', 'usd-menu-body'); body.setAttribute('aria-label', `${label} commands`);
    disclosure.addEventListener('toggle', positionMenus);
    disclosure.append(trigger, body); parent.append(disclosure); menus.push(disclosure);
    trigger.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') followMenu(trigger); });
    trigger.addEventListener('click', event => { event.preventDefault(); if (trigger.getAttribute('aria-disabled') === 'true') return; for (const other of menus) if (other !== disclosure) other.open = false; if (disclosure.open) disclosure.open = false; else openMenu(disclosure); });
    disclosure.addEventListener('keydown', event => {
      if (event.target !== trigger || !['ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(event.key)) return;
      if (trigger.getAttribute('aria-disabled') === 'true') return;
      event.preventDefault();
      if (event.key === 'ArrowDown') { for (const other of menus) if (other !== disclosure) other.open = false; openMenu(disclosure); body.querySelector('button:not(:disabled),a,select,input')?.focus(); }
      else nextMenu(trigger, event.key === 'ArrowRight' ? 1 : -1, disclosure.open);
    });
    body.addEventListener('keydown', event => {
      if (event.target.closest('select,input,textarea') || !['ArrowDown','ArrowUp','Home','End','ArrowLeft','ArrowRight'].includes(event.key)) return;
      const items = [...body.querySelectorAll('button:not(:disabled),a[href]:not([aria-disabled=true]),select:not(:disabled),input:not(:disabled),summary')]
        .filter(item => item.getClientRects().length && !item.closest('[hidden]'));
      const current = event.target.closest('button,a,summary');
      if (!items.includes(current)) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (current.tagName === 'SUMMARY') { current.parentElement.open = event.key === 'ArrowRight'; return; }
        nextMenu(trigger,event.key === 'ArrowRight' ? 1 : -1,true); return;
      }
      const index = items.indexOf(current), next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length-1 : (index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
      items[next]?.focus({preventScroll:true});
    });
    return [disclosure, body];
  }
  const [fileMenu, fileCommands] = createMenu('File');
  const [, viewCommands] = createMenu('View');
  const [layoutMenu, menu] = createMenu('Window');
  const [, helpCommands] = createMenu('Help');
  downloadControl = mountDownloadButton({
    container: header, getSource: () => downloadSource?.(),
    stateKey: 'needle-usd-download-format', menuAnchor: header,
    onOpenChange(open) { if (open) for (const menu of menus) menu.open = false; },
    onMenuNavigate(direction) { nextMenu(downloadControl.menuTrigger, direction, downloadControl.menuOpen); },
  });
  const downloadGroup = downloadControl.element;
  downloadControl.button.id = 'usd-download';
  downloadControl.menuTrigger.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') followMenu(downloadControl.menuTrigger); });
  downloadControl.button.addEventListener('click', () => closeMenus());
  const samples = button('Examples', () => { closeMenus(); setMenubarOpen(false); openPanel('examples'); });
  samples.disabled = true; samples.classList.add('usd-examples-menu'); fileMenu.after(samples);
  samples.setAttribute('aria-controls','usd-examples-panel');
  samples.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); nextMenu(samples, event.key === 'ArrowRight' ? 1 : -1, false); }
    if (event.key === 'ArrowDown') { event.preventDefault(); samples.click(); requestAnimationFrame(()=>examplesSearch.focus()); }
  });
  fileCommands.append(open, share);
  helpCommands.append(about); if (feedback) helpCommands.append(feedback);
  const engineRow = element('div', 'usd-menu-row', 'Viewer'); engineRow.append(engine); viewCommands.append(engineRow);
  const frameSelection=button('Frame selection',()=>{window.usdViewportInteraction?.focus();closeMenus();},'Frame selection or all (F)');
  frameSelection.append(element('kbd','','F'));viewCommands.append(frameSelection);
  const theme = element('select', 'usd-theme-select'); theme.setAttribute('aria-label', 'Color theme');
  for (const [value, text] of [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]) { const option = element('option', '', text); option.value = value; theme.append(option); }
  theme.value = read(THEME, 'system');
  const media = matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const dark = theme.value === 'dark' || theme.value === 'system' && media.matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    logo.querySelector('img').src = `/brand/logos/logo_needle_${dark ? 'white' : 'black'}_no_padding.svg`;
    document.dispatchEvent(new CustomEvent('usd-theme-change'));
  }
  theme.onchange = () => { save(THEME, theme.value); applyTheme(); }; media.addEventListener('change', applyTheme); applyTheme();
  const themeRow = element('label', 'usd-menu-row', 'Theme'); themeRow.append(theme); viewCommands.append(themeRow);
  viewCommands.classList.add('usd-view-menu');
  header.replaceChildren(identity, menuToggle, actions, fileContext, downloadGroup, input); header.className = 'header-tool usd-app-header'; header.setAttribute('role', 'banner');
  root.append(header);
  const workspace = element('main', 'usd-workspace'); workspace.setAttribute('aria-label', 'USD workspace'); root.append(workspace);
  const dockHost = element('div', 'usd-dock'); workspace.append(dockHost);
  // Compact screens display the same live panel elements one at a time. Dockview
  // keeps the desktop topology and dimensions, including explicit floating groups.
  const compact = element('div', 'usd-compact'); compact.hidden = true;
  const compactHeader = element('div', 'usd-compact-header');
  const back = button('Viewport', () => showCompact('viewport'), 'Back to viewport', 'arrow_back'); back.setAttribute('aria-label', 'Back to viewport');
  const compactPicker = element('select'); compactPicker.setAttribute('aria-label', 'Active panel');
  compactPicker.onchange = () => openPanel(compactPicker.value);
  const compactClose = button('', () => closePanel(compactPanel), 'Close panel'); compactClose.append(viewerIcon('close')); compactClose.setAttribute('aria-label', 'Close active panel');
  compactHeader.append(back, compactPicker, compactClose);
  const compactContent = element('div', 'usd-compact-content'), compactTimeline = element('div', 'usd-compact-timeline');
  compact.append(compactHeader, compactContent, compactTimeline); workspace.append(compact);
  const viewerHost = element('div', 'usd-viewer-layout'); workspace.append(viewerHost);
  const examplesDialog = element('dialog', 'usd-examples-dialog'); examplesDialog.id = 'usd-viewer-examples'; examplesDialog.setAttribute('aria-label', 'Examples');
  const examplesHeading = element('div', 'usd-examples-dialog-header');
  const closeExamples = button('', () => examplesDialog.close(), 'Close examples'); closeExamples.className = 'usd-tab-close'; closeExamples.setAttribute('aria-label', 'Close examples'); closeExamples.append(viewerIcon('close'));
  examplesHeading.append(element('strong', '', 'Examples'), closeExamples);
  const examplesContent = element('div', 'usd-examples-dialog-content'); examplesDialog.append(examplesHeading, examplesContent); root.append(examplesDialog);
  examplesDialog.addEventListener('close', () => { if (disposed) return; renderCompact(); if (productMode === 'viewer') (samples.getClientRects().length ? samples : menuToggle).focus({preventScroll:true}); });
  examplesDialog.addEventListener('click', event => { if (event.target !== examplesDialog) return; const box=examplesDialog.getBoundingClientRect(); if (event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom) examplesDialog.close(); });
  const mounts = new Map(); let compactPanel = 'viewport', isCompact = false, responsiveInitialized = false;
  const hosts = Object.fromEntries(Object.keys(definitions).map(id => { const host = element('section', `usd-panel usd-panel-${id}`); host.dataset.panel = id; parking.append(host); return [id, host]; }));
  hosts.examples.id='usd-examples-panel'; hosts.examples.append(samplePicker);
  const examplesBrowser=mountExamplesBrowser(samplePicker);
  parking.append(examplesSearch);
  examplesSearch.addEventListener('pointerdown', event => event.stopPropagation());
  examplesSearch.addEventListener('keydown', event => { if (event.key !== 'Escape') event.stopPropagation(); });
  function settingsGroup(title, expanded) {const group=element('details','usd-settings-section');group.open=expanded;const summary=element('summary');summary.append(viewerIcon('chevron_right'),document.createTextNode(title));group.append(summary);const body=element('div');group.append(body);viewCommands.append(group);return body;}
  const rendererSettings=settingsGroup('Rendering', true), viewSettings=settingsGroup('Scene', false);
  const cameraSettings=element('div','usd-camera-settings');viewSettings.append(cameraSettings);
  const helperSettings=settingsGroup('Helpers', false);

  const fileBar = document.querySelector('.filename-bar');
  for (const id of ['usd-detail-controls','usd-texture-controls','usd-background-controls']) {const control=document.getElementById(id);if(control)viewSettings.append(control);}
  const legacyVariants=document.getElementById('usd-variant-controls'); if(legacyVariants){legacyVariants.classList.add('usd-legacy-variants');parking.append(legacyVariants);}
  const clear = fileBar.querySelector('.clear-button'); clear.textContent = 'Close file'; commandIcon(clear,'close'); clear.classList.add('header-tool-button'); clear.hidden = true; fileCommands.append(clear);
  const conversion = document.getElementById('loaded-converter-toggle-wrap'); if (conversion) rendererSettings.append(conversion);
  const simulationControls = document.getElementById('usd-physics-controls');
  if (simulationControls) hosts.simulation.append(simulationControls);
  const simulationEmpty = element('div', 'usd-panel-empty', 'No simulation'); hosts.simulation.append(simulationEmpty);
  let physicsController=null, selectedPrim='';
  const physicsShortcut=element('div','usd-physics-shortcut');physicsShortcut.hidden=true;
  const interactSelection=button('Interact',async()=>{openPanel('simulation');await physicsController?.interact();},'Drag movable parts within their joint limits','play_arrow');
  physicsShortcut.append(interactSelection);hosts.properties.append(physicsShortcut);
  function updatePhysicsShortcut(){physicsShortcut.hidden=!physicsController?.canInteract(selectedPrim);hosts.properties.append(physicsShortcut);}
  const updateSimulation = () => { simulationEmpty.hidden = !!simulationControls && !simulationControls.hidden; };
  const simulationObserver = new MutationObserver(updateSimulation);
  if (simulationControls) simulationObserver.observe(simulationControls, {attributes:true,attributeFilter:['hidden']}); updateSimulation();
  parking.append(fileBar);
  const viewport = element('div', 'usd-viewport'); viewport.id = 'usd-viewport';
  hosts.viewport.append(viewport);
  const emptyHint = document.querySelector('#dropzone .dropzone-subtitle'); if (emptyHint) emptyHint.textContent = 'or choose File → Open or Examples';
  for (const id of ['dropzone', 'loading-overlay', 'usd-load-error']) { const node = document.getElementById(id); if (node) viewport.append(node); }
  const replHost = element('div', 'usd-console-editor'); hosts.console.append(replHost);
  const footer = document.querySelector('.footer');
  if (footer) { const diagnostics=element('details','usd-console-diagnostics');diagnostics.append(element('summary','','Log'),footer);hosts.console.append(diagnostics); }
  const placeholders = new Map();
  for (const id of ['stage', 'properties', 'layers', 'timeline']) { const text = element('div', 'usd-panel-empty', id === 'timeline' ? 'No animation' : 'No stage loaded'); placeholders.set(id, text); hosts[id].append(text); }
  document.getElementById('top-center')?.remove(); document.body.prepend(root);
  let restoring = true, persistTimer, disposed = false, layoutFrame, resizeFrame, stageRevealFrame;
  const visibilityListeners = new Set(), disposeListeners = new Set();
  let state = previousWorkspace;
  const migrating = !state;
  state ||= read('needle-usd-workspace-v1', { current: null, presets: {} });
  let awaitingStage = state.awaitingStage ?? !state.current;
  let stageInfo = null;
  let desktopWidth = state.current?.grid?.width || Math.max(1100, workspace.clientWidth);
  let desktopHeight = state.current?.grid?.height || workspace.clientHeight;
  const dock = createDockview(dockHost, {
    disableAutoResizing: true,
    theme: { name: 'needle-usd', className: 'dockview-theme-needle-usd', gap: 1 },
    defaultTabComponent: 'usd-tab', keyboardNavigation: true, floatingGroupDragHandle: 'tabbar', disableTabsOverflowList: true,
    popoutUrl: `${location.origin}/viewer-popout.html`,
    createRightHeaderActionComponent(group) {
      const slot=element('div','usd-examples-search-slot'); slot.hidden=true;
      return {element:slot, init() { searchSlots.set(group.id,slot); }, dispose() {
        if (examplesSearch.parentElement===slot) parking.append(examplesSearch);
        searchSlots.delete(group.id);
      }};
    },
    createComponent({ name }) {
      const wrapper = element('div', 'usd-panel-mount');
      return { element: wrapper, init() { mounts.set(name, wrapper); wrapper.append(hosts[name]); }, dispose() { if (mounts.get(name) === wrapper) { mounts.delete(name); parking.append(hosts[name]); } } };
    },
    createTabComponent() {
      const tab = element('div', 'usd-dock-tab'), caption = element('span', 'usd-dock-caption'); tab.append(caption);
      let subscription;
      return { element: tab, init({ api, title }) {
        caption.textContent = title; subscription = api.onDidTitleChange(event => { caption.textContent = event.title; });
        if (api.id !== 'viewport') { const close = button('', event => { event.stopPropagation(); closePanel(api.id); }, `Close ${title}`); close.append(viewerIcon('close')); close.className = 'usd-tab-close'; close.setAttribute('aria-label', `Close ${title}`); close.onpointerdown = event => event.stopPropagation(); tab.append(close); }
        tab.ondblclick = () => api.isMaximized() ? api.exitMaximized() : api.maximize();
      }, dispose() { subscription?.dispose(); } };
    },
    getTabContextMenuItems: ({ panel }) => [
      { label: panel.api.isMaximized() ? 'Restore' : 'Maximize', action: () => panel.api.isMaximized() ? panel.api.exitMaximized() : panel.api.maximize() },
      { label: 'Float panel', action: () => dock.addFloatingGroup(panel, { width: Math.max(360, panel.api.width), height: Math.max(240, panel.api.height), dragHandle: panel.id === 'viewport' ? 'titlebar' : 'tabbar' }) },
      ...(panel.id === 'viewport' ? [] : [{ label: 'Open in window', action: () => void popout(panel.id) }, 'close']),
    ],
  });
  dock.layout(desktopWidth, desktopHeight);
  const codePane=mountLazyCodePane(hosts.code,{isVisible:()=>!restoring && isPanelVisible('code')});
  function add(id, position) { const [title, minimumWidth, minimumHeight] = definitions[id]; return dock.addPanel({ id, title, component: id, minimumWidth, minimumHeight, renderer: 'always', ...(position ? { position } : {}) }); }
  function defaultKind() { return workspace.clientWidth < COMPACT_WIDTH ? 'viewport' : workspace.clientWidth < 1100 ? 'review' : 'inspect'; }
  function defaults(kind = defaultKind(), explicit = true) {
    if (explicit) { awaitingStage = false; }
    const browsing = !explicit && isPanelVisible('examples'), browserWidth=dock.getPanel('examples')?.api.width;
    state.preset = kind; presets.value = kind;
    restoring = true; compactPanel = 'viewport'; dock.clear();
    add('viewport');
    if (kind !== 'viewport') {
      add('stage', { referencePanel: 'viewport', direction: 'left' });
      add('layers', { referencePanel: 'stage', direction: 'within' });
      add('examples', { referencePanel: 'stage', direction: 'within' });
      if (kind === 'inspect') {
        add('properties', { referencePanel: 'viewport', direction: 'right' });
      }
      dock.getPanel('stage').api.setActive();
      dock.getPanel('stage').api.setSize({ width: navigationWidth });
    }
    if (kind === 'viewport' && !explicit && !new URLSearchParams(location.search).get('file')) { add('examples',{referencePanel:'viewport',direction:'left'}).api.setSize({width:state.examplesWidth||dimension('examples-width',360)}); }
    if (browsing && dock.getPanel('examples')) { dock.getPanel('examples').api.setActive(); dock.getPanel('examples').api.setSize({width:browserWidth}); }
    dock.getPanel('properties')?.api.setSize({ width: inspectorWidth });
    dock.getPanel('viewport').api.setActive(); restoring = false; layoutResponsive();
  }
  function restore(layout) {
    restoring = true;
    try { dock.fromJSON(layout); if (!dock.getPanel('viewport')) throw new Error('Missing viewport'); dock.getPanel('settings')?.api.close(); }
    catch { defaults(undefined, false); }
    finally { restoring = false; }
    layoutResponsive();
  }
  function persist() {
    if (disposed || restoring || productMode !== 'studio') return;
    clearTimeout(persistTimer); persistTimer = setTimeout(() => {
      if (productMode === 'studio') saveStudioLayout();
    }, 150);
  }
  function saveStudioLayout() { clearTimeout(persistTimer); state.current = dock.toJSON(); state.awaitingStage = awaitingStage; save(STORAGE, state); }
  function setProductMode(next) {
    if (!validMode(next) || next === productMode) return;
    if (productMode === 'studio') saveStudioLayout();
    if (examplesDialog.open) examplesDialog.close();
    closeMenus(); setMenubarOpen(false);
    productMode = next; save(PRODUCT_MODE, next);
    const url = new URL(location.href); url.searchParams.set('workspace', next); history.replaceState({}, '', url);
    productSelect.value = next;
    if (next === 'studio' && awaitingStage && stageInfo) { awaitingStage = false; defaults(defaultKind(), false); }
    else layoutResponsive();
  }
  function showCompact(id) { compactPanel = id; renderCompact(); }
  function isPanelVisible(id) { if (productMode === 'viewer') return id === 'viewport' || id === 'examples' && examplesDialog.open; const panel=dock.getPanel(id); return !!panel && (isCompact ? compactPanel===id : panel.api.isVisible); }
  function notifyVisibility() {
    if (disposed || restoring) return;
    codePane.refreshVisibility();
    for (const subscription of visibilityListeners) {
      const visible = isPanelVisible(subscription.id);
      if (visible !== subscription.visible) { subscription.visible = visible; subscription.callback(visible); }
    }
  }
  function placeExamplesSearch() {
    let target=parking;
    if (productMode==='viewer' && examplesDialog.open) target=examplesHeading;
    else if (productMode==='studio' && isPanelVisible('examples')) {
      target=isCompact ? compactHeader : searchSlots.get(dock.getPanel('examples')?.group.id) || parking;
    }
    for (const slot of searchSlots.values()) slot.hidden=slot!==target;
    if (examplesSearch.parentElement!==target) {
      if (target.moveBefore && examplesSearch.isConnected && target.isConnected && target.ownerDocument===examplesSearch.ownerDocument) target.moveBefore(examplesSearch,target===examplesHeading?closeExamples:target===compactHeader?compactClose:null);
      else target.insertBefore(examplesSearch,target===examplesHeading?closeExamples:target===compactHeader?compactClose:null);
    }
  }
  function notifyExamples() { placeExamplesSearch(); const visible=isPanelVisible('examples'); samples.setAttribute('aria-controls', productMode === 'viewer' ? examplesDialog.id : hosts.examples.id); samples.setAttribute('aria-expanded', String(visible)); samples.setAttribute('aria-pressed',String(visible)); if(samplePicker.dataset.visible===String(visible))return; samplePicker.dataset.visible=String(visible); samplePicker.dispatchEvent(new CustomEvent('usd-examples-visibility',{detail:visible})); }
  function moveHost(id, target) {
    if (hosts[id].parentElement === target) return;
    if (target.moveBefore && hosts[id].isConnected && target.isConnected && hosts[id].ownerDocument === target.ownerDocument) target.moveBefore(hosts[id], null);
    else target.append(hosts[id]);
  }
  function renderCompact() {
    viewerHost.hidden = productMode !== 'viewer';
    if (productMode === 'viewer') {
      moveHost('viewport', viewerHost); moveHost('examples', examplesDialog.open ? examplesContent : parking);
      compact.hidden = true; updateViewportVisibility(); notifyExamples(); notifyVisibility(); return;
    }
    // Move only when the destination changes, preserving focus and scroll state.
    if (!dock.getPanel(compactPanel) || dock.getPanel(compactPanel).api.location.type === 'popout') compactPanel = 'viewport';
    updateViewportVisibility();
    const showTimeline = isCompact && compactPanel === 'viewport' && !!dock.getPanel('timeline');
    for (const [id, wrapper] of mounts) {
      const target = isCompact && id === compactPanel ? compactContent : showTimeline && id === 'timeline' ? compactTimeline : wrapper;
      moveHost(id, target);
    }
    compact.hidden = !isCompact; notifyExamples(); notifyVisibility();
    if (!isCompact) return;
    compactHeader.hidden = compactPanel === 'viewport';
    compactPicker.replaceChildren();
    for (const panel of dock.panels) {
      if (panel.id === 'viewport' || panel.id === 'timeline' || panel.api.location.type === 'popout') continue;
      const option = element('option', '', definitions[panel.id][0]); option.value = panel.id; compactPicker.append(option);
    }
    compactPicker.value = compactPanel;
    compactPicker.hidden = compactPanel === 'examples';
    compactTimeline.hidden = !showTimeline;
  }
  function closePanel(id) {
    if (productMode === 'viewer' && id === 'examples') { examplesDialog.close(); return; }
    if (id === 'viewport') return;
    if(id==='examples')state.examplesWidth=dock.getPanel(id)?.api.width||state.examplesWidth;
    awaitingStage = false;
    dock.getPanel(id)?.api.close();
    if (compactPanel === id) compactPanel = 'viewport';
    renderCompact(); persist();
  }
  function openPanel(id, focus = true) {
    // Compatibility with saved commands: controls now live directly in View.
    if (id === 'settings') { closeMenus(true); if (menuToggle.getClientRects().length) setMenubarOpen(true); const menu = viewCommands.parentElement; menu.open = true; positionMenus(); return; }
    if (productMode === 'viewer') {
      if (id === 'examples') { if (!examplesDialog.open) examplesDialog.showModal(); renderCompact(); return; }
      if (id === 'viewport') { examplesDialog.close(); return; }
      setProductMode('studio');
    }
    if (!restoring && focus && id !== 'examples') { awaitingStage = false; }
    let panel = dock.getPanel(id);
    if (!panel) {
      const sibling = { stage: dock.getPanel('layers')?'layers':'examples', layers: dock.getPanel('stage')?'stage':'examples', examples: dock.getPanel('stage')?'stage':'layers', simulation: 'properties', properties: 'simulation', console: 'timeline', timeline: 'console', code: dock.getPanel('properties')?'properties':'simulation' }[id];
      const peer = dock.getPanel(sibling);
      const direction = ['stage','layers','examples'].includes(id) ? 'left' : id === 'timeline' && peer ? 'above' : id === 'console' || id === 'timeline' ? 'below' : 'right';
      // Timeline always retains its own short strip; Console sits below it.
      const tabbed = peer && !['console', 'timeline'].includes(id);
      panel = add(id, { referencePanel: peer ? sibling : 'viewport', direction: tabbed ? 'within' : direction });
      if (!tabbed) panel.api.setSize(id === 'timeline' ? { height: timelineHeight } : id === 'console' ? { height: consoleHeight } : { width: id === 'examples' ? state.examplesWidth||dimension('examples-width',360) : id === 'stage' || id === 'layers' ? navigationWidth : inspectorWidth });
    }
    if (focus) {
      if (workspace.clientWidth >= COMPACT_WIDTH) {
        const maximized = dock.panels.find(candidate => candidate.api.isMaximized());
        if (maximized && maximized.group !== panel.group) maximized.api.exitMaximized();
      }
      panel.api.setActive();
      if (panel.api.location.type === 'popout') {
        dock.getPopouts().find(({ group }) => group.panels.some(candidate => candidate.id === id))?.window.focus();
      } else if (workspace.clientWidth < COMPACT_WIDTH) compactPanel = id === 'timeline' ? 'viewport' : id;
    }
    renderCompact(); persist(); return panel;
  }
  async function popout(id) {
    const panel = dock.getPanel(id); if (!panel || id === 'viewport') return;
    await dock.addPopoutGroup(panel, { popoutUrl: `${location.origin}/viewer-popout.html` });
  }
  document.addEventListener('usd-theme-change', () => { for (const popout of dock.getPopouts()) popout.window.document.documentElement.dataset.theme = document.documentElement.dataset.theme; });
  dock.onDidAddPopoutGroup(({ window: child }) => { child.document.documentElement.dataset.theme = document.documentElement.dataset.theme; });
  function hideViewportHeader() {
    let changed = false;
    for (const group of dock.groups) {
      const hidden = group.panels.length === 1 && group.panels[0].id === 'viewport';
      if (group.header.hidden !== hidden) { group.header.hidden = hidden; changed = true; }
    }
    return changed;
  }
  function scheduleLayout() { cancelAnimationFrame(layoutFrame); layoutFrame = requestAnimationFrame(layoutResponsive); }
  function revealStageAfterLayout() {
    // Dockview queues its overlay bounds/visibility update after the active-panel
    // event. Queue our frame after those handlers, then reveal within the tree.
    queueMicrotask(() => {
      if (disposed) return;
      cancelAnimationFrame(stageRevealFrame);
      stageRevealFrame = requestAnimationFrame(() => {
        if (!disposed && isPanelVisible('stage')) window.usdStagePanel?.revealSelection?.();
      });
    });
  }
  const subscriptions = [dock.onDidActivePanelChange(()=>{notifyExamples();notifyVisibility();revealStageAfterLayout();persist();}), dock.onDidLayoutChange(() => { if (hideViewportHeader()) scheduleLayout(); notifyVisibility(); persist(); }), dock.onDidRemovePanel(() => { scheduleLayout(); notifyVisibility(); persist(); })];
  const presets = element('select'); presets.setAttribute('aria-label', 'Workspace layout');
  function refreshPresets() {
    presets.replaceChildren();
    for (const [value, text] of [['inspect', 'Inspect'], ['review', 'Review'], ['viewport', 'Viewport'], ...Object.keys(state.presets || {}).map(name => ['saved:' + name, name])]) { const option = element('option', '', text); option.value = value; presets.append(option); }
    presets.value = state.preset || (awaitingStage ? 'viewport' : 'inspect');
  }
  refreshPresets();
  presets.onchange = () => { state.preset = presets.value; awaitingStage = false; compactPanel = 'viewport'; if (presets.value.startsWith('saved:')) { restore(state.presets[presets.value.slice(6)]); layoutResponsive(); } else defaults(presets.value); };
  const presetRow = element('label', 'usd-menu-row', 'Workspace'); presetRow.append(presets); menu.append(presetRow);
  menu.append(button('Viewport', () => { openPanel('viewport'); closeMenus(); }));
  menu.append(element('div', 'usd-menu-label', 'Panels'));
  const panelChecks = [];
  const panelIcons = { stage:'account_tree', properties:'tune', layers:'layers', timeline:'timeline', console:'terminal', simulation:'play_arrow', examples:'folder_open' };
  for (const [id, [title]] of Object.entries(definitions)) {
    if (id === 'viewport' || id === 'settings') continue;
    const label = element('label', 'usd-menu-row', title), check = element('input'); check.type = 'checkbox'; check.setAttribute('aria-label', `Show ${title}`);
    label.prepend(id==='code'?codeIcon():viewerIcon(panelIcons[id])); label.classList.add('usd-panel-menu-item'); label.append(check); check.onchange = () => { if (check.checked) openPanel(id); else closePanel(id); closeMenus(); };
    panelChecks.push([id,check]); menu.append(label);
  }
  const floatCommand = button('Float active panel', () => { const panel = dock.activePanel; if (panel) dock.addFloatingGroup(panel, { width: 440, height: 420, dragHandle: panel.id === 'viewport' ? 'titlebar' : 'tabbar' }); closeMenus(); });
  const maximizeCommand = button('Maximize / restore', () => { const panel = dock.activePanel; if (panel) panel.api.isMaximized() ? panel.api.exitMaximized() : panel.api.maximize(); closeMenus(); });
  const popoutCommand = button('Open panel in window', () => { if (dock.activePanel) void popout(dock.activePanel.id); closeMenus(); });
  menuUpdates.set(layoutMenu, () => {
    for (const [id,check] of panelChecks) { check.checked = !!dock.getPanel(id) && (!isCompact || id === compactPanel || id === 'timeline' && compactPanel === 'viewport'); }
    floatCommand.disabled = maximizeCommand.disabled = isCompact;
    popoutCommand.disabled = isCompact || !dock.activePanel || dock.activePanel.id === 'viewport';
  });
  menu.append(floatCommand, maximizeCommand, popoutCommand,
    button('Reset layout', () => { defaults(); layoutMenu.open = false; }));
  const name = element('input'); name.placeholder = 'Layout name'; name.setAttribute('aria-label', 'Layout name');
  const saveRow = element('div', 'usd-menu-save'); saveRow.append(name, button('Save', () => { const key = name.value.trim(); if (!key) return; awaitingStage = false; state.awaitingStage = false; state.presets ||= {}; state.presets[key] = dock.toJSON(); state.preset = 'saved:' + key; save(STORAGE, state); refreshPresets(); presets.value = 'saved:' + key; name.value = ''; })); menu.append(saveRow);
  function closeMenus(keepMenubar = false) { for (const disclosure of menus) disclosure.open = false; downloadControl?.closeMenu(); if (!keepMenubar) setMenubarOpen(false); }
  const onOutsideMenu = event => { if (!actions.contains(event.target) && !menuToggle.contains(event.target) && !downloadControl.element.contains(event.target)) { closeMenus(); setMenubarOpen(false); } };
  const onMenuKey = event => { if (event.key === 'Escape') { const active = menus.find(menu => menu.open), mobileOpen = root.dataset.menuOpen === 'true' && menuToggle.getClientRects().length; closeMenus(); if (mobileOpen) menuToggle.focus(); else active?.firstElementChild.focus(); } };
  document.addEventListener('pointerdown', onOutsideMenu);
  document.addEventListener('keydown', onMenuKey);
  for (const body of [fileCommands, helpCommands]) body.addEventListener('click', event => { if (event.target.closest('button,a')) closeMenus(); });
  if (state.current) restore(state.current); else defaults('viewport', false);
  if (!state.examplesPanelIntroduced) { const active=dock.activePanel; if(state.current && !dock.getPanel('examples'))add('examples',{referencePanel:'viewport',direction:'left'}).api.setSize({width:state.examplesWidth||dimension('examples-width',360)}); active?.api.setActive(); state.examplesPanelIntroduced=true; }
  if (migrating) dock.getPanel('console')?.api.close();
  restoring = false;
  function layoutResponsive() {
    const width = workspace.clientWidth, height = workspace.clientHeight;
    root.dataset.mode = workspace.dataset.mode = productMode; layoutMenu.hidden = productMode !== 'studio';
    document.title = productMode === 'studio' ? 'USD Studio — Needle' : 'USD Viewer — Needle';
    dockHost.inert = productMode === 'viewer';
    if (productMode === 'viewer') { workspace.dataset.compact = 'false'; renderCompact(); positionMenus(); return; }
    const compactNext=width < COMPACT_WIDTH;
    if(responsiveInitialized && compactNext && !isCompact && dock.activePanel?.id==='examples')compactPanel='examples';
    isCompact = compactNext;responsiveInitialized=true;
    workspace.dataset.compact = String(isCompact);
    if (!isCompact) { desktopWidth = width; desktopHeight = height; }
    dockHost.style.width = `${desktopWidth}px`; dockHost.style.height = `${desktopHeight}px`;
    renderCompact(); hideViewportHeader();
    dock.layout(desktopWidth, desktopHeight); positionMenus(); persist();
  }
  layoutResponsive();
  // Layout writes belong in an animation frame, never inside ResizeObserver delivery.
  const observer = new ResizeObserver(scheduleLayout); observer.observe(workspace); observer.observe(header);
  let previousSize = '';
  function updateViewportVisibility() {
    // Compact panels retain desktop geometry, so size alone cannot indicate visibility.
    const rect = viewport.getBoundingClientRect();
    window.usdViewportVisible = (productMode === 'viewer' || !isCompact || compactPanel === 'viewport') && rect.width > 0 && rect.height > 0;
  }
  const viewportObserver = new ResizeObserver(() => {
    const rect = viewport.getBoundingClientRect(), key = `${rect.width}:${rect.height}`;
    updateViewportVisibility();
    if (key !== previousSize) { previousSize = key; cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => window.dispatchEvent(new Event('usd-viewport-resize'))); }
  }); viewportObserver.observe(viewport);
  const loadedObserver = new MutationObserver(() => {
    root.dataset.loaded = String(header.classList.contains('have-custom-file'));
    const text = document.querySelector('.filename-text')?.textContent?.trim();
    if (fileContext.textContent !== (text || 'Untitled')) fileContext.textContent = text || 'Untitled';
    clear.hidden = root.dataset.loaded !== 'true';
  }); loadedObserver.observe(header, { attributes: true }); loadedObserver.observe(fileBar, { subtree: true, characterData: true, childList: true });
  const api = {
    dock, viewport, code: codePane, get mode() { return productMode; }, setMode: setProductMode,
    onPanelVisibility(id, callback) {
      if (disposed) return () => {};
      const subscription = {id, callback, visible:isPanelVisible(id)}; visibilityListeners.add(subscription);
      callback(subscription.visible);
      return () => visibilityListeners.delete(subscription);
    },
    onDispose(callback) { if (disposed) { callback(); return () => {}; } disposeListeners.add(callback); return () => disposeListeners.delete(callback); },
    setDownload(getSource) { downloadSource = getSource; downloadControl.refresh(); },
    containers: { helpers: helperSettings, settings: rendererSettings, view: cameraSettings, stage: hosts.stage, properties: hosts.properties, layers: hosts.layers, timeline: hosts.timeline, console: replHost },
    openPanel, isPanelVisible, exampleChosen() { if (productMode === 'viewer') examplesDialog.close(); else if(isCompact)showCompact('viewport'); }, reset: defaults, setReady() { open.disabled = input.disabled = samples.disabled = false; },
    async prepareStage() {
      if (productMode === 'viewer') return;
      if (!awaitingStage) return;
      // Establish the canvas dimensions before either loader fits its camera.
      awaitingStage = false; defaults(defaultKind(), false);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    },
    setStage(info) {
      stageInfo = info;
      for (const [id, placeholder] of placeholders) placeholder.hidden = !!info;
      if (productMode === 'studio' && info && awaitingStage) { awaitingStage = false; defaults(defaultKind(), false); }
      // Stage metadata updates content only. Timeline visibility and placement
      // belong to the saved workspace, including when the stage has no animation.
      placeholders.get('timeline').hidden = !!info?.time;
    },
    setPhysics(controller,path=selectedPrim) { physicsController=controller;selectedPrim=path;updatePhysicsShortcut(); },
    selectPrim(path) { selectedPrim=path;updatePhysicsShortcut();codePane.follow(path); if(productMode === 'studio' && path && !isCompact && !isPanelVisible('code')) openPanel('properties'); },
    dispose() { if (disposed) return; disposed = true; examplesDialog.close(); for (const callback of disposeListeners) callback(); disposeListeners.clear(); visibilityListeners.clear(); downloadControl.dispose(); document.removeEventListener('pointerdown', onOutsideMenu); document.removeEventListener('keydown', onMenuKey); media.removeEventListener('change', applyTheme); cancelAnimationFrame(layoutFrame); cancelAnimationFrame(resizeFrame); cancelAnimationFrame(stageRevealFrame); clearTimeout(persistTimer); observer.disconnect(); viewportObserver.disconnect(); loadedObserver.disconnect(); examplesBrowser.dispose(); codePane.dispose(); simulationObserver.disconnect(); subscriptions.forEach(s => s.dispose()); dock.dispose(); },
  };
  window.addEventListener('pagehide', () => { if (!disposed && productMode === 'studio') saveStudioLayout(); }, { once: true });
  return api;
}
