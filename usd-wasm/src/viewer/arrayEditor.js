import {
  arrayLayout,
  fromRows,
  parseArrayLiteral,
  serializeArray,
  findArrays,
} from "./arrayData.js";
import { viewerIcon } from "./icons.js";
const PAGE = 32;
const TYPES = {
  float: [0],
  bool: [false],
  int: [0],
  point3f: [[0, 0, 0]],
  color3f: [[0.5, 0.5, 0.5]],
  texCoord2f: [[0, 0]],
  quatf: [[1, 0, 0, 0]],
  matrix4d: [
    [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ],
  ],
  token: [""],
};
/** A bounded table for one literal. Applying is delegated to the document owner. */
export function mountArrayEditor(
  container,
  {
    value = [],
    type = "",
    name = "Array",
    language = "javascript",
    editable = true,
    timeCode = Number.NaN,
    create = false,
    onApply,
    onClose,
  } = {},
) {
  const doc = container.ownerDocument,
    node = (tag, cls, text) => {
      const el = doc.createElement(tag);
      el.className = cls || "";
      if (text !== undefined) el.textContent = text;
      return el;
    };
  const root = node("section", "usd-array-editor");
  root.setAttribute("aria-label", name + " data");
  const header = node("div", "usd-array-toolbar"),
    title = node("strong", "usd-array-title", name),
    meta = node("span", "usd-array-meta");
  header.append(title, meta);
  const button = (parent, label, action, icon) => {
    const b = node("button", "usd-array-button", icon ? undefined : label);
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    if (icon) b.append(viewerIcon(icon));
    b.onclick = action;
    parent.append(b);
    return b;
  };
  const close = () => {
    root.remove();
    onClose?.();
  };
  const tools = node("div", "usd-array-toolbar usd-array-tools");
  const undo = button(tools, "Undo", () => replay(false)),
    redo = button(tools, "Redo", () => replay(true));
  const rawToggle = button(tools, "Raw", () => {
    rawMode = !rawMode;
    rawToggle.setAttribute("aria-pressed", String(rawMode));
    if (rawMode) raw.value = serializeArray(values(), language);
    paint();
  });
  button(tools, "Copy table", async () => {
    try {
      await doc.defaultView.navigator.clipboard.writeText(
        [layout.columns.join("\t"), ...rows.map((row) => row.join("\t"))].join(
          "\n",
        ),
      );
    } catch (error) {
      status.textContent = error.message;
    }
  });
  button(header, "Close data", close, "close");
  const setup = node("div", "usd-array-toolbar"),
    select = node("select");
  select.setAttribute("aria-label", "Array type");
  for (const key of Object.keys(TYPES)) {
    const option = node("option", "", key + "[]");
    option.value = key;
    select.append(option);
  }
  select.value =
    type.replace("[]", "") in TYPES ? type.replace("[]", "") : "point3f";
  const count = node("input");
  count.type = "number";
  count.min = "0";
  count.max = "10000";
  count.value = "4";
  count.setAttribute("aria-label", "Initial rows");
  setup.append(select, count);
  setup.hidden = !create;
  const scroll = node("div", "usd-array-scroll"),
    table = node("table", "usd-array-table");
  scroll.append(table);
  const raw = node("textarea", "usd-array-raw");
  raw.setAttribute("aria-label", "Array source");
  raw.spellcheck = false;
  raw.readOnly = !editable;
  const footer = node("div", "usd-array-footer"),
    pagination = node("div", "usd-array-toolbar usd-array-pagination"),
    actions = node("div", "usd-array-toolbar"),
    position = node("span", "usd-array-position");
  const previous = button(
    pagination,
    "Previous rows",
    () => {
      page--;
      paint();
    },
    "chevron_left",
  );
  pagination.append(position);
  const next = button(
    pagination,
    "Next rows",
    () => {
      page++;
      paint();
    },
    "chevron_right",
  );
  const goto = node("input", "usd-array-goto");
  goto.type = "number";
  goto.min = "0";
  goto.setAttribute("aria-label", "Go to row");
  goto.placeholder = "Row";
  goto.onchange = () => {
    page = Math.floor(Math.max(0, Number(goto.value) || 0) / PAGE);
    paint();
  };
  pagination.append(goto);
  footer.append(pagination, actions);
  const add = button(actions, "Add row", () => {
    const seed = TYPES[type.replace("[]", "")]?.[0];
    const after =
      seed !== undefined
        ? Array.isArray(seed)
          ? seed.flat(Infinity)
          : [seed]
        : rows[0]?.map((v) =>
            typeof v === "string" ? "" : typeof v === "boolean" ? false : 0,
          ) || Array(layout.width).fill(0);
    change([{ at: rows.length, before: null, after }]);
  });
  const status = node("div", "usd-array-status");
  status.setAttribute("role", "status");
  const apply = button(actions, "Apply", async () => {
    if (busy) return;
    status.textContent = "";
    busy = true;
    setBusy();
    try {
      if (!rawMode && invalid.size)
        throw new TypeError("Correct invalid cells before applying.");
      const data = rawMode ? parseArrayLiteral(raw.value, language) : values();
      const actual = arrayLayout(data, type, name);
      if (
        data.length &&
        (actual.width !== layout.width ||
          actual.dims.length !== layout.dims.length)
      )
        throw new TypeError("Keep the same row shape.");
      validate(data.flat(Infinity));
      await onApply?.(data);
      if (!disposed) close();
    } catch (error) {
      if (!disposed) status.textContent = error.message || String(error);
    } finally {
      busy = false;
      if (!disposed) setBusy();
    }
  });
  apply.classList.add("usd-array-apply");
  apply.hidden = add.hidden = !editable;
  root.append(header, tools, setup, scroll, raw, status, footer);
  container.append(root);
  let layout,
    rows,
    page = 0,
    rawMode = false,
    busy = false,
    disposed = false,
    history = [],
    cursor = 0,
    invalid = new Map();
  function init(data) {
    layout = arrayLayout(data, type, name);
    rows = layout.rows.map((row) => row.slice());
    page = 0;
    history = [];
    cursor = 0;
    invalid.clear();
    paint();
  }
  const values = () => fromRows(rows, layout.dims);
  function validate(values) {
    const scalar = type.replace("[]", "");
    for (const value of values) {
      if (
        type &&
        !/^(?:token|string|asset|bool)/.test(scalar) &&
        typeof value !== "number"
      )
        throw new TypeError("This attribute requires numeric components.");
      if (
        type &&
        /^(?:token|string|asset)/.test(scalar) &&
        typeof value !== "string"
      )
        throw new TypeError("This attribute requires strings.");
      if (scalar === "bool" && typeof value !== "boolean")
        throw new TypeError("This attribute requires true or false.");
      if (typeof value === "number") {
        if (!Number.isFinite(value))
          throw new TypeError("Enter a finite number.");
        if (
          /^(u?int|uchar)/.test(scalar) &&
          (!Number.isSafeInteger(value) ||
            value < (scalar.startsWith("u") ? 0 : -2147483648) ||
            value >
              (scalar === "uchar"
                ? 255
                : scalar === "uint"
                  ? 4294967295
                  : 2147483647))
        )
          throw new TypeError("Enter an integer in range for " + scalar + ".");
        if (
          /(?:f$|float)/.test(scalar) &&
          Math.abs(value) > 3.4028234663852886e38
        )
          throw new TypeError("Value exceeds float range.");
        if (/(?:h$|half)/.test(scalar) && Math.abs(value) > 65504)
          throw new TypeError("Value exceeds half range.");
      } else if (!["string", "boolean"].includes(typeof value))
        throw new TypeError("Enter a literal value.");
    }
  }
  function converted(text, old) {
    if (typeof old === "string") return text;
    if (typeof old === "boolean") {
      if (!["true", "false"].includes(text))
        throw new TypeError("Enter true or false.");
      return text === "true";
    }
    if (!text.trim()) throw new TypeError("Enter a number.");
    const number = Number(text);
    validate([number]);
    return number;
  }
  function setBusy() {
    for (const control of root.querySelectorAll("button,input,textarea,select"))
      control.disabled = busy;
    if (!busy) paint();
  }
  function change(patches) {
    if (!patches.length) return;
    if (
      invalid.size &&
      patches.some((p) => p.before === null || p.after === null)
    ) {
      status.textContent = "Correct invalid cells before changing rows.";
      return;
    }
    history.splice(cursor);
    history.push(patches);
    if (history.length > 100) history.shift();
    cursor = history.length;
    for (const p of patches)
      if (p.after === null) rows.splice(p.at, 1);
      else if (p.before === null) rows.splice(p.at, 0, p.after.slice());
      else rows[p.at] = p.after.slice();
    paint();
  }
  function replay(forward) {
    if (invalid.size) {
      invalid.clear();
      status.textContent = "";
      paint();
      return;
    }
    if (busy || (forward ? cursor >= history.length : cursor === 0)) return;
    const patches = history[forward ? cursor++ : --cursor];
    for (const p of forward ? patches : [...patches].reverse()) {
      const from = forward ? p.before : p.after,
        to = forward ? p.after : p.before;
      if (to === null) rows.splice(p.at, 1);
      else if (from === null) rows.splice(p.at, 0, to.slice());
      else rows[p.at] = to.slice();
    }
    paint();
  }
  function paint() {
    page = Math.max(
      0,
      Math.min(page, Math.max(0, Math.ceil(rows.length / PAGE) - 1)),
    );
    const start = page * PAGE,
      end = Math.min(rows.length, start + PAGE);
    meta.textContent = `${type || layout.columns.join(" · ")} · ${rows.length.toLocaleString()} ${rows.length === 1 ? "row" : "rows"}${Number.isFinite(timeCode) ? " · t=" + timeCode : ""}`;
    scroll.hidden = rawMode;
    raw.hidden = !rawMode;
    rawToggle.setAttribute("aria-pressed", String(rawMode));
    pagination.hidden = rows.length <= PAGE;
    actions.hidden = !editable;
    previous.disabled = page === 0;
    next.disabled = end >= rows.length;
    goto.max = String(Math.max(0, rows.length - 1));
    position.textContent = rows.length
      ? `${start}–${end - 1} / ${rows.length.toLocaleString()}`
      : "0 rows";
    undo.disabled = cursor === 0;
    redo.disabled = cursor === history.length;
    undo.hidden = redo.hidden = !editable;
    add.hidden = !editable || rawMode;
    table.replaceChildren();
    if (rawMode) return;
    const head = node("thead"),
      h = node("tr");
    h.append(node("th", "", "#"));
    for (const label of layout.dims.length === 3 ? ["Matrix"] : layout.columns)
      h.append(node("th", "", label));
    if (layout.color) h.append(node("th", "", "Color"));
    if (editable) h.append(node("th"));
    head.append(h);
    table.append(head);
    const body = node("tbody");
    for (let i = start; i < end; i++) {
      const tr = node("tr");
      tr.append(node("th", "", i));
      const matrix =
        layout.dims.length === 3 ? node("div", "usd-array-matrix") : null;
      if (matrix) {
        matrix.style.setProperty("--matrix-columns", layout.dims[2]);
        const cell = node("td");
        cell.append(matrix);
        tr.append(cell);
      }
      rows[i].forEach((v, j) => {
        const cell = node(matrix ? "div" : "td");
        if (!editable) cell.textContent = String(v);
        else {
          const input = node("input");
          const cellKey = i + ":" + j;
          input.value = invalid.get(cellKey) ?? String(v);
          if (invalid.has(cellKey)) input.setAttribute("aria-invalid", "true");
          input.setAttribute("aria-label", `Row ${i} ${layout.columns[j]}`);
          input.spellcheck = false;
          input.inputMode = typeof v === "number" ? "decimal" : "text";
          input.onchange = () => {
            try {
              const after = rows[i].slice();
              after[j] = converted(input.value, v);
              invalid.delete(cellKey);
              input.removeAttribute("aria-invalid");
              if (after[j] !== v)
                change([{ at: i, before: rows[i].slice(), after }]);
              status.textContent = "";
            } catch (error) {
              status.textContent = error.message;
              invalid.set(cellKey, input.value);
              input.setAttribute("aria-invalid", "true");
            }
          };
          input.onkeydown = (event) => {
            if (
              !["Tab", "Enter", "ArrowUp", "ArrowDown"].includes(event.key) ||
              event.ctrlKey ||
              event.metaKey
            )
              return;
            event.preventDefault();
            input.onchange();
            if (invalid.has(cellKey)) return;
            let row = i,
              column = j;
            if (event.key === "Tab") {
              column += event.shiftKey ? -1 : 1;
              if (column < 0) {
                row--;
                column = layout.width - 1;
              } else if (column >= layout.width) {
                row++;
                column = 0;
              }
            } else
              row +=
                event.key === "ArrowUp" ||
                (event.key === "Enter" && event.shiftKey)
                  ? -1
                  : 1;
            if (row < 0) {
              rawToggle.focus();
              return;
            }
            if (row >= rows.length) {
              apply.focus();
              return;
            }
            page = Math.floor(row / PAGE);
            paint();
            const target = [...table.querySelectorAll("input")].find(
              (el) =>
                el.getAttribute("aria-label") ===
                `Row ${row} ${layout.columns[column]}`,
            );
            target?.focus();
            target?.select();
          };
          input.onpaste = (event) => {
            const text = event.clipboardData?.getData("text/plain");
            if (!text?.includes("\t") && !text?.includes("\n")) return;
            event.preventDefault();
            try {
              const block = text
                .trimEnd()
                .split(/\r?\n/)
                .map((line) => line.split("\t"));
              if (block.some((row) => j + row.length > layout.width))
                throw new TypeError("Pasted columns exceed the row width.");
              const patches = block.map((parts, k) => {
                const before = rows[i + k]?.slice() || null,
                  after =
                    before?.slice() ||
                    rows[i].map((v) =>
                      typeof v === "string"
                        ? ""
                        : typeof v === "boolean"
                          ? false
                          : 0,
                    );
                parts.forEach(
                  (part, l) => (after[j + l] = converted(part, rows[i][j + l])),
                );
                return { at: i + k, before, after };
              });
              change(patches);
              status.textContent = "";
            } catch (error) {
              status.textContent = error.message;
            }
          };
          cell.append(input);
        }
        if (matrix) matrix.append(cell);
        else tr.append(cell);
      });
      if (layout.color) {
        const cell = node("td"),
          swatch = node(editable ? "input" : "span", "usd-array-swatch");
        if (editable) {
          swatch.type = "color";
          swatch.setAttribute("aria-label", `Row ${i} color`);
          const srgb = (v) =>
            v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
          swatch.value =
            "#" +
            rows[i]
              .slice(0, 3)
              .map((v) =>
                Math.round(Math.max(0, Math.min(1, srgb(v))) * 255)
                  .toString(16)
                  .padStart(2, "0"),
              )
              .join("");
          swatch.onchange = () => {
            const after = rows[i].slice();
            for (let c = 0; c < 3; c++) {
              const v =
                parseInt(swatch.value.slice(1 + c * 2, 3 + c * 2), 16) / 255;
              after[c] =
                v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            }
            change([{ at: i, before: rows[i].slice(), after }]);
          };
        } else
          swatch.style.background = `color(srgb-linear ${rows[i].slice(0, 3).join(" ")})`;
        cell.append(swatch);
        tr.append(cell);
      }
      if (editable) {
        const cell = node("td");
        button(
          cell,
          `Remove row ${i}`,
          () => change([{ at: i, before: rows[i].slice(), after: null }]),
          "close",
        );
        tr.append(cell);
      }
      body.append(tr);
    }
    table.append(body);
  }
  select.onchange = count.onchange = () => {
    const n = Number(count.value);
    if (!Number.isInteger(n) || n < 0 || n > 10000) {
      status.textContent = "Choose 0–10,000 rows.";
      return;
    }
    type = select.value + "[]";
    init(
      Array.from({ length: n }, () => structuredClone(TYPES[select.value][0])),
    );
  };
  root.onkeydown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      if (editable) apply.click();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "z" &&
      !event.target.matches("input,textarea")
    ) {
      event.preventDefault();
      replay(event.shiftKey);
    }
  };
  init(value);
  if (create) select.onchange();
  return {
    element: root,
    dispose() {
      disposed = true;
      root.remove();
    },
    get value() {
      return values();
    },
  };
}

