import { installViewerStyle } from './style.js';
import { inspectStage, inspectPrim, setVariant, setPayloadLoaded, stageCameras } from '../scene/index.js';

// Consolidated from the USD-WG viewer. Native handles remain owned by Hydra.
export async function mountStagePanel({ handle, stage, scene, camera, controls, container = document.body, beforeEdit = () => {}, afterEdit = () => {}, isCurrent = () => true, setCamera = () => {}, onVariantChange = () => {}, style = true }) {
  if (style) installViewerStyle();
  let disposed = false, editing = false, selectedPath = '', activeCamera = '', currentPurpose = 'default,render', frame, info;
  const panel = document.createElement('aside'); panel.id = 'usd-suite'; panel.className = 'usd-suite';
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = 'Stage';
  toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'usd-suite-content');
  const content = document.createElement('div'); content.id = 'usd-suite-content'; content.hidden = true;
  const heading = document.createElement('div'); heading.className = 'usd-suite-heading';
  const title = document.createElement('strong'); title.textContent = 'Stage';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Close stage');
  heading.append(title, close); content.append(heading); panel.append(toggle, content); container.append(panel);
  function open(value) { content.hidden = !value; toggle.setAttribute('aria-expanded', String(value)); }
  toggle.onclick = () => open(content.hidden); close.onclick = () => open(false);
  const status = document.createElement('div'); status.setAttribute('role', 'status');
  function section(title, expanded = true) {
    const group = document.createElement('details'); group.open = expanded;
    const summary = document.createElement('summary'); summary.textContent = title; group.append(summary); content.append(group); return group;
  }
  const view = section('View'), variants = section('Variants'), payloads = section('Payloads'), hierarchy = section('Prims'), properties = section('Properties'), layers = section('Layers', false);
  content.append(status);
  function row(parent, text, element) { const label = document.createElement('label'); label.textContent = text; label.append(element); parent.append(label); return element; }
  function dropdown(parent, label, options, value, change) {
    const select = document.createElement('select'); select.setAttribute('aria-label', label);
    for (const [id, text] of options) { const option = document.createElement('option'); option.value = id; option.textContent = text; select.append(option); }
    select.value = value; select.onchange = () => change(select.value); row(parent, label, select); return select;
  }
  async function edit(action) {
    if (editing || disposed || !isCurrent()) return;
    editing = true; status.textContent = '';
    panel.querySelectorAll('select,input,button').forEach(control => { control.disabled = true; });
    try {
      await beforeEdit(); await action(); await handle.materialsReady?.();
      if (disposed || !isCurrent()) return;
      await afterEdit();
      if (disposed || !isCurrent()) return;
      refresh();
    } catch (error) { status.textContent = error.message; console.error('USD stage edit failed', error); }
    finally { editing = false; panel.querySelectorAll('select,input,button').forEach(control => { control.disabled = false; }); }
  }
  let authoredCameras = [];
  function selectCamera(path) {
    activeCamera = path;
    const selected = authoredCameras.find(candidate => candidate.userData.usdPath === path);
    if (!selected) activeCamera = '';
    setCamera(selected || camera);
    controls.enabled = !selected;
  }
  function showProperties(path) {
    selectedPath = path;
    properties.replaceChildren(properties.firstElementChild);
    const data = inspectPrim(stage, path, handle.getTime?.() || 0);
    if (!data) return;
    const name = document.createElement('code'); name.textContent = path; properties.append(name);
    const table = document.createElement('table');
    for (const [key, value] of [ ...Object.entries(data.metadata), ...data.attributes.map(attr => [attr.name, attr.value]), ...data.relationships.map(rel => [rel.name, rel.targets.join(', ')]) ]) {
      const tr = document.createElement('tr'), th = document.createElement('th'), td = document.createElement('td');
      th.textContent = key; td.textContent = String(value); tr.append(th, td); table.append(tr);
    }
    properties.append(table); properties.open = true;
  }
  function refresh() {
    if (disposed || !isCurrent()) return;
    info = inspectStage(stage);
    view.replaceChildren(view.firstElementChild); variants.replaceChildren(variants.firstElementChild); payloads.replaceChildren(payloads.firstElementChild);
    hierarchy.replaceChildren(hierarchy.firstElementChild); layers.replaceChildren(layers.firstElementChild);
    authoredCameras = stageCameras(scene);
    dropdown(view, 'Camera', [['', 'Free'], ...authoredCameras.map(cam => [cam.userData.usdPath, cam.userData.usdPath])], activeCamera, selectCamera);
    selectCamera(activeCamera);
    const purposes = [['default,render', 'Default + render'], ['default', 'Default'], ['render', 'Render'], ['proxy', 'Proxy'], ['guide', 'Guide'], ['default,render,proxy,guide', 'All']];
    const included = handle.driver?.GetIncludedPurposes?.();
    let purpose = currentPurpose;
    if (included) { try { purpose = Array.from({ length: included.size() }, (_, i) => included.get(i)).join(','); } finally { included.delete?.(); } }
    dropdown(view, 'Purpose', purposes, purpose, value => edit(async () => { await handle.setIncludedPurposes(value.split(',')); currentPurpose = value; }));
    for (const variant of info.variants) {
      const select = dropdown(variants, `${variant.path} · ${variant.setName}`, variant.choices.map(value => [value, value]), variant.selection,
        value => edit(async () => {
          await setVariant(handle, variant.path, variant.setName, value);
          onVariantChange(variant.path, variant.setName, value);

        }));
      select.dataset.stageVariant = variant.setName;
    }
    variants.hidden = !info.variants.length;
    for (const payload of info.payloads) {
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = payload.loaded; input.setAttribute('aria-label', `Load ${payload.path}`);
      input.onchange = () => edit(() => setPayloadLoaded(handle, payload.path, input.checked)); row(payloads, payload.path, input);
    }
    payloads.hidden = !info.payloads.length;
    const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Filter prims'; search.setAttribute('aria-label', 'Filter prims'); hierarchy.append(search);
    const tree = document.createElement('div'); tree.className = 'usd-prim-tree'; hierarchy.append(tree);
    function drawTree() {
      tree.replaceChildren();
      for (const prim of info.prims) {
        if (search.value && !`${prim.path} ${prim.type}`.toLowerCase().includes(search.value.toLowerCase())) continue;
        const button = document.createElement('button'); button.type = 'button'; button.textContent = `${prim.name}  ${prim.type}`;
        button.title = prim.path; button.dataset.primPath = prim.path;
        button.style.paddingLeft = `${8 + (prim.path.split('/').length - 2) * 12}px`;
        button.onclick = () => showProperties(prim.path); tree.append(button);
      }
    }
    search.oninput = drawTree; drawTree();
    for (const layer of info.layers) { const item = document.createElement('div'); item.className = 'usd-layer'; item.textContent = layer.identifier || layer.realPath || JSON.stringify(layer); layers.append(item); }
    if (info.errors.length) status.textContent = info.errors.join('\n');
    if (selectedPath) showProperties(selectedPath);
  }
  const timeline = document.createElement('div'); timeline.className = 'usd-timeline';
  const metadata = handle.stageMetadata();
  if (metadata.endTimeCode > metadata.startTimeCode) {
    const play = document.createElement('button'); play.type = 'button'; play.setAttribute('aria-label', 'Play or pause');
    play.onclick = () => handle.setPlaying(!handle.isPlaying());
    const slider = document.createElement('input'); slider.type = 'range'; slider.min = metadata.startTimeCode; slider.max = metadata.endTimeCode; slider.step = 'any'; slider.setAttribute('aria-label', 'Time code');
    const output = document.createElement('output'); let pendingTime, seeking = false;
    async function seek() {
      if (seeking) return; seeking = true;
      try { while (pendingTime !== undefined && !disposed && isCurrent()) { const time = pendingTime; pendingTime = undefined; await handle.setTime(time); } }
      catch (error) { status.textContent = error.message; } finally { seeking = false; }
    }
    slider.oninput = () => { handle.setPlaying(false); pendingTime = Number(slider.value); void seek(); };
    timeline.append(play, slider, output); container.append(timeline);
    function tick() { if (disposed) return; const time = handle.getTime(); slider.value = time; output.value = time.toFixed(1); play.textContent = handle.isPlaying() ? 'Pause' : 'Play'; frame = requestAnimationFrame(tick); }
    tick();
  }
  refresh();
  return { refresh, dispose() { if (disposed) return; disposed = true; cancelAnimationFrame(frame); selectCamera(''); panel.remove(); timeline.remove(); setCamera(camera); } };
}
