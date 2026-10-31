# Inspection and editing foundations

The viewer shares authored USD selection identities between Stage, Properties,
viewport picking, outlines, framing and the JavaScript console. This is view
context, separate from authored stage data.

## Package and application responsibilities

The SDK owns OpenUSD lifetime, asset resolution, Hydra synchronization, composed
scene inspection, variant/payload operations and dependency-preserving export.
`/viewer/inspect` provides embeddable inspection controls. `/editing` provides
document-scoped array commands; `/viewer/repl` and `/viewer/download` are optional
UI. Hosts can build their own interfaces without importing the hosted app.

The application owns Dockview panels, menus, URL/history state, example catalogs,
uploaded-file inventory and host lighting/camera preferences. It chooses when to
load tools and passes document identity and refresh hooks to SDK operations.
Picking events and outlines live in the host; native authored identities and
instance mapping come from `handle.resolvePick()` and `handle.resolveSelection()`.

Use `handle.readStage(callback)` for native reads that may cross an asynchronous
resolver boundary. Reads share the native operation queue with edits and export,
wait for draws and reject if the document closes. They do not increment the scene
revision or redraw. The callback must not author data or nest another queued
handle operation. Use `editStage()` for mutations. This is lifecycle coordination,
not a read-only security sandbox.

`readStageAsset()` returns owned bytes for HTTP, mounted and package assets;
`readStageLayer()` returns live authored USDA without replacing the loaded root.
Both are exported from `/scene` and support cancellation and current-document
checks. The host chooses which files appear in its browser. Disposing a document
must invalidate those readers and its command owner.

## Navigation

Property names, relationship targets and attribute connections in Properties
are links. Following a connection reaches the destination property, including
namespaced inputs and outputs. Back/Forward restores inspection context; the
property filter clears when it would hide the destination. Following does not
frame the camera or change an edit target. Missing targets leave the current
selection intact.

The selected property's disclosure shows its resolved source and property stack:
spec paths, layer identifiers, and layer offsets/scales. These are read from the
composed stage rather than inferred from displayed strings. Long values can be
expanded, and path/value copying uses the original value.

## Selection

- Click replaces selection; Ctrl/Cmd-click toggles membership. Shift-click and
  Shift-arrow extend a range in the visible hierarchy. F frames the selection,
  or the scene when nothing is selected.
- View → Scene → Pick switches between prims and instances. Native instance
  proxy paths are resolved to their authored paths. Point instances carry their
  instancer context; Instances mode selects the outer instance as a whole.
- `StagePanel.selection` is an immutable array of plain identities. A primary
  item drives Properties; all items drive outlines and framing. No native Prim,
  renderer object, or GPU resource is stored in selection/history/localStorage.
- The wasm driver's path-translation query is authoritative for mixed prototypes,
  masked instances and nested instancers. The UI does not infer identities from
  a synthetic render path or assume that a draw index is an authored point index.
- Authored point IDs are strings, preserving signed 64-bit values exactly.
  When IDs exist, masks resolve by ID across array reordering. Without IDs,
  point identity uses the authored position index. The index in a pick record is
  the index at pick time; use the resolver for current rendered indices.

Outline proxies never change authored materials or tracer inputs. Masks refresh
after edits and completed animation draws; camera-only changes reuse them.
Property cells and expanded values survive paused sampling and seeking.

## JavaScript console

Open Window → Console. Ctrl/Cmd+Enter runs; Enter inserts a newline.
Alt+Up/Down recalls commands. `help` lists the exposed symbols and shortcuts.

```js
selection
follow('/World/Material/Surface.inputs:roughness')
inspect('/World/Mesh')
await edit(stage => {
  const prim = stage.GetPrimAtPath('/World/Sphere');
  const radius = prim.GetAttribute('radius');
  try { radius.SetDouble(0.7, NaN); }
  finally { radius.delete(); prim.delete(); }
});
```

`stage`, `USD`, `handle`, `scene`, `selection`, `panel`, `api` and `three` refer
to the current document and viewer APIs. `select`, `follow`, `inspect`, `print`,
`clear` and `edit` are convenience commands. `api` contains the SDK scene helpers;
use `edit` for host-synchronized authored changes. Do not nest another
`handle.editStage()` inside an `edit` callback.

Declarations are command-local. Store values for later commands in `scratch`:

```js
scratch.path = '/World/Sphere'
inspect(scratch.path)
```

Only bounded command history persists across reloads. Scratch state resets when
the document changes. Output stores text rather than retaining native objects.
Exposed SDK references reject access after their document closes. This is trusted
in-page JavaScript, not a sandbox: synchronous infinite loops and unrelated global
side effects cannot be cancelled by the console.

## Mutation ownership and future editing

`StagePanel.edit(callback)` owns the host lifecycle and delegates to the handle's
serialized stage-edit queue. It stops/restores dependent simulation, updates
materials/lighting, and refreshes inspection. Read-only navigation and REPL
expressions bypass this path.

Arbitrary JavaScript callbacks are not atomic transactions. A script can author
a valid change and then throw. The handle synchronizes the actual resulting
stage, the host restores its dependent systems, and the original error remains
visible. A later edit can proceed. No automatic rollback or undo is implied.

Future authoring should add semantic commands at this boundary. Each command
should prepare its forward/inverse opinions against stable prim/property or
instance identities, record one user intent, and restore the relevant inspection
context on replay. Navigation history must remain separate. Whole-stage snapshots
or post-mutation JSON diffs are not the intended undo design.

Edit-target selection, reset-opinion operations, dirty/savepoint state, and
override/flattened USD export still need explicit product workflows. Selecting
another prim must not change authoring authority. The console currently operates
on the loaded stage's current edit target and does not provide a save workflow.

The reusable modules ship in `@needle-tools/usd/viewer`; hosts retain ownership
of the stage, renderer and document lifetime. `StagePanel` exposes `selectPrim`,
`selectMany`, `navigate`, `selection`, `selectedProperty` and `edit`.