/** The same table edits literals already under the caret, or inserts new data. */
export function attachArrayInput(input, button, container, { onToggle } = {}) {
  let editor;
  const close = () => {
    editor?.dispose();
    editor = null;
    onToggle?.(false);
  };
  button.onclick = () => {
    if (editor) {
      close();
      return;
    }
    const text = input.value,
      start = input.selectionStart,
      end = input.selectionEnd;
    const found = findArrays(text, "javascript", { includeSmall: true }).find(
      (array) => array.start <= start && array.end >= end,
    );
    onToggle?.(true);
    editor = mountArrayEditor(container, {
      value: found?.value || [],
      type: found?.type || "",
      name: found?.name || "Array",
      create: !found || (found.value.length === 0 && !found.type),
      onClose: () => {
        editor = null;
        onToggle?.(false);
        input.focus();
      },
      onApply: (value) => {
        // Refuse an old range if another action changed the draft while the table was open.
        if (input.value !== text)
          throw new Error("Source changed. Reopen the array.");
        const from = found?.start ?? start,
          to = found?.end ?? end;
        close();
        input.focus();
        input.setSelectionRange(from, to);
        const literal = serializeArray(value);
        if (!input.ownerDocument.execCommand("insertText", false, literal))
          input.setRangeText(literal, from, to, "end");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      },
    });
  };
  return {
    close,
    dispose() {
      close();
      button.onclick = null;
    },
  };
}
