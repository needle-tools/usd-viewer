# Needle Brand System

<!-- ⚠️ GENERATED from brand.json — do not edit manually. Run: npm run branding:build -->

Needle interfaces are calm, precise, compact, and easy to work in. Use a soft green stage, crisp white work surfaces, dark readable text, restrained shadows, and green accents that support the task.

## Sources

- [Miro Board — Branding](https://miro.com/app/board/uXjVMtbJd74=/)
- [Google Drive — Fonts](https://drive.google.com/drive/folders/1ViWPX5azV2QFrb9K9OexkDzB5H4SvOxU)

## Logo Rules

- The Needle logo must not be edited, distorted, recolored, or reconfigured.
- Maintain clear space around the lockup equal to roughly the height of the wordmark letter e.
- Use the full lockup unless Needle is already clearly identified nearby.
- Use black artwork on light surfaces and white artwork on dark surfaces with strong contrast.
- The wordmark font treatment is reserved for the actual Needle lockup and should not be reused for ordinary UI text.

## Principles

Needle interfaces are calm, compact, and technical without feeling cold. Use a soft green stage, white work surfaces, restrained chrome, and real information density.

### Surfaces
- Use a very light green page stage with white working surfaces.
- Use solid surfaces in workbench UI.
- Do not use blur, glass, or decorative gradients in normal panes or buttons.
- Do not turn small facts into separate cards by default.
- Keep the stage neutral or dark and let the content provide the texture.
- Treat the stage as a working viewport, not a poster illustration.

### Layout
- Start from the primary task and surface, not from a preferred layout or hero header.
- Fit the main workflow into the first viewport.
- Use a stage only when the user is inspecting or manipulating a visual result.
- A three-pane shell is common, not mandatory.
- When a stage is present, keep it wider than the side panes.
- Place controls close to the object they change.
- Keep presets next to the settings or objects they affect.
- Use tabs, drawers, or modals for secondary steps.
- Use one shell before introducing nested cards.
- Left and right panes should have different jobs. Do not mirror them.

### Interaction
- Reuse the core classes from brand.css before writing custom control CSS.
- Segmented controls are one joined row of small segments with shared borders.
- Keep segmented controls small and identical across header, stage, and inspector.
- Slider rows are direct: label, value, then one real range input. No extra box.
- Boolean rows are direct: label plus checkbox. No phone switch. No outer box.
- Color-driven tools should expose real color inputs and direct hex values. Add one alpha slider row when opacity matters.
- Tags are small, thin-bordered, and lightly tinted. No gradients.
- Buttons in workbench UI are solid. Do not use gradients.
- Use one small-control radius family per tool row. Do not mix multiple radii side by side.

### Iconography
- Use one icon family per surface: Material Symbols Rounded for product UI, Lucide for marketing and docs.
- Use Material Symbols Rounded in product UI. Use the outline treatment with variable font settings: opsz 20, wght 300–400, FILL 0, GRAD 0.
- Use Lucide in marketing and docs.
- Prefer outlined icons with rounded joins at around 20×20 optical size and 1.5–2px stroke weight.
- Icons should feel secondary to text — use them to reinforce meaning, not replace labels. Icon-only buttons need a tooltip or accessible label.
- Use a neutral text color for icons by default; tint with the brand green or purple only for active/selected state.
- Keep the icon vocabulary small and consistent within a product: one icon per concept, reused everywhere that concept appears.
- Mark icon elements with class='notranslate' and translate='no' so machine-translation services do not mangle icon ligatures.

### Hierarchy & Tree Views
- Tree views and nested lists use a consistent indentation rhythm so structure is scannable at a glance.
- Rows stay content-height rather than oversized so trees remain dense and navigable.
- Expand/collapse affordances (arrows or folder icons) sit to the left of the label. A single click toggles expansion; double-click or Enter activates.
- Selection is shown with a subtle background fill (pale green or neutral tint), not a heavy border or color block.
- Hover state is a lighter tint of the selection color. Keep the contrast low — just enough to confirm the pointer target.
- Use connector lines or indentation guides only when they improve scanning. Keep them very light.

### Information Density
- Build the inspector as one continuous pane.
- Use section dividers, alignment, and spacing instead of boxing every row.
- Keep pane headers brief and singular.
- Use tabs or modes instead of showing every surface at once.
- Prefer compact rows and lists before larger cards or tiles.

### Content Economy
- Keep tool titles short.
- In workbench headers, order the identity as Needle lockup, light-weight product name, then optional muted context on the same line.
- Pane headers should not restate their own role.
- Helper text is short and local.
- Long explanation belongs in docs, onboarding, help, or empty states.

### Anti-Patterns
- Do not use a hero header in a workbench.
- Do not use `header-pill` inside dense editors, inspectors, or technical panes.
- Do not add a four-up KPI card row under the header by default.
- Do not mirror the left and right sidebars.
- Do not use gradients in normal panes, segmented controls, or workbench buttons.
- Do not use multiple slider styles in one tool.
- Do not mix multiple button radii in the same control row.
- Do not box sliders, toggles, or small metrics in their own mini-cards.
- Do not append a page-level footer strip to a workbench.
- Do not redefine the core brand.css component classes.

### Page Types
- **Marketing**: Marketing pages are brighter and more playful, with floating pills, gradients, and larger type. Keep the backdrop light and optimistic. Use the brand or CTA gradient in focused, high-value moments only. Let the lockup and call to action breathe inside large rounded panels or pill bars. Use the header-pill plus footer-area shell for full marketing pages.
- **Docs**: Docs pages are quieter and more structured, on the same soft green stage with white content blocks. Use one clear page title, then move into the content. Avoid marketing-style slogan stacks. Use purple for link emphasis and navigation state more than bright green buttons. Callouts are softly tinted green or blue on top of the pale page. Code blocks are white and rounded, with restrained borders and plenty of internal padding. Use the header-pill plus footer-area shell for full docs pages. Footer links inherit the footer text color. Do not let browser-default violet show through.
- **Management**: Management pages are operational overviews and browsing surfaces. Use them for uploads, libraries, project lists, and cloud-style organization pages. Use `header-pill` by default. Keep one shared content width across the header, main sections, and footer inner content. Prefer rows, tables, lists, and compact cards over a stage-first layout. Use cards only where they group genuinely different content. Footer is optional. Use `footer-area` only when the page ends like a website.
- **Workbench**: Workbench pages are hands-on product pages. Use them for focused tasks where the user is creating, editing, inspecting, or processing something. Choose `header-tool` for dense operational pages. Use `header-pill` only if the page behaves more like browsing or management. No hero. Use the real Needle lockup when branding appears. Order header identity as Needle lockup, light-weight product name, then optional muted file or project context on the same line. Decide the primary surface first. Use a stage only when the result itself needs space. If the task is mostly configuration or review, a two-column or single-pane layout may be better than a stage-first layout. Group presets with the settings or objects they affect. Add side panes only when they help the workflow. If both are present, they should have different jobs. Reuse the same segmented control in the header, stage, and inspector. Use direct property rows, check rows, and color rows inside the inspector. Use a neutral or dark stage when the page needs a visual work surface. Status is inline or optional. Do not add a KPI card row by default. No blur, no glass, no marketing footer.
- **Settings**: Settings pages use white panels on green, clear labels, and compact spacing. Use distinct white panels, but keep them compact and quiet. Use tabs and segmented controls in the same compact viewer-style treatment used elsewhere in the product. Keep only the active settings group in focus. Use tabs or sections to avoid overwhelming the user with everything at once. Keep forms readable, direct, and factual rather than glossy or promotional.
- **Data**: Data-heavy and inspector views use mono details, white panels, and muted separators on a pale green stage. Place structured data inside white rounded containers. Use the Monaspace-style mono face selectively for identifiers, values, JSON structure, and technical labels. Prefer light separators and spacing over dense grid lines. Keep inspector rows compact and aligned. Avoid nested boxes around each field or duplicated summary panels. Apply the data-ink ratio principle: remove any UI element that does not directly help the user read or compare values.

## Typography Families

| Role | Family | Usage |
|---|---|---|
| Display | Nunito Sans | Hero headlines, section titles, and the dominant UI typography. |
| Body | Nunito Sans | Body text, metadata, labels, and general interface copy. |
| Wordmark | Oblique | Reserved for the Needle lockup and wordmark artwork only. |
| Accent Serif | IBM Plex Serif Italic | Occasional editorial accent or italic pull quote treatment. |
| Code | Monaspace Neon | Inline code, code blocks, JSON/data views, and terminal-style technical output. |

## Typography Roles

| Role | Usage | Tone | Size | Weight |
|---|---|---|---|---|
| Display | Hero titles, landing page feature names, and the strongest title moments. | Confident, rounded, compact, and highly legible. | `clamp(2.8rem, 6vw, 4.6rem)` | 800 |
| Page Title | Primary title at the top of a docs page, marketing section, or a major standalone view. Do not use this as the default title size for everyday workbench tools. | Strong but calmer than display. | `clamp(1.8rem, 3.6vw, 2.6rem)` | 720 |
| Section Title | Section headings and prominent content grouping labels. | Clear, friendly, and compact. | `1.35rem` | 700 |
| Tool Title | Compact titles inside product headers, toolbars, modal heads, and operational shells. The `header-tool` component deliberately applies its lighter product-name treatment through header-specific variables. | Direct, technical, and not promotional. | `1.2rem` | 700 |
| Panel Title | Inspector group titles, sidebar section headings, compact cards, and data panels. | Small, sturdy, and matter-of-fact. | `0.98rem` | 700 |
| Micro Label | Overlines, metric captions, compact status labels, and inspector metadata. | Quiet, technical, and highly compact. | `0.74rem` | 700 |
| Metric | Numeric status readouts, compact KPIs, and operational summaries. | Readable, dense, and stable. | `0.95rem` | 650 |
| Body | Paragraphs, standard UI copy, and descriptive text. | Quiet, readable, and neutral. | `1rem` | 400 |
| Body Muted | Secondary explanation, timestamps, counts, and supporting metadata. | Softer than body but still crisp. | `1rem` | 400 |
| Label | Field labels, tabs, small buttons, and compact interface labels. | Firm and tidy. | `0.9rem` | 500 |
| Link | Inline links and navigation links. | Plainspoken with color emphasis rather than decoration-heavy styling. | `1rem` | 500 |
| Code Inline | Inline code, identifiers, and short technical terms. Use em not rem so the size scales relative to surrounding body text and appears optically similar in height. | Clean, structured, and understated. | `0.84em` | 400 |
| Code Block | Larger code samples and dense technical information boxes. | Spacious, readable, and calm. | `0.9rem` | 400 |

## CSS

Import [`brand.css`](brand.css) for the semantic tokens such as `--surface-page`, `--surface-panel`, `--text-primary`, `--accent-brand`, `--radius-panel`, and `--type-body-size`, plus classes such as `.header-tool`, `.segmented-control`, `.pane`, `.stage`, `.property-row`, `.check-row`, `.color-row`, `.tag`, `.user-profile`, and `.footer-area`.

## Shell Selection

Choose the information architecture first, then the shell:
- one dominant work surface with dense operational chrome -> `header-tool`
- browsing, docs, marketing, or lighter management -> `header-pill`
- use `footer-area` only when the page genuinely ends like a website
- dense operational pages do not end with a marketing footer

## Shell HTML

Canonical shells:

`workbench`
```html
<div class="workbench-shell">
  <header class="header-tool">...</header>
  <!-- optional status-strip -->
  <main class="workbench-grid">
    <!-- choose one dominant surface -->
    <section class="stage">...</section>
    <!-- add one or two panes only if the task needs them -->
    <aside class="pane">...</aside>
  </main>
</div>
```

`management`
```html
<div class="management-page">
  <div class="header-pill-shell">
    <header class="header-pill">...</header>
  </div>
  <main>...</main>
  <!-- optional footer-area when the page ends like a website -->
</div>
```

`docs`
```html
<div class="docs-page">
  <div class="header-pill-shell">
    <header class="header-pill">...</header>
  </div>
  <main>...</main>
  <footer class="footer-area">...</footer>
</div>
```

`marketing`
```html
<div class="marketing-page">
  <div class="header-pill-shell">
    <header class="header-pill">...</header>
  </div>
  <main>...</main>
  <footer class="footer-area">...</footer>
</div>
```

## Component HTML

Reuse these classes from a local copy of brand.css:

`header-tool`
```html
<header class="header-tool">
  <div class="header-tool-leading">
    <img src="./logos/logo_needle_black_no_padding.svg" alt="Needle" />
    <div class="header-tool-title-group">
      <strong>Current Tool</strong>
      <span>current file / current context</span>
    </div>
  </div>
  <div class="segmented-control" role="tablist" aria-label="Workspace mode">
    <button aria-selected="true">Primary</button>
    <button>Secondary</button>
    <button>Export</button>
  </div>
  <div class="header-tool-actions">
    <button class="header-tool-button" aria-label="App settings">Settings</button>
    <button class="header-tool-button" aria-label="Toggle sidebar">Sidebar</button>
  </div>
</header>
```
The toolbar owns workspace switching, app settings, and sidebar visibility. Keep action-specific settings next to the action.

`segmented-control`
```html
<div class="segmented-control" role="tablist" aria-label="View mode">
  <button aria-selected="true">Primary</button>
  <button>Secondary</button>
  <button>Raw</button>
</div>
```

`settings-shell`
```html
<div class="settings-shell">
  <nav class="settings-section-nav" aria-label="Settings sections">...</nav>
  <section class="settings-content">...</section>
</div>
```
Use this sidebar only when there are more than a few peer settings sections; otherwise use headings in one pane.

`split-action`
```html
<div class="split-action">
  <div class="split-action-row">
    <button class="split-action-main">Run</button>
    <button class="split-action-options" aria-label="Run options">Settings</button>
  </div>
  <div class="split-action-popover">...</div>
</div>
```
Use the small options popover only for settings of the next run; use the settings pane or app dialog for persistent configuration.

`property-row`
```html
<div class="property-row">
  <div class="property-row-head">
    <label for="exposure">Exposure</label>
    <output for="exposure">1.10</output>
  </div>
  <input id="exposure" type="range" min="0" max="100" value="24" />
</div>
```

`check-row`
```html
<div class="check-row">
  <label for="volumetric">Enabled</label>
  <input id="volumetric" type="checkbox" checked />
</div>
```

`color-row`
```html
<div class="color-row">
  <label for="key-tint">Tint</label>
  <div class="color-field">
    <button class="color-field-button" type="button">
      <span class="color-swatch" style="background:#F6DDBB"></span>
      <span>#F6DDBB</span>
    </button>
    <div class="color-popover">
      <input id="key-tint" type="color" value="#F6DDBB" />
      <input class="color-input" type="text" value="#F6DDBB" />
      <input type="range" min="0" max="100" value="72" />
    </div>
  </div>
</div>
```

`user-profile`
```html
<button class="user-profile" type="button">
  <img class="user-profile-logo" src="./logos/logo_needle_black_no_padding.svg" alt="Needle" />
  <span class="user-profile-identity">
    <strong class="user-profile-name">Felix Herbst</strong>
    <span class="user-profile-meta">Needle Test</span>
  </span>
  <span class="user-profile-avatar">FH</span>
</button>
```
Use the same segmented control everywhere. Use property, check, and color rows directly in technical panes. Use user-profile for account identity, not page titles. Do not box controls individually.

## Hard Rules

Hard rules:
- The finished page is self-contained.
- Use one header family per page.
- Dense operational pages use `header-tool`; browsing, docs, marketing, and lighter management pages use `header-pill`.
- If you copied brand.css, do not redeclare `--surface-*`, `--text-*`, `--accent-*`, or `--border-*`.
- Reuse the canonical segmented control, property rows, check rows, and color rows.
- Do not append `footer-area` to dense operational pages.

## Common Patterns

Common patterns:
- A three-pane workbench is common when a visual result needs a large stage.
- A two-column layout is common when the task is result plus settings.
- One continuous inspector is common when the task is mostly configuration or review.
- Management pages often use rows, tables, or compact cards instead of a stage.

## Component Anatomy Variables

Use the grouped component variables and hierarchy comments in [`brand.css`](brand.css) when you need the exact structure.

| Variable Group | Purpose | Implied Hierarchy | Example Variables |
|---|---|---|---|
| `--header-tool-row-*`<br>`--header-tool-leading-*`<br>`--header-tool-title-group-*`<br>`--header-tool-actions-*` | Compact operational header for dense viewers, editors, inspectors, and focused studios. | `header-tool > leading + modes + actions` | `--header-tool-row-padding-inline`<br>`--header-tool-leading-gap`<br>`--header-tool-title-group-gap`<br>`--header-tool-actions-gap` |
| `--status-strip-*`<br>`--status-strip-item-*` | Optional inline operational readout for runtime, counts, warnings, and selection. | `status-strip > status-item[]` | `--status-strip-padding-inline`<br>`--status-strip-gap`<br>`--status-strip-item-min-width` |
| `--layout-workbench-shell-*`<br>`--layout-workbench-grid-*` | Viewport-first shell for tools with one dominant stage and compact side panes. | `workbench-shell > header-tool + optional status-strip + workbench-grid` | `--layout-workbench-shell-padding`<br>`--layout-workbench-shell-gap`<br>`--layout-workbench-grid-columns` |
| `--surface-stage-*` | Central work surface with stage toolbar, canvas, and footer metadata. | `stage > stage-toolbar + stage-canvas + stage-footer` | `--surface-stage-background`<br>`--surface-stage-canvas-background`<br>`--surface-stage-min-height` |
| `--surface-stage-toolbar-*` | Compact row at the top of the stage for mode switches and direct stage actions. | `stage-toolbar > controls + meta` | `--surface-stage-toolbar-gap`<br>`--surface-stage-toolbar-padding-inline`<br>`--surface-stage-toolbar-min-height` |
| `--surface-stage-canvas-*` | Neutral or dark central canvas for the actual visual work. | `stage-canvas > scene` | `--surface-stage-canvas-background`<br>`--surface-stage-canvas-radius`<br>`--surface-stage-canvas-min-height` |
| `--surface-stage-footer-*` | Compact bottom row for metrics, selection facts, and stage-level summaries. | `stage-footer > label + metrics` | `--surface-stage-footer-gap`<br>`--surface-stage-footer-padding-inline`<br>`--surface-stage-footer-min-height` |
| `--pane-*`<br>`--pane-head-*`<br>`--pane-body-*` | Pane shell plus its head/body split for inspectors and side panels. | `pane > pane-head + pane-body` | `--pane-background`<br>`--pane-head-padding-block`<br>`--pane-body-gap` |
| `--control-segmented-track-*`<br>`--control-segmented-segment-*` | Joined viewer-style segment row with one border system shared across the whole control. | `segmented-track > segment[]` | `--control-segmented-track-border-color`<br>`--control-segmented-segment-padding-inline`<br>`--control-segmented-segment-background-selected` |
| `--control-property-list-*`<br>`--control-property-row-*`<br>`--control-property-row-head-*`<br>`--control-property-row-label-*`<br>`--control-property-row-value-*` | Continuous property pane plus the label/value row anatomy used before sliders, enums, and checks. | `property-list > property-row > property-row-head` | `--control-property-list-gap`<br>`--control-property-row-gap`<br>`--control-property-row-value-size` |
| `--control-slider-track-*`<br>`--control-slider-thumb-*` | Real range input styling for technical rows. | `property-row > input[type=range]` | `--control-slider-track-height`<br>`--control-slider-track-background`<br>`--control-slider-thumb-size` |
| `--control-check-row-*`<br>`--control-check-box-*` | Compact boolean row with a technical check box, not a phone-style switch. | `check-row > label + input[type=checkbox]` | `--control-check-row-gap`<br>`--control-check-box-size`<br>`--control-check-box-background-selected` |
| `--control-color-row-*`<br>`--control-color-swatch-*`<br>`--control-color-input-*`<br>`--control-color-popover-*` | One-line color row with a field trigger; detailed color and alpha controls live in a popover. | `color-row > label + color-field > color-field-button + color-popover` | `--control-color-row-gap`<br>`--control-color-swatch-size`<br>`--control-color-input-min-height`<br>`--control-color-popover-padding` |
| `--tag-*` | Compact status chip for viewer and cloud surfaces, including optional split metadata. | `tag-list > tag[] or tag-segmented > tag-segmented-label + tag-segmented-meta` | `--tag-min-height`<br>`--tag-padding-inline`<br>`--tag-border-color`<br>`--tag-split-divider-color` |
| `--list-row-*` | Dense rows for presets, uploads, warnings, and asset lists. | `list > list-row[]` | `--list-row-padding-block`<br>`--list-row-border-color`<br>`--list-row-background` |
| `--user-profile-shell-*`<br>`--user-profile-avatar-*`<br>`--user-profile-card-*` | Cloud-style account identity for header pills, account menus, and profile summary panels. | `user-profile > logo + identity + avatar; user-profile-card > head + rows + actions` | `--user-profile-shell-padding-inline`<br>`--user-profile-avatar-size`<br>`--user-profile-card-padding`<br>`--user-profile-card-row-border-color` |
| `--header-pill-shell-*`<br>`--header-pill-nav-*`<br>`--header-pill-actions-*` | Floating marketing/docs header with brand, navigation, and CTA cluster. | `header-pill-shell > brand + nav + actions` | `--header-pill-shell-padding-inline`<br>`--header-pill-nav-gap`<br>`--header-pill-actions-gap` |
| `--footer-marketing-shell-*`<br>`--footer-marketing-main-*`<br>`--footer-marketing-column-*` | Marketing/docs footer with brand summary, columns, and one legal row. | `footer-marketing-shell > footer-marketing-main + footer-marketing-legal` | `--footer-marketing-shell-padding-inline`<br>`--footer-marketing-main-columns`<br>`--footer-marketing-column-gap` |

## Patterns

[`brand-recipes.json`](brand-recipes.json) lists the UI patterns.

| Pattern | Purpose | Slots | Build |
|---|---|---|---|
| `header-pill` | Floating top navigation for marketing, docs, cloud overview, and lighter management pages. | brand, navigation, secondary-action, primary-action | Build a floating white pill header for marketing, docs, cloud overviews, and lighter management surfaces. Reuse `.header-pill-shell`, `.header-pill`, `.header-pill-brand`, `.header-pill-nav`, `.header-pill-actions`, and `.header-pill-dropdown` from brand.css. Keep the real lockup on the left, navigation in the middle, and actions on the right. If the page needs a page or product name, use plain text next to the lockup, not a fake wordmark. Keep one shared content width across the page and let the menu collapse into an overflow panel on narrow widths. Do not use backdrop blur. Do not use this inside dense operational pages. |
| `footer-area` | Wide multi-column footer used on marketing and docs pages to close a page calmly. | brand, columns, legal | Use a calm multi-column footer on marketing, docs, and website-like management pages. Reuse `.footer-area` from brand.css. The footer spans the full page width; constrain inner content inside `.footer-area-main`. Keep it open on the page stage: no boxed panel, no tinted footer slab, no violet links. Do not append it to dense operational pages. |
| `documentation-sidebar` | Anchored section navigation for marketing and documentation pages with several reference sections. | section-links, active-section, optional-copy-action | For marketing and documentation pages with several anchored sections, reuse the calm `.brand-sidebar` navigation treatment: a small 'On this page' label, one vertical link rule, and one quiet active state. Keep it sticky on wider screens and a drawer on mobile. Do not use this as workbench chrome or duplicate an inspector navigation rail. |
| `card` | Default surface for content modules, upload tiles, and summary blocks. | media, title, meta, actions | Use a white rounded card with a soft border and very gentle elevation. Keep the interior clean and readable rather than glossy. In workbench layouts, use cards sparingly; do not turn every control group, toggle cluster, or small metric into its own large card. |
| `tag` | Small status or categorization chip used in lists, docs, and data views. | icon, label, meta | Use the canonical `.tag` class from brand.css for status and category chips. Keep tags small, thin-bordered, lightly tinted, and Cloud-like. Optional icons are good. Use the split tag variant when a label needs a small count or meta value. Do not use gradients, oversized padding, or glossy pills. |
| `callout` | Short informational or success message block used in docs and tutorials. | title, body | For docs callouts, use a softly tinted green or blue panel on the pale page. Keep the edges rounded and the tone friendly rather than urgent. |
| `code-block` | Larger code or structured technical explanation surface. | label, code, meta | Place code inside a white rounded panel with soft border and lots of padding. Use mono typography, muted supporting comments, and avoid dark-theme heaviness by default. |
| `json-display` | Structured JSON or object inspection view used in the viewer and technical tooling pages. | mode-tabs, breadcrumbs, content | For JSON or object inspection, use the pale green page stage with one dominant white content panel. Add compact viewer-style segmented tabs for view modes, set data in Monaspace-style mono, and keep tree structure readable with soft separators and light green active states. Do not add extra summary cards above the main panel unless they reveal genuinely distinct information. |
| `header-tool` | Compact top bar for dense operational pages. | brand, title, context, modes, actions, status | Use this for dense product tools. Reuse `.header-tool`, `.header-tool-leading`, `.header-tool-title-group`, `.header-tool-actions`, `.header-tool-status`, and `.header-tool-button` from brand.css. Keep it top-aligned, compact, and on the page background. Put the real lockup on the left, followed by a relatively large light-weight product name and optional short muted context in the same line. Never stack a subtitle below the product name. Keep modes and actions in the same row. No eyebrow. No long subtitle. No blur. No glass. |
| `status-strip` | Inline operational readout for runtime, selection, counts, warnings, and job progress. | facts, status, warning | Use a status strip only when the header or stage footer cannot carry the facts. Keep it to one slim row. Use compact labels and values. Do not turn it into a KPI card deck. |
| `segmented-control` | Consistent viewer-style tabs or mode switch used across workbench, settings, and data surfaces. | segments, active-segment | Reuse the `.segmented-control` class from brand.css. Build one joined row of small segments with visible vertical dividers. Short labels only. Selected segment is pale green with the darker outline. Do not add outer padding, chip gaps, shadows, or oversized pills. |
| `property-slider` | Compact inline range control for technical inspectors and workbench panes. | label, value, track, thumb | Build one direct row: label, value, then one real `input[type='range']`. Reuse `.property-row` and `.property-row-head` from brand.css. Do not box the slider. |
| `check-row` | Compact boolean row for technical inspectors and settings panes. | label, control | Reuse the `.check-row` class from brand.css. Build one label plus one checkbox. No row card. No switch track. No extra badge. |
| `color-field` | Direct color swatch and value field for lighting, material, and annotation tools. | label, value, popover | For color-driven tools, expose a direct one-line color row. Reuse `.color-row`, `.color-field`, `.color-field-button`, `.color-popover`, and `.color-input` from brand.css. Put detailed color and alpha controls inside the popover, not as extra permanent rows. |
| `workbench-layout` | Common layout for hands-on product pages with one dominant work surface and supporting controls. | header, primary-surface, pane, status | Use the compact workbench shell when the page needs one dominant work surface. Reuse `.workbench-shell`, `.header-tool`, `.workbench-grid`, `.stage`, `.pane`, and `.segmented-control` from brand.css. Status strip is optional. Choose the arrangement from the task: stage plus inspector, two-column result plus settings, or one continuous inspector are all valid. Add panes only when they help. Use a stage only when the result needs space. Keep controls close to the thing they change. Do not mirror the sidebars. Do not add KPI cards under the header. Keep panes and buttons solid. |
| `inspector-section` | Dense continuous property pane for properties, metrics, options, and technical metadata. | title, rows, helper, actions | Build one continuous inspector pane. Use one short pane title. Then use direct property rows, check rows, and color rows. Keep helper text local. Do not turn each control into its own card. Do not duplicate the left pane. |
| `settings-layout` | Primary arrangement for settings-style experiences. | sidebar, tabs, panels | For settings UIs, start with a pastel green page background and place white rounded panels on top. Use compact viewer-style segmented controls and soft selected states instead of aggressive color blocking. Keep headings compact, align control rows, and move explanations close to the relevant control instead of writing long introductory paragraphs. |
| `settings-navigation` | Compact section navigation paired with a continuous settings pane when an experience has several settings groups. | section-navigation, active-section, settings-rows | When settings contain more than a few sections, reuse `.settings-shell`, `.settings-section-nav`, and `.settings-content` from brand.css. Keep the section navigation immediately beside one continuous settings pane so people can find groups without scrolling through a long list. Use this only for several peer sections; with two or three small groups, keep short headings directly in the pane. Keep one selected section, quiet labels, and no duplicate inspector sidebar. |
| `section-rail` | Icon-only section rail attached to a panel edge, for dense workbenches where a labelled section list would cost too much width. | section-icons, active-section-header, collapsible-groups, section-panel | Use `.section-rail-shell` with `.section-rail` and `.section-rail-content` from brand.css when a dense tool needs peer sections but cannot spend width on a labelled section list. The rail is not a column inside the panel: it is a floating strip whose inner edge tucks behind `.section-rail-content`, and `.section-rail-item` runs on into that tuck, so the panel clips the selected item and it reads as a tab attached to the panel. Keep the rail icon-only and give every button a real accessible name; `.section-rail-item-label` then expands that name on hover and focus, sliding out from behind the item. Keep the vertical rail on the panel edge that faces free space such as a viewer or canvas, because the label expands over that space; switch to `data-orientation="horizontal"` when nothing beside the panel is free. Always keep the active section named in `.section-rail-content-head`, because the rail itself shows no persistent text, and split long sections into `.section-rail-group` disclosures that reuse the same header bar. With enough width for readable section names, use the settings navigation recipe instead. |
| `split-action` | Primary run button with an attached options trigger for settings that affect only the next action. | primary-action, options-trigger, action-options | For a primary action with a few run-specific choices, reuse `.split-action`, `.split-action-row`, `.split-action-main`, `.split-action-options`, and `.split-action-popover` from brand.css. The main button runs the action; the attached settings or chevron button opens a small anchored options pane. Put only choices that affect the next run there. Use the regular settings pane or app settings dialog for persistent, shared, or multi-section configuration. |
| `workspace-toolbar` | Top-level operational toolbar for switching workspaces and managing global tool chrome. | brand-context, workspace-switcher, app-settings, sidebar-toggle | Use the top toolbar for global workspaces and global chrome. Start with `.header-tool`; put workspace modes in the canonical `.segmented-control`, then use compact `.header-tool-button` icon buttons for an app settings dialog and show or hide sidebars. Workspace switching belongs here because it changes the whole work surface. Per-action options belong on a split action, and section-level configuration belongs in the settings pane. |
| `data-panel` | Structured panel for technical metadata, inspector content, and object details. | tabs, badges, content | Render technical data in white rounded containers with restrained separators, mono values, and soft green selected tabs. Prefer compact rows, inline metrics, and direct labeling over large summary cards. If there is too much information, switch between modes instead of rendering everything at once. |
| `user-profile` | Cloud-style account identity used in header pills, account menus, profile panels, and workspace switchers. | logo, name, workspace, avatar, actions | Use `.user-profile` for Cloud-style account identity: real Needle lockup, two-line person/workspace text, and one circular avatar on the right. Use `.user-profile-card` when the profile needs account facts or menu actions. Keep it compact, white, rounded, and lightly bordered. Do not turn the profile into a hero, and do not replace the Needle logo with initials. |
| `dropdown-menu` | Account or action menu that appears above other content. | identity, team-switcher, actions | Use a white floating dropdown with rounded corners, soft border, and stacked rows. Optional leading icons are good. Use separators between groups. Keep the menu calm and readable, not dark or glassy. |
| `command-dialog` | Quick command palette for jumping to actions, assets, or modes without dedicating permanent page chrome. | search, groups, commands, hints | If a Needle tool offers quick command, present it as a compact command palette dialog above the current workflow. Use one strong modal container, a short search field, grouped action rows, and quiet keyboard hints. Do not turn quick command into a permanent marketing card or a large decorative panel inside the page. |
| `terminal-ui` | Needle-flavored terminal or CLI presentation for logs, prompts, and command workflows. | title, output, prompt, menu | For terminal UI, use a dark rounded shell with Monaspace-style mono text, calm dim secondary lines, and Needle green only for the active prompt, selected row, or success state. It should feel like a technical tool made by Needle, not a hacker movie terminal. |
| `asset-grid` | Management-style overview for uploads, projects, or library entries when the page is primarily about browsing and operations rather than direct tool work. | sidebar, hero-card, items | Use this recipe for management and browsing pages, not for workbench tools. Keep the stage pale green and let white rows, cards, or list surfaces organize the content. One larger focal card can anchor the layout, with supporting rows or cards around it. Avoid invented decorative gradients inside thumbnails or preview areas unless the asset itself provides the visual. |
