// Add a dataset URL here to register another built-in example folder.
export const DEFAULT_COLLECTIONS = [
  {title:'NVIDIA SimReady',url:'https://huggingface.co/datasets/nvidia/simready-assets'},
  {title:'AGIBOT SimReady',url:'https://huggingface.co/datasets/agibot-assets/simready-assets'},
];

const encodePath = path => path.split('/').map(encodeURIComponent).join('/');
const dirname = path => path.slice(0, path.lastIndexOf('/'));

/** Collection URLs are dataset roots or a folder at a particular revision. */
export function parseCollection(value) {
  const url = new URL(value);
  const match = url.hostname === 'huggingface.co' && url.pathname.match(/^\/datasets\/([^/]+\/[^/]+)(?:\/tree\/([^/]+)(?:\/(.*))?)?\/?$/);
  if (!match) throw new Error('Use a Hugging Face dataset or dataset folder URL.');
  const repository = decodeURIComponent(match[1]), revision = decodeURIComponent(match[2] || 'main');
  const folder = decodeURIComponent(match[3] || '').replace(/\/$/, '');
  return {repository, revision, folder, url:`https://huggingface.co/datasets/${repository}${revision === 'main' && !folder ? '' : `/tree/${encodeURIComponent(revision)}${folder ? '/'+encodePath(folder) : ''}`}`};
}

/** Read the published inventory and root declarations; never download geometry
 * or invent previews to populate a collection. Revisions are pinned per load. */
export function createCollectionLibrary(value, {request = globalThis.fetch} = {}) {
  const collection = parseCollection(value);
  let pending;
  async function json(url) {
    const response = await request(url);
    if (!response.ok) throw new Error(`Collection: HTTP ${response.status}`);
    return {data:await response.json(), next:response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1]};
  }
  async function load() {
    pending ||= (async () => {
      const api = `https://huggingface.co/api/datasets/${collection.repository}`;
      const {data:info} = await json(`${api}/revision/${encodeURIComponent(collection.revision)}`);
      const revision = info.sha;
      if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Collection has no revision.');
      let next = `${api}/tree/${revision}${collection.folder ? '/'+encodePath(collection.folder) : ''}?recursive=true&limit=1000`;
      const entries = [];
      while (next) {
        const page = await json(next);
        if (!Array.isArray(page.data)) throw new Error('Invalid collection inventory.');
        entries.push(...page.data); next = page.next;
        if (next && !next.startsWith(api+'/tree/')) throw new Error('Invalid collection pagination.');
      }
      const files = new Map(entries.filter(entry=>entry.type==='file').map(entry=>[entry.path,entry]));
      const resolve = path => `https://huggingface.co/datasets/${collection.repository}/resolve/${revision}/${encodePath(path)}`;
      const packages = [...files.keys()].filter(path=>path.endsWith('/com.nvidia.simready.packaging.json')).map(dirname).sort();
      const roots = new Set();
      for (const pkg of packages) {
        const declarations = `${pkg}/.metadata/com.nvidia.simready.root_usds.json`;
        if (files.has(declarations)) {
          const {data} = await json(resolve(declarations));
          for (const path of data.entries || []) {
            const root = `${pkg}/${path.replace(/^\.\//,'')}`;
            if (files.has(root)) roots.add(root);
          }
        } else {
          // Some publishers omit root metadata. Their published root previews
          // identify entry points without mistaking payload layers for samples.
          for (const path of files.keys()) if (path.startsWith(pkg+'/') && /\.usd[acz]?$/i.test(path)) {
            const thumbnail = `${dirname(path)}/.thumbs/256x256/${path.split('/').pop()}.png`;
            if (files.has(thumbnail)) roots.add(path);
          }
        }
      }
      if (!packages.length) {
        // Ordinary USD collections use the same folder UI as SimReady datasets.
        for (const path of files.keys()) if (/\.usd[acz]?$/i.test(path) && !path.includes('/.')) roots.add(path);
      }
      const cards = [...roots].map(root => {
        const filename = root.split('/').pop(), folder = dirname(root);
        const preview = `${folder}/.thumbs/256x256/${filename}.png`;
        const light = `${folder}/.thumbs/256x256/${filename}_light.png`;
        return {id:root, name:filename.replace(/\.usd[acz]?$/i,'').replace(/[_-]+/g,' '), search:`${collection.repository} ${root}`,
          meta:collection.repository, url:resolve(root), source:resolve(root).replace('/resolve/','/blob/'),
          ...(files.has(preview)?{thumbnail:resolve(preview)}:{}), ...(files.has(light)?{thumbnailLight:resolve(light)}:{})};
      });
      return {...collection, revision, cards};
    })().catch(error=>{pending=undefined;throw error;});
    return pending;
  }
  return {load};
}
