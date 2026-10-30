import { fork } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { it } from "node:test";
import { getUsdModule } from "../../src/bindings/index.js";
const loadRuntime = () => getUsdModule({ print() {}, printErr() {} });
// A native parallel USD read can wait on a worker. Serve HTTP externally so the
// fixture server does not depend on the waiting native caller's event loop.
async function serve(body) {
  const child = fork(
    new URL("./helpers/http-server.mjs", import.meta.url),
    [body],
    { execArgv: [], stdio: ["ignore", "ignore", "inherit", "ipc"] },
  );
  const [ready] = await once(child, "message");
  let next = 0;
  return {
    port: ready.port,
    count() {
      const id = ++next;
      return new Promise((resolve) => {
        const listener = (message) => {
          if (message.kind === "count" && message.id === id) {
            child.off("message", listener);
            resolve(message.count);
          }
        };
        child.on("message", listener);
        child.send({ kind: "count", id });
      });
    },
    async close() {
      const closed = once(child, "exit");
      child.kill("SIGTERM");
      await closed;
    },
  };
}
it(
  "awaits metadata activation that resolves an unfetched HTTP reference",
  { timeout: 30000 },
  async () => {
    const USD = await loadRuntime();
    const server = await serve(
      '#usda 1.0\ndef Xform "Asset"\n{\n def Sphere "Child" {}\n}\n',
    );
    const hadSelf = Object.hasOwn(globalThis, "self"),
      previousSelf = globalThis.self;
    globalThis.self = globalThis;
    let stage;
    try {
      const address = server;
      USD.FS_createPath("/", "tmp", true, true);
      USD.FS_createDataFile(
        "/tmp",
        "metadata-http.usda",
        new TextEncoder().encode(
          '#usda 1.0\ndef Xform "Root" (active = false)\n{\n def Xform "Hidden" (prepend references = @http://127.0.0.1:' +
            address.port +
            "/asset.usda@</Asset>) {}\n}\n",
        ),
        true,
        true,
      );
      stage = await USD.OpenStage("/tmp/metadata-http.usda");
      assert.equal(await server.count(), 0);
      assert.equal(
        await stage.GetPrimAtPath("/Root").SetMetadata("active", true),
        true,
      );
      assert.equal(stage.GetPrimAtPath("/Root/Hidden/Child").IsValid(), true);
      assert.equal(await server.count(), 1);
    } finally {
      if (stage) USD.ReleaseStage(stage);
      if (hadSelf) globalThis.self = previousSelf;
      else delete globalThis.self;
      await server.close();
    }
  },
);

it(
  "awaits typed values loaded from an HTTP value clip",
  { timeout: 30000 },
  async () => {
    const USD = await loadRuntime();
    const server = await serve(
      '#usda 1.0\ndef "Model" {\n float size.timeSamples = {1:2,3:4}\n}\n',
    );
    const hadSelf = Object.hasOwn(globalThis, "self"),
      previousSelf = globalThis.self;
    globalThis.self = globalThis;
    let stage;
    try {
      USD.FS_createPath("/", "tmp", true, true);
      const write = (name, text) =>
        USD.FS_createDataFile(
          "/tmp",
          name,
          new TextEncoder().encode(text),
          true,
          true,
        );
      write("manifest.usda", '#usda 1.0\ndef "Model" {\n float size\n}\n');
      write(
        "typed-clip.usda",
        `#usda 1.0
 def "Model" (
 clips = { dictionary default = {
 asset[] assetPaths = [@http://127.0.0.1:${server.port}/clip.usda@]
 asset manifestAssetPath = @manifest.usda@
 string primPath = "/Model"
 double2[] active = [(0,0)]
 double2[] times = [(0,0),(5,5)]
 } }
 ) {
 float size
 }
`,
      );
      stage = await USD.OpenStage("/tmp/typed-clip.usda");
      assert.equal(await server.count(), 0);
      assert.equal(
        await stage.GetPrimAtPath("/Model").GetAttribute("size").Get(2),
        3,
      );
      assert.equal(await server.count(), 1);
    } finally {
      if (stage) USD.ReleaseStage(stage);
      if (hadSelf) globalThis.self = previousSelf;
      else delete globalThis.self;
      await server.close();
    }
  },
);
