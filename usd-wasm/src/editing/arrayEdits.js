/** Owns typed array commands for one document. Hosts supply the serialized stage
 * edit boundary and document-lifetime check; no renderer or DOM is imported. */
/** @param {import('../types/editing.js').ArrayEditsOptions} options */
export function createArrayEdits({ usd, stage: hostStage, edit, isCurrent }) {
  let history = [],
    cursor = 0,
    queue = Promise.resolve(),
    disposed = false;
  const current = () => {
    if (disposed || !isCurrent()) throw new Error("The document has changed.");
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // USDA uses short decimal spellings for float/half values. Compare the
  // stored precision so an unchanged authored 0.1 matches its native value.
  function expectedValueMatches(actual, expected, type) {
    const f32=/^(?:float[234]?|(?:color|point|normal|vector|texCoord)[234]f|quatf)\[\]$/.test(type);
    const half=/^(?:half[234]?|(?:color|point|normal|vector|texCoord)[234]h|quath)\[\]$/.test(type);
    const roundHalf=value=>{
      const number=Math.fround(value),a=Math.abs(number);
      if(!a||!Number.isFinite(a))return number;
      if(a>=65520)return Math.sign(number)*Infinity;
      const step=2**(Math.max(-14,Math.floor(Math.log2(a)))-10),q=a/step,low=Math.floor(q),fraction=q-low;
      return Math.sign(number)*(low+(fraction>.5||fraction===.5&&low%2?1:0))*step;
    };
    const round=half?roundHalf:f32?Math.fround:value=>value;
    function equal(a,b){
      if(Array.isArray(b))return Array.isArray(a)&&a.length===b.length&&b.every((value,index)=>equal(a[index],value));
      return a===(typeof b==='number'?round(b):b);
    }
    return equal(actual,expected);
  }
  function makePatch(before, after) {
    if (before.length === after.length)
      return {
        kind: "rows",
        length: before.length,
        changes: before.flatMap((value, index) =>
          same(value, after[index])
            ? []
            : [{ index, before: value, after: after[index] }],
        ),
      };
    let start = 0,
      tail = 0;
    while (
      start < Math.min(before.length, after.length) &&
      same(before[start], after[start])
    )
      start++;
    while (
      tail < Math.min(before.length, after.length) - start &&
      same(before[before.length - 1 - tail], after[after.length - 1 - tail])
    )
      tail++;
    return {
      kind: "splice",
      start,
      beforeLength: before.length,
      afterLength: after.length,
      before: before.slice(start, before.length - tail),
      after: after.slice(start, after.length - tail),
    };
  }
  function replayValue(value, patch, forward) {
    const from = forward ? "before" : "after",
      to = forward ? "after" : "before";
    const result = value.slice();
    if (patch.kind === "rows") {
      if (
        value.length !== patch.length ||
        patch.changes.some((change) => !same(value[change.index], change[from]))
      )
        throw new Error("The value was edited elsewhere.");
      for (const change of patch.changes) result[change.index] = change[to];
    } else {
      if (
        value.length !== patch[from + "Length"] ||
        !same(
          value.slice(patch.start, patch.start + patch[from].length),
          patch[from],
        )
      )
        throw new Error("The value was edited elsewhere.");
      result.splice(patch.start, patch[from].length, ...patch[to]);
    }
    return result;
  }
  async function write(command, value, { text, expected } = {}) {
    current();
    let before,
      after,
      attempted,
      changed = false;
    async function inLayer(action, checkText = true) {
      current();
      const stage = await hostStage.OpenLayerStage(command.layer);
      if (!stage) throw new Error("Layer is unavailable.");
      try {
        current();
        if (
          checkText &&
          text !== undefined &&
          await (stage.GetRootLayer().ExportToStringAsync?.() ?? stage.GetRootLayer().ExportToString()) !== text
        )
          throw new Error("Layer changed. Reopen the array before applying.");
        const prim = stage.GetPrimAtPath(command.primPath),
          attribute = prim.GetAttribute(command.name);
        try {
          if (!attribute.IsValid() || attribute.GetTypeName() !== command.type)
            throw new Error("The attribute has changed.");
          return await action(attribute);
        } finally {
          attribute.delete?.();
          prim.delete?.();
        }
      } finally {
        usd.ReleaseStage(stage);
      }
    }
    try {
      await edit(() =>
        inLayer(async (attribute) => {
          before = await attribute.Get(command.time);
          current();
          if (expected !== undefined && !expectedValueMatches(before, expected, command.type))
            throw new Error("The value was edited elsewhere.");
          const desired = typeof value === "function" ? value(before) : value;
          if (same(before, desired)) {
            after = before;
            return;
          }
          attempted = desired;
          if (!attribute.Set(desired, command.time))
            throw new Error("USD rejected this array.");
          changed = true;
          after = await attribute.Get(command.time);
        }),
      );
      current();
      return { before, after, changed };
    } catch (error) {
      if (changed && !disposed && isCurrent()) {
        try {
          await edit(() =>
            inLayer(async (attribute) => {
              // Recovery is a separate serialized edit. A different command may
              // have committed while the failed edit refreshed its host views.
              const value = await attribute.Get(command.time);
              current();
              if (!same(value, after === undefined ? attempted : after))
                throw new Error("The value was edited elsewhere; rollback was skipped.");
              if (!attribute.Set(before, command.time))
                throw new Error("Could not restore the array.");
            }, false),
          );
        } catch (rollbackError) {
          // Keep the originating failure (including its identity and stack).
          // Recovery diagnostics must not mask the reason the command failed.
          try { Object.defineProperty(error, "rollbackError", { value: rollbackError, configurable: true }); }
          catch { /* JavaScript permits throwing primitives and frozen errors. */ }
        }
      }
      throw error;
    }
  }
  function serialize(action) {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  }
  return {
    apply(layer, array, text, value, options = {}) {
      return serialize(async () => {
        if (!array.property)
          throw new Error("This literal is not a USD attribute.");
        const command = { layer, ...array.property };
        const result = await write(command, value, { text, expected: options.expected });
        if (!result.changed || same(result.before, result.after)) return;
        history.splice(cursor);
        history.push({
          ...command,
          patch: makePatch(result.before, result.after),
        });
        if (history.length > 50) history.shift();
        cursor = history.length;
      });
    },
    undo() {
      return serialize(async () => {
        if (!cursor) return;
        const command = history[cursor - 1];
        await write(command, (value) =>
          replayValue(value, command.patch, false),
        );
        cursor--;
      });
    },
    redo() {
      return serialize(async () => {
        if (cursor === history.length) return;
        const command = history[cursor];
        await write(command, (value) =>
          replayValue(value, command.patch, true),
        );
        cursor++;
      });
    },
    get canUndo() {
      return cursor > 0;
    },
    get canRedo() {
      return cursor < history.length;
    },
    dispose() {
      disposed = true;
      history = [];
      cursor = 0;
    },
  };
}
