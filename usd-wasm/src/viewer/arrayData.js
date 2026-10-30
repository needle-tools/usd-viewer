// Literal data only: never evaluate JavaScript while inspecting source.
const NUMBER = /[+-]?(?:\d[\d_]*(?:\.[\d_]*)?|\.[\d_]+)(?:[eE][+-]?[\d_]+)?/y;
const TOKEN =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|@@@[\s\S]*?@@@|@[^@\n]*@|<[^<>\n]*>|\/(?![/*])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+\/[dgimsuvy]*|[A-Za-z_$][\w$:.]*|[+-]?(?:\d[\d_]*(?:\.[\d_]*)?|\.[\d_]+)(?:[eE][+-]?[\d_]+)?|[^\s]/g;
function tokens(source) {
  return [...source.matchAll(TOKEN)]
    .filter((m) => !/^(?:\/\/|\/\*|#)/.test(m[0]))
    .map((m) => ({ value: m[0], start: m.index, end: m.index + m[0].length }));
}
function read(tokens, at, language, depth = 0) {
  if (depth > 8) return null;
  const first = tokens[at]?.value;
  if (first === "[" || (language === "usda" && first === "(")) {
    const end = first === "[" ? "]" : ")",
      values = [];
    let index = at + 1;
    while (tokens[index]?.value !== end) {
      const child = read(tokens, index, language, depth + 1);
      if (!child) return null;
      values.push(child.value);
      index = child.next;
      if (tokens[index]?.value === ",") index++;
      else if (tokens[index]?.value !== end) return null;
    }
    return { value: values, next: index + 1 };
  }
  // Gf vector constructors in authored examples are data when every argument is literal.
  if (
    language === "javascript" &&
    /^Gf\.(?:Vec[234][dfh]|Quat[fdh])$/.test(first) &&
    tokens[at + 1]?.value === "("
  ) {
    const part = read(tokens, at + 1, "usda", depth + 1);
    return part;
  }
  if (first === "true" || first === "false")
    return { value: first === "true", next: at + 1 };
  if (first?.[0] === '"' || first?.[0] === "'") {
    // Reject uncommon escapes rather than changing their meaning.
    if (first.startsWith('"""') || first.startsWith("'''")) return null;
    const body = first.slice(1, -1);
    if (/\\(?![\\'"nrt])/.test(body)) return null;
    return {
      value: body.replace(
        /\\([\\'"nrt])/g,
        (_, c) => ({ n: "\n", r: "\r", t: "\t" })[c] ?? c,
      ),
      next: at + 1,
    };
  }
  NUMBER.lastIndex = 0;
  const match = NUMBER.exec(first || "");
  if (match?.[0] === first) {
    const value = Number(first.replaceAll("_", ""));
    if (
      Number.isFinite(value) &&
      !(
        language === "usda" &&
        /^[+-]?\d+$/.test(first.replaceAll("_", "")) &&
        !Number.isSafeInteger(value)
      )
    )
      return { value, next: at + 1 };
  }
  return null;
}
function shape(value) {
  if (!Array.isArray(value)) return [];
  const inner = value.length ? shape(value[0]) : [];
  if (
    !inner ||
    value.some(
      (child) => JSON.stringify(shape(child)) !== JSON.stringify(inner),
    )
  )
    return null;
  return [value.length, ...inner];
}
const leafCount = (value) =>
  Array.isArray(value) ? value.reduce((sum, v) => sum + leafCount(v), 0) : 1;
export function parseArrayLiteral(source, language = "javascript") {
  const list = tokens(source),
    result = read(list, 0, language);
  if (
    !result ||
    result.next !== list.length ||
    list[0]?.value !== "[" ||
    !shape(result.value)
  )
    throw new TypeError("Use a rectangular array of literal values.");
  return result.value;
}
export function serializeArray(value, language = "javascript") {
  const scalar = (v) => (typeof v === "string" ? JSON.stringify(v) : String(v));
  const nested = (v, depth) =>
    !Array.isArray(v)
      ? scalar(v)
      : (language === "usda" && depth > 0 ? "(" : "[") +
        v.map((c) => nested(c, depth + 1)).join(", ") +
        (language === "usda" && depth > 0 ? ")" : "]");
  return nested(value, 0);
}
export function arrayLayout(value, type = "", name = "") {
  let dims = shape(value);
  if (value.length === 0) {
    const matrix = type.match(/^(?:matrix|frame)([234])d\[\]$/),
      vector = type.match(
        /^(?:(?:color|point|normal|vector|texCoord)[234][dfh]|(?:float|double|half|int)[234])\[\]$/,
      );
    if (matrix) dims = [0, Number(matrix[1]), Number(matrix[1])];
    else if (/^quat[dfh]\[\]$/.test(type)) dims = [0, 4];
    else if (vector) dims = [0, Number(type.match(/[234]/)[0])];
  }
  if (!dims || dims.length > 3)
    throw new TypeError("Use scalar, vector or matrix rows.");
  const width = dims.slice(1).reduce((a, b) => a * b, 1);
  if (width > 16) throw new TypeError("Rows may contain up to 16 components.");
  let columns = Array.from({ length: width }, (_, i) =>
    width === 1 ? "Value" : String(i),
  );
  if (/matrix|frame/.test(type) || dims.length === 3)
    columns = Array.from(
      { length: width },
      (_, i) => `m${Math.floor(i / (dims[2] || 4))}${i % (dims[2] || 4)}`,
    );
  else if (width === 4 && /quat|rotation|orientation/i.test(type + " " + name))
    columns = ["W", "X", "Y", "Z"];
  else if (width >= 3 && /color/i.test(type + " " + name))
    columns = ["R", "G", "B", ...(width === 4 ? ["A"] : [])];
  else if (width === 2 && /texCoord|\bst\b|\buv/i.test(type + " " + name))
    columns = ["U", "V"];
  else if (width > 1 && width <= 4)
    columns = ["X", "Y", "Z", "W"].slice(0, width);
  return {
    dims,
    width,
    columns,
    rows: value.map((row) => (Array.isArray(row) ? row.flat(Infinity) : [row])),
    color: columns[0] === "R",
  };
}
export function fromRows(rows, dims) {
  return rows.map((row) =>
    dims.length < 2
      ? row[0]
      : dims.length < 3
        ? row.slice()
        : Array.from({ length: dims[1] }, (_, r) =>
            row.slice(r * dims[2], (r + 1) * dims[2]),
          ),
  );
}
export function findArrays(
  source,
  language = "javascript",
  { includeSmall = false } = {},
) {
  if (!["javascript", "usda"].includes(language)) return [];
  const list = tokens(source),
    result = [],
    stack = [];
  let pending = null;
  const path = () =>
    stack
      .filter((f) => f.kind === "prim")
      .map((f) => f.name)
      .join("/");
  for (let i = 0; i < list.length; i++) {
    const t = list[i],
      v = t.value;
    if (language === "usda" && /^(def|over|class)$/.test(v)) {
      const name = list[i + 1]?.value.startsWith('"')
        ? list[i + 1]
        : list[i + 2];
      if (name?.value.startsWith('"'))
        pending = { name: JSON.parse(name.value), paren: 0 };
    }
    if (v === "(" && pending) pending.paren++;
    if (v === ")" && pending) pending.paren--;
    if (v === "{") {
      const prev = list.slice(Math.max(0, i - 6), i).map((x) => x.value);
      if (pending && pending.paren === 0) {
        stack.push({ kind: "prim", name: pending.name });
        pending = null;
      } else {
        const decl = prev
          .join(" ")
          .match(/(\w+) \[ \] ([\w:]+)\.timeSamples =$/);
        stack.push(
          decl
            ? { kind: "samples", type: decl[1] + "[]", name: decl[2] }
            : { kind: prev.includes("variantSet") ? "variant" : "other" },
        );
      }
    }
    if (v === "}") stack.pop();
    if (
      v !== "[" ||
      (language === "usda" &&
        list[i + 1]?.value === "]" &&
        /^[A-Za-z]/.test(list[i - 1]?.value || ""))
    )
      continue;
    const parsed = read(list, i, language);
    if (!parsed) continue;
    const value = parsed.value,
      dims = shape(value);
    if (
      !dims ||
      dims.length > 3 ||
      dims.slice(1).reduce((a, b) => a * b, 1) > 16
    )
      continue;
    const end = list[parsed.next - 1].end,
      before = source.slice(Math.max(0, t.start - 200), t.start);
    const decl = before.match(/(\w+)\[\]\s+([\w:]+)\s*=\s*$/),
      samples = stack.findLast((f) => f.kind === "samples");
    let property = null,
      type = decl ? decl[1] + "[]" : "",
      name = decl?.[2];
    if (
      language === "usda" &&
      (decl || samples) &&
      path() &&
      ["prim", "samples"].includes(stack.at(-1)?.kind) &&
      !stack.some((f) => f.kind === "variant")
    ) {
      const frame = samples ? before.match(/([+-]?[\d.eE]+)\s*:\s*$/) : null;
      if (!samples || frame)
        property = {
          primPath: "/" + path(),
          name: name || samples.name,
          type: decl ? type : samples.type,
          time: frame ? Number(frame[1]) : Number.NaN,
        };
    }
    if (language === "javascript") {
      const constructor = before.match(
        /Vt\.(Vec[234][dfh]|Matrix4d|Quat[dfh]|Float|Double|Int|Token|String)Array\(\s*$/,
      )?.[1];
      name =
        before.match(
          /(?:const|let|var)\s+(\w+)\s*=\s*(?:Vt\.\w+Array\(\s*)?$/,
        )?.[1] ||
        before.match(/([\w:]+)\s*[:=]\s*$/)?.[1] ||
        "Array";
      type = constructor
        ? constructor
            .replace(
              /^Vec([234])([dfh])$/,
              (_, n, p) => ({ d: "double", f: "float", h: "half" })[p] + n,
            )
            .replace(/^[A-Z]/, (c) => c.toLowerCase()) + "[]"
        : "";
      if (before.endsWith("[")) continue;
    }
    if (language === "usda" && property?.type === "bool[]") {
      if (value.some((v) => ![0, 1, true, false].includes(v))) continue;
      for (let n = 0; n < value.length; n++) value[n] = !!value[n];
    }
    if (
      includeSmall ||
      leafCount(value) >= 8 ||
      value.length === 0 ||
      (language === "usda" && decl)
    )
      result.push({
        start: t.start,
        end,
        value,
        type: property?.type || type || "",
        name: name || property?.name || "Array",
        property,
        language,
      });
    i = parsed.next - 1;
  }
  return result;
}
