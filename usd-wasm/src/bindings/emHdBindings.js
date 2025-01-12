var getUsdModule = ((args) => {
  var _scriptDir =
    typeof document !== "undefined" && document.currentScript
      ? document.currentScript.src
      : undefined;
  if (typeof __filename !== "undefined") _scriptDir = _scriptDir || __filename;
  return function (moduleArg = {
    // module overrides can be supplied here
    locateFile: (path, prefix) => {
      if (!prefix && _scriptDir) prefix = _scriptDir.substr(0, _scriptDir.lastIndexOf('/') + 1);
      return prefix + path;
    },
    ...args
}) {
    function GROWABLE_HEAP_I8() {
      if (wasmMemory.buffer != HEAP8.buffer) {
        updateMemoryViews();
      }
      return HEAP8;
    }
    function GROWABLE_HEAP_U8() {
      if (wasmMemory.buffer != HEAP8.buffer) {
        updateMemoryViews();
      }
      return HEAPU8;
    }
    function GROWABLE_HEAP_I16() {
      if (wasmMemory.buffer != HEAP8.buffer) {
        updateMemoryViews();
      }
      return HEAP16;
    }
    function GROWABLE_HEAP_U16() {
      if (wasmMemory.buffer != HEAP8.buffer) {
        updateMemoryViews();
      }
      return HEAPU16;
    }
    function GROWABLE_HEAP_I32() {
      if (wasmMemory.buffer != HEAP8.buffer) {
        updateMemoryViews();
      }
      return HEAP32;
    }
    function GROWABLE_HEAP_U32() {
      if (wasmMemory.buffer != HEAP8.buffer) {
        updateMemoryViews();
      }
      return HEAPU32;
    }
    function GROWABLE_HEAP_F32() {
      if (wasmMemory.buffer != HEAP8.buffer) {
        updateMemoryViews();
      }
      return HEAPF32;
    }
    function GROWABLE_HEAP_F64() {
      if (wasmMemory.buffer != HEAP8.buffer) {
        updateMemoryViews();
      }
      return HEAPF64;
    }
    var Module = moduleArg;
    var readyPromiseResolve, readyPromiseReject;
    Module["ready"] = new Promise((resolve, reject) => {
      readyPromiseResolve = resolve;
      readyPromiseReject = reject;
    });
    if (!Module.expectedDataFileDownloads) {
      Module.expectedDataFileDownloads = 0;
    }
    Module.expectedDataFileDownloads++;
    (function () {
      if (Module["ENVIRONMENT_IS_PTHREAD"] || Module["$ww"]) return;
      var loadPackage = function (metadata) {
        var PACKAGE_PATH = "";
        if (typeof window === "object") {
          PACKAGE_PATH = window["encodeURIComponent"](
            window.location.pathname
              .toString()
              .substring(
                0,
                window.location.pathname.toString().lastIndexOf("/"),
              ) + "/",
          );
        } else if (
          typeof process === "undefined" &&
          typeof location !== "undefined"
        ) {
          PACKAGE_PATH = encodeURIComponent(
            location.pathname
              .toString()
              .substring(0, location.pathname.toString().lastIndexOf("/")) +
              "/",
          );
        }
        var PACKAGE_NAME = "emHdBindings.data";
        var REMOTE_PACKAGE_BASE = "emHdBindings.data";
        if (
          typeof Module["locateFilePackage"] === "function" &&
          !Module["locateFile"]
        ) {
          Module["locateFile"] = Module["locateFilePackage"];
          err(
            "warning: you defined Module.locateFilePackage, that has been renamed to Module.locateFile (using your locateFilePackage for now)",
          );
        }
        var REMOTE_PACKAGE_NAME = Module["locateFile"]
          ? Module["locateFile"](REMOTE_PACKAGE_BASE, "")
          : REMOTE_PACKAGE_BASE;
        var REMOTE_PACKAGE_SIZE = metadata["remote_package_size"];
        function fetchRemotePackage(
          packageName,
          packageSize,
          callback,
          errback,
        ) {
          if (
            typeof process === "object" &&
            typeof process.versions === "object" &&
            typeof process.versions.node === "string"
          ) {
            require("fs").readFile(packageName, function (err, contents) {
              if (err) {
                errback(err);
              } else {
                callback(contents.buffer);
              }
            });
            return;
          }
          var xhr = new XMLHttpRequest();
          xhr.open("GET", packageName, true);
          xhr.responseType = "arraybuffer";
          xhr.onprogress = function (event) {
            var url = packageName;
            var size = packageSize;
            if (event.total) size = event.total;
            if (event.loaded) {
              if (!xhr.addedTotal) {
                xhr.addedTotal = true;
                if (!Module.dataFileDownloads) Module.dataFileDownloads = {};
                Module.dataFileDownloads[url] = {
                  loaded: event.loaded,
                  total: size,
                };
              } else {
                Module.dataFileDownloads[url].loaded = event.loaded;
              }
              var total = 0;
              var loaded = 0;
              var num = 0;
              for (var download in Module.dataFileDownloads) {
                var data = Module.dataFileDownloads[download];
                total += data.total;
                loaded += data.loaded;
                num++;
              }
              total = Math.ceil(
                (total * Module.expectedDataFileDownloads) / num,
              );
              if (Module["setStatus"])
                Module["setStatus"](`Downloading data... (${loaded}/${total})`);
            } else if (!Module.dataFileDownloads) {
              if (Module["setStatus"])
                Module["setStatus"]("Downloading data...");
            }
          };
          xhr.onerror = function (event) {
            throw new Error("NetworkError for: " + packageName);
          };
          xhr.onload = function (event) {
            if (
              xhr.status == 200 ||
              xhr.status == 304 ||
              xhr.status == 206 ||
              (xhr.status == 0 && xhr.response)
            ) {
              var packageData = xhr.response;
              callback(packageData);
            } else {
              throw new Error(xhr.statusText + " : " + xhr.responseURL);
            }
          };
          xhr.send(null);
        }
        function handleError(error) {
          console.error("package error:", error);
        }
        var fetchedCallback = null;
        var fetched = Module["getPreloadedPackage"]
          ? Module["getPreloadedPackage"](
              REMOTE_PACKAGE_NAME,
              REMOTE_PACKAGE_SIZE,
            )
          : null;
        if (!fetched)
          fetchRemotePackage(
            REMOTE_PACKAGE_NAME,
            REMOTE_PACKAGE_SIZE,
            function (data) {
              if (fetchedCallback) {
                fetchedCallback(data);
                fetchedCallback = null;
              } else {
                fetched = data;
              }
            },
            handleError,
          );
        function runWithFS() {
          function assert(check, msg) {
            if (!check) throw msg + new Error().stack;
          }
          Module["FS_createPath"]("/", "usd", true, true);
          Module["FS_createPath"]("/usd", "ar", true, true);
          Module["FS_createPath"]("/usd/ar", "resources", true, true);
          Module["FS_createPath"]("/usd", "hd", true, true);
          Module["FS_createPath"]("/usd/hd", "resources", true, true);
          Module["FS_createPath"](
            "/usd/hd/resources",
            "codegenTemplates",
            true,
            true,
          );
          Module["FS_createPath"]("/usd", "httpResolver", true, true);
          Module["FS_createPath"]("/usd/httpResolver", "resources", true, true);
          Module["FS_createPath"]("/usd", "ndr", true, true);
          Module["FS_createPath"]("/usd/ndr", "resources", true, true);
          Module["FS_createPath"]("/usd", "sdf", true, true);
          Module["FS_createPath"]("/usd/sdf", "resources", true, true);
          Module["FS_createPath"]("/usd", "usd", true, true);
          Module["FS_createPath"]("/usd/usd", "resources", true, true);
          Module["FS_createPath"](
            "/usd/usd/resources",
            "codegenTemplates",
            true,
            true,
          );
          Module["FS_createPath"]("/usd/usd/resources", "usd", true, true);
          Module["FS_createPath"]("/usd", "usdGeom", true, true);
          Module["FS_createPath"]("/usd/usdGeom", "resources", true, true);
          Module["FS_createPath"](
            "/usd/usdGeom/resources",
            "usdGeom",
            true,
            true,
          );
          Module["FS_createPath"]("/usd", "usdHydra", true, true);
          Module["FS_createPath"]("/usd/usdHydra", "resources", true, true);
          Module["FS_createPath"](
            "/usd/usdHydra/resources",
            "shaders",
            true,
            true,
          );
          Module["FS_createPath"](
            "/usd/usdHydra/resources",
            "usdHydra",
            true,
            true,
          );
          Module["FS_createPath"]("/usd", "usdImaging", true, true);
          Module["FS_createPath"]("/usd/usdImaging", "resources", true, true);
          Module["FS_createPath"]("/usd", "usdLux", true, true);
          Module["FS_createPath"]("/usd/usdLux", "resources", true, true);
          Module["FS_createPath"](
            "/usd/usdLux/resources",
            "usdLux",
            true,
            true,
          );
          Module["FS_createPath"]("/usd", "usdRender", true, true);
          Module["FS_createPath"]("/usd/usdRender", "resources", true, true);
          Module["FS_createPath"](
            "/usd/usdRender/resources",
            "usdRender",
            true,
            true,
          );
          Module["FS_createPath"]("/usd", "usdShade", true, true);
          Module["FS_createPath"]("/usd/usdShade", "resources", true, true);
          Module["FS_createPath"](
            "/usd/usdShade/resources",
            "usdShade",
            true,
            true,
          );
          Module["FS_createPath"]("/usd", "usdShaders", true, true);
          Module["FS_createPath"]("/usd/usdShaders", "resources", true, true);
          Module["FS_createPath"](
            "/usd/usdShaders/resources",
            "shaders",
            true,
            true,
          );
          Module["FS_createPath"]("/usd", "usdSkel", true, true);
          Module["FS_createPath"]("/usd/usdSkel", "resources", true, true);
          Module["FS_createPath"](
            "/usd/usdSkel/resources",
            "usdSkel",
            true,
            true,
          );
          Module["FS_createPath"]("/usd", "usdVol", true, true);
          Module["FS_createPath"]("/usd/usdVol", "resources", true, true);
          Module["FS_createPath"](
            "/usd/usdVol/resources",
            "usdVol",
            true,
            true,
          );
          function DataRequest(start, end, audio) {
            this.start = start;
            this.end = end;
            this.audio = audio;
          }
          DataRequest.prototype = {
            requests: {},
            open: function (mode, name) {
              this.name = name;
              this.requests[name] = this;
              Module["addRunDependency"](`fp ${this.name}`);
            },
            send: function () {},
            onload: function () {
              var byteArray = this.byteArray.subarray(this.start, this.end);
              this.finish(byteArray);
            },
            finish: function (byteArray) {
              var that = this;
              Module["FS_createDataFile"](
                this.name,
                null,
                byteArray,
                true,
                true,
                true,
              );
              Module["removeRunDependency"](`fp ${that.name}`);
              this.requests[this.name] = null;
            },
          };
          var files = metadata["files"];
          for (var i = 0; i < files.length; ++i) {
            new DataRequest(
              files[i]["start"],
              files[i]["end"],
              files[i]["audio"] || 0,
            ).open("GET", files[i]["filename"]);
          }
          function processPackageData(arrayBuffer) {
            assert(arrayBuffer, "Loading data file failed.");
            assert(
              arrayBuffer.constructor.name === ArrayBuffer.name,
              "bad input to processPackageData",
            );
            var byteArray = new Uint8Array(arrayBuffer);
            DataRequest.prototype.byteArray = byteArray;
            var files = metadata["files"];
            for (var i = 0; i < files.length; ++i) {
              DataRequest.prototype.requests[files[i].filename].onload();
            }
            Module["removeRunDependency"]("datafile_emHdBindings.data");
          }
          Module["addRunDependency"]("datafile_emHdBindings.data");
          if (!Module.preloadResults) Module.preloadResults = {};
          Module.preloadResults[PACKAGE_NAME] = { fromCache: false };
          if (fetched) {
            processPackageData(fetched);
            fetched = null;
          } else {
            fetchedCallback = processPackageData;
          }
        }
        if (Module["calledRun"]) {
          runWithFS();
        } else {
          if (!Module["preRun"]) Module["preRun"] = [];
          Module["preRun"].push(runWithFS);
        }
      };
      loadPackage({
        files: [
          { filename: "/usd/ar/resources/plugInfo.json", start: 0, end: 589 },
          {
            filename: "/usd/hd/resources/codegenTemplates/schemaClass.cpp",
            start: 589,
            end: 9620,
          },
          {
            filename: "/usd/hd/resources/codegenTemplates/schemaClass.h",
            start: 9620,
            end: 20258,
          },
          {
            filename: "/usd/hd/resources/plugInfo.json",
            start: 20258,
            end: 20483,
          },
          {
            filename: "/usd/httpResolver/resources/plugInfo.json",
            start: 20483,
            end: 20823,
          },
          {
            filename: "/usd/ndr/resources/plugInfo.json",
            start: 20823,
            end: 21397,
          },
          { filename: "/usd/plugInfo.json", start: 21397, end: 21448 },
          {
            filename: "/usd/sdf/resources/plugInfo.json",
            start: 21448,
            end: 22544,
          },
          {
            filename: "/usd/usd/resources/codegenTemplates/api.h",
            start: 22544,
            end: 24646,
          },
          {
            filename: "/usd/usd/resources/codegenTemplates/plugInfo.json",
            start: 24646,
            end: 25003,
          },
          {
            filename: "/usd/usd/resources/codegenTemplates/schemaClass.cpp",
            start: 25003,
            end: 37342,
          },
          {
            filename: "/usd/usd/resources/codegenTemplates/schemaClass.h",
            start: 37342,
            end: 54229,
          },
          {
            filename: "/usd/usd/resources/codegenTemplates/tokens.cpp",
            start: 54229,
            end: 55817,
          },
          {
            filename: "/usd/usd/resources/codegenTemplates/tokens.h",
            start: 55817,
            end: 59072,
          },
          {
            filename: "/usd/usd/resources/codegenTemplates/wrapSchemaClass.cpp",
            start: 59072,
            end: 68578,
          },
          {
            filename: "/usd/usd/resources/codegenTemplates/wrapTokens.cpp",
            start: 68578,
            end: 71099,
          },
          {
            filename: "/usd/usd/resources/generatedSchema.usda",
            start: 71099,
            end: 86803,
          },
          {
            filename: "/usd/usd/resources/plugInfo.json",
            start: 86803,
            end: 92530,
          },
          {
            filename: "/usd/usd/resources/usd/schema.usda",
            start: 92530,
            end: 110774,
          },
          {
            filename: "/usd/usdGeom/resources/generatedSchema.usda",
            start: 110774,
            end: 355640,
          },
          {
            filename: "/usd/usdGeom/resources/plugInfo.json",
            start: 355640,
            end: 371761,
          },
          {
            filename: "/usd/usdGeom/resources/usdGeom/schema.usda",
            start: 371761,
            end: 500520,
          },
          {
            filename: "/usd/usdHydra/resources/generatedSchema.usda",
            start: 500520,
            end: 501538,
          },
          {
            filename: "/usd/usdHydra/resources/plugInfo.json",
            start: 501538,
            end: 502826,
          },
          {
            filename: "/usd/usdHydra/resources/shaders/empty.glslfx",
            start: 502826,
            end: 504049,
          },
          {
            filename: "/usd/usdHydra/resources/shaders/shaderDefs.usda",
            start: 504049,
            end: 510806,
          },
          {
            filename: "/usd/usdHydra/resources/usdHydra/schema.usda",
            start: 510806,
            end: 518107,
          },
          {
            filename: "/usd/usdImaging/resources/plugInfo.json",
            start: 518107,
            end: 531776,
          },
          {
            filename: "/usd/usdLux/resources/generatedSchema.usda",
            start: 531776,
            end: 610666,
          },
          {
            filename: "/usd/usdLux/resources/plugInfo.json",
            start: 610666,
            end: 620463,
          },
          {
            filename: "/usd/usdLux/resources/usdLux/schema.usda",
            start: 620463,
            end: 662394,
          },
          {
            filename: "/usd/usdRender/resources/generatedSchema.usda",
            start: 662394,
            end: 685685,
          },
          {
            filename: "/usd/usdRender/resources/plugInfo.json",
            start: 685685,
            end: 688784,
          },
          {
            filename: "/usd/usdRender/resources/usdRender/schema.usda",
            start: 688784,
            end: 705492,
          },
          {
            filename: "/usd/usdShade/resources/generatedSchema.usda",
            start: 705492,
            end: 721492,
          },
          {
            filename: "/usd/usdShade/resources/plugInfo.json",
            start: 721492,
            end: 727378,
          },
          {
            filename: "/usd/usdShade/resources/usdShade/schema.usda",
            start: 727378,
            end: 754223,
          },
          {
            filename: "/usd/usdShaders/resources/plugInfo.json",
            start: 754223,
            end: 754902,
          },
          {
            filename: "/usd/usdShaders/resources/shaders/previewSurface.glslfx",
            start: 754902,
            end: 768823,
          },
          {
            filename: "/usd/usdShaders/resources/shaders/primvarReader.glslfx",
            start: 768823,
            end: 770046,
          },
          {
            filename: "/usd/usdShaders/resources/shaders/shaderDefs.usda",
            start: 770046,
            end: 784976,
          },
          {
            filename: "/usd/usdShaders/resources/shaders/transform2d.glslfx",
            start: 784976,
            end: 786199,
          },
          {
            filename: "/usd/usdShaders/resources/shaders/uvTexture.glslfx",
            start: 786199,
            end: 787422,
          },
          {
            filename: "/usd/usdSkel/resources/generatedSchema.usda",
            start: 787422,
            end: 802913,
          },
          {
            filename: "/usd/usdSkel/resources/plugInfo.json",
            start: 802913,
            end: 805907,
          },
          {
            filename: "/usd/usdSkel/resources/usdSkel/schema.usda",
            start: 805907,
            end: 816312,
          },
          {
            filename: "/usd/usdVol/resources/generatedSchema.usda",
            start: 816312,
            end: 840757,
          },
          {
            filename: "/usd/usdVol/resources/plugInfo.json",
            start: 840757,
            end: 843193,
          },
          {
            filename: "/usd/usdVol/resources/usdVol/schema.usda",
            start: 843193,
            end: 849069,
          },
        ],
        remote_package_size: 849069,
      });
    })();
    if (!Module["ENVIRONMENT_IS_PTHREAD"]) {
      function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent,
        );
      }
      const MAX_MEMORY_MOBILE = 1024 * 1024 * 1024;
      const MAX_MEMORY_DESKTOP = 4 * 1024 * 1024 * 1024;
      const MAX_DEVICE_MEMORY = isMobileDevice()
        ? MAX_MEMORY_MOBILE
        : MAX_MEMORY_DESKTOP;
      Module["wasmMemory"] = new WebAssembly.Memory({
        initial: 16777216 / 65536,
        maximum: MAX_DEVICE_MEMORY / 65536,
        shared: true,
      });
    }
    var moduleOverrides = Object.assign({}, Module);
    var arguments_ = [];
    var thisProgram = "./this.program";
    var quit_ = (status, toThrow) => {
      throw toThrow;
    };
    var ENVIRONMENT_IS_WEB = typeof window == "object";
    var ENVIRONMENT_IS_WORKER = typeof importScripts == "function";
    var ENVIRONMENT_IS_NODE =
      typeof process == "object" &&
      typeof process.versions == "object" &&
      typeof process.versions.node == "string";
    var ENVIRONMENT_IS_PTHREAD = Module["ENVIRONMENT_IS_PTHREAD"] || false;
    var scriptDirectory = "";
    function locateFile(path) {
      if (Module["locateFile"]) {
        return Module["locateFile"](path, scriptDirectory);
      }
      return scriptDirectory + path;
    }
    var read_, readAsync, readBinary;
    if (ENVIRONMENT_IS_NODE) {
      var fs = require("fs");
      var nodePath = require("path");
      if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = nodePath.dirname(scriptDirectory) + "/";
      } else {
        scriptDirectory = __dirname + "/";
      }
      read_ = (filename, binary) => {
        filename = isFileURI(filename)
          ? new URL(filename)
          : nodePath.normalize(filename);
        return fs.readFileSync(filename, binary ? undefined : "utf8");
      };
      readBinary = (filename) => {
        var ret = read_(filename, true);
        if (!ret.buffer) {
          ret = new Uint8Array(ret);
        }
        return ret;
      };
      readAsync = (filename, onload, onerror, binary = true) => {
        filename = isFileURI(filename)
          ? new URL(filename)
          : nodePath.normalize(filename);
        fs.readFile(filename, binary ? undefined : "utf8", (err, data) => {
          if (err) onerror(err);
          else onload(binary ? data.buffer : data);
        });
      };
      if (!Module["thisProgram"] && process.argv.length > 1) {
        thisProgram = process.argv[1].replace(/\\/g, "/");
      }
      arguments_ = process.argv.slice(2);
      quit_ = (status, toThrow) => {
        process.exitCode = status;
        throw toThrow;
      };
      Module["inspect"] = () => "[Emscripten Module object]";
      let nodeWorkerThreads;
      try {
        nodeWorkerThreads = require("worker_threads");
      } catch (e) {
        console.error(
          'The "worker_threads" module is not supported in this node.js build - perhaps a newer version is needed?',
        );
        throw e;
      }
      global.Worker = nodeWorkerThreads.Worker;
    } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
      if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = self.location.href;
      } else if (typeof document != "undefined" && document.currentScript) {
        scriptDirectory = document.currentScript.src;
      }
      if (_scriptDir) {
        scriptDirectory = _scriptDir;
      }
      if (scriptDirectory.indexOf("blob:") !== 0) {
        scriptDirectory = scriptDirectory.substr(
          0,
          scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1,
        );
      } else {
        scriptDirectory = "";
      }
      if (!ENVIRONMENT_IS_NODE) {
        read_ = (url) => {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, false);
          xhr.send(null);
          return xhr.responseText;
        };
        if (ENVIRONMENT_IS_WORKER) {
          readBinary = (url) => {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            xhr.responseType = "arraybuffer";
            xhr.send(null);
            return new Uint8Array(xhr.response);
          };
        }
        readAsync = (url, onload, onerror) => {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, true);
          xhr.responseType = "arraybuffer";
          xhr.onload = () => {
            if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
              onload(xhr.response);
              return;
            }
            onerror();
          };
          xhr.onerror = onerror;
          xhr.send(null);
        };
      }
    } else {
    }
    if (ENVIRONMENT_IS_NODE) {
      if (typeof performance == "undefined") {
        global.performance = require("perf_hooks").performance;
      }
    }
    var defaultPrint = console.log.bind(console);
    var defaultPrintErr = console.error.bind(console);
    if (ENVIRONMENT_IS_NODE) {
      defaultPrint = (...args) => fs.writeSync(1, args.join(" ") + "\n");
      defaultPrintErr = (...args) => fs.writeSync(2, args.join(" ") + "\n");
    }
    var out = Module["print"] || defaultPrint;
    var err = Module["printErr"] || defaultPrintErr;
    Object.assign(Module, moduleOverrides);
    moduleOverrides = null;
    if (Module["arguments"]) arguments_ = Module["arguments"];
    if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
    if (Module["quit"]) quit_ = Module["quit"];
    var wasmBinary;
    if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
    if (typeof WebAssembly != "object") {
      abort("no native wasm support detected");
    }
    var wasmMemory;
    var wasmModule;
    var ABORT = false;
    var EXITSTATUS;
    function assert(condition, text) {
      if (!condition) {
        abort(text);
      }
    }
    var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
    function updateMemoryViews() {
      var b = wasmMemory.buffer;
      Module["HEAP8"] = HEAP8 = new Int8Array(b);
      Module["HEAP16"] = HEAP16 = new Int16Array(b);
      Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
      Module["HEAPU16"] = HEAPU16 = new Uint16Array(b);
      Module["HEAP32"] = HEAP32 = new Int32Array(b);
      Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
      Module["HEAPF32"] = HEAPF32 = new Float32Array(b);
      Module["HEAPF64"] = HEAPF64 = new Float64Array(b);
    }
    var INITIAL_MEMORY = Module["INITIAL_MEMORY"] || 16777216;
    assert(
      INITIAL_MEMORY >= 5242880,
      "INITIAL_MEMORY should be larger than STACK_SIZE, was " +
        INITIAL_MEMORY +
        "! (STACK_SIZE=" +
        5242880 +
        ")",
    );
    if (ENVIRONMENT_IS_PTHREAD) {
      wasmMemory = Module["wasmMemory"];
    } else {
      if (Module["wasmMemory"]) {
        wasmMemory = Module["wasmMemory"];
      } else {
        wasmMemory = new WebAssembly.Memory({
          initial: INITIAL_MEMORY / 65536,
          maximum: 4294967296 / 65536,
          shared: true,
        });
        if (!(wasmMemory.buffer instanceof SharedArrayBuffer)) {
          err(
            "requested a shared WebAssembly.Memory but the returned buffer is not a SharedArrayBuffer, indicating that while the browser has SharedArrayBuffer it does not have WebAssembly threads support - you may need to set a flag",
          );
          if (ENVIRONMENT_IS_NODE) {
            err(
              "(on node you may need: --experimental-wasm-threads --experimental-wasm-bulk-memory and/or recent version)",
            );
          }
          throw Error("bad memory");
        }
      }
    }
    updateMemoryViews();
    INITIAL_MEMORY = wasmMemory.buffer.byteLength;
    var __ATPRERUN__ = [];
    var __ATINIT__ = [];
    var __ATPOSTRUN__ = [];
    var runtimeInitialized = false;
    function preRun() {
      if (Module["preRun"]) {
        if (typeof Module["preRun"] == "function")
          Module["preRun"] = [Module["preRun"]];
        while (Module["preRun"].length) {
          addOnPreRun(Module["preRun"].shift());
        }
      }
      callRuntimeCallbacks(__ATPRERUN__);
    }
    function initRuntime() {
      runtimeInitialized = true;
      if (ENVIRONMENT_IS_PTHREAD) return;
      if (!Module["noFSInit"] && !FS.init.initialized) FS.init();
      FS.ignorePermissions = false;
      TTY.init();
      callRuntimeCallbacks(__ATINIT__);
    }
    function postRun() {
      if (ENVIRONMENT_IS_PTHREAD) return;
      if (Module["postRun"]) {
        if (typeof Module["postRun"] == "function")
          Module["postRun"] = [Module["postRun"]];
        while (Module["postRun"].length) {
          addOnPostRun(Module["postRun"].shift());
        }
      }
      callRuntimeCallbacks(__ATPOSTRUN__);
    }
    function addOnPreRun(cb) {
      __ATPRERUN__.unshift(cb);
    }
    function addOnInit(cb) {
      __ATINIT__.unshift(cb);
    }
    function addOnPostRun(cb) {
      __ATPOSTRUN__.unshift(cb);
    }
    var runDependencies = 0;
    var runDependencyWatcher = null;
    var dependenciesFulfilled = null;
    function getUniqueRunDependency(id) {
      return id;
    }
    function addRunDependency(id) {
      runDependencies++;
      if (Module["monitorRunDependencies"]) {
        Module["monitorRunDependencies"](runDependencies);
      }
    }
    function removeRunDependency(id) {
      runDependencies--;
      if (Module["monitorRunDependencies"]) {
        Module["monitorRunDependencies"](runDependencies);
      }
      if (runDependencies == 0) {
        if (runDependencyWatcher !== null) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
        }
        if (dependenciesFulfilled) {
          var callback = dependenciesFulfilled;
          dependenciesFulfilled = null;
          callback();
        }
      }
    }
    function abort(what) {
      if (Module["onAbort"]) {
        Module["onAbort"](what);
      }
      what = "Aborted(" + what + ")";
      err(what);
      // ABORT = true; // this does not allow anything to work after being set, however we're actually okay to try other assets so we shouldn't do this
      EXITSTATUS = 1;
      what += ". Build with -sASSERTIONS for more info.";
      var e = new WebAssembly.RuntimeError(what);
      readyPromiseReject(e);
      throw e;
    }
    var dataURIPrefix = "data:application/octet-stream;base64,";
    var isDataURI = (filename) => filename.startsWith(dataURIPrefix);
    var isFileURI = (filename) => filename.startsWith("file://");
    var wasmBinaryFile;
    wasmBinaryFile = "emHdBindings.wasm";
    if (!isDataURI(wasmBinaryFile)) {
      wasmBinaryFile = locateFile(wasmBinaryFile);
    }
    function getBinarySync(file) {
      if (file == wasmBinaryFile && wasmBinary) {
        return new Uint8Array(wasmBinary);
      }
      if (readBinary) {
        return readBinary(file);
      }
      throw "both async and sync fetching of the wasm failed";
    }
    function getBinaryPromise(binaryFile) {
      if (!wasmBinary && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)) {
        if (typeof fetch == "function" && !isFileURI(binaryFile)) {
          return fetch(binaryFile, { credentials: "same-origin" })
            .then((response) => {
              if (!response["ok"]) {
                throw "failed to load wasm binary file at '" + binaryFile + "'";
              }
              return response["arrayBuffer"]();
            })
            .catch(() => getBinarySync(binaryFile));
        } else if (readAsync) {
          return new Promise((resolve, reject) => {
            readAsync(
              binaryFile,
              (response) => resolve(new Uint8Array(response)),
              reject,
            );
          });
        }
      }
      return Promise.resolve().then(() => getBinarySync(binaryFile));
    }
    function instantiateArrayBuffer(binaryFile, imports, receiver) {
      return getBinaryPromise(binaryFile)
        .then((binary) => WebAssembly.instantiate(binary, imports))
        .then((instance) => instance)
        .then(receiver, (reason) => {
          err(`failed to asynchronously prepare wasm: ${reason}`);
          abort(reason);
        });
    }
    function instantiateAsync(binary, binaryFile, imports, callback) {
      if (
        !binary &&
        typeof WebAssembly.instantiateStreaming == "function" &&
        !isDataURI(binaryFile) &&
        !isFileURI(binaryFile) &&
        !ENVIRONMENT_IS_NODE &&
        typeof fetch == "function"
      ) {
        return fetch(binaryFile, { credentials: "same-origin" }).then(
          (response) => {
            var result = WebAssembly.instantiateStreaming(response, imports);
            return result.then(callback, function (reason) {
              err(`wasm streaming compile failed: ${reason}`);
              err("falling back to ArrayBuffer instantiation");
              return instantiateArrayBuffer(binaryFile, imports, callback);
            });
          },
        );
      }
      return instantiateArrayBuffer(binaryFile, imports, callback);
    }
    function createWasm() {
      var info = { a: wasmImports };
      function receiveInstance(instance, module) {
        wasmExports = instance.exports;
        wasmExports = Asyncify.instrumentWasmExports(wasmExports);
        wasmExports = applySignatureConversions(wasmExports);
        registerTLSInit(wasmExports["Hd"]);
        wasmTable = wasmExports["Dd"];
        addOnInit(wasmExports["Bd"]);
        wasmModule = module;
        removeRunDependency("wasm-instantiate");
        return wasmExports;
      }
      addRunDependency("wasm-instantiate");
      function receiveInstantiationResult(result) {
        receiveInstance(result["instance"], result["module"]);
      }
      if (Module["instantiateWasm"]) {
        try {
          return Module["instantiateWasm"](info, receiveInstance);
        } catch (e) {
          err(`Module.instantiateWasm callback failed with error: ${e}`);
          readyPromiseReject(e);
        }
      }
      instantiateAsync(
        wasmBinary,
        wasmBinaryFile,
        info,
        receiveInstantiationResult,
      ).catch(readyPromiseReject);
      return {};
    }
    var tempDouble;
    var tempI64;
    function __asyncjs__fetch_asset(route, dataPtr) {
      return Asyncify.handleAsync(async () => {
        const routeString = UTF8ToString(route);
        const absoluteUrl = new URL(routeString);
        try {
          const response = await fetch(absoluteUrl);
          if (!response.ok)
            throw new Error("Fetch failed: " + response.statusText);
          const buffer = await response.arrayBuffer();
          const length = buffer.byteLength;
          const ptr = _malloc(length);
          GROWABLE_HEAP_U8().set(new Uint8Array(buffer), ptr >>> 0);
          Module.HEAP32[dataPtr >> 2] = ptr;
          Module.HEAP32[(dataPtr >> 2) + 1] = length;
        } catch (err) {
          console.error("Error in fetch_asset: ", err);
          Module.HEAP32[dataPtr >> 2] = 0;
          Module.HEAP32[(dataPtr >> 2) + 1] = 0;
        }
      });
    }
    function addToLoadedFiles(path) {
      if (typeof self !== "undefined") {
        if (typeof self.loadedFiles === "undefined") {
          self.loadedFiles = [];
        }
      } else {
        console.log("Neither window nor self is defined");
      }
      self.loadedFiles.push(UTF8ToString(path));
    }
    function downloadJS(data, filenamedata) {
      const text = UTF8ToString(data);
      const filename = UTF8ToString(filenamedata);
      let element = document.createElement("a");
      element.setAttribute(
        "href",
        "data:text/plain;charset=utf-8," + encodeURIComponent(text),
      );
      element.setAttribute("download", filename);
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
    function ExitStatus(status) {
      this.name = "ExitStatus";
      this.message = `Program terminated with exit(${status})`;
      this.status = status;
    }
    var terminateWorker = (worker) => {
      worker.terminate();
      worker.onmessage = (e) => {};
    };
    var killThread = (pthread_ptr) => {
      var worker = PThread.pthreads[pthread_ptr];
      delete PThread.pthreads[pthread_ptr];
      terminateWorker(worker);
      __emscripten_thread_free_data(pthread_ptr);
      PThread.runningWorkers.splice(PThread.runningWorkers.indexOf(worker), 1);
      worker.pthread_ptr = 0;
    };
    var cancelThread = (pthread_ptr) => {
      var worker = PThread.pthreads[pthread_ptr];
      worker.postMessage({ cmd: "cancel" });
    };
    var cleanupThread = (pthread_ptr) => {
      var worker = PThread.pthreads[pthread_ptr];
      assert(worker);
      PThread.returnWorkerToPool(worker);
    };
    var zeroMemory = (address, size) => {
      GROWABLE_HEAP_U8().fill(0, address, address + size);
      return address;
    };
    var spawnThread = (threadParams) => {
      var worker = PThread.getNewWorker();
      if (!worker) {
        return 6;
      }
      PThread.runningWorkers.push(worker);
      PThread.pthreads[threadParams.pthread_ptr] = worker;
      worker.pthread_ptr = threadParams.pthread_ptr;
      var msg = {
        cmd: "run",
        start_routine: threadParams.startRoutine,
        arg: threadParams.arg,
        pthread_ptr: threadParams.pthread_ptr,
      };
      if (ENVIRONMENT_IS_NODE) {
        worker.unref();
      }
      worker.postMessage(msg, threadParams.transferList);
      return 0;
    };
    var runtimeKeepaliveCounter = 0;
    var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
    var PATH = {
      isAbs: (path) => path.charAt(0) === "/",
      splitPath: (filename) => {
        var splitPathRe =
          /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
      },
      normalizeArray: (parts, allowAboveRoot) => {
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
          var last = parts[i];
          if (last === ".") {
            parts.splice(i, 1);
          } else if (last === "..") {
            parts.splice(i, 1);
            up++;
          } else if (up) {
            parts.splice(i, 1);
            up--;
          }
        }
        if (allowAboveRoot) {
          for (; up; up--) {
            parts.unshift("..");
          }
        }
        return parts;
      },
      normalize: (path) => {
        var isAbsolute = PATH.isAbs(path),
          trailingSlash = path.substr(-1) === "/";
        path = PATH.normalizeArray(
          path.split("/").filter((p) => !!p),
          !isAbsolute,
        ).join("/");
        if (!path && !isAbsolute) {
          path = ".";
        }
        if (path && trailingSlash) {
          path += "/";
        }
        return (isAbsolute ? "/" : "") + path;
      },
      dirname: (path) => {
        var result = PATH.splitPath(path),
          root = result[0],
          dir = result[1];
        if (!root && !dir) {
          return ".";
        }
        if (dir) {
          dir = dir.substr(0, dir.length - 1);
        }
        return root + dir;
      },
      basename: (path) => {
        if (path === "/") return "/";
        path = PATH.normalize(path);
        path = path.replace(/\/$/, "");
        var lastSlash = path.lastIndexOf("/");
        if (lastSlash === -1) return path;
        return path.substr(lastSlash + 1);
      },
      join: function () {
        var paths = Array.prototype.slice.call(arguments);
        return PATH.normalize(paths.join("/"));
      },
      join2: (l, r) => PATH.normalize(l + "/" + r),
    };
    var initRandomFill = () => {
      if (
        typeof crypto == "object" &&
        typeof crypto["getRandomValues"] == "function"
      ) {
        return (view) => (
          view.set(crypto.getRandomValues(new Uint8Array(view.byteLength))),
          view
        );
      } else if (ENVIRONMENT_IS_NODE) {
        try {
          var crypto_module = require("crypto");
          var randomFillSync = crypto_module["randomFillSync"];
          if (randomFillSync) {
            return (view) => crypto_module["randomFillSync"](view);
          }
          var randomBytes = crypto_module["randomBytes"];
          return (view) => (view.set(randomBytes(view.byteLength)), view);
        } catch (e) {}
      }
      abort("initRandomDevice");
    };
    var randomFill = (view) => (randomFill = initRandomFill())(view);
    var PATH_FS = {
      resolve: function () {
        var resolvedPath = "",
          resolvedAbsolute = false;
        for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
          var path = i >= 0 ? arguments[i] : FS.cwd();
          if (typeof path != "string") {
            throw new TypeError("Arguments to path.resolve must be strings");
          } else if (!path) {
            return "";
          }
          resolvedPath = path + "/" + resolvedPath;
          resolvedAbsolute = PATH.isAbs(path);
        }
        resolvedPath = PATH.normalizeArray(
          resolvedPath.split("/").filter((p) => !!p),
          !resolvedAbsolute,
        ).join("/");
        return (resolvedAbsolute ? "/" : "") + resolvedPath || ".";
      },
      relative: (from, to) => {
        from = PATH_FS.resolve(from).substr(1);
        to = PATH_FS.resolve(to).substr(1);
        function trim(arr) {
          var start = 0;
          for (; start < arr.length; start++) {
            if (arr[start] !== "") break;
          }
          var end = arr.length - 1;
          for (; end >= 0; end--) {
            if (arr[end] !== "") break;
          }
          if (start > end) return [];
          return arr.slice(start, end - start + 1);
        }
        var fromParts = trim(from.split("/"));
        var toParts = trim(to.split("/"));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
          if (fromParts[i] !== toParts[i]) {
            samePartsLength = i;
            break;
          }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
          outputParts.push("..");
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join("/");
      },
    };
    var UTF8Decoder =
      typeof TextDecoder != "undefined" ? new TextDecoder("utf8") : undefined;
    var UTF8ArrayToString = (heapOrArray, idx, maxBytesToRead) => {
      idx >>>= 0;
      var endIdx = idx + maxBytesToRead;
      var endPtr = idx;
      while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
      if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
        return UTF8Decoder.decode(heapOrArray.slice(idx, endPtr));
      }
      var str = "";
      while (idx < endPtr) {
        var u0 = heapOrArray[idx++];
        if (!(u0 & 128)) {
          str += String.fromCharCode(u0);
          continue;
        }
        var u1 = heapOrArray[idx++] & 63;
        if ((u0 & 224) == 192) {
          str += String.fromCharCode(((u0 & 31) << 6) | u1);
          continue;
        }
        var u2 = heapOrArray[idx++] & 63;
        if ((u0 & 240) == 224) {
          u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
        } else {
          u0 =
            ((u0 & 7) << 18) |
            (u1 << 12) |
            (u2 << 6) |
            (heapOrArray[idx++] & 63);
        }
        if (u0 < 65536) {
          str += String.fromCharCode(u0);
        } else {
          var ch = u0 - 65536;
          str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));
        }
      }
      return str;
    };
    var FS_stdin_getChar_buffer = [];
    var lengthBytesUTF8 = (str) => {
      var len = 0;
      for (var i = 0; i < str.length; ++i) {
        var c = str.charCodeAt(i);
        if (c <= 127) {
          len++;
        } else if (c <= 2047) {
          len += 2;
        } else if (c >= 55296 && c <= 57343) {
          len += 4;
          ++i;
        } else {
          len += 3;
        }
      }
      return len;
    };
    var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
      outIdx >>>= 0;
      if (!(maxBytesToWrite > 0)) return 0;
      var startIdx = outIdx;
      var endIdx = outIdx + maxBytesToWrite - 1;
      for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343) {
          var u1 = str.charCodeAt(++i);
          u = (65536 + ((u & 1023) << 10)) | (u1 & 1023);
        }
        if (u <= 127) {
          if (outIdx >= endIdx) break;
          heap[outIdx++ >>> 0] = u;
        } else if (u <= 2047) {
          if (outIdx + 1 >= endIdx) break;
          heap[outIdx++ >>> 0] = 192 | (u >> 6);
          heap[outIdx++ >>> 0] = 128 | (u & 63);
        } else if (u <= 65535) {
          if (outIdx + 2 >= endIdx) break;
          heap[outIdx++ >>> 0] = 224 | (u >> 12);
          heap[outIdx++ >>> 0] = 128 | ((u >> 6) & 63);
          heap[outIdx++ >>> 0] = 128 | (u & 63);
        } else {
          if (outIdx + 3 >= endIdx) break;
          heap[outIdx++ >>> 0] = 240 | (u >> 18);
          heap[outIdx++ >>> 0] = 128 | ((u >> 12) & 63);
          heap[outIdx++ >>> 0] = 128 | ((u >> 6) & 63);
          heap[outIdx++ >>> 0] = 128 | (u & 63);
        }
      }
      heap[outIdx >>> 0] = 0;
      return outIdx - startIdx;
    };
    function intArrayFromString(stringy, dontAddNull, length) {
      var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
      var u8array = new Array(len);
      var numBytesWritten = stringToUTF8Array(
        stringy,
        u8array,
        0,
        u8array.length,
      );
      if (dontAddNull) u8array.length = numBytesWritten;
      return u8array;
    }
    var FS_stdin_getChar = () => {
      if (!FS_stdin_getChar_buffer.length) {
        var result = null;
        if (ENVIRONMENT_IS_NODE) {
          var BUFSIZE = 256;
          var buf = Buffer.alloc(BUFSIZE);
          var bytesRead = 0;
          var fd = process.stdin.fd;
          try {
            bytesRead = fs.readSync(fd, buf);
          } catch (e) {
            if (e.toString().includes("EOF")) bytesRead = 0;
            else throw e;
          }
          if (bytesRead > 0) {
            result = buf.slice(0, bytesRead).toString("utf-8");
          } else {
            result = null;
          }
        } else if (
          typeof window != "undefined" &&
          typeof window.prompt == "function"
        ) {
          result = window.prompt("Input: ");
          if (result !== null) {
            result += "\n";
          }
        } else if (typeof readline == "function") {
          result = readline();
          if (result !== null) {
            result += "\n";
          }
        }
        if (!result) {
          return null;
        }
        FS_stdin_getChar_buffer = intArrayFromString(result, true);
      }
      return FS_stdin_getChar_buffer.shift();
    };
    var TTY = {
      ttys: [],
      init() {},
      shutdown() {},
      register(dev, ops) {
        TTY.ttys[dev] = { input: [], output: [], ops: ops };
        FS.registerDevice(dev, TTY.stream_ops);
      },
      stream_ops: {
        open(stream) {
          var tty = TTY.ttys[stream.node.rdev];
          if (!tty) {
            throw new FS.ErrnoError(43);
          }
          stream.tty = tty;
          stream.seekable = false;
        },
        close(stream) {
          stream.tty.ops.fsync(stream.tty);
        },
        fsync(stream) {
          stream.tty.ops.fsync(stream.tty);
        },
        read(stream, buffer, offset, length, pos) {
          if (!stream.tty || !stream.tty.ops.get_char) {
            throw new FS.ErrnoError(60);
          }
          var bytesRead = 0;
          for (var i = 0; i < length; i++) {
            var result;
            try {
              result = stream.tty.ops.get_char(stream.tty);
            } catch (e) {
              throw new FS.ErrnoError(29);
            }
            if (result === undefined && bytesRead === 0) {
              throw new FS.ErrnoError(6);
            }
            if (result === null || result === undefined) break;
            bytesRead++;
            buffer[offset + i] = result;
          }
          if (bytesRead) {
            stream.node.timestamp = Date.now();
          }
          return bytesRead;
        },
        write(stream, buffer, offset, length, pos) {
          if (!stream.tty || !stream.tty.ops.put_char) {
            throw new FS.ErrnoError(60);
          }
          try {
            for (var i = 0; i < length; i++) {
              stream.tty.ops.put_char(stream.tty, buffer[offset + i]);
            }
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
          if (length) {
            stream.node.timestamp = Date.now();
          }
          return i;
        },
      },
      default_tty_ops: {
        get_char(tty) {
          return FS_stdin_getChar();
        },
        put_char(tty, val) {
          if (val === null || val === 10) {
            out(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val);
          }
        },
        fsync(tty) {
          if (tty.output && tty.output.length > 0) {
            out(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        },
        ioctl_tcgets(tty) {
          return {
            c_iflag: 25856,
            c_oflag: 5,
            c_cflag: 191,
            c_lflag: 35387,
            c_cc: [
              3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0,
              0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            ],
          };
        },
        ioctl_tcsets(tty, optional_actions, data) {
          return 0;
        },
        ioctl_tiocgwinsz(tty) {
          return [24, 80];
        },
      },
      default_tty1_ops: {
        put_char(tty, val) {
          if (val === null || val === 10) {
            err(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val);
          }
        },
        fsync(tty) {
          if (tty.output && tty.output.length > 0) {
            err(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        },
      },
    };
    var alignMemory = (size, alignment) =>
      Math.ceil(size / alignment) * alignment;
    var mmapAlloc = (size) => {
      size = alignMemory(size, 65536);
      var ptr = _emscripten_builtin_memalign(65536, size);
      if (!ptr) return 0;
      return zeroMemory(ptr, size);
    };
    var MEMFS = {
      ops_table: null,
      mount(mount) {
        return MEMFS.createNode(null, "/", 16384 | 511, 0);
      },
      createNode(parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
          throw new FS.ErrnoError(63);
        }
        if (!MEMFS.ops_table) {
          MEMFS.ops_table = {
            dir: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
                lookup: MEMFS.node_ops.lookup,
                mknod: MEMFS.node_ops.mknod,
                rename: MEMFS.node_ops.rename,
                unlink: MEMFS.node_ops.unlink,
                rmdir: MEMFS.node_ops.rmdir,
                readdir: MEMFS.node_ops.readdir,
                symlink: MEMFS.node_ops.symlink,
              },
              stream: { llseek: MEMFS.stream_ops.llseek },
            },
            file: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
              },
              stream: {
                llseek: MEMFS.stream_ops.llseek,
                read: MEMFS.stream_ops.read,
                write: MEMFS.stream_ops.write,
                allocate: MEMFS.stream_ops.allocate,
                mmap: MEMFS.stream_ops.mmap,
                msync: MEMFS.stream_ops.msync,
              },
            },
            link: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
                readlink: MEMFS.node_ops.readlink,
              },
              stream: {},
            },
            chrdev: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
              },
              stream: FS.chrdev_stream_ops,
            },
          };
        }
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
          node.node_ops = MEMFS.ops_table.dir.node;
          node.stream_ops = MEMFS.ops_table.dir.stream;
          node.contents = {};
        } else if (FS.isFile(node.mode)) {
          node.node_ops = MEMFS.ops_table.file.node;
          node.stream_ops = MEMFS.ops_table.file.stream;
          node.usedBytes = 0;
          node.contents = null;
        } else if (FS.isLink(node.mode)) {
          node.node_ops = MEMFS.ops_table.link.node;
          node.stream_ops = MEMFS.ops_table.link.stream;
        } else if (FS.isChrdev(node.mode)) {
          node.node_ops = MEMFS.ops_table.chrdev.node;
          node.stream_ops = MEMFS.ops_table.chrdev.stream;
        }
        node.timestamp = Date.now();
        if (parent) {
          parent.contents[name] = node;
          parent.timestamp = node.timestamp;
        }
        return node;
      },
      getFileDataAsTypedArray(node) {
        if (!node.contents) return new Uint8Array(0);
        if (node.contents.subarray)
          return node.contents.subarray(0, node.usedBytes);
        return new Uint8Array(node.contents);
      },
      expandFileStorage(node, newCapacity) {
        var prevCapacity = node.contents ? node.contents.length : 0;
        if (prevCapacity >= newCapacity) return;
        var CAPACITY_DOUBLING_MAX = 1024 * 1024;
        newCapacity = Math.max(
          newCapacity,
          (prevCapacity *
            (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125)) >>>
            0,
        );
        if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);
        var oldContents = node.contents;
        node.contents = new Uint8Array(newCapacity);
        if (node.usedBytes > 0)
          node.contents.set(oldContents.subarray(0, node.usedBytes), 0);
      },
      resizeFileStorage(node, newSize) {
        if (node.usedBytes == newSize) return;
        if (newSize == 0) {
          node.contents = null;
          node.usedBytes = 0;
        } else {
          var oldContents = node.contents;
          node.contents = new Uint8Array(newSize);
          if (oldContents) {
            node.contents.set(
              oldContents.subarray(0, Math.min(newSize, node.usedBytes)),
            );
          }
          node.usedBytes = newSize;
        }
      },
      node_ops: {
        getattr(node) {
          var attr = {};
          attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
          attr.ino = node.id;
          attr.mode = node.mode;
          attr.nlink = 1;
          attr.uid = 0;
          attr.gid = 0;
          attr.rdev = node.rdev;
          if (FS.isDir(node.mode)) {
            attr.size = 4096;
          } else if (FS.isFile(node.mode)) {
            attr.size = node.usedBytes;
          } else if (FS.isLink(node.mode)) {
            attr.size = node.link.length;
          } else {
            attr.size = 0;
          }
          attr.atime = new Date(node.timestamp);
          attr.mtime = new Date(node.timestamp);
          attr.ctime = new Date(node.timestamp);
          attr.blksize = 4096;
          attr.blocks = Math.ceil(attr.size / attr.blksize);
          return attr;
        },
        setattr(node, attr) {
          if (attr.mode !== undefined) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== undefined) {
            node.timestamp = attr.timestamp;
          }
          if (attr.size !== undefined) {
            MEMFS.resizeFileStorage(node, attr.size);
          }
        },
        lookup(parent, name) {
          throw FS.genericErrors[44];
        },
        mknod(parent, name, mode, dev) {
          return MEMFS.createNode(parent, name, mode, dev);
        },
        rename(old_node, new_dir, new_name) {
          if (FS.isDir(old_node.mode)) {
            var new_node;
            try {
              new_node = FS.lookupNode(new_dir, new_name);
            } catch (e) {}
            if (new_node) {
              for (var i in new_node.contents) {
                throw new FS.ErrnoError(55);
              }
            }
          }
          delete old_node.parent.contents[old_node.name];
          old_node.parent.timestamp = Date.now();
          old_node.name = new_name;
          new_dir.contents[new_name] = old_node;
          new_dir.timestamp = old_node.parent.timestamp;
          old_node.parent = new_dir;
        },
        unlink(parent, name) {
          delete parent.contents[name];
          parent.timestamp = Date.now();
        },
        rmdir(parent, name) {
          var node = FS.lookupNode(parent, name);
          for (var i in node.contents) {
            throw new FS.ErrnoError(55);
          }
          delete parent.contents[name];
          parent.timestamp = Date.now();
        },
        readdir(node) {
          var entries = [".", ".."];
          for (var key in node.contents) {
            if (!node.contents.hasOwnProperty(key)) {
              continue;
            }
            entries.push(key);
          }
          return entries;
        },
        symlink(parent, newname, oldpath) {
          var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
          node.link = oldpath;
          return node;
        },
        readlink(node) {
          if (!FS.isLink(node.mode)) {
            throw new FS.ErrnoError(28);
          }
          return node.link;
        },
      },
      stream_ops: {
        read(stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= stream.node.usedBytes) return 0;
          var size = Math.min(stream.node.usedBytes - position, length);
          if (size > 8 && contents.subarray) {
            buffer.set(contents.subarray(position, position + size), offset);
          } else {
            for (var i = 0; i < size; i++)
              buffer[offset + i] = contents[position + i];
          }
          return size;
        },
        write(stream, buffer, offset, length, position, canOwn) {
          if (buffer.buffer === GROWABLE_HEAP_I8().buffer) {
            canOwn = false;
          }
          if (!length) return 0;
          var node = stream.node;
          node.timestamp = Date.now();
          if (buffer.subarray && (!node.contents || node.contents.subarray)) {
            if (canOwn) {
              node.contents = buffer.subarray(offset, offset + length);
              node.usedBytes = length;
              return length;
            } else if (node.usedBytes === 0 && position === 0) {
              node.contents = buffer.slice(offset, offset + length);
              node.usedBytes = length;
              return length;
            } else if (position + length <= node.usedBytes) {
              node.contents.set(
                buffer.subarray(offset, offset + length),
                position,
              );
              return length;
            }
          }
          MEMFS.expandFileStorage(node, position + length);
          if (node.contents.subarray && buffer.subarray) {
            node.contents.set(
              buffer.subarray(offset, offset + length),
              position,
            );
          } else {
            for (var i = 0; i < length; i++) {
              node.contents[position + i] = buffer[offset + i];
            }
          }
          node.usedBytes = Math.max(node.usedBytes, position + length);
          return length;
        },
        llseek(stream, offset, whence) {
          var position = offset;
          if (whence === 1) {
            position += stream.position;
          } else if (whence === 2) {
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.usedBytes;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(28);
          }
          return position;
        },
        allocate(stream, offset, length) {
          MEMFS.expandFileStorage(stream.node, offset + length);
          stream.node.usedBytes = Math.max(
            stream.node.usedBytes,
            offset + length,
          );
        },
        mmap(stream, length, position, prot, flags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(43);
          }
          var ptr;
          var allocated;
          var contents = stream.node.contents;
          if (!(flags & 2) && contents.buffer === GROWABLE_HEAP_I8().buffer) {
            allocated = false;
            ptr = contents.byteOffset;
          } else {
            if (position > 0 || position + length < contents.length) {
              if (contents.subarray) {
                contents = contents.subarray(position, position + length);
              } else {
                contents = Array.prototype.slice.call(
                  contents,
                  position,
                  position + length,
                );
              }
            }
            allocated = true;
            ptr = mmapAlloc(length);
            if (!ptr) {
              throw new FS.ErrnoError(48);
            }
            GROWABLE_HEAP_I8().set(contents, ptr >>> 0);
          }
          return { ptr: ptr, allocated: allocated };
        },
        msync(stream, buffer, offset, length, mmapFlags) {
          MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
          return 0;
        },
      },
    };
    var asyncLoad = (url, onload, onerror, noRunDep) => {
      var dep = !noRunDep ? getUniqueRunDependency(`al ${url}`) : "";
      readAsync(
        url,
        (arrayBuffer) => {
          assert(
            arrayBuffer,
            `Loading data file "${url}" failed (no arrayBuffer).`,
          );
          onload(new Uint8Array(arrayBuffer));
          if (dep) removeRunDependency(dep);
        },
        (event) => {
          if (onerror) {
            onerror();
          } else {
            throw `Loading data file "${url}" failed.`;
          }
        },
      );
      if (dep) addRunDependency(dep);
    };
    var FS_createDataFile = (
      parent,
      name,
      fileData,
      canRead,
      canWrite,
      canOwn,
    ) => FS.createDataFile(parent, name, fileData, canRead, canWrite, canOwn);
    var preloadPlugins = Module["preloadPlugins"] || [];
    var FS_handledByPreloadPlugin = (byteArray, fullname, finish, onerror) => {
      if (typeof Browser != "undefined") Browser.init();
      var handled = false;
      preloadPlugins.forEach((plugin) => {
        if (handled) return;
        if (plugin["canHandle"](fullname)) {
          plugin["handle"](byteArray, fullname, finish, onerror);
          handled = true;
        }
      });
      return handled;
    };
    var FS_createPreloadedFile = (
      parent,
      name,
      url,
      canRead,
      canWrite,
      onload,
      onerror,
      dontCreateFile,
      canOwn,
      preFinish,
    ) => {
      var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
      var dep = getUniqueRunDependency(`cp ${fullname}`);
      function processData(byteArray) {
        function finish(byteArray) {
          if (preFinish) preFinish();
          if (!dontCreateFile) {
            FS_createDataFile(
              parent,
              name,
              byteArray,
              canRead,
              canWrite,
              canOwn,
            );
          }
          if (onload) onload();
          removeRunDependency(dep);
        }
        if (
          FS_handledByPreloadPlugin(byteArray, fullname, finish, () => {
            if (onerror) onerror();
            removeRunDependency(dep);
          })
        ) {
          return;
        }
        finish(byteArray);
      }
      addRunDependency(dep);
      if (typeof url == "string") {
        asyncLoad(url, (byteArray) => processData(byteArray), onerror);
      } else {
        processData(url);
      }
    };
    var FS_modeStringToFlags = (str) => {
      var flagModes = {
        r: 0,
        "r+": 2,
        w: 512 | 64 | 1,
        "w+": 512 | 64 | 2,
        a: 1024 | 64 | 1,
        "a+": 1024 | 64 | 2,
      };
      var flags = flagModes[str];
      if (typeof flags == "undefined") {
        throw new Error(`Unknown file open mode: ${str}`);
      }
      return flags;
    };
    var FS_getMode = (canRead, canWrite) => {
      var mode = 0;
      if (canRead) mode |= 292 | 73;
      if (canWrite) mode |= 146;
      return mode;
    };
    var FS = {
      root: null,
      mounts: [],
      devices: {},
      streams: [],
      nextInode: 1,
      nameTable: null,
      currentPath: "/",
      initialized: false,
      ignorePermissions: true,
      ErrnoError: null,
      genericErrors: {},
      filesystems: null,
      syncFSRequests: 0,
      lookupPath(path, opts = {}) {
        path = PATH_FS.resolve(path);
        if (!path) return { path: "", node: null };
        var defaults = { follow_mount: true, recurse_count: 0 };
        opts = Object.assign(defaults, opts);
        if (opts.recurse_count > 8) {
          throw new FS.ErrnoError(32);
        }
        var parts = path.split("/").filter((p) => !!p);
        var current = FS.root;
        var current_path = "/";
        for (var i = 0; i < parts.length; i++) {
          var islast = i === parts.length - 1;
          if (islast && opts.parent) {
            break;
          }
          current = FS.lookupNode(current, parts[i]);
          current_path = PATH.join2(current_path, parts[i]);
          if (FS.isMountpoint(current)) {
            if (!islast || (islast && opts.follow_mount)) {
              current = current.mounted.root;
            }
          }
          if (!islast || opts.follow) {
            var count = 0;
            while (FS.isLink(current.mode)) {
              var link = FS.readlink(current_path);
              current_path = PATH_FS.resolve(PATH.dirname(current_path), link);
              var lookup = FS.lookupPath(current_path, {
                recurse_count: opts.recurse_count + 1,
              });
              current = lookup.node;
              if (count++ > 40) {
                throw new FS.ErrnoError(32);
              }
            }
          }
        }
        return { path: current_path, node: current };
      },
      getPath(node) {
        var path;
        while (true) {
          if (FS.isRoot(node)) {
            var mount = node.mount.mountpoint;
            if (!path) return mount;
            return mount[mount.length - 1] !== "/"
              ? `${mount}/${path}`
              : mount + path;
          }
          path = path ? `${node.name}/${path}` : node.name;
          node = node.parent;
        }
      },
      hashName(parentid, name) {
        var hash = 0;
        for (var i = 0; i < name.length; i++) {
          hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        }
        return ((parentid + hash) >>> 0) % FS.nameTable.length;
      },
      hashAddNode(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node;
      },
      hashRemoveNode(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
          FS.nameTable[hash] = node.name_next;
        } else {
          var current = FS.nameTable[hash];
          while (current) {
            if (current.name_next === node) {
              current.name_next = node.name_next;
              break;
            }
            current = current.name_next;
          }
        }
      },
      lookupNode(parent, name) {
        var errCode = FS.mayLookup(parent);
        if (errCode) {
          throw new FS.ErrnoError(errCode, parent);
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
          var nodeName = node.name;
          if (node.parent.id === parent.id && nodeName === name) {
            return node;
          }
        }
        return FS.lookup(parent, name);
      },
      createNode(parent, name, mode, rdev) {
        var node = new FS.FSNode(parent, name, mode, rdev);
        FS.hashAddNode(node);
        return node;
      },
      destroyNode(node) {
        FS.hashRemoveNode(node);
      },
      isRoot(node) {
        return node === node.parent;
      },
      isMountpoint(node) {
        return !!node.mounted;
      },
      isFile(mode) {
        return (mode & 61440) === 32768;
      },
      isDir(mode) {
        return (mode & 61440) === 16384;
      },
      isLink(mode) {
        return (mode & 61440) === 40960;
      },
      isChrdev(mode) {
        return (mode & 61440) === 8192;
      },
      isBlkdev(mode) {
        return (mode & 61440) === 24576;
      },
      isFIFO(mode) {
        return (mode & 61440) === 4096;
      },
      isSocket(mode) {
        return (mode & 49152) === 49152;
      },
      flagsToPermissionString(flag) {
        var perms = ["r", "w", "rw"][flag & 3];
        if (flag & 512) {
          perms += "w";
        }
        return perms;
      },
      nodePermissions(node, perms) {
        if (FS.ignorePermissions) {
          return 0;
        }
        if (perms.includes("r") && !(node.mode & 292)) {
          return 2;
        } else if (perms.includes("w") && !(node.mode & 146)) {
          return 2;
        } else if (perms.includes("x") && !(node.mode & 73)) {
          return 2;
        }
        return 0;
      },
      mayLookup(dir) {
        var errCode = FS.nodePermissions(dir, "x");
        if (errCode) return errCode;
        if (!dir.node_ops.lookup) return 2;
        return 0;
      },
      mayCreate(dir, name) {
        try {
          var node = FS.lookupNode(dir, name);
          return 20;
        } catch (e) {}
        return FS.nodePermissions(dir, "wx");
      },
      mayDelete(dir, name, isdir) {
        var node;
        try {
          node = FS.lookupNode(dir, name);
        } catch (e) {
          return e.errno;
        }
        var errCode = FS.nodePermissions(dir, "wx");
        if (errCode) {
          return errCode;
        }
        if (isdir) {
          if (!FS.isDir(node.mode)) {
            return 54;
          }
          if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
            return 10;
          }
        } else {
          if (FS.isDir(node.mode)) {
            return 31;
          }
        }
        return 0;
      },
      mayOpen(node, flags) {
        if (!node) {
          return 44;
        }
        if (FS.isLink(node.mode)) {
          return 32;
        } else if (FS.isDir(node.mode)) {
          if (FS.flagsToPermissionString(flags) !== "r" || flags & 512) {
            return 31;
          }
        }
        return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
      },
      MAX_OPEN_FDS: 4096,
      nextfd() {
        for (var fd = 0; fd <= FS.MAX_OPEN_FDS; fd++) {
          if (!FS.streams[fd]) {
            return fd;
          }
        }
        throw new FS.ErrnoError(33);
      },
      getStreamChecked(fd) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(8);
        }
        return stream;
      },
      getStream: (fd) => FS.streams[fd],
      createStream(stream, fd = -1) {
        if (!FS.FSStream) {
          FS.FSStream = function () {
            this.shared = {};
          };
          FS.FSStream.prototype = {};
          Object.defineProperties(FS.FSStream.prototype, {
            object: {
              get() {
                return this.node;
              },
              set(val) {
                this.node = val;
              },
            },
            isRead: {
              get() {
                return (this.flags & 2097155) !== 1;
              },
            },
            isWrite: {
              get() {
                return (this.flags & 2097155) !== 0;
              },
            },
            isAppend: {
              get() {
                return this.flags & 1024;
              },
            },
            flags: {
              get() {
                return this.shared.flags;
              },
              set(val) {
                this.shared.flags = val;
              },
            },
            position: {
              get() {
                return this.shared.position;
              },
              set(val) {
                this.shared.position = val;
              },
            },
          });
        }
        stream = Object.assign(new FS.FSStream(), stream);
        if (fd == -1) {
          fd = FS.nextfd();
        }
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream;
      },
      closeStream(fd) {
        FS.streams[fd] = null;
      },
      chrdev_stream_ops: {
        open(stream) {
          var device = FS.getDevice(stream.node.rdev);
          stream.stream_ops = device.stream_ops;
          if (stream.stream_ops.open) {
            stream.stream_ops.open(stream);
          }
        },
        llseek() {
          throw new FS.ErrnoError(70);
        },
      },
      major: (dev) => dev >> 8,
      minor: (dev) => dev & 255,
      makedev: (ma, mi) => (ma << 8) | mi,
      registerDevice(dev, ops) {
        FS.devices[dev] = { stream_ops: ops };
      },
      getDevice: (dev) => FS.devices[dev],
      getMounts(mount) {
        var mounts = [];
        var check = [mount];
        while (check.length) {
          var m = check.pop();
          mounts.push(m);
          check.push.apply(check, m.mounts);
        }
        return mounts;
      },
      syncfs(populate, callback) {
        if (typeof populate == "function") {
          callback = populate;
          populate = false;
        }
        FS.syncFSRequests++;
        if (FS.syncFSRequests > 1) {
          err(
            `warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`,
          );
        }
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;
        function doCallback(errCode) {
          FS.syncFSRequests--;
          return callback(errCode);
        }
        function done(errCode) {
          if (errCode) {
            if (!done.errored) {
              done.errored = true;
              return doCallback(errCode);
            }
            return;
          }
          if (++completed >= mounts.length) {
            doCallback(null);
          }
        }
        mounts.forEach((mount) => {
          if (!mount.type.syncfs) {
            return done(null);
          }
          mount.type.syncfs(mount, populate, done);
        });
      },
      mount(type, opts, mountpoint) {
        var root = mountpoint === "/";
        var pseudo = !mountpoint;
        var node;
        if (root && FS.root) {
          throw new FS.ErrnoError(10);
        } else if (!root && !pseudo) {
          var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
          mountpoint = lookup.path;
          node = lookup.node;
          if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(10);
          }
          if (!FS.isDir(node.mode)) {
            throw new FS.ErrnoError(54);
          }
        }
        var mount = {
          type: type,
          opts: opts,
          mountpoint: mountpoint,
          mounts: [],
        };
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
        if (root) {
          FS.root = mountRoot;
        } else if (node) {
          node.mounted = mount;
          if (node.mount) {
            node.mount.mounts.push(mount);
          }
        }
        return mountRoot;
      },
      unmount(mountpoint) {
        var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
        if (!FS.isMountpoint(lookup.node)) {
          throw new FS.ErrnoError(28);
        }
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
        Object.keys(FS.nameTable).forEach((hash) => {
          var current = FS.nameTable[hash];
          while (current) {
            var next = current.name_next;
            if (mounts.includes(current.mount)) {
              FS.destroyNode(current);
            }
            current = next;
          }
        });
        node.mounted = null;
        var idx = node.mount.mounts.indexOf(mount);
        node.mount.mounts.splice(idx, 1);
      },
      lookup(parent, name) {
        return parent.node_ops.lookup(parent, name);
      },
      mknod(path, mode, dev) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name || name === "." || name === "..") {
          throw new FS.ErrnoError(28);
        }
        var errCode = FS.mayCreate(parent, name);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.mknod) {
          throw new FS.ErrnoError(63);
        }
        return parent.node_ops.mknod(parent, name, mode, dev);
      },
      create(path, mode) {
        mode = mode !== undefined ? mode : 438;
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0);
      },
      mkdir(path, mode) {
        mode = mode !== undefined ? mode : 511;
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0);
      },
      mkdirTree(path, mode) {
        var dirs = path.split("/");
        var d = "";
        for (var i = 0; i < dirs.length; ++i) {
          if (!dirs[i]) continue;
          d += "/" + dirs[i];
          try {
            FS.mkdir(d, mode);
          } catch (e) {
            if (e.errno != 20) throw e;
          }
        }
      },
      mkdev(path, mode, dev) {
        if (typeof dev == "undefined") {
          dev = mode;
          mode = 438;
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev);
      },
      symlink(oldpath, newpath) {
        if (!PATH_FS.resolve(oldpath)) {
          throw new FS.ErrnoError(44);
        }
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(44);
        }
        var newname = PATH.basename(newpath);
        var errCode = FS.mayCreate(parent, newname);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.symlink) {
          throw new FS.ErrnoError(63);
        }
        return parent.node_ops.symlink(parent, newname, oldpath);
      },
      rename(old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        var lookup, old_dir, new_dir;
        lookup = FS.lookupPath(old_path, { parent: true });
        old_dir = lookup.node;
        lookup = FS.lookupPath(new_path, { parent: true });
        new_dir = lookup.node;
        if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
        if (old_dir.mount !== new_dir.mount) {
          throw new FS.ErrnoError(75);
        }
        var old_node = FS.lookupNode(old_dir, old_name);
        var relative = PATH_FS.relative(old_path, new_dirname);
        if (relative.charAt(0) !== ".") {
          throw new FS.ErrnoError(28);
        }
        relative = PATH_FS.relative(new_path, old_dirname);
        if (relative.charAt(0) !== ".") {
          throw new FS.ErrnoError(55);
        }
        var new_node;
        try {
          new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {}
        if (old_node === new_node) {
          return;
        }
        var isdir = FS.isDir(old_node.mode);
        var errCode = FS.mayDelete(old_dir, old_name, isdir);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        errCode = new_node
          ? FS.mayDelete(new_dir, new_name, isdir)
          : FS.mayCreate(new_dir, new_name);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!old_dir.node_ops.rename) {
          throw new FS.ErrnoError(63);
        }
        if (
          FS.isMountpoint(old_node) ||
          (new_node && FS.isMountpoint(new_node))
        ) {
          throw new FS.ErrnoError(10);
        }
        if (new_dir !== old_dir) {
          errCode = FS.nodePermissions(old_dir, "w");
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
        }
        FS.hashRemoveNode(old_node);
        try {
          old_dir.node_ops.rename(old_node, new_dir, new_name);
        } catch (e) {
          throw e;
        } finally {
          FS.hashAddNode(old_node);
        }
      },
      rmdir(path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var errCode = FS.mayDelete(parent, name, true);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.rmdir) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(10);
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node);
      },
      readdir(path) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        if (!node.node_ops.readdir) {
          throw new FS.ErrnoError(54);
        }
        return node.node_ops.readdir(node);
      },
      unlink(path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(44);
        }
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var errCode = FS.mayDelete(parent, name, false);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.unlink) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(10);
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node);
      },
      readlink(path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
          throw new FS.ErrnoError(44);
        }
        if (!link.node_ops.readlink) {
          throw new FS.ErrnoError(28);
        }
        return PATH_FS.resolve(
          FS.getPath(link.parent),
          link.node_ops.readlink(link),
        );
      },
      stat(path, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        var node = lookup.node;
        if (!node) {
          throw new FS.ErrnoError(44);
        }
        if (!node.node_ops.getattr) {
          throw new FS.ErrnoError(63);
        }
        return node.node_ops.getattr(node);
      },
      lstat(path) {
        return FS.stat(path, true);
      },
      chmod(path, mode, dontFollow) {
        var node;
        if (typeof path == "string") {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(63);
        }
        node.node_ops.setattr(node, {
          mode: (mode & 4095) | (node.mode & ~4095),
          timestamp: Date.now(),
        });
      },
      lchmod(path, mode) {
        FS.chmod(path, mode, true);
      },
      fchmod(fd, mode) {
        var stream = FS.getStreamChecked(fd);
        FS.chmod(stream.node, mode);
      },
      chown(path, uid, gid, dontFollow) {
        var node;
        if (typeof path == "string") {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(63);
        }
        node.node_ops.setattr(node, { timestamp: Date.now() });
      },
      lchown(path, uid, gid) {
        FS.chown(path, uid, gid, true);
      },
      fchown(fd, uid, gid) {
        var stream = FS.getStreamChecked(fd);
        FS.chown(stream.node, uid, gid);
      },
      truncate(path, len) {
        if (len < 0) {
          throw new FS.ErrnoError(28);
        }
        var node;
        if (typeof path == "string") {
          var lookup = FS.lookupPath(path, { follow: true });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isDir(node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!FS.isFile(node.mode)) {
          throw new FS.ErrnoError(28);
        }
        var errCode = FS.nodePermissions(node, "w");
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        node.node_ops.setattr(node, { size: len, timestamp: Date.now() });
      },
      ftruncate(fd, len) {
        var stream = FS.getStreamChecked(fd);
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(28);
        }
        FS.truncate(stream.node, len);
      },
      utime(path, atime, mtime) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        node.node_ops.setattr(node, { timestamp: Math.max(atime, mtime) });
      },
      open(path, flags, mode) {
        if (path === "") {
          throw new FS.ErrnoError(44);
        }
        flags = typeof flags == "string" ? FS_modeStringToFlags(flags) : flags;
        mode = typeof mode == "undefined" ? 438 : mode;
        if (flags & 64) {
          mode = (mode & 4095) | 32768;
        } else {
          mode = 0;
        }
        var node;
        if (typeof path == "object") {
          node = path;
        } else {
          path = PATH.normalize(path);
          try {
            var lookup = FS.lookupPath(path, { follow: !(flags & 131072) });
            node = lookup.node;
          } catch (e) {}
        }
        var created = false;
        if (flags & 64) {
          if (node) {
            if (flags & 128) {
              throw new FS.ErrnoError(20);
            }
          } else {
            node = FS.mknod(path, mode, 0);
            created = true;
          }
        }
        if (!node) {
          throw new FS.ErrnoError(44);
        }
        if (FS.isChrdev(node.mode)) {
          flags &= ~512;
        }
        if (flags & 65536 && !FS.isDir(node.mode)) {
          throw new FS.ErrnoError(54);
        }
        if (!created) {
          var errCode = FS.mayOpen(node, flags);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
        }
        if (flags & 512 && !created) {
          FS.truncate(node, 0);
        }
        flags &= ~(128 | 512 | 131072);
        var stream = FS.createStream({
          node: node,
          path: FS.getPath(node),
          flags: flags,
          seekable: true,
          position: 0,
          stream_ops: node.stream_ops,
          ungotten: [],
          error: false,
        });
        if (stream.stream_ops.open) {
          stream.stream_ops.open(stream);
        }
        if (Module["logReadFiles"] && !(flags & 1)) {
          if (!FS.readFiles) FS.readFiles = {};
          if (!(path in FS.readFiles)) {
            FS.readFiles[path] = 1;
          }
        }
        return stream;
      },
      close(stream) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if (stream.getdents) stream.getdents = null;
        try {
          if (stream.stream_ops.close) {
            stream.stream_ops.close(stream);
          }
        } catch (e) {
          throw e;
        } finally {
          FS.closeStream(stream.fd);
        }
        stream.fd = null;
      },
      isClosed(stream) {
        return stream.fd === null;
      },
      llseek(stream, offset, whence) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if (!stream.seekable || !stream.stream_ops.llseek) {
          throw new FS.ErrnoError(70);
        }
        if (whence != 0 && whence != 1 && whence != 2) {
          throw new FS.ErrnoError(28);
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position;
      },
      read(stream, buffer, offset, length, position) {
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(28);
        }
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(8);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!stream.stream_ops.read) {
          throw new FS.ErrnoError(28);
        }
        var seeking = typeof position != "undefined";
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(70);
        }
        var bytesRead = stream.stream_ops.read(
          stream,
          buffer,
          offset,
          length,
          position,
        );
        if (!seeking) stream.position += bytesRead;
        return bytesRead;
      },
      write(stream, buffer, offset, length, position, canOwn) {
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(28);
        }
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(8);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!stream.stream_ops.write) {
          throw new FS.ErrnoError(28);
        }
        if (stream.seekable && stream.flags & 1024) {
          FS.llseek(stream, 0, 2);
        }
        var seeking = typeof position != "undefined";
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(70);
        }
        var bytesWritten = stream.stream_ops.write(
          stream,
          buffer,
          offset,
          length,
          position,
          canOwn,
        );
        if (!seeking) stream.position += bytesWritten;
        return bytesWritten;
      },
      allocate(stream, offset, length) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if (offset < 0 || length <= 0) {
          throw new FS.ErrnoError(28);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(8);
        }
        if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(43);
        }
        if (!stream.stream_ops.allocate) {
          throw new FS.ErrnoError(138);
        }
        stream.stream_ops.allocate(stream, offset, length);
      },
      mmap(stream, length, position, prot, flags) {
        if (
          (prot & 2) !== 0 &&
          (flags & 2) === 0 &&
          (stream.flags & 2097155) !== 2
        ) {
          throw new FS.ErrnoError(2);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(2);
        }
        if (!stream.stream_ops.mmap) {
          throw new FS.ErrnoError(43);
        }
        return stream.stream_ops.mmap(stream, length, position, prot, flags);
      },
      msync(stream, buffer, offset, length, mmapFlags) {
        if (!stream.stream_ops.msync) {
          return 0;
        }
        return stream.stream_ops.msync(
          stream,
          buffer,
          offset,
          length,
          mmapFlags,
        );
      },
      munmap: (stream) => 0,
      ioctl(stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
          throw new FS.ErrnoError(59);
        }
        return stream.stream_ops.ioctl(stream, cmd, arg);
      },
      readFile(path, opts = {}) {
        opts.flags = opts.flags || 0;
        opts.encoding = opts.encoding || "binary";
        if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
          throw new Error(`Invalid encoding type "${opts.encoding}"`);
        }
        var ret;
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === "utf8") {
          ret = UTF8ArrayToString(buf, 0);
        } else if (opts.encoding === "binary") {
          ret = buf;
        }
        FS.close(stream);
        return ret;
      },
      writeFile(path, data, opts = {}) {
        opts.flags = opts.flags || 577;
        var stream = FS.open(path, opts.flags, opts.mode);
        if (typeof data == "string") {
          var buf = new Uint8Array(lengthBytesUTF8(data) + 1);
          var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
          FS.write(stream, buf, 0, actualNumBytes, undefined, opts.canOwn);
        } else if (ArrayBuffer.isView(data)) {
          FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
        } else {
          throw new Error("Unsupported data type");
        }
        FS.close(stream);
      },
      cwd: () => FS.currentPath,
      chdir(path) {
        var lookup = FS.lookupPath(path, { follow: true });
        if (lookup.node === null) {
          throw new FS.ErrnoError(44);
        }
        if (!FS.isDir(lookup.node.mode)) {
          throw new FS.ErrnoError(54);
        }
        var errCode = FS.nodePermissions(lookup.node, "x");
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        FS.currentPath = lookup.path;
      },
      createDefaultDirectories() {
        FS.mkdir("/tmp");
        FS.mkdir("/home");
        FS.mkdir("/home/web_user");
      },
      createDefaultDevices() {
        FS.mkdir("/dev");
        FS.registerDevice(FS.makedev(1, 3), {
          read: () => 0,
          write: (stream, buffer, offset, length, pos) => length,
        });
        FS.mkdev("/dev/null", FS.makedev(1, 3));
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev("/dev/tty", FS.makedev(5, 0));
        FS.mkdev("/dev/tty1", FS.makedev(6, 0));
        var randomBuffer = new Uint8Array(1024),
          randomLeft = 0;
        var randomByte = () => {
          if (randomLeft === 0) {
            randomLeft = randomFill(randomBuffer).byteLength;
          }
          return randomBuffer[--randomLeft];
        };
        FS.createDevice("/dev", "random", randomByte);
        FS.createDevice("/dev", "urandom", randomByte);
        FS.mkdir("/dev/shm");
        FS.mkdir("/dev/shm/tmp");
      },
      createSpecialDirectories() {
        FS.mkdir("/proc");
        var proc_self = FS.mkdir("/proc/self");
        FS.mkdir("/proc/self/fd");
        FS.mount(
          {
            mount() {
              var node = FS.createNode(proc_self, "fd", 16384 | 511, 73);
              node.node_ops = {
                lookup(parent, name) {
                  var fd = +name;
                  var stream = FS.getStreamChecked(fd);
                  var ret = {
                    parent: null,
                    mount: { mountpoint: "fake" },
                    node_ops: { readlink: () => stream.path },
                  };
                  ret.parent = ret;
                  return ret;
                },
              };
              return node;
            },
          },
          {},
          "/proc/self/fd",
        );
      },
      createStandardStreams() {
        if (Module["stdin"]) {
          FS.createDevice("/dev", "stdin", Module["stdin"]);
        } else {
          FS.symlink("/dev/tty", "/dev/stdin");
        }
        if (Module["stdout"]) {
          FS.createDevice("/dev", "stdout", null, Module["stdout"]);
        } else {
          FS.symlink("/dev/tty", "/dev/stdout");
        }
        if (Module["stderr"]) {
          FS.createDevice("/dev", "stderr", null, Module["stderr"]);
        } else {
          FS.symlink("/dev/tty1", "/dev/stderr");
        }
        var stdin = FS.open("/dev/stdin", 0);
        var stdout = FS.open("/dev/stdout", 1);
        var stderr = FS.open("/dev/stderr", 1);
      },
      ensureErrnoError() {
        if (FS.ErrnoError) return;
        FS.ErrnoError = function ErrnoError(errno, node) {
          this.name = "ErrnoError";
          this.node = node;
          this.setErrno = function (errno) {
            this.errno = errno;
          };
          this.setErrno(errno);
          this.message = "FS error";
        };
        FS.ErrnoError.prototype = new Error();
        FS.ErrnoError.prototype.constructor = FS.ErrnoError;
        [44].forEach((code) => {
          FS.genericErrors[code] = new FS.ErrnoError(code);
          FS.genericErrors[code].stack = "<generic error, no stack>";
        });
      },
      staticInit() {
        FS.ensureErrnoError();
        FS.nameTable = new Array(4096);
        FS.mount(MEMFS, {}, "/");
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
        FS.filesystems = { MEMFS: MEMFS };
      },
      init(input, output, error) {
        FS.init.initialized = true;
        FS.ensureErrnoError();
        Module["stdin"] = input || Module["stdin"];
        Module["stdout"] = output || Module["stdout"];
        Module["stderr"] = error || Module["stderr"];
        FS.createStandardStreams();
      },
      quit() {
        FS.init.initialized = false;
        for (var i = 0; i < FS.streams.length; i++) {
          var stream = FS.streams[i];
          if (!stream) {
            continue;
          }
          FS.close(stream);
        }
      },
      findObject(path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (!ret.exists) {
          return null;
        }
        return ret.object;
      },
      analyzePath(path, dontResolveLastLink) {
        try {
          var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          path = lookup.path;
        } catch (e) {}
        var ret = {
          isRoot: false,
          exists: false,
          error: 0,
          name: null,
          path: null,
          object: null,
          parentExists: false,
          parentPath: null,
          parentObject: null,
        };
        try {
          var lookup = FS.lookupPath(path, { parent: true });
          ret.parentExists = true;
          ret.parentPath = lookup.path;
          ret.parentObject = lookup.node;
          ret.name = PATH.basename(path);
          lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          ret.exists = true;
          ret.path = lookup.path;
          ret.object = lookup.node;
          ret.name = lookup.node.name;
          ret.isRoot = lookup.path === "/";
        } catch (e) {
          ret.error = e.errno;
        }
        return ret;
      },
      createPath(parent, path, canRead, canWrite) {
        parent = typeof parent == "string" ? parent : FS.getPath(parent);
        var parts = path.split("/").reverse();
        while (parts.length) {
          var part = parts.pop();
          if (!part) continue;
          var current = PATH.join2(parent, part);
          try {
            FS.mkdir(current);
          } catch (e) {}
          parent = current;
        }
        return current;
      },
      createFile(parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(
          typeof parent == "string" ? parent : FS.getPath(parent),
          name,
        );
        var mode = FS_getMode(canRead, canWrite);
        return FS.create(path, mode);
      },
      createDataFile(parent, name, data, canRead, canWrite, canOwn) {
        var path = name;
        if (parent) {
          parent = typeof parent == "string" ? parent : FS.getPath(parent);
          path = name ? PATH.join2(parent, name) : parent;
        }
        var mode = FS_getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
          if (typeof data == "string") {
            var arr = new Array(data.length);
            for (var i = 0, len = data.length; i < len; ++i)
              arr[i] = data.charCodeAt(i);
            data = arr;
          }
          FS.chmod(node, mode | 146);
          var stream = FS.open(node, 577);
          FS.write(stream, data, 0, data.length, 0, canOwn);
          FS.close(stream);
          FS.chmod(node, mode);
        }
        return node;
      },
      createDevice(parent, name, input, output) {
        var path = PATH.join2(
          typeof parent == "string" ? parent : FS.getPath(parent),
          name,
        );
        var mode = FS_getMode(!!input, !!output);
        if (!FS.createDevice.major) FS.createDevice.major = 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        FS.registerDevice(dev, {
          open(stream) {
            stream.seekable = false;
          },
          close(stream) {
            if (output && output.buffer && output.buffer.length) {
              output(10);
            }
          },
          read(stream, buffer, offset, length, pos) {
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
              var result;
              try {
                result = input();
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
              if (result === undefined && bytesRead === 0) {
                throw new FS.ErrnoError(6);
              }
              if (result === null || result === undefined) break;
              bytesRead++;
              buffer[offset + i] = result;
            }
            if (bytesRead) {
              stream.node.timestamp = Date.now();
            }
            return bytesRead;
          },
          write(stream, buffer, offset, length, pos) {
            for (var i = 0; i < length; i++) {
              try {
                output(buffer[offset + i]);
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
            }
            if (length) {
              stream.node.timestamp = Date.now();
            }
            return i;
          },
        });
        return FS.mkdev(path, mode, dev);
      },
      forceLoadFile(obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents)
          return true;
        if (typeof XMLHttpRequest != "undefined") {
          throw new Error(
            "Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.",
          );
        } else if (read_) {
          try {
            obj.contents = intArrayFromString(read_(obj.url), true);
            obj.usedBytes = obj.contents.length;
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
        } else {
          throw new Error("Cannot load without read() or XMLHttpRequest.");
        }
      },
      createLazyFile(parent, name, url, canRead, canWrite) {
        function LazyUint8Array() {
          this.lengthKnown = false;
          this.chunks = [];
        }
        LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
          if (idx > this.length - 1 || idx < 0) {
            return undefined;
          }
          var chunkOffset = idx % this.chunkSize;
          var chunkNum = (idx / this.chunkSize) | 0;
          return this.getter(chunkNum)[chunkOffset];
        };
        LazyUint8Array.prototype.setDataGetter =
          function LazyUint8Array_setDataGetter(getter) {
            this.getter = getter;
          };
        LazyUint8Array.prototype.cacheLength =
          function LazyUint8Array_cacheLength() {
            var xhr = new XMLHttpRequest();
            xhr.open("HEAD", url, false);
            xhr.send(null);
            if (
              !((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304)
            )
              throw new Error(
                "Couldn't load " + url + ". Status: " + xhr.status,
              );
            var datalength = Number(xhr.getResponseHeader("Content-length"));
            var header;
            var hasByteServing =
              (header = xhr.getResponseHeader("Accept-Ranges")) &&
              header === "bytes";
            var usesGzip =
              (header = xhr.getResponseHeader("Content-Encoding")) &&
              header === "gzip";
            var chunkSize = 1024 * 1024;
            if (!hasByteServing) chunkSize = datalength;
            var doXHR = (from, to) => {
              if (from > to)
                throw new Error(
                  "invalid range (" +
                    from +
                    ", " +
                    to +
                    ") or no bytes requested!",
                );
              if (to > datalength - 1)
                throw new Error(
                  "only " + datalength + " bytes available! programmer error!",
                );
              var xhr = new XMLHttpRequest();
              xhr.open("GET", url, false);
              if (datalength !== chunkSize)
                xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
              xhr.responseType = "arraybuffer";
              if (xhr.overrideMimeType) {
                xhr.overrideMimeType("text/plain; charset=x-user-defined");
              }
              xhr.send(null);
              if (
                !((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304)
              )
                throw new Error(
                  "Couldn't load " + url + ". Status: " + xhr.status,
                );
              if (xhr.response !== undefined) {
                return new Uint8Array(xhr.response || []);
              }
              return intArrayFromString(xhr.responseText || "", true);
            };
            var lazyArray = this;
            lazyArray.setDataGetter((chunkNum) => {
              var start = chunkNum * chunkSize;
              var end = (chunkNum + 1) * chunkSize - 1;
              end = Math.min(end, datalength - 1);
              if (typeof lazyArray.chunks[chunkNum] == "undefined") {
                lazyArray.chunks[chunkNum] = doXHR(start, end);
              }
              if (typeof lazyArray.chunks[chunkNum] == "undefined")
                throw new Error("doXHR failed!");
              return lazyArray.chunks[chunkNum];
            });
            if (usesGzip || !datalength) {
              chunkSize = datalength = 1;
              datalength = this.getter(0).length;
              chunkSize = datalength;
              out(
                "LazyFiles on gzip forces download of the whole file when length is accessed",
              );
            }
            this._length = datalength;
            this._chunkSize = chunkSize;
            this.lengthKnown = true;
          };
        if (typeof XMLHttpRequest != "undefined") {
          if (!ENVIRONMENT_IS_WORKER)
            throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";
          var lazyArray = new LazyUint8Array();
          Object.defineProperties(lazyArray, {
            length: {
              get: function () {
                if (!this.lengthKnown) {
                  this.cacheLength();
                }
                return this._length;
              },
            },
            chunkSize: {
              get: function () {
                if (!this.lengthKnown) {
                  this.cacheLength();
                }
                return this._chunkSize;
              },
            },
          });
          var properties = { isDevice: false, contents: lazyArray };
        } else {
          var properties = { isDevice: false, url: url };
        }
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        if (properties.contents) {
          node.contents = properties.contents;
        } else if (properties.url) {
          node.contents = null;
          node.url = properties.url;
        }
        Object.defineProperties(node, {
          usedBytes: {
            get: function () {
              return this.contents.length;
            },
          },
        });
        var stream_ops = {};
        var keys = Object.keys(node.stream_ops);
        keys.forEach((key) => {
          var fn = node.stream_ops[key];
          stream_ops[key] = function forceLoadLazyFile() {
            FS.forceLoadFile(node);
            return fn.apply(null, arguments);
          };
        });
        function writeChunks(stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= contents.length) return 0;
          var size = Math.min(contents.length - position, length);
          if (contents.slice) {
            for (var i = 0; i < size; i++) {
              buffer[offset + i] = contents[position + i];
            }
          } else {
            for (var i = 0; i < size; i++) {
              buffer[offset + i] = contents.get(position + i);
            }
          }
          return size;
        }
        stream_ops.read = (stream, buffer, offset, length, position) => {
          FS.forceLoadFile(node);
          return writeChunks(stream, buffer, offset, length, position);
        };
        stream_ops.mmap = (stream, length, position, prot, flags) => {
          FS.forceLoadFile(node);
          var ptr = mmapAlloc(length);
          if (!ptr) {
            throw new FS.ErrnoError(48);
          }
          writeChunks(stream, GROWABLE_HEAP_I8(), ptr, length, position);
          return { ptr: ptr, allocated: true };
        };
        node.stream_ops = stream_ops;
        return node;
      },
    };
    var UTF8ToString = (ptr, maxBytesToRead) => {
      ptr >>>= 0;
      return ptr
        ? UTF8ArrayToString(GROWABLE_HEAP_U8(), ptr, maxBytesToRead)
        : "";
    };
    var SYSCALLS = {
      DEFAULT_POLLMASK: 5,
      calculateAt(dirfd, path, allowEmpty) {
        if (PATH.isAbs(path)) {
          return path;
        }
        var dir;
        if (dirfd === -100) {
          dir = FS.cwd();
        } else {
          var dirstream = SYSCALLS.getStreamFromFD(dirfd);
          dir = dirstream.path;
        }
        if (path.length == 0) {
          if (!allowEmpty) {
            throw new FS.ErrnoError(44);
          }
          return dir;
        }
        return PATH.join2(dir, path);
      },
      doStat(func, path, buf) {
        try {
          var stat = func(path);
        } catch (e) {
          if (
            e &&
            e.node &&
            PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))
          ) {
            return -54;
          }
          throw e;
        }
        GROWABLE_HEAP_I32()[(buf >>> 2) >>> 0] = stat.dev;
        GROWABLE_HEAP_I32()[((buf + 4) >>> 2) >>> 0] = stat.mode;
        GROWABLE_HEAP_U32()[((buf + 8) >>> 2) >>> 0] = stat.nlink;
        GROWABLE_HEAP_I32()[((buf + 12) >>> 2) >>> 0] = stat.uid;
        GROWABLE_HEAP_I32()[((buf + 16) >>> 2) >>> 0] = stat.gid;
        GROWABLE_HEAP_I32()[((buf + 20) >>> 2) >>> 0] = stat.rdev;
        (tempI64 = [
          stat.size >>> 0,
          ((tempDouble = stat.size),
          +Math.abs(tempDouble) >= 1
            ? tempDouble > 0
              ? +Math.floor(tempDouble / 4294967296) >>> 0
              : ~~+Math.ceil(
                  (tempDouble - +(~~tempDouble >>> 0)) / 4294967296,
                ) >>> 0
            : 0),
        ]),
          (GROWABLE_HEAP_I32()[((buf + 24) >>> 2) >>> 0] = tempI64[0]),
          (GROWABLE_HEAP_I32()[((buf + 28) >>> 2) >>> 0] = tempI64[1]);
        GROWABLE_HEAP_I32()[((buf + 32) >>> 2) >>> 0] = 4096;
        GROWABLE_HEAP_I32()[((buf + 36) >>> 2) >>> 0] = stat.blocks;
        var atime = stat.atime.getTime();
        var mtime = stat.mtime.getTime();
        var ctime = stat.ctime.getTime();
        (tempI64 = [
          Math.floor(atime / 1e3) >>> 0,
          ((tempDouble = Math.floor(atime / 1e3)),
          +Math.abs(tempDouble) >= 1
            ? tempDouble > 0
              ? +Math.floor(tempDouble / 4294967296) >>> 0
              : ~~+Math.ceil(
                  (tempDouble - +(~~tempDouble >>> 0)) / 4294967296,
                ) >>> 0
            : 0),
        ]),
          (GROWABLE_HEAP_I32()[((buf + 40) >>> 2) >>> 0] = tempI64[0]),
          (GROWABLE_HEAP_I32()[((buf + 44) >>> 2) >>> 0] = tempI64[1]);
        GROWABLE_HEAP_U32()[((buf + 48) >>> 2) >>> 0] = (atime % 1e3) * 1e3;
        (tempI64 = [
          Math.floor(mtime / 1e3) >>> 0,
          ((tempDouble = Math.floor(mtime / 1e3)),
          +Math.abs(tempDouble) >= 1
            ? tempDouble > 0
              ? +Math.floor(tempDouble / 4294967296) >>> 0
              : ~~+Math.ceil(
                  (tempDouble - +(~~tempDouble >>> 0)) / 4294967296,
                ) >>> 0
            : 0),
        ]),
          (GROWABLE_HEAP_I32()[((buf + 56) >>> 2) >>> 0] = tempI64[0]),
          (GROWABLE_HEAP_I32()[((buf + 60) >>> 2) >>> 0] = tempI64[1]);
        GROWABLE_HEAP_U32()[((buf + 64) >>> 2) >>> 0] = (mtime % 1e3) * 1e3;
        (tempI64 = [
          Math.floor(ctime / 1e3) >>> 0,
          ((tempDouble = Math.floor(ctime / 1e3)),
          +Math.abs(tempDouble) >= 1
            ? tempDouble > 0
              ? +Math.floor(tempDouble / 4294967296) >>> 0
              : ~~+Math.ceil(
                  (tempDouble - +(~~tempDouble >>> 0)) / 4294967296,
                ) >>> 0
            : 0),
        ]),
          (GROWABLE_HEAP_I32()[((buf + 72) >>> 2) >>> 0] = tempI64[0]),
          (GROWABLE_HEAP_I32()[((buf + 76) >>> 2) >>> 0] = tempI64[1]);
        GROWABLE_HEAP_U32()[((buf + 80) >>> 2) >>> 0] = (ctime % 1e3) * 1e3;
        (tempI64 = [
          stat.ino >>> 0,
          ((tempDouble = stat.ino),
          +Math.abs(tempDouble) >= 1
            ? tempDouble > 0
              ? +Math.floor(tempDouble / 4294967296) >>> 0
              : ~~+Math.ceil(
                  (tempDouble - +(~~tempDouble >>> 0)) / 4294967296,
                ) >>> 0
            : 0),
        ]),
          (GROWABLE_HEAP_I32()[((buf + 88) >>> 2) >>> 0] = tempI64[0]),
          (GROWABLE_HEAP_I32()[((buf + 92) >>> 2) >>> 0] = tempI64[1]);
        return 0;
      },
      doMsync(addr, stream, len, flags, offset) {
        if (!FS.isFile(stream.node.mode)) {
          throw new FS.ErrnoError(43);
        }
        if (flags & 2) {
          return 0;
        }
        var buffer = GROWABLE_HEAP_U8().slice(addr, addr + len);
        FS.msync(stream, buffer, offset, len, flags);
      },
      varargs: undefined,
      get() {
        var ret = GROWABLE_HEAP_I32()[(+SYSCALLS.varargs >>> 2) >>> 0];
        SYSCALLS.varargs += 4;
        return ret;
      },
      getp() {
        return SYSCALLS.get();
      },
      getStr(ptr) {
        var ret = UTF8ToString(ptr);
        return ret;
      },
      getStreamFromFD(fd) {
        var stream = FS.getStreamChecked(fd);
        return stream;
      },
    };
    function _proc_exit(code) {
      if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(0, 1, code);
      EXITSTATUS = code;
      if (!keepRuntimeAlive()) {
        PThread.terminateAllThreads();
        if (Module["onExit"]) Module["onExit"](code);
        ABORT = true;
      }
      quit_(code, new ExitStatus(code));
    }
    var exitJS = (status, implicit) => {
      EXITSTATUS = status;
      if (ENVIRONMENT_IS_PTHREAD) {
        exitOnMainThread(status);
        throw "unwind";
      }
      _proc_exit(status);
    };
    var _exit = exitJS;
    var handleException = (e) => {
      if (e instanceof ExitStatus || e == "unwind") {
        return EXITSTATUS;
      }
      quit_(1, e);
    };
    var PThread = {
      unusedWorkers: [],
      runningWorkers: [],
      tlsInitFunctions: [],
      pthreads: {},
      init() {
        if (ENVIRONMENT_IS_PTHREAD) {
          PThread.initWorker();
        } else {
          PThread.initMainThread();
        }
      },
      initMainThread() {
        var pthreadPoolSize = 10;
        while (pthreadPoolSize--) {
          PThread.allocateUnusedWorker();
        }
        addOnPreRun(() => {
          addRunDependency("loading-workers");
          PThread.loadWasmModuleToAllWorkers(() =>
            removeRunDependency("loading-workers"),
          );
        });
      },
      initWorker() {
        noExitRuntime = false;
      },
      setExitStatus: (status) => {
        EXITSTATUS = status;
      },
      terminateAllThreads__deps: ["$terminateWorker"],
      terminateAllThreads: () => {
        for (var worker of PThread.runningWorkers) {
          terminateWorker(worker);
        }
        for (var worker of PThread.unusedWorkers) {
          terminateWorker(worker);
        }
        PThread.unusedWorkers = [];
        PThread.runningWorkers = [];
        PThread.pthreads = [];
      },
      returnWorkerToPool: (worker) => {
        var pthread_ptr = worker.pthread_ptr;
        delete PThread.pthreads[pthread_ptr];
        PThread.unusedWorkers.push(worker);
        PThread.runningWorkers.splice(
          PThread.runningWorkers.indexOf(worker),
          1,
        );
        worker.pthread_ptr = 0;
        __emscripten_thread_free_data(pthread_ptr);
      },
      receiveObjectTransfer(data) {},
      threadInitTLS() {
        PThread.tlsInitFunctions.forEach((f) => f());
      },
      loadWasmModuleToWorker: (worker) =>
        new Promise((onFinishedLoading) => {
          worker.onmessage = (e) => {
            var d = e["data"];
            var cmd = d["cmd"];
            if (d["targetThread"] && d["targetThread"] != _pthread_self()) {
              var targetWorker = PThread.pthreads[d["targetThread"]];
              if (targetWorker) {
                targetWorker.postMessage(d, d["transferList"]);
              } else {
                err(
                  `Internal error! Worker sent a message "${cmd}" to target pthread ${d["targetThread"]}, but that thread no longer exists!`,
                );
              }
              return;
            }
            if (cmd === "checkMailbox") {
              checkMailbox();
            } else if (cmd === "spawnThread") {
              spawnThread(d);
            } else if (cmd === "cleanupThread") {
              cleanupThread(d["thread"]);
            } else if (cmd === "killThread") {
              killThread(d["thread"]);
            } else if (cmd === "cancelThread") {
              cancelThread(d["thread"]);
            } else if (cmd === "loaded") {
              worker.loaded = true;
              if (ENVIRONMENT_IS_NODE && !worker.pthread_ptr) {
                worker.unref();
              }
              onFinishedLoading(worker);
            } else if (cmd === "alert") {
              alert(`Thread ${d["threadId"]}: ${d["text"]}`);
            } else if (d.target === "setimmediate") {
              worker.postMessage(d);
            } else if (cmd === "callHandler") {
              Module[d["handler"]](...d["args"]);
            } else if (cmd) {
              err(`worker sent an unknown command ${cmd}`);
            }
          };
          worker.onerror = (e) => {
            var message = "worker sent an error!";
            err(`${message} ${e.filename}:${e.lineno}: ${e.message}`);
            throw e;
          };
          if (ENVIRONMENT_IS_NODE) {
            worker.on("message", (data) => worker.onmessage({ data: data }));
            worker.on("error", (e) => worker.onerror(e));
          }
          var handlers = [];
          var knownHandlers = ["onExit", "onAbort", "print", "printErr"];
          for (var handler of knownHandlers) {
            if (Module.hasOwnProperty(handler)) {
              handlers.push(handler);
            }
          }
          worker.postMessage({
            cmd: "load",
            handlers: handlers,
            urlOrBlob: Module["mainScriptUrlOrBlob"] || _scriptDir,
            wasmMemory: wasmMemory,
            wasmModule: wasmModule,
          });
        }),
      loadWasmModuleToAllWorkers(onMaybeReady) {
        if (ENVIRONMENT_IS_PTHREAD) {
          return onMaybeReady();
        }
        let pthreadPoolReady = Promise.all(
          PThread.unusedWorkers.map(PThread.loadWasmModuleToWorker),
        );
        pthreadPoolReady.then(onMaybeReady);
      },
      allocateUnusedWorker() {
        var worker;
        var pthreadMainJs = locateFile("emHdBindings.worker.js");
        worker = new Worker(pthreadMainJs);
        PThread.unusedWorkers.push(worker);
      },
      getNewWorker() {
        if (PThread.unusedWorkers.length == 0) {
          PThread.allocateUnusedWorker();
          PThread.loadWasmModuleToWorker(PThread.unusedWorkers[0]);
        }
        return PThread.unusedWorkers.pop();
      },
    };
    Module["PThread"] = PThread;
    var callRuntimeCallbacks = (callbacks) => {
      while (callbacks.length > 0) {
        callbacks.shift()(Module);
      }
    };
    var establishStackSpace = () => {
      var pthread_ptr = _pthread_self();
      var stackHigh = GROWABLE_HEAP_U32()[((pthread_ptr + 52) >>> 2) >>> 0];
      var stackSize = GROWABLE_HEAP_U32()[((pthread_ptr + 56) >>> 2) >>> 0];
      var stackLow = stackHigh - stackSize;
      _emscripten_stack_set_limits(stackHigh, stackLow);
      stackRestore(stackHigh);
    };
    Module["establishStackSpace"] = establishStackSpace;
    function exitOnMainThread(returnCode) {
      if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(1, 0, returnCode);
      _exit(returnCode);
    }
    var invokeEntryPoint = (ptr, arg) => {
      var result = ((a1) => dynCall_ii.apply(null, [ptr, a1]))(arg);
      function finish(result) {
        if (keepRuntimeAlive()) {
          PThread.setExitStatus(result);
        } else {
          __emscripten_thread_exit(result);
        }
      }
      finish(result);
    };
    Module["invokeEntryPoint"] = invokeEntryPoint;
    var noExitRuntime = Module["noExitRuntime"] || true;
    var registerTLSInit = (tlsInitFunc) => {
      PThread.tlsInitFunctions.push(tlsInitFunc);
    };
    var convertI32PairToI53Checked = (lo, hi) =>
      (hi + 2097152) >>> 0 < 4194305 - !!lo
        ? (lo >>> 0) + hi * 4294967296
        : NaN;
    var ___call_sighandler = function (fp, sig) {
      fp >>>= 0;
      return ((a1) => dynCall_vi.apply(null, [fp, a1]))(sig);
    };
    var exceptionCaught = [];
    var uncaughtExceptionCount = 0;
    function ___cxa_begin_catch(ptr) {
      ptr >>>= 0;
      var info = new ExceptionInfo(ptr);
      if (!info.get_caught()) {
        info.set_caught(true);
        uncaughtExceptionCount--;
      }
      info.set_rethrown(false);
      exceptionCaught.push(info);
      ___cxa_increment_exception_refcount(info.excPtr);
      return info.get_exception_ptr();
    }
    var exceptionLast = 0;
    var ___cxa_end_catch = () => {
      _setThrew(0, 0);
      var info = exceptionCaught.pop();
      ___cxa_decrement_exception_refcount(info.excPtr);
      exceptionLast = 0;
    };
    function ExceptionInfo(excPtr) {
      this.excPtr = excPtr;
      this.ptr = excPtr - 24;
      this.set_type = function (type) {
        GROWABLE_HEAP_U32()[((this.ptr + 4) >>> 2) >>> 0] = type;
      };
      this.get_type = function () {
        return GROWABLE_HEAP_U32()[((this.ptr + 4) >>> 2) >>> 0];
      };
      this.set_destructor = function (destructor) {
        GROWABLE_HEAP_U32()[((this.ptr + 8) >>> 2) >>> 0] = destructor;
      };
      this.get_destructor = function () {
        return GROWABLE_HEAP_U32()[((this.ptr + 8) >>> 2) >>> 0];
      };
      this.set_caught = function (caught) {
        caught = caught ? 1 : 0;
        GROWABLE_HEAP_I8()[((this.ptr + 12) >>> 0) >>> 0] = caught;
      };
      this.get_caught = function () {
        return GROWABLE_HEAP_I8()[((this.ptr + 12) >>> 0) >>> 0] != 0;
      };
      this.set_rethrown = function (rethrown) {
        rethrown = rethrown ? 1 : 0;
        GROWABLE_HEAP_I8()[((this.ptr + 13) >>> 0) >>> 0] = rethrown;
      };
      this.get_rethrown = function () {
        return GROWABLE_HEAP_I8()[((this.ptr + 13) >>> 0) >>> 0] != 0;
      };
      this.init = function (type, destructor) {
        this.set_adjusted_ptr(0);
        this.set_type(type);
        this.set_destructor(destructor);
      };
      this.set_adjusted_ptr = function (adjustedPtr) {
        GROWABLE_HEAP_U32()[((this.ptr + 16) >>> 2) >>> 0] = adjustedPtr;
      };
      this.get_adjusted_ptr = function () {
        return GROWABLE_HEAP_U32()[((this.ptr + 16) >>> 2) >>> 0];
      };
      this.get_exception_ptr = function () {
        var isPointer = ___cxa_is_pointer_type(this.get_type());
        if (isPointer) {
          return GROWABLE_HEAP_U32()[(this.excPtr >>> 2) >>> 0];
        }
        var adjusted = this.get_adjusted_ptr();
        if (adjusted !== 0) return adjusted;
        return this.excPtr;
      };
    }
    function ___resumeException(ptr) {
      ptr >>>= 0;
      if (!exceptionLast) {
        exceptionLast = ptr;
      }
      throw exceptionLast;
    }
    var findMatchingCatch = (args) => {
      var thrown = exceptionLast;
      if (!thrown) {
        setTempRet0(0);
        return 0;
      }
      var info = new ExceptionInfo(thrown);
      info.set_adjusted_ptr(thrown);
      var thrownType = info.get_type();
      if (!thrownType) {
        setTempRet0(0);
        return thrown;
      }
      for (var arg in args) {
        var caughtType = args[arg];
        if (caughtType === 0 || caughtType === thrownType) {
          break;
        }
        var adjusted_ptr_addr = info.ptr + 16;
        if (___cxa_can_catch(caughtType, thrownType, adjusted_ptr_addr)) {
          setTempRet0(caughtType);
          return thrown;
        }
      }
      setTempRet0(thrownType);
      return thrown;
    };
    function ___cxa_find_matching_catch_2() {
      return findMatchingCatch([]);
    }
    function ___cxa_find_matching_catch_3(arg0) {
      arg0 >>>= 0;
      return findMatchingCatch([arg0]);
    }
    function ___cxa_find_matching_catch_4(arg0, arg1) {
      arg0 >>>= 0;
      arg1 >>>= 0;
      return findMatchingCatch([arg0, arg1]);
    }
    function ___cxa_get_exception_ptr(ptr) {
      ptr >>>= 0;
      var rtn = new ExceptionInfo(ptr).get_exception_ptr();
      return rtn;
    }
    var ___cxa_rethrow = () => {
      var info = exceptionCaught.pop();
      if (!info) {
        abort("no exception to throw");
      }
      var ptr = info.excPtr;
      if (!info.get_rethrown()) {
        exceptionCaught.push(info);
        info.set_rethrown(true);
        info.set_caught(false);
        uncaughtExceptionCount++;
      }
      exceptionLast = ptr;
      throw exceptionLast;
    };
    function ___cxa_rethrow_primary_exception(ptr) {
      ptr >>>= 0;
      if (!ptr) return;
      var info = new ExceptionInfo(ptr);
      exceptionCaught.push(info);
      info.set_rethrown(true);
      ___cxa_rethrow();
    }
    function ___cxa_throw(ptr, type, destructor) {
      ptr >>>= 0;
      type >>>= 0;
      destructor >>>= 0;
      var info = new ExceptionInfo(ptr);
      info.init(type, destructor);
      exceptionLast = ptr;
      uncaughtExceptionCount++;
      throw exceptionLast;
    }
    var ___cxa_uncaught_exceptions = () => uncaughtExceptionCount;
    function ___emscripten_init_main_thread_js(tb) {
      tb >>>= 0;
      __emscripten_thread_init(
        tb,
        !ENVIRONMENT_IS_WORKER,
        1,
        !ENVIRONMENT_IS_WEB,
        2097152,
        false,
      );
      PThread.threadInitTLS();
    }
    function ___emscripten_thread_cleanup(thread) {
      thread >>>= 0;
      if (!ENVIRONMENT_IS_PTHREAD) cleanupThread(thread);
      else postMessage({ cmd: "cleanupThread", thread: thread });
    }
    function pthreadCreateProxied(pthread_ptr, attr, startRoutine, arg) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(2, 1, pthread_ptr, attr, startRoutine, arg);
      return ___pthread_create_js(pthread_ptr, attr, startRoutine, arg);
    }
    function ___pthread_create_js(pthread_ptr, attr, startRoutine, arg) {
      pthread_ptr >>>= 0;
      attr >>>= 0;
      startRoutine >>>= 0;
      arg >>>= 0;
      if (typeof SharedArrayBuffer == "undefined") {
        err(
          "Current environment does not support SharedArrayBuffer, pthreads are not available!",
        );
        return 6;
      }
      var transferList = [];
      var error = 0;
      if (ENVIRONMENT_IS_PTHREAD && (transferList.length === 0 || error)) {
        return pthreadCreateProxied(pthread_ptr, attr, startRoutine, arg);
      }
      if (error) return error;
      var threadParams = {
        startRoutine: startRoutine,
        pthread_ptr: pthread_ptr,
        arg: arg,
        transferList: transferList,
      };
      if (ENVIRONMENT_IS_PTHREAD) {
        threadParams.cmd = "spawnThread";
        postMessage(threadParams, transferList);
        return 0;
      }
      return spawnThread(threadParams);
    }
    function ___syscall_chmod(path, mode) {
      if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(3, 1, path, mode);
      path >>>= 0;
      try {
        path = SYSCALLS.getStr(path);
        FS.chmod(path, mode);
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_faccessat(dirfd, path, amode, flags) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(4, 1, dirfd, path, amode, flags);
      path >>>= 0;
      try {
        path = SYSCALLS.getStr(path);
        path = SYSCALLS.calculateAt(dirfd, path);
        if (amode & ~7) {
          return -28;
        }
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        if (!node) {
          return -44;
        }
        var perms = "";
        if (amode & 4) perms += "r";
        if (amode & 2) perms += "w";
        if (amode & 1) perms += "x";
        if (perms && FS.nodePermissions(node, perms)) {
          return -2;
        }
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_fadvise64(fd, offset, len, advice) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(5, 0, fd, offset, len, advice);
      return 0;
    }
    function ___syscall_fchmod(fd, mode) {
      if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(6, 1, fd, mode);
      try {
        FS.fchmod(fd, mode);
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    var setErrNo = (value) => {
      GROWABLE_HEAP_I32()[(___errno_location() >>> 2) >>> 0] = value;
      return value;
    };
    function ___syscall_fcntl64(fd, cmd, varargs) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(7, 1, fd, cmd, varargs);
      varargs >>>= 0;
      SYSCALLS.varargs = varargs;
      try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        switch (cmd) {
          case 0: {
            var arg = SYSCALLS.get();
            if (arg < 0) {
              return -28;
            }
            while (FS.streams[arg]) {
              arg++;
            }
            var newStream;
            newStream = FS.createStream(stream, arg);
            return newStream.fd;
          }
          case 1:
          case 2:
            return 0;
          case 3:
            return stream.flags;
          case 4: {
            var arg = SYSCALLS.get();
            stream.flags |= arg;
            return 0;
          }
          case 5: {
            var arg = SYSCALLS.getp();
            var offset = 0;
            GROWABLE_HEAP_I16()[((arg + offset) >>> 1) >>> 0] = 2;
            return 0;
          }
          case 6:
          case 7:
            return 0;
          case 16:
          case 8:
            return -28;
          case 9:
            setErrNo(28);
            return -1;
          default: {
            return -28;
          }
        }
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_fstat64(fd, buf) {
      if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(8, 1, fd, buf);
      buf >>>= 0;
      try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        return SYSCALLS.doStat(FS.stat, stream.path, buf);
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    var stringToUTF8 = (str, outPtr, maxBytesToWrite) =>
      stringToUTF8Array(str, GROWABLE_HEAP_U8(), outPtr, maxBytesToWrite);
    function ___syscall_getcwd(buf, size) {
      if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(9, 1, buf, size);
      buf >>>= 0;
      size >>>= 0;
      try {
        if (size === 0) return -28;
        var cwd = FS.cwd();
        var cwdLengthInBytes = lengthBytesUTF8(cwd) + 1;
        if (size < cwdLengthInBytes) return -68;
        stringToUTF8(cwd, buf, size);
        return cwdLengthInBytes;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_getdents64(fd, dirp, count) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(10, 1, fd, dirp, count);
      dirp >>>= 0;
      count >>>= 0;
      try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        if (!stream.getdents) {
          stream.getdents = FS.readdir(stream.path);
        }
        var struct_size = 280;
        var pos = 0;
        var off = FS.llseek(stream, 0, 1);
        var idx = Math.floor(off / struct_size);
        while (idx < stream.getdents.length && pos + struct_size <= count) {
          var id;
          var type;
          var name = stream.getdents[idx];
          if (name === ".") {
            id = stream.node.id;
            type = 4;
          } else if (name === "..") {
            var lookup = FS.lookupPath(stream.path, { parent: true });
            id = lookup.node.id;
            type = 4;
          } else {
            var child = FS.lookupNode(stream.node, name);
            id = child.id;
            type = FS.isChrdev(child.mode)
              ? 2
              : FS.isDir(child.mode)
                ? 4
                : FS.isLink(child.mode)
                  ? 10
                  : 8;
          }
          (tempI64 = [
            id >>> 0,
            ((tempDouble = id),
            +Math.abs(tempDouble) >= 1
              ? tempDouble > 0
                ? +Math.floor(tempDouble / 4294967296) >>> 0
                : ~~+Math.ceil(
                    (tempDouble - +(~~tempDouble >>> 0)) / 4294967296,
                  ) >>> 0
              : 0),
          ]),
            (GROWABLE_HEAP_I32()[((dirp + pos) >>> 2) >>> 0] = tempI64[0]),
            (GROWABLE_HEAP_I32()[((dirp + pos + 4) >>> 2) >>> 0] = tempI64[1]);
          (tempI64 = [
            ((idx + 1) * struct_size) >>> 0,
            ((tempDouble = (idx + 1) * struct_size),
            +Math.abs(tempDouble) >= 1
              ? tempDouble > 0
                ? +Math.floor(tempDouble / 4294967296) >>> 0
                : ~~+Math.ceil(
                    (tempDouble - +(~~tempDouble >>> 0)) / 4294967296,
                  ) >>> 0
              : 0),
          ]),
            (GROWABLE_HEAP_I32()[((dirp + pos + 8) >>> 2) >>> 0] = tempI64[0]),
            (GROWABLE_HEAP_I32()[((dirp + pos + 12) >>> 2) >>> 0] = tempI64[1]);
          GROWABLE_HEAP_I16()[((dirp + pos + 16) >>> 1) >>> 0] = 280;
          GROWABLE_HEAP_I8()[((dirp + pos + 18) >>> 0) >>> 0] = type;
          stringToUTF8(name, dirp + pos + 19, 256);
          pos += struct_size;
          idx += 1;
        }
        FS.llseek(stream, idx * struct_size, 0);
        return pos;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_ioctl(fd, op, varargs) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(11, 1, fd, op, varargs);
      varargs >>>= 0;
      SYSCALLS.varargs = varargs;
      try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        switch (op) {
          case 21509: {
            if (!stream.tty) return -59;
            return 0;
          }
          case 21505: {
            if (!stream.tty) return -59;
            if (stream.tty.ops.ioctl_tcgets) {
              var termios = stream.tty.ops.ioctl_tcgets(stream);
              var argp = SYSCALLS.getp();
              GROWABLE_HEAP_I32()[(argp >>> 2) >>> 0] = termios.c_iflag || 0;
              GROWABLE_HEAP_I32()[((argp + 4) >>> 2) >>> 0] =
                termios.c_oflag || 0;
              GROWABLE_HEAP_I32()[((argp + 8) >>> 2) >>> 0] =
                termios.c_cflag || 0;
              GROWABLE_HEAP_I32()[((argp + 12) >>> 2) >>> 0] =
                termios.c_lflag || 0;
              for (var i = 0; i < 32; i++) {
                GROWABLE_HEAP_I8()[((argp + i + 17) >>> 0) >>> 0] =
                  termios.c_cc[i] || 0;
              }
              return 0;
            }
            return 0;
          }
          case 21510:
          case 21511:
          case 21512: {
            if (!stream.tty) return -59;
            return 0;
          }
          case 21506:
          case 21507:
          case 21508: {
            if (!stream.tty) return -59;
            if (stream.tty.ops.ioctl_tcsets) {
              var argp = SYSCALLS.getp();
              var c_iflag = GROWABLE_HEAP_I32()[(argp >>> 2) >>> 0];
              var c_oflag = GROWABLE_HEAP_I32()[((argp + 4) >>> 2) >>> 0];
              var c_cflag = GROWABLE_HEAP_I32()[((argp + 8) >>> 2) >>> 0];
              var c_lflag = GROWABLE_HEAP_I32()[((argp + 12) >>> 2) >>> 0];
              var c_cc = [];
              for (var i = 0; i < 32; i++) {
                c_cc.push(GROWABLE_HEAP_I8()[((argp + i + 17) >>> 0) >>> 0]);
              }
              return stream.tty.ops.ioctl_tcsets(stream.tty, op, {
                c_iflag: c_iflag,
                c_oflag: c_oflag,
                c_cflag: c_cflag,
                c_lflag: c_lflag,
                c_cc: c_cc,
              });
            }
            return 0;
          }
          case 21519: {
            if (!stream.tty) return -59;
            var argp = SYSCALLS.getp();
            GROWABLE_HEAP_I32()[(argp >>> 2) >>> 0] = 0;
            return 0;
          }
          case 21520: {
            if (!stream.tty) return -59;
            return -28;
          }
          case 21531: {
            var argp = SYSCALLS.getp();
            return FS.ioctl(stream, op, argp);
          }
          case 21523: {
            if (!stream.tty) return -59;
            if (stream.tty.ops.ioctl_tiocgwinsz) {
              var winsize = stream.tty.ops.ioctl_tiocgwinsz(stream.tty);
              var argp = SYSCALLS.getp();
              GROWABLE_HEAP_I16()[(argp >>> 1) >>> 0] = winsize[0];
              GROWABLE_HEAP_I16()[((argp + 2) >>> 1) >>> 0] = winsize[1];
            }
            return 0;
          }
          case 21524: {
            if (!stream.tty) return -59;
            return 0;
          }
          case 21515: {
            if (!stream.tty) return -59;
            return 0;
          }
          default:
            return -28;
        }
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_lstat64(path, buf) {
      if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(12, 1, path, buf);
      path >>>= 0;
      buf >>>= 0;
      try {
        path = SYSCALLS.getStr(path);
        return SYSCALLS.doStat(FS.lstat, path, buf);
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_mkdirat(dirfd, path, mode) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(13, 1, dirfd, path, mode);
      path >>>= 0;
      try {
        path = SYSCALLS.getStr(path);
        path = SYSCALLS.calculateAt(dirfd, path);
        path = PATH.normalize(path);
        if (path[path.length - 1] === "/")
          path = path.substr(0, path.length - 1);
        FS.mkdir(path, mode, 0);
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_newfstatat(dirfd, path, buf, flags) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(14, 1, dirfd, path, buf, flags);
      path >>>= 0;
      buf >>>= 0;
      try {
        path = SYSCALLS.getStr(path);
        var nofollow = flags & 256;
        var allowEmpty = flags & 4096;
        flags = flags & ~6400;
        path = SYSCALLS.calculateAt(dirfd, path, allowEmpty);
        return SYSCALLS.doStat(nofollow ? FS.lstat : FS.stat, path, buf);
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_openat(dirfd, path, flags, varargs) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(15, 1, dirfd, path, flags, varargs);
      path >>>= 0;
      varargs >>>= 0;
      SYSCALLS.varargs = varargs;
      try {
        path = SYSCALLS.getStr(path);
        path = SYSCALLS.calculateAt(dirfd, path);
        var mode = varargs ? SYSCALLS.get() : 0;
        return FS.open(path, flags, mode).fd;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_readlinkat(dirfd, path, buf, bufsize) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(16, 1, dirfd, path, buf, bufsize);
      path >>>= 0;
      buf >>>= 0;
      bufsize >>>= 0;
      try {
        path = SYSCALLS.getStr(path);
        path = SYSCALLS.calculateAt(dirfd, path);
        if (bufsize <= 0) return -28;
        var ret = FS.readlink(path);
        var len = Math.min(bufsize, lengthBytesUTF8(ret));
        var endChar = GROWABLE_HEAP_I8()[(buf + len) >>> 0];
        stringToUTF8(ret, buf, bufsize + 1);
        GROWABLE_HEAP_I8()[(buf + len) >>> 0] = endChar;
        return len;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_renameat(olddirfd, oldpath, newdirfd, newpath) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(17, 1, olddirfd, oldpath, newdirfd, newpath);
      oldpath >>>= 0;
      newpath >>>= 0;
      try {
        oldpath = SYSCALLS.getStr(oldpath);
        newpath = SYSCALLS.getStr(newpath);
        oldpath = SYSCALLS.calculateAt(olddirfd, oldpath);
        newpath = SYSCALLS.calculateAt(newdirfd, newpath);
        FS.rename(oldpath, newpath);
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_stat64(path, buf) {
      if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(18, 1, path, buf);
      path >>>= 0;
      buf >>>= 0;
      try {
        path = SYSCALLS.getStr(path);
        return SYSCALLS.doStat(FS.stat, path, buf);
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_unlinkat(dirfd, path, flags) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(19, 1, dirfd, path, flags);
      path >>>= 0;
      try {
        path = SYSCALLS.getStr(path);
        path = SYSCALLS.calculateAt(dirfd, path);
        if (flags === 0) {
          FS.unlink(path);
        } else if (flags === 512) {
          FS.rmdir(path);
        } else {
          abort("Invalid flags passed to unlinkat");
        }
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function __embind_register_bigint(
      primitiveType,
      name,
      size,
      minRange,
      maxRange,
    ) {
      primitiveType >>>= 0;
      name >>>= 0;
      size >>>= 0;
    }
    var embind_init_charCodes = () => {
      var codes = new Array(256);
      for (var i = 0; i < 256; ++i) {
        codes[i] = String.fromCharCode(i);
      }
      embind_charCodes = codes;
    };
    var embind_charCodes;
    var readLatin1String = (ptr) => {
      var ret = "";
      var c = ptr;
      while (GROWABLE_HEAP_U8()[c >>> 0]) {
        ret += embind_charCodes[GROWABLE_HEAP_U8()[c++ >>> 0]];
      }
      return ret;
    };
    var awaitingDependencies = {};
    var registeredTypes = {};
    var typeDependencies = {};
    var BindingError;
    var throwBindingError = (message) => {
      throw new BindingError(message);
    };
    var InternalError;
    var throwInternalError = (message) => {
      throw new InternalError(message);
    };
    var whenDependentTypesAreResolved = (
      myTypes,
      dependentTypes,
      getTypeConverters,
    ) => {
      myTypes.forEach(function (type) {
        typeDependencies[type] = dependentTypes;
      });
      function onComplete(typeConverters) {
        var myTypeConverters = getTypeConverters(typeConverters);
        if (myTypeConverters.length !== myTypes.length) {
          throwInternalError("Mismatched type converter count");
        }
        for (var i = 0; i < myTypes.length; ++i) {
          registerType(myTypes[i], myTypeConverters[i]);
        }
      }
      var typeConverters = new Array(dependentTypes.length);
      var unregisteredTypes = [];
      var registered = 0;
      dependentTypes.forEach((dt, i) => {
        if (registeredTypes.hasOwnProperty(dt)) {
          typeConverters[i] = registeredTypes[dt];
        } else {
          unregisteredTypes.push(dt);
          if (!awaitingDependencies.hasOwnProperty(dt)) {
            awaitingDependencies[dt] = [];
          }
          awaitingDependencies[dt].push(() => {
            typeConverters[i] = registeredTypes[dt];
            ++registered;
            if (registered === unregisteredTypes.length) {
              onComplete(typeConverters);
            }
          });
        }
      });
      if (0 === unregisteredTypes.length) {
        onComplete(typeConverters);
      }
    };
    function sharedRegisterType(rawType, registeredInstance, options = {}) {
      var name = registeredInstance.name;
      if (!rawType) {
        throwBindingError(
          `type "${name}" must have a positive integer typeid pointer`,
        );
      }
      if (registeredTypes.hasOwnProperty(rawType)) {
        if (options.ignoreDuplicateRegistrations) {
          return;
        } else {
          throwBindingError(`Cannot register type '${name}' twice`);
        }
      }
      registeredTypes[rawType] = registeredInstance;
      delete typeDependencies[rawType];
      if (awaitingDependencies.hasOwnProperty(rawType)) {
        var callbacks = awaitingDependencies[rawType];
        delete awaitingDependencies[rawType];
        callbacks.forEach((cb) => cb());
      }
    }
    function registerType(rawType, registeredInstance, options = {}) {
      if (!("argPackAdvance" in registeredInstance)) {
        throw new TypeError(
          "registerType registeredInstance requires argPackAdvance",
        );
      }
      return sharedRegisterType(rawType, registeredInstance, options);
    }
    var GenericWireTypeSize = 8;
    function __embind_register_bool(rawType, name, trueValue, falseValue) {
      rawType >>>= 0;
      name >>>= 0;
      name = readLatin1String(name);
      registerType(rawType, {
        name: name,
        fromWireType: function (wt) {
          return !!wt;
        },
        toWireType: function (destructors, o) {
          return o ? trueValue : falseValue;
        },
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: function (pointer) {
          return this["fromWireType"](GROWABLE_HEAP_U8()[pointer >>> 0]);
        },
        destructorFunction: null,
      });
    }
    var shallowCopyInternalPointer = (o) => ({
      count: o.count,
      deleteScheduled: o.deleteScheduled,
      preservePointerOnDelete: o.preservePointerOnDelete,
      ptr: o.ptr,
      ptrType: o.ptrType,
      smartPtr: o.smartPtr,
      smartPtrType: o.smartPtrType,
    });
    var throwInstanceAlreadyDeleted = (obj) => {
      function getInstanceTypeName(handle) {
        return handle.$$.ptrType.registeredClass.name;
      }
      throwBindingError(getInstanceTypeName(obj) + " instance already deleted");
    };
    var finalizationRegistry = false;
    var detachFinalizer = (handle) => {};
    var runDestructor = ($$) => {
      if ($$.smartPtr) {
        $$.smartPtrType.rawDestructor($$.smartPtr);
      } else {
        $$.ptrType.registeredClass.rawDestructor($$.ptr);
      }
    };
    var releaseClassHandle = ($$) => {
      $$.count.value -= 1;
      var toDelete = 0 === $$.count.value;
      if (toDelete) {
        runDestructor($$);
      }
    };
    var downcastPointer = (ptr, ptrClass, desiredClass) => {
      if (ptrClass === desiredClass) {
        return ptr;
      }
      if (undefined === desiredClass.baseClass) {
        return null;
      }
      var rv = downcastPointer(ptr, ptrClass, desiredClass.baseClass);
      if (rv === null) {
        return null;
      }
      return desiredClass.downcast(rv);
    };
    var registeredPointers = {};
    var getInheritedInstanceCount = () =>
      Object.keys(registeredInstances).length;
    var getLiveInheritedInstances = () => {
      var rv = [];
      for (var k in registeredInstances) {
        if (registeredInstances.hasOwnProperty(k)) {
          rv.push(registeredInstances[k]);
        }
      }
      return rv;
    };
    var deletionQueue = [];
    var flushPendingDeletes = () => {
      while (deletionQueue.length) {
        var obj = deletionQueue.pop();
        obj.$$.deleteScheduled = false;
        obj["delete"]();
      }
    };
    var delayFunction;
    var setDelayFunction = (fn) => {
      delayFunction = fn;
      if (deletionQueue.length && delayFunction) {
        delayFunction(flushPendingDeletes);
      }
    };
    var init_embind = () => {
      Module["getInheritedInstanceCount"] = getInheritedInstanceCount;
      Module["getLiveInheritedInstances"] = getLiveInheritedInstances;
      Module["flushPendingDeletes"] = flushPendingDeletes;
      Module["setDelayFunction"] = setDelayFunction;
    };
    var registeredInstances = {};
    var getBasestPointer = (class_, ptr) => {
      if (ptr === undefined) {
        throwBindingError("ptr should not be undefined");
      }
      while (class_.baseClass) {
        ptr = class_.upcast(ptr);
        class_ = class_.baseClass;
      }
      return ptr;
    };
    var getInheritedInstance = (class_, ptr) => {
      ptr = getBasestPointer(class_, ptr);
      return registeredInstances[ptr];
    };
    var makeClassHandle = (prototype, record) => {
      if (!record.ptrType || !record.ptr) {
        throwInternalError("makeClassHandle requires ptr and ptrType");
      }
      var hasSmartPtrType = !!record.smartPtrType;
      var hasSmartPtr = !!record.smartPtr;
      if (hasSmartPtrType !== hasSmartPtr) {
        throwInternalError("Both smartPtrType and smartPtr must be specified");
      }
      record.count = { value: 1 };
      return attachFinalizer(
        Object.create(prototype, { $$: { value: record } }),
      );
    };
    function RegisteredPointer_fromWireType(ptr) {
      var rawPointer = this.getPointee(ptr);
      if (!rawPointer) {
        this.destructor(ptr);
        return null;
      }
      var registeredInstance = getInheritedInstance(
        this.registeredClass,
        rawPointer,
      );
      if (undefined !== registeredInstance) {
        if (0 === registeredInstance.$$.count.value) {
          registeredInstance.$$.ptr = rawPointer;
          registeredInstance.$$.smartPtr = ptr;
          return registeredInstance["clone"]();
        } else {
          var rv = registeredInstance["clone"]();
          this.destructor(ptr);
          return rv;
        }
      }
      function makeDefaultHandle() {
        if (this.isSmartPointer) {
          return makeClassHandle(this.registeredClass.instancePrototype, {
            ptrType: this.pointeeType,
            ptr: rawPointer,
            smartPtrType: this,
            smartPtr: ptr,
          });
        } else {
          return makeClassHandle(this.registeredClass.instancePrototype, {
            ptrType: this,
            ptr: ptr,
          });
        }
      }
      var actualType = this.registeredClass.getActualType(rawPointer);
      var registeredPointerRecord = registeredPointers[actualType];
      if (!registeredPointerRecord) {
        return makeDefaultHandle.call(this);
      }
      var toType;
      if (this.isConst) {
        toType = registeredPointerRecord.constPointerType;
      } else {
        toType = registeredPointerRecord.pointerType;
      }
      var dp = downcastPointer(
        rawPointer,
        this.registeredClass,
        toType.registeredClass,
      );
      if (dp === null) {
        return makeDefaultHandle.call(this);
      }
      if (this.isSmartPointer) {
        return makeClassHandle(toType.registeredClass.instancePrototype, {
          ptrType: toType,
          ptr: dp,
          smartPtrType: this,
          smartPtr: ptr,
        });
      } else {
        return makeClassHandle(toType.registeredClass.instancePrototype, {
          ptrType: toType,
          ptr: dp,
        });
      }
    }
    var attachFinalizer = (handle) => {
      if ("undefined" === typeof FinalizationRegistry) {
        attachFinalizer = (handle) => handle;
        return handle;
      }
      finalizationRegistry = new FinalizationRegistry((info) => {
        releaseClassHandle(info.$$);
      });
      attachFinalizer = (handle) => {
        var $$ = handle.$$;
        var hasSmartPtr = !!$$.smartPtr;
        if (hasSmartPtr) {
          var info = { $$: $$ };
          finalizationRegistry.register(handle, info, handle);
        }
        return handle;
      };
      detachFinalizer = (handle) => finalizationRegistry.unregister(handle);
      return attachFinalizer(handle);
    };
    var init_ClassHandle = () => {
      Object.assign(ClassHandle.prototype, {
        isAliasOf(other) {
          if (!(this instanceof ClassHandle)) {
            return false;
          }
          if (!(other instanceof ClassHandle)) {
            return false;
          }
          var leftClass = this.$$.ptrType.registeredClass;
          var left = this.$$.ptr;
          other.$$ = other.$$;
          var rightClass = other.$$.ptrType.registeredClass;
          var right = other.$$.ptr;
          while (leftClass.baseClass) {
            left = leftClass.upcast(left);
            leftClass = leftClass.baseClass;
          }
          while (rightClass.baseClass) {
            right = rightClass.upcast(right);
            rightClass = rightClass.baseClass;
          }
          return leftClass === rightClass && left === right;
        },
        clone() {
          if (!this.$$.ptr) {
            throwInstanceAlreadyDeleted(this);
          }
          if (this.$$.preservePointerOnDelete) {
            this.$$.count.value += 1;
            return this;
          } else {
            var clone = attachFinalizer(
              Object.create(Object.getPrototypeOf(this), {
                $$: { value: shallowCopyInternalPointer(this.$$) },
              }),
            );
            clone.$$.count.value += 1;
            clone.$$.deleteScheduled = false;
            return clone;
          }
        },
        delete() {
          if (!this.$$.ptr) {
            throwInstanceAlreadyDeleted(this);
          }
          if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
            throwBindingError("Object already scheduled for deletion");
          }
          detachFinalizer(this);
          releaseClassHandle(this.$$);
          if (!this.$$.preservePointerOnDelete) {
            this.$$.smartPtr = undefined;
            this.$$.ptr = undefined;
          }
        },
        isDeleted() {
          return !this.$$.ptr;
        },
        deleteLater() {
          if (!this.$$.ptr) {
            throwInstanceAlreadyDeleted(this);
          }
          if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
            throwBindingError("Object already scheduled for deletion");
          }
          deletionQueue.push(this);
          if (deletionQueue.length === 1 && delayFunction) {
            delayFunction(flushPendingDeletes);
          }
          this.$$.deleteScheduled = true;
          return this;
        },
      });
    };
    function ClassHandle() {}
    var char_0 = 48;
    var char_9 = 57;
    var makeLegalFunctionName = (name) => {
      if (undefined === name) {
        return "_unknown";
      }
      name = name.replace(/[^a-zA-Z0-9_]/g, "$");
      var f = name.charCodeAt(0);
      if (f >= char_0 && f <= char_9) {
        return `_${name}`;
      }
      return name;
    };
    function createNamedFunction(name, body) {
      name = makeLegalFunctionName(name);
      return {
        [name]: function () {
          return body.apply(this, arguments);
        },
      }[name];
    }
    var ensureOverloadTable = (proto, methodName, humanName) => {
      if (undefined === proto[methodName].overloadTable) {
        var prevFunc = proto[methodName];
        proto[methodName] = function () {
          if (
            !proto[methodName].overloadTable.hasOwnProperty(arguments.length)
          ) {
            throwBindingError(
              `Function '${humanName}' called with an invalid number of arguments (${arguments.length}) - expects one of (${proto[methodName].overloadTable})!`,
            );
          }
          return proto[methodName].overloadTable[arguments.length].apply(
            this,
            arguments,
          );
        };
        proto[methodName].overloadTable = [];
        proto[methodName].overloadTable[prevFunc.argCount] = prevFunc;
      }
    };
    var exposePublicSymbol = (name, value, numArguments) => {
      if (Module.hasOwnProperty(name)) {
        if (
          undefined === numArguments ||
          (undefined !== Module[name].overloadTable &&
            undefined !== Module[name].overloadTable[numArguments])
        ) {
          throwBindingError(`Cannot register public name '${name}' twice`);
        }
        ensureOverloadTable(Module, name, name);
        if (Module.hasOwnProperty(numArguments)) {
          throwBindingError(
            `Cannot register multiple overloads of a function with the same number of arguments (${numArguments})!`,
          );
        }
        Module[name].overloadTable[numArguments] = value;
      } else {
        Module[name] = value;
        if (undefined !== numArguments) {
          Module[name].numArguments = numArguments;
        }
      }
    };
    function RegisteredClass(
      name,
      constructor,
      instancePrototype,
      rawDestructor,
      baseClass,
      getActualType,
      upcast,
      downcast,
    ) {
      this.name = name;
      this.constructor = constructor;
      this.instancePrototype = instancePrototype;
      this.rawDestructor = rawDestructor;
      this.baseClass = baseClass;
      this.getActualType = getActualType;
      this.upcast = upcast;
      this.downcast = downcast;
      this.pureVirtualFunctions = [];
    }
    var upcastPointer = (ptr, ptrClass, desiredClass) => {
      while (ptrClass !== desiredClass) {
        if (!ptrClass.upcast) {
          throwBindingError(
            `Expected null or instance of ${desiredClass.name}, got an instance of ${ptrClass.name}`,
          );
        }
        ptr = ptrClass.upcast(ptr);
        ptrClass = ptrClass.baseClass;
      }
      return ptr;
    };
    function constNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
        if (this.isReference) {
          throwBindingError(`null is not a valid ${this.name}`);
        }
        return 0;
      }
      if (!handle.$$) {
        throwBindingError(
          `Cannot pass "${embindRepr(handle)}" as a ${this.name}`,
        );
      }
      if (!handle.$$.ptr) {
        throwBindingError(
          `Cannot pass deleted object as a pointer of type ${this.name}`,
        );
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
    function genericPointerToWireType(destructors, handle) {
      var ptr;
      if (handle === null) {
        if (this.isReference) {
          throwBindingError(`null is not a valid ${this.name}`);
        }
        if (this.isSmartPointer) {
          ptr = this.rawConstructor();
          if (destructors !== null) {
            destructors.push(this.rawDestructor, ptr);
          }
          return ptr;
        } else {
          return 0;
        }
      }
      if (!handle.$$) {
        throwBindingError(
          `Cannot pass "${embindRepr(handle)}" as a ${this.name}`,
        );
      }
      if (!handle.$$.ptr) {
        throwBindingError(
          `Cannot pass deleted object as a pointer of type ${this.name}`,
        );
      }
      if (!this.isConst && handle.$$.ptrType.isConst) {
        throwBindingError(
          `Cannot convert argument of type ${handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name} to parameter type ${this.name}`,
        );
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      if (this.isSmartPointer) {
        if (undefined === handle.$$.smartPtr) {
          throwBindingError("Passing raw pointer to smart pointer is illegal");
        }
        switch (this.sharingPolicy) {
          case 0:
            if (handle.$$.smartPtrType === this) {
              ptr = handle.$$.smartPtr;
            } else {
              throwBindingError(
                `Cannot convert argument of type ${handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name} to parameter type ${this.name}`,
              );
            }
            break;
          case 1:
            ptr = handle.$$.smartPtr;
            break;
          case 2:
            if (handle.$$.smartPtrType === this) {
              ptr = handle.$$.smartPtr;
            } else {
              var clonedHandle = handle["clone"]();
              ptr = this.rawShare(
                ptr,
                Emval.toHandle(() => clonedHandle["delete"]()),
              );
              if (destructors !== null) {
                destructors.push(this.rawDestructor, ptr);
              }
            }
            break;
          default:
            throwBindingError("Unsupporting sharing policy");
        }
      }
      return ptr;
    }
    function nonConstNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
        if (this.isReference) {
          throwBindingError(`null is not a valid ${this.name}`);
        }
        return 0;
      }
      if (!handle.$$) {
        throwBindingError(
          `Cannot pass "${embindRepr(handle)}" as a ${this.name}`,
        );
      }
      if (!handle.$$.ptr) {
        throwBindingError(
          `Cannot pass deleted object as a pointer of type ${this.name}`,
        );
      }
      if (handle.$$.ptrType.isConst) {
        throwBindingError(
          `Cannot convert argument of type ${handle.$$.ptrType.name} to parameter type ${this.name}`,
        );
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
    function readPointer(pointer) {
      return this["fromWireType"](GROWABLE_HEAP_U32()[(pointer >>> 2) >>> 0]);
    }
    var init_RegisteredPointer = () => {
      Object.assign(RegisteredPointer.prototype, {
        getPointee(ptr) {
          if (this.rawGetPointee) {
            ptr = this.rawGetPointee(ptr);
          }
          return ptr;
        },
        destructor(ptr) {
          if (this.rawDestructor) {
            this.rawDestructor(ptr);
          }
        },
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: readPointer,
        deleteObject(handle) {
          if (handle !== null) {
            handle["delete"]();
          }
        },
        fromWireType: RegisteredPointer_fromWireType,
      });
    };
    function RegisteredPointer(
      name,
      registeredClass,
      isReference,
      isConst,
      isSmartPointer,
      pointeeType,
      sharingPolicy,
      rawGetPointee,
      rawConstructor,
      rawShare,
      rawDestructor,
    ) {
      this.name = name;
      this.registeredClass = registeredClass;
      this.isReference = isReference;
      this.isConst = isConst;
      this.isSmartPointer = isSmartPointer;
      this.pointeeType = pointeeType;
      this.sharingPolicy = sharingPolicy;
      this.rawGetPointee = rawGetPointee;
      this.rawConstructor = rawConstructor;
      this.rawShare = rawShare;
      this.rawDestructor = rawDestructor;
      if (!isSmartPointer && registeredClass.baseClass === undefined) {
        if (isConst) {
          this["toWireType"] = constNoSmartPtrRawPointerToWireType;
          this.destructorFunction = null;
        } else {
          this["toWireType"] = nonConstNoSmartPtrRawPointerToWireType;
          this.destructorFunction = null;
        }
      } else {
        this["toWireType"] = genericPointerToWireType;
      }
    }
    var replacePublicSymbol = (name, value, numArguments) => {
      if (!Module.hasOwnProperty(name)) {
        throwInternalError("Replacing nonexistant public symbol");
      }
      if (
        undefined !== Module[name].overloadTable &&
        undefined !== numArguments
      ) {
        Module[name].overloadTable[numArguments] = value;
      } else {
        Module[name] = value;
        Module[name].argCount = numArguments;
      }
    };
    var dynCallLegacy = (sig, ptr, args) => {
      var f = Module["dynCall_" + sig];
      return args && args.length
        ? f.apply(null, [ptr].concat(args))
        : f.call(null, ptr);
    };
    var wasmTable;
    var dynCall = (sig, ptr, args) => {
      var rtn = dynCallLegacy(sig, ptr, args);
      return rtn;
    };
    var getDynCaller = (sig, ptr) => {
      var argCache = [];
      return function () {
        argCache.length = 0;
        Object.assign(argCache, arguments);
        return dynCall(sig, ptr, argCache);
      };
    };
    var embind__requireFunction = (signature, rawFunction) => {
      signature = readLatin1String(signature);
      function makeDynCaller() {
        return getDynCaller(signature, rawFunction);
      }
      var fp = makeDynCaller();
      if (typeof fp != "function") {
        throwBindingError(
          `unknown function pointer with signature ${signature}: ${rawFunction}`,
        );
      }
      return fp;
    };
    var extendError = (baseErrorType, errorName) => {
      var errorClass = createNamedFunction(errorName, function (message) {
        this.name = errorName;
        this.message = message;
        var stack = new Error(message).stack;
        if (stack !== undefined) {
          this.stack =
            this.toString() + "\n" + stack.replace(/^Error(:[^\n]*)?\n/, "");
        }
      });
      errorClass.prototype = Object.create(baseErrorType.prototype);
      errorClass.prototype.constructor = errorClass;
      errorClass.prototype.toString = function () {
        if (this.message === undefined) {
          return this.name;
        } else {
          return `${this.name}: ${this.message}`;
        }
      };
      return errorClass;
    };
    var UnboundTypeError;
    var getTypeName = (type) => {
      var ptr = ___getTypeName(type);
      var rv = readLatin1String(ptr);
      _free(ptr);
      return rv;
    };
    var throwUnboundTypeError = (message, types) => {
      var unboundTypes = [];
      var seen = {};
      function visit(type) {
        if (seen[type]) {
          return;
        }
        if (registeredTypes[type]) {
          return;
        }
        if (typeDependencies[type]) {
          typeDependencies[type].forEach(visit);
          return;
        }
        unboundTypes.push(type);
        seen[type] = true;
      }
      types.forEach(visit);
      throw new UnboundTypeError(
        `${message}: ` + unboundTypes.map(getTypeName).join([", "]),
      );
    };
    function __embind_register_class(
      rawType,
      rawPointerType,
      rawConstPointerType,
      baseClassRawType,
      getActualTypeSignature,
      getActualType,
      upcastSignature,
      upcast,
      downcastSignature,
      downcast,
      name,
      destructorSignature,
      rawDestructor,
    ) {
      rawType >>>= 0;
      rawPointerType >>>= 0;
      rawConstPointerType >>>= 0;
      baseClassRawType >>>= 0;
      getActualTypeSignature >>>= 0;
      getActualType >>>= 0;
      upcastSignature >>>= 0;
      upcast >>>= 0;
      downcastSignature >>>= 0;
      downcast >>>= 0;
      name >>>= 0;
      destructorSignature >>>= 0;
      rawDestructor >>>= 0;
      name = readLatin1String(name);
      getActualType = embind__requireFunction(
        getActualTypeSignature,
        getActualType,
      );
      if (upcast) {
        upcast = embind__requireFunction(upcastSignature, upcast);
      }
      if (downcast) {
        downcast = embind__requireFunction(downcastSignature, downcast);
      }
      rawDestructor = embind__requireFunction(
        destructorSignature,
        rawDestructor,
      );
      var legalFunctionName = makeLegalFunctionName(name);
      exposePublicSymbol(legalFunctionName, function () {
        throwUnboundTypeError(`Cannot construct ${name} due to unbound types`, [
          baseClassRawType,
        ]);
      });
      whenDependentTypesAreResolved(
        [rawType, rawPointerType, rawConstPointerType],
        baseClassRawType ? [baseClassRawType] : [],
        function (base) {
          base = base[0];
          var baseClass;
          var basePrototype;
          if (baseClassRawType) {
            baseClass = base.registeredClass;
            basePrototype = baseClass.instancePrototype;
          } else {
            basePrototype = ClassHandle.prototype;
          }
          var constructor = createNamedFunction(legalFunctionName, function () {
            if (Object.getPrototypeOf(this) !== instancePrototype) {
              throw new BindingError("Use 'new' to construct " + name);
            }
            if (undefined === registeredClass.constructor_body) {
              throw new BindingError(name + " has no accessible constructor");
            }
            var body = registeredClass.constructor_body[arguments.length];
            if (undefined === body) {
              throw new BindingError(
                `Tried to invoke ctor of ${name} with invalid number of parameters (${arguments.length}) - expected (${Object.keys(registeredClass.constructor_body).toString()}) parameters instead!`,
              );
            }
            return body.apply(this, arguments);
          });
          var instancePrototype = Object.create(basePrototype, {
            constructor: { value: constructor },
          });
          constructor.prototype = instancePrototype;
          var registeredClass = new RegisteredClass(
            name,
            constructor,
            instancePrototype,
            rawDestructor,
            baseClass,
            getActualType,
            upcast,
            downcast,
          );
          if (registeredClass.baseClass) {
            if (registeredClass.baseClass.__derivedClasses === undefined) {
              registeredClass.baseClass.__derivedClasses = [];
            }
            registeredClass.baseClass.__derivedClasses.push(registeredClass);
          }
          var referenceConverter = new RegisteredPointer(
            name,
            registeredClass,
            true,
            false,
            false,
          );
          var pointerConverter = new RegisteredPointer(
            name + "*",
            registeredClass,
            false,
            false,
            false,
          );
          var constPointerConverter = new RegisteredPointer(
            name + " const*",
            registeredClass,
            false,
            true,
            false,
          );
          registeredPointers[rawType] = {
            pointerType: pointerConverter,
            constPointerType: constPointerConverter,
          };
          replacePublicSymbol(legalFunctionName, constructor);
          return [referenceConverter, pointerConverter, constPointerConverter];
        },
      );
    }
    var runDestructors = (destructors) => {
      while (destructors.length) {
        var ptr = destructors.pop();
        var del = destructors.pop();
        del(ptr);
      }
    };
    function newFunc(constructor, argumentList) {
      if (!(constructor instanceof Function)) {
        throw new TypeError(
          `new_ called with constructor type ${typeof constructor} which is not a function`,
        );
      }
      var dummy = createNamedFunction(
        constructor.name || "unknownFunctionName",
        function () {},
      );
      dummy.prototype = constructor.prototype;
      var obj = new dummy();
      var r = constructor.apply(obj, argumentList);
      return r instanceof Object ? r : obj;
    }
    var runAndAbortIfError = (func) => {
      try {
        return func();
      } catch (e) {
        abort(e);
      }
    };
    var maybeExit = () => {
      if (!keepRuntimeAlive()) {
        try {
          if (ENVIRONMENT_IS_PTHREAD) __emscripten_thread_exit(EXITSTATUS);
          else _exit(EXITSTATUS);
        } catch (e) {
          handleException(e);
        }
      }
    };
    var callUserCallback = (func) => {
      if (ABORT) {
        return;
      }
      try {
        func();
        maybeExit();
      } catch (e) {
        handleException(e);
      }
    };
    var runtimeKeepalivePush = () => {
      runtimeKeepaliveCounter += 1;
    };
    var runtimeKeepalivePop = () => {
      runtimeKeepaliveCounter -= 1;
    };
    var Asyncify = {
      instrumentWasmImports(imports) {
        var importPattern = /^(invoke_.*|__asyncjs__.*)$/;
        for (var x in imports) {
          (function (x) {
            var original = imports[x];
            var sig = original.sig;
            if (typeof original == "function") {
              var isAsyncifyImport = original.isAsync || importPattern.test(x);
            }
          })(x);
        }
      },
      instrumentWasmExports(exports) {
        var ret = {};
        for (var x in exports) {
          (function (x) {
            var original = exports[x];
            if (typeof original == "function") {
              ret[x] = function () {
                Asyncify.exportCallStack.push(x);
                try {
                  return original.apply(null, arguments);
                } finally {
                  if (!ABORT) {
                    var y = Asyncify.exportCallStack.pop();
                    assert(y === x);
                    Asyncify.maybeStopUnwind();
                  }
                }
              };
            } else {
              ret[x] = original;
            }
          })(x);
        }
        return ret;
      },
      State: { Normal: 0, Unwinding: 1, Rewinding: 2, Disabled: 3 },
      state: 0,
      StackSize: 4096,
      currData: null,
      handleSleepReturnValue: 0,
      exportCallStack: [],
      callStackNameToId: {},
      callStackIdToName: {},
      callStackId: 0,
      asyncPromiseHandlers: null,
      sleepCallbacks: [],
      getCallStackId(funcName) {
        var id = Asyncify.callStackNameToId[funcName];
        if (id === undefined) {
          id = Asyncify.callStackId++;
          Asyncify.callStackNameToId[funcName] = id;
          Asyncify.callStackIdToName[id] = funcName;
        }
        return id;
      },
      maybeStopUnwind() {
        if (
          Asyncify.currData &&
          Asyncify.state === Asyncify.State.Unwinding &&
          Asyncify.exportCallStack.length === 0
        ) {
          Asyncify.state = Asyncify.State.Normal;
          runtimeKeepalivePush();
          runAndAbortIfError(_asyncify_stop_unwind);
          if (typeof Fibers != "undefined") {
            Fibers.trampoline();
          }
        }
      },
      whenDone() {
        return new Promise((resolve, reject) => {
          Asyncify.asyncPromiseHandlers = { resolve: resolve, reject: reject };
        });
      },
      allocateData() {
        var ptr = _malloc(12 + Asyncify.StackSize);
        Asyncify.setDataHeader(ptr, ptr + 12, Asyncify.StackSize);
        Asyncify.setDataRewindFunc(ptr);
        return ptr;
      },
      setDataHeader(ptr, stack, stackSize) {
        GROWABLE_HEAP_U32()[(ptr >>> 2) >>> 0] = stack;
        GROWABLE_HEAP_U32()[((ptr + 4) >>> 2) >>> 0] = stack + stackSize;
      },
      setDataRewindFunc(ptr) {
        var bottomOfCallStack = Asyncify.exportCallStack[0];
        var rewindId = Asyncify.getCallStackId(bottomOfCallStack);
        GROWABLE_HEAP_I32()[((ptr + 8) >>> 2) >>> 0] = rewindId;
      },
      getDataRewindFunc(ptr) {
        var id = GROWABLE_HEAP_I32()[((ptr + 8) >>> 2) >>> 0];
        var name = Asyncify.callStackIdToName[id];
        var func = wasmExports[name];
        return func;
      },
      doRewind(ptr) {
        var start = Asyncify.getDataRewindFunc(ptr);
        runtimeKeepalivePop();
        return start();
      },
      handleSleep(startAsync) {
        if (ABORT) return;
        if (Asyncify.state === Asyncify.State.Normal) {
          var reachedCallback = false;
          var reachedAfterCallback = false;
          startAsync((handleSleepReturnValue = 0) => {
            if (ABORT) return;
            Asyncify.handleSleepReturnValue = handleSleepReturnValue;
            reachedCallback = true;
            if (!reachedAfterCallback) {
              return;
            }
            Asyncify.state = Asyncify.State.Rewinding;
            runAndAbortIfError(() => _asyncify_start_rewind(Asyncify.currData));
            if (typeof Browser != "undefined" && Browser.mainLoop.func) {
              Browser.mainLoop.resume();
            }
            var asyncWasmReturnValue,
              isError = false;
            try {
              asyncWasmReturnValue = Asyncify.doRewind(Asyncify.currData);
            } catch (err) {
              asyncWasmReturnValue = err;
              isError = true;
            }
            var handled = false;
            if (!Asyncify.currData) {
              var asyncPromiseHandlers = Asyncify.asyncPromiseHandlers;
              if (asyncPromiseHandlers) {
                Asyncify.asyncPromiseHandlers = null;
                (isError
                  ? asyncPromiseHandlers.reject
                  : asyncPromiseHandlers.resolve)(asyncWasmReturnValue);
                handled = true;
              }
            }
            if (isError && !handled) {
              throw asyncWasmReturnValue;
            }
          });
          reachedAfterCallback = true;
          if (!reachedCallback) {
            Asyncify.state = Asyncify.State.Unwinding;
            Asyncify.currData = Asyncify.allocateData();
            if (typeof Browser != "undefined" && Browser.mainLoop.func) {
              Browser.mainLoop.pause();
            }
            runAndAbortIfError(() => _asyncify_start_unwind(Asyncify.currData));
          }
        } else if (Asyncify.state === Asyncify.State.Rewinding) {
          Asyncify.state = Asyncify.State.Normal;
          runAndAbortIfError(_asyncify_stop_rewind);
          _free(Asyncify.currData);
          Asyncify.currData = null;
          Asyncify.sleepCallbacks.forEach((func) => callUserCallback(func));
        } else {
          abort(`invalid state: ${Asyncify.state}`);
        }
        return Asyncify.handleSleepReturnValue;
      },
      handleAsync(startAsync) {
        return Asyncify.handleSleep((wakeUp) => {
          startAsync().then(wakeUp);
        });
      },
    };
    function craftInvokerFunction(
      humanName,
      argTypes,
      classType,
      cppInvokerFunc,
      cppTargetFunc,
      isAsync,
    ) {
      var argCount = argTypes.length;
      if (argCount < 2) {
        throwBindingError(
          "argTypes array size mismatch! Must at least get return value and 'this' types!",
        );
      }
      var isClassMethodFunc = argTypes[1] !== null && classType !== null;
      var needsDestructorStack = false;
      for (var i = 1; i < argTypes.length; ++i) {
        if (
          argTypes[i] !== null &&
          argTypes[i].destructorFunction === undefined
        ) {
          needsDestructorStack = true;
          break;
        }
      }
      var returns = argTypes[0].name !== "void";
      var argsList = "";
      var argsListWired = "";
      for (var i = 0; i < argCount - 2; ++i) {
        argsList += (i !== 0 ? ", " : "") + "arg" + i;
        argsListWired += (i !== 0 ? ", " : "") + "arg" + i + "Wired";
      }
      var invokerFnBody = `\n        return function ${makeLegalFunctionName(humanName)}(${argsList}) {\n        if (arguments.length !== ${argCount - 2}) {\n          throwBindingError('function ${humanName} called with ' + arguments.length + ' arguments, expected ${argCount - 2}');\n        }`;
      if (needsDestructorStack) {
        invokerFnBody += "var destructors = [];\n";
      }
      var dtorStack = needsDestructorStack ? "destructors" : "null";
      var args1 = [
        "throwBindingError",
        "invoker",
        "fn",
        "runDestructors",
        "retType",
        "classParam",
      ];
      var args2 = [
        throwBindingError,
        cppInvokerFunc,
        cppTargetFunc,
        runDestructors,
        argTypes[0],
        argTypes[1],
      ];
      if (isClassMethodFunc) {
        invokerFnBody +=
          "var thisWired = classParam.toWireType(" + dtorStack + ", this);\n";
      }
      for (var i = 0; i < argCount - 2; ++i) {
        invokerFnBody +=
          "var arg" +
          i +
          "Wired = argType" +
          i +
          ".toWireType(" +
          dtorStack +
          ", arg" +
          i +
          "); // " +
          argTypes[i + 2].name +
          "\n";
        args1.push("argType" + i);
        args2.push(argTypes[i + 2]);
      }
      if (isClassMethodFunc) {
        argsListWired =
          "thisWired" + (argsListWired.length > 0 ? ", " : "") + argsListWired;
      }
      invokerFnBody +=
        (returns || isAsync ? "var rv = " : "") +
        "invoker(fn" +
        (argsListWired.length > 0 ? ", " : "") +
        argsListWired +
        ");\n";
      args1.push("Asyncify");
      args2.push(Asyncify);
      invokerFnBody += "function onDone(" + (returns ? "rv" : "") + ") {\n";
      if (needsDestructorStack) {
        invokerFnBody += "runDestructors(destructors);\n";
      } else {
        for (var i = isClassMethodFunc ? 1 : 2; i < argTypes.length; ++i) {
          var paramName = i === 1 ? "thisWired" : "arg" + (i - 2) + "Wired";
          if (argTypes[i].destructorFunction !== null) {
            invokerFnBody +=
              paramName +
              "_dtor(" +
              paramName +
              "); // " +
              argTypes[i].name +
              "\n";
            args1.push(paramName + "_dtor");
            args2.push(argTypes[i].destructorFunction);
          }
        }
      }
      if (returns) {
        invokerFnBody +=
          "var ret = retType.fromWireType(rv);\n" + "return ret;\n";
      } else {
      }
      invokerFnBody += "}\n";
      invokerFnBody +=
        "return Asyncify.currData ? Asyncify.whenDone().then(onDone) : onDone(" +
        (returns ? "rv" : "") +
        ");\n";
      invokerFnBody += "}\n";
      args1.push(invokerFnBody);
      return newFunc(Function, args1).apply(null, args2);
    }
    var heap32VectorToArray = (count, firstElement) => {
      var array = [];
      for (var i = 0; i < count; i++) {
        array.push(GROWABLE_HEAP_U32()[((firstElement + i * 4) >>> 2) >>> 0]);
      }
      return array;
    };
    var getFunctionName = (signature) => {
      signature = signature.trim();
      const argsIndex = signature.indexOf("(");
      if (argsIndex !== -1) {
        assert(
          signature[signature.length - 1] == ")",
          "Parentheses for argument names should match.",
        );
        return signature.substr(0, argsIndex);
      } else {
        return signature;
      }
    };
    function __embind_register_class_class_function(
      rawClassType,
      methodName,
      argCount,
      rawArgTypesAddr,
      invokerSignature,
      rawInvoker,
      fn,
      isAsync,
    ) {
      rawClassType >>>= 0;
      methodName >>>= 0;
      rawArgTypesAddr >>>= 0;
      invokerSignature >>>= 0;
      rawInvoker >>>= 0;
      fn >>>= 0;
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      methodName = readLatin1String(methodName);
      methodName = getFunctionName(methodName);
      rawInvoker = embind__requireFunction(invokerSignature, rawInvoker);
      whenDependentTypesAreResolved([], [rawClassType], function (classType) {
        classType = classType[0];
        var humanName = `${classType.name}.${methodName}`;
        function unboundTypesHandler() {
          throwUnboundTypeError(
            `Cannot call ${humanName} due to unbound types`,
            rawArgTypes,
          );
        }
        if (methodName.startsWith("@@")) {
          methodName = Symbol[methodName.substring(2)];
        }
        var proto = classType.registeredClass.constructor;
        if (undefined === proto[methodName]) {
          unboundTypesHandler.argCount = argCount - 1;
          proto[methodName] = unboundTypesHandler;
        } else {
          ensureOverloadTable(proto, methodName, humanName);
          proto[methodName].overloadTable[argCount - 1] = unboundTypesHandler;
        }
        whenDependentTypesAreResolved([], rawArgTypes, function (argTypes) {
          var invokerArgsArray = [argTypes[0], null].concat(argTypes.slice(1));
          var func = craftInvokerFunction(
            humanName,
            invokerArgsArray,
            null,
            rawInvoker,
            fn,
            isAsync,
          );
          if (undefined === proto[methodName].overloadTable) {
            func.argCount = argCount - 1;
            proto[methodName] = func;
          } else {
            proto[methodName].overloadTable[argCount - 1] = func;
          }
          if (classType.registeredClass.__derivedClasses) {
            for (const derivedClass of classType.registeredClass
              .__derivedClasses) {
              if (!derivedClass.constructor.hasOwnProperty(methodName)) {
                derivedClass.constructor[methodName] = func;
              }
            }
          }
          return [];
        });
        return [];
      });
    }
    var validateThis = (this_, classType, humanName) => {
      if (!(this_ instanceof Object)) {
        throwBindingError(`${humanName} with invalid "this": ${this_}`);
      }
      if (!(this_ instanceof classType.registeredClass.constructor)) {
        throwBindingError(
          `${humanName} incompatible with "this" of type ${this_.constructor.name}`,
        );
      }
      if (!this_.$$.ptr) {
        throwBindingError(
          `cannot call emscripten binding method ${humanName} on deleted object`,
        );
      }
      return upcastPointer(
        this_.$$.ptr,
        this_.$$.ptrType.registeredClass,
        classType.registeredClass,
      );
    };
    function __embind_register_class_class_property(
      rawClassType,
      fieldName,
      rawFieldType,
      rawFieldPtr,
      getterSignature,
      getter,
      setterSignature,
      setter,
    ) {
      rawClassType >>>= 0;
      fieldName >>>= 0;
      rawFieldType >>>= 0;
      rawFieldPtr >>>= 0;
      getterSignature >>>= 0;
      getter >>>= 0;
      setterSignature >>>= 0;
      setter >>>= 0;
      fieldName = readLatin1String(fieldName);
      getter = embind__requireFunction(getterSignature, getter);
      whenDependentTypesAreResolved([], [rawClassType], function (classType) {
        classType = classType[0];
        var humanName = `${classType.name}.${fieldName}`;
        var desc = {
          get() {
            throwUnboundTypeError(
              `Cannot access ${humanName} due to unbound types`,
              [rawFieldType],
            );
          },
          enumerable: true,
          configurable: true,
        };
        if (setter) {
          desc.set = () => {
            throwUnboundTypeError(
              `Cannot access ${humanName} due to unbound types`,
              [rawFieldType],
            );
          };
        } else {
          desc.set = (v) => {
            throwBindingError(`${humanName} is a read-only property`);
          };
        }
        Object.defineProperty(
          classType.registeredClass.constructor,
          fieldName,
          desc,
        );
        whenDependentTypesAreResolved([], [rawFieldType], function (fieldType) {
          fieldType = fieldType[0];
          var desc = {
            get() {
              return fieldType["fromWireType"](getter(rawFieldPtr));
            },
            enumerable: true,
          };
          if (setter) {
            setter = embind__requireFunction(setterSignature, setter);
            desc.set = (v) => {
              var destructors = [];
              setter(rawFieldPtr, fieldType["toWireType"](destructors, v));
              runDestructors(destructors);
            };
          }
          Object.defineProperty(
            classType.registeredClass.constructor,
            fieldName,
            desc,
          );
          return [];
        });
        return [];
      });
    }
    function __embind_register_class_constructor(
      rawClassType,
      argCount,
      rawArgTypesAddr,
      invokerSignature,
      invoker,
      rawConstructor,
    ) {
      rawClassType >>>= 0;
      rawArgTypesAddr >>>= 0;
      invokerSignature >>>= 0;
      invoker >>>= 0;
      rawConstructor >>>= 0;
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      invoker = embind__requireFunction(invokerSignature, invoker);
      whenDependentTypesAreResolved([], [rawClassType], function (classType) {
        classType = classType[0];
        var humanName = `constructor ${classType.name}`;
        if (undefined === classType.registeredClass.constructor_body) {
          classType.registeredClass.constructor_body = [];
        }
        if (
          undefined !== classType.registeredClass.constructor_body[argCount - 1]
        ) {
          throw new BindingError(
            `Cannot register multiple constructors with identical number of parameters (${argCount - 1}) for class '${classType.name}'! Overload resolution is currently only performed using the parameter count, not actual type info!`,
          );
        }
        classType.registeredClass.constructor_body[argCount - 1] = () => {
          throwUnboundTypeError(
            `Cannot construct ${classType.name} due to unbound types`,
            rawArgTypes,
          );
        };
        whenDependentTypesAreResolved([], rawArgTypes, (argTypes) => {
          argTypes.splice(1, 0, null);
          classType.registeredClass.constructor_body[argCount - 1] =
            craftInvokerFunction(
              humanName,
              argTypes,
              null,
              invoker,
              rawConstructor,
            );
          return [];
        });
        return [];
      });
    }
    function __embind_register_class_function(
      rawClassType,
      methodName,
      argCount,
      rawArgTypesAddr,
      invokerSignature,
      rawInvoker,
      context,
      isPureVirtual,
      isAsync,
    ) {
      rawClassType >>>= 0;
      methodName >>>= 0;
      rawArgTypesAddr >>>= 0;
      invokerSignature >>>= 0;
      rawInvoker >>>= 0;
      context >>>= 0;
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      methodName = readLatin1String(methodName);
      methodName = getFunctionName(methodName);
      rawInvoker = embind__requireFunction(invokerSignature, rawInvoker);
      whenDependentTypesAreResolved([], [rawClassType], function (classType) {
        classType = classType[0];
        var humanName = `${classType.name}.${methodName}`;
        if (methodName.startsWith("@@")) {
          methodName = Symbol[methodName.substring(2)];
        }
        if (isPureVirtual) {
          classType.registeredClass.pureVirtualFunctions.push(methodName);
        }
        function unboundTypesHandler() {
          throwUnboundTypeError(
            `Cannot call ${humanName} due to unbound types`,
            rawArgTypes,
          );
        }
        var proto = classType.registeredClass.instancePrototype;
        var method = proto[methodName];
        if (
          undefined === method ||
          (undefined === method.overloadTable &&
            method.className !== classType.name &&
            method.argCount === argCount - 2)
        ) {
          unboundTypesHandler.argCount = argCount - 2;
          unboundTypesHandler.className = classType.name;
          proto[methodName] = unboundTypesHandler;
        } else {
          ensureOverloadTable(proto, methodName, humanName);
          proto[methodName].overloadTable[argCount - 2] = unboundTypesHandler;
        }
        whenDependentTypesAreResolved([], rawArgTypes, function (argTypes) {
          var memberFunction = craftInvokerFunction(
            humanName,
            argTypes,
            classType,
            rawInvoker,
            context,
            isAsync,
          );
          if (undefined === proto[methodName].overloadTable) {
            memberFunction.argCount = argCount - 2;
            proto[methodName] = memberFunction;
          } else {
            proto[methodName].overloadTable[argCount - 2] = memberFunction;
          }
          return [];
        });
        return [];
      });
    }
    function __embind_register_class_property(
      classType,
      fieldName,
      getterReturnType,
      getterSignature,
      getter,
      getterContext,
      setterArgumentType,
      setterSignature,
      setter,
      setterContext,
    ) {
      classType >>>= 0;
      fieldName >>>= 0;
      getterReturnType >>>= 0;
      getterSignature >>>= 0;
      getter >>>= 0;
      getterContext >>>= 0;
      setterArgumentType >>>= 0;
      setterSignature >>>= 0;
      setter >>>= 0;
      setterContext >>>= 0;
      fieldName = readLatin1String(fieldName);
      getter = embind__requireFunction(getterSignature, getter);
      whenDependentTypesAreResolved([], [classType], function (classType) {
        classType = classType[0];
        var humanName = `${classType.name}.${fieldName}`;
        var desc = {
          get() {
            throwUnboundTypeError(
              `Cannot access ${humanName} due to unbound types`,
              [getterReturnType, setterArgumentType],
            );
          },
          enumerable: true,
          configurable: true,
        };
        if (setter) {
          desc.set = () =>
            throwUnboundTypeError(
              `Cannot access ${humanName} due to unbound types`,
              [getterReturnType, setterArgumentType],
            );
        } else {
          desc.set = (v) =>
            throwBindingError(humanName + " is a read-only property");
        }
        Object.defineProperty(
          classType.registeredClass.instancePrototype,
          fieldName,
          desc,
        );
        whenDependentTypesAreResolved(
          [],
          setter ? [getterReturnType, setterArgumentType] : [getterReturnType],
          function (types) {
            var getterReturnType = types[0];
            var desc = {
              get() {
                var ptr = validateThis(this, classType, humanName + " getter");
                return getterReturnType["fromWireType"](
                  getter(getterContext, ptr),
                );
              },
              enumerable: true,
            };
            if (setter) {
              setter = embind__requireFunction(setterSignature, setter);
              var setterArgumentType = types[1];
              desc.set = function (v) {
                var ptr = validateThis(this, classType, humanName + " setter");
                var destructors = [];
                setter(
                  setterContext,
                  ptr,
                  setterArgumentType["toWireType"](destructors, v),
                );
                runDestructors(destructors);
              };
            }
            Object.defineProperty(
              classType.registeredClass.instancePrototype,
              fieldName,
              desc,
            );
            return [];
          },
        );
        return [];
      });
    }
    function handleAllocatorInit() {
      Object.assign(HandleAllocator.prototype, {
        get(id) {
          return this.allocated[id];
        },
        has(id) {
          return this.allocated[id] !== undefined;
        },
        allocate(handle) {
          var id = this.freelist.pop() || this.allocated.length;
          this.allocated[id] = handle;
          return id;
        },
        free(id) {
          this.allocated[id] = undefined;
          this.freelist.push(id);
        },
      });
    }
    function HandleAllocator() {
      this.allocated = [undefined];
      this.freelist = [];
    }
    var emval_handles = new HandleAllocator();
    function __emval_decref(handle) {
      handle >>>= 0;
      if (
        handle >= emval_handles.reserved &&
        0 === --emval_handles.get(handle).refcount
      ) {
        emval_handles.free(handle);
      }
    }
    var count_emval_handles = () => {
      var count = 0;
      for (
        var i = emval_handles.reserved;
        i < emval_handles.allocated.length;
        ++i
      ) {
        if (emval_handles.allocated[i] !== undefined) {
          ++count;
        }
      }
      return count;
    };
    var init_emval = () => {
      emval_handles.allocated.push(
        { value: undefined },
        { value: null },
        { value: true },
        { value: false },
      );
      emval_handles.reserved = emval_handles.allocated.length;
      Module["count_emval_handles"] = count_emval_handles;
    };
    var Emval = {
      toValue: (handle) => {
        if (!handle) {
          throwBindingError("Cannot use deleted val. handle = " + handle);
        }
        return emval_handles.get(handle).value;
      },
      toHandle: (value) => {
        switch (value) {
          case undefined:
            return 1;
          case null:
            return 2;
          case true:
            return 3;
          case false:
            return 4;
          default: {
            return emval_handles.allocate({ refcount: 1, value: value });
          }
        }
      },
    };
    function simpleReadValueFromPointer(pointer) {
      return this["fromWireType"](GROWABLE_HEAP_I32()[(pointer >>> 2) >>> 0]);
    }
    var __embind_register_emval = function (rawType, name) {
      rawType >>>= 0;
      name >>>= 0;
      name = readLatin1String(name);
      registerType(rawType, {
        name: name,
        fromWireType: (handle) => {
          var rv = Emval.toValue(handle);
          __emval_decref(handle);
          return rv;
        },
        toWireType: (destructors, value) => Emval.toHandle(value),
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: simpleReadValueFromPointer,
        destructorFunction: null,
      });
    };
    var enumReadValueFromPointer = (name, width, signed) => {
      switch (width) {
        case 1:
          return signed
            ? function (pointer) {
                return this["fromWireType"](
                  GROWABLE_HEAP_I8()[(pointer >>> 0) >>> 0],
                );
              }
            : function (pointer) {
                return this["fromWireType"](
                  GROWABLE_HEAP_U8()[(pointer >>> 0) >>> 0],
                );
              };
        case 2:
          return signed
            ? function (pointer) {
                return this["fromWireType"](
                  GROWABLE_HEAP_I16()[(pointer >>> 1) >>> 0],
                );
              }
            : function (pointer) {
                return this["fromWireType"](
                  GROWABLE_HEAP_U16()[(pointer >>> 1) >>> 0],
                );
              };
        case 4:
          return signed
            ? function (pointer) {
                return this["fromWireType"](
                  GROWABLE_HEAP_I32()[(pointer >>> 2) >>> 0],
                );
              }
            : function (pointer) {
                return this["fromWireType"](
                  GROWABLE_HEAP_U32()[(pointer >>> 2) >>> 0],
                );
              };
        default:
          throw new TypeError(`invalid integer width (${width}): ${name}`);
      }
    };
    function __embind_register_enum(rawType, name, size, isSigned) {
      rawType >>>= 0;
      name >>>= 0;
      size >>>= 0;
      name = readLatin1String(name);
      function ctor() {}
      ctor.values = {};
      registerType(rawType, {
        name: name,
        constructor: ctor,
        fromWireType: function (c) {
          return this.constructor.values[c];
        },
        toWireType: (destructors, c) => c.value,
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: enumReadValueFromPointer(name, size, isSigned),
        destructorFunction: null,
      });
      exposePublicSymbol(name, ctor);
    }
    var requireRegisteredType = (rawType, humanName) => {
      var impl = registeredTypes[rawType];
      if (undefined === impl) {
        throwBindingError(
          humanName + " has unknown type " + getTypeName(rawType),
        );
      }
      return impl;
    };
    function __embind_register_enum_value(rawEnumType, name, enumValue) {
      rawEnumType >>>= 0;
      name >>>= 0;
      enumValue >>>= 0;
      var enumType = requireRegisteredType(rawEnumType, "enum");
      name = readLatin1String(name);
      var Enum = enumType.constructor;
      var Value = Object.create(enumType.constructor.prototype, {
        value: { value: enumValue },
        constructor: {
          value: createNamedFunction(
            `${enumType.name}_${name}`,
            function () {},
          ),
        },
      });
      Enum.values[enumValue] = Value;
      Enum[name] = Value;
    }
    var embindRepr = (v) => {
      if (v === null) {
        return "null";
      }
      var t = typeof v;
      if (t === "object" || t === "array" || t === "function") {
        return v.toString();
      } else {
        return "" + v;
      }
    };
    var floatReadValueFromPointer = (name, width) => {
      switch (width) {
        case 4:
          return function (pointer) {
            return this["fromWireType"](
              GROWABLE_HEAP_F32()[(pointer >>> 2) >>> 0],
            );
          };
        case 8:
          return function (pointer) {
            return this["fromWireType"](
              GROWABLE_HEAP_F64()[(pointer >>> 3) >>> 0],
            );
          };
        default:
          throw new TypeError(`invalid float width (${width}): ${name}`);
      }
    };
    var __embind_register_float = function (rawType, name, size) {
      rawType >>>= 0;
      name >>>= 0;
      size >>>= 0;
      name = readLatin1String(name);
      registerType(rawType, {
        name: name,
        fromWireType: (value) => value,
        toWireType: (destructors, value) => value,
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: floatReadValueFromPointer(name, size),
        destructorFunction: null,
      });
    };
    function __embind_register_function(
      name,
      argCount,
      rawArgTypesAddr,
      signature,
      rawInvoker,
      fn,
      isAsync,
    ) {
      name >>>= 0;
      rawArgTypesAddr >>>= 0;
      signature >>>= 0;
      rawInvoker >>>= 0;
      fn >>>= 0;
      var argTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      name = readLatin1String(name);
      name = getFunctionName(name);
      rawInvoker = embind__requireFunction(signature, rawInvoker);
      exposePublicSymbol(
        name,
        function () {
          throwUnboundTypeError(
            `Cannot call ${name} due to unbound types`,
            argTypes,
          );
        },
        argCount - 1,
      );
      whenDependentTypesAreResolved([], argTypes, function (argTypes) {
        var invokerArgsArray = [argTypes[0], null].concat(argTypes.slice(1));
        replacePublicSymbol(
          name,
          craftInvokerFunction(
            name,
            invokerArgsArray,
            null,
            rawInvoker,
            fn,
            isAsync,
          ),
          argCount - 1,
        );
        return [];
      });
    }
    var integerReadValueFromPointer = (name, width, signed) => {
      switch (width) {
        case 1:
          return signed
            ? (pointer) => GROWABLE_HEAP_I8()[(pointer >>> 0) >>> 0]
            : (pointer) => GROWABLE_HEAP_U8()[(pointer >>> 0) >>> 0];
        case 2:
          return signed
            ? (pointer) => GROWABLE_HEAP_I16()[(pointer >>> 1) >>> 0]
            : (pointer) => GROWABLE_HEAP_U16()[(pointer >>> 1) >>> 0];
        case 4:
          return signed
            ? (pointer) => GROWABLE_HEAP_I32()[(pointer >>> 2) >>> 0]
            : (pointer) => GROWABLE_HEAP_U32()[(pointer >>> 2) >>> 0];
        default:
          throw new TypeError(`invalid integer width (${width}): ${name}`);
      }
    };
    function __embind_register_integer(
      primitiveType,
      name,
      size,
      minRange,
      maxRange,
    ) {
      primitiveType >>>= 0;
      name >>>= 0;
      size >>>= 0;
      name = readLatin1String(name);
      if (maxRange === -1) {
        maxRange = 4294967295;
      }
      var fromWireType = (value) => value;
      if (minRange === 0) {
        var bitshift = 32 - 8 * size;
        fromWireType = (value) => (value << bitshift) >>> bitshift;
      }
      var isUnsignedType = name.includes("unsigned");
      var checkAssertions = (value, toTypeName) => {};
      var toWireType;
      if (isUnsignedType) {
        toWireType = function (destructors, value) {
          checkAssertions(value, this.name);
          return value >>> 0;
        };
      } else {
        toWireType = function (destructors, value) {
          checkAssertions(value, this.name);
          return value;
        };
      }
      registerType(primitiveType, {
        name: name,
        fromWireType: fromWireType,
        toWireType: toWireType,
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: integerReadValueFromPointer(
          name,
          size,
          minRange !== 0,
        ),
        destructorFunction: null,
      });
    }
    function __embind_register_memory_view(rawType, dataTypeIndex, name) {
      rawType >>>= 0;
      name >>>= 0;
      var typeMapping = [
        Int8Array,
        Uint8Array,
        Int16Array,
        Uint16Array,
        Int32Array,
        Uint32Array,
        Float32Array,
        Float64Array,
      ];
      var TA = typeMapping[dataTypeIndex];
      function decodeMemoryView(handle) {
        var size = GROWABLE_HEAP_U32()[(handle >>> 2) >>> 0];
        var data = GROWABLE_HEAP_U32()[((handle + 4) >>> 2) >>> 0];
        return new TA(GROWABLE_HEAP_I8().buffer, data, size);
      }
      name = readLatin1String(name);
      registerType(
        rawType,
        {
          name: name,
          fromWireType: decodeMemoryView,
          argPackAdvance: GenericWireTypeSize,
          readValueFromPointer: decodeMemoryView,
        },
        { ignoreDuplicateRegistrations: true },
      );
    }
    function __embind_register_smart_ptr(
      rawType,
      rawPointeeType,
      name,
      sharingPolicy,
      getPointeeSignature,
      rawGetPointee,
      constructorSignature,
      rawConstructor,
      shareSignature,
      rawShare,
      destructorSignature,
      rawDestructor,
    ) {
      rawType >>>= 0;
      rawPointeeType >>>= 0;
      name >>>= 0;
      getPointeeSignature >>>= 0;
      rawGetPointee >>>= 0;
      constructorSignature >>>= 0;
      rawConstructor >>>= 0;
      shareSignature >>>= 0;
      rawShare >>>= 0;
      destructorSignature >>>= 0;
      rawDestructor >>>= 0;
      name = readLatin1String(name);
      rawGetPointee = embind__requireFunction(
        getPointeeSignature,
        rawGetPointee,
      );
      rawConstructor = embind__requireFunction(
        constructorSignature,
        rawConstructor,
      );
      rawShare = embind__requireFunction(shareSignature, rawShare);
      rawDestructor = embind__requireFunction(
        destructorSignature,
        rawDestructor,
      );
      whenDependentTypesAreResolved(
        [rawType],
        [rawPointeeType],
        function (pointeeType) {
          pointeeType = pointeeType[0];
          var registeredPointer = new RegisteredPointer(
            name,
            pointeeType.registeredClass,
            false,
            false,
            true,
            pointeeType,
            sharingPolicy,
            rawGetPointee,
            rawConstructor,
            rawShare,
            rawDestructor,
          );
          return [registeredPointer];
        },
      );
    }
    function __embind_register_std_string(rawType, name) {
      rawType >>>= 0;
      name >>>= 0;
      name = readLatin1String(name);
      var stdStringIsUTF8 = name === "std::string";
      registerType(rawType, {
        name: name,
        fromWireType(value) {
          var length = GROWABLE_HEAP_U32()[(value >>> 2) >>> 0];
          var payload = value + 4;
          var str;
          if (stdStringIsUTF8) {
            var decodeStartPtr = payload;
            for (var i = 0; i <= length; ++i) {
              var currentBytePtr = payload + i;
              if (
                i == length ||
                GROWABLE_HEAP_U8()[currentBytePtr >>> 0] == 0
              ) {
                var maxRead = currentBytePtr - decodeStartPtr;
                var stringSegment = UTF8ToString(decodeStartPtr, maxRead);
                if (str === undefined) {
                  str = stringSegment;
                } else {
                  str += String.fromCharCode(0);
                  str += stringSegment;
                }
                decodeStartPtr = currentBytePtr + 1;
              }
            }
          } else {
            var a = new Array(length);
            for (var i = 0; i < length; ++i) {
              a[i] = String.fromCharCode(
                GROWABLE_HEAP_U8()[(payload + i) >>> 0],
              );
            }
            str = a.join("");
          }
          _free(value);
          return str;
        },
        toWireType(destructors, value) {
          if (value instanceof ArrayBuffer) {
            value = new Uint8Array(value);
          }
          var length;
          var valueIsOfTypeString = typeof value == "string";
          if (
            !(
              valueIsOfTypeString ||
              value instanceof Uint8Array ||
              value instanceof Uint8ClampedArray ||
              value instanceof Int8Array
            )
          ) {
            throwBindingError("Cannot pass non-string to std::string");
          }
          if (stdStringIsUTF8 && valueIsOfTypeString) {
            length = lengthBytesUTF8(value);
          } else {
            length = value.length;
          }
          var base = _malloc(4 + length + 1);
          var ptr = base + 4;
          GROWABLE_HEAP_U32()[(base >>> 2) >>> 0] = length;
          if (stdStringIsUTF8 && valueIsOfTypeString) {
            stringToUTF8(value, ptr, length + 1);
          } else {
            if (valueIsOfTypeString) {
              for (var i = 0; i < length; ++i) {
                var charCode = value.charCodeAt(i);
                if (charCode > 255) {
                  _free(ptr);
                  throwBindingError(
                    "String has UTF-16 code units that do not fit in 8 bits",
                  );
                }
                GROWABLE_HEAP_U8()[(ptr + i) >>> 0] = charCode;
              }
            } else {
              for (var i = 0; i < length; ++i) {
                GROWABLE_HEAP_U8()[(ptr + i) >>> 0] = value[i];
              }
            }
          }
          if (destructors !== null) {
            destructors.push(_free, base);
          }
          return base;
        },
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: readPointer,
        destructorFunction(ptr) {
          _free(ptr);
        },
      });
    }
    var UTF16Decoder =
      typeof TextDecoder != "undefined"
        ? new TextDecoder("utf-16le")
        : undefined;
    var UTF16ToString = (ptr, maxBytesToRead) => {
      var endPtr = ptr;
      var idx = endPtr >> 1;
      var maxIdx = idx + maxBytesToRead / 2;
      while (!(idx >= maxIdx) && GROWABLE_HEAP_U16()[idx >>> 0]) ++idx;
      endPtr = idx << 1;
      if (endPtr - ptr > 32 && UTF16Decoder)
        return UTF16Decoder.decode(GROWABLE_HEAP_U8().slice(ptr, endPtr));
      var str = "";
      for (var i = 0; !(i >= maxBytesToRead / 2); ++i) {
        var codeUnit = GROWABLE_HEAP_I16()[((ptr + i * 2) >>> 1) >>> 0];
        if (codeUnit == 0) break;
        str += String.fromCharCode(codeUnit);
      }
      return str;
    };
    var stringToUTF16 = (str, outPtr, maxBytesToWrite) => {
      if (maxBytesToWrite === undefined) {
        maxBytesToWrite = 2147483647;
      }
      if (maxBytesToWrite < 2) return 0;
      maxBytesToWrite -= 2;
      var startPtr = outPtr;
      var numCharsToWrite =
        maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
      for (var i = 0; i < numCharsToWrite; ++i) {
        var codeUnit = str.charCodeAt(i);
        GROWABLE_HEAP_I16()[(outPtr >>> 1) >>> 0] = codeUnit;
        outPtr += 2;
      }
      GROWABLE_HEAP_I16()[(outPtr >>> 1) >>> 0] = 0;
      return outPtr - startPtr;
    };
    var lengthBytesUTF16 = (str) => str.length * 2;
    var UTF32ToString = (ptr, maxBytesToRead) => {
      var i = 0;
      var str = "";
      while (!(i >= maxBytesToRead / 4)) {
        var utf32 = GROWABLE_HEAP_I32()[((ptr + i * 4) >>> 2) >>> 0];
        if (utf32 == 0) break;
        ++i;
        if (utf32 >= 65536) {
          var ch = utf32 - 65536;
          str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));
        } else {
          str += String.fromCharCode(utf32);
        }
      }
      return str;
    };
    var stringToUTF32 = (str, outPtr, maxBytesToWrite) => {
      outPtr >>>= 0;
      if (maxBytesToWrite === undefined) {
        maxBytesToWrite = 2147483647;
      }
      if (maxBytesToWrite < 4) return 0;
      var startPtr = outPtr;
      var endPtr = startPtr + maxBytesToWrite - 4;
      for (var i = 0; i < str.length; ++i) {
        var codeUnit = str.charCodeAt(i);
        if (codeUnit >= 55296 && codeUnit <= 57343) {
          var trailSurrogate = str.charCodeAt(++i);
          codeUnit =
            (65536 + ((codeUnit & 1023) << 10)) | (trailSurrogate & 1023);
        }
        GROWABLE_HEAP_I32()[(outPtr >>> 2) >>> 0] = codeUnit;
        outPtr += 4;
        if (outPtr + 4 > endPtr) break;
      }
      GROWABLE_HEAP_I32()[(outPtr >>> 2) >>> 0] = 0;
      return outPtr - startPtr;
    };
    var lengthBytesUTF32 = (str) => {
      var len = 0;
      for (var i = 0; i < str.length; ++i) {
        var codeUnit = str.charCodeAt(i);
        if (codeUnit >= 55296 && codeUnit <= 57343) ++i;
        len += 4;
      }
      return len;
    };
    var __embind_register_std_wstring = function (rawType, charSize, name) {
      rawType >>>= 0;
      charSize >>>= 0;
      name >>>= 0;
      name = readLatin1String(name);
      var decodeString, encodeString, getHeap, lengthBytesUTF, shift;
      if (charSize === 2) {
        decodeString = UTF16ToString;
        encodeString = stringToUTF16;
        lengthBytesUTF = lengthBytesUTF16;
        getHeap = () => GROWABLE_HEAP_U16();
        shift = 1;
      } else if (charSize === 4) {
        decodeString = UTF32ToString;
        encodeString = stringToUTF32;
        lengthBytesUTF = lengthBytesUTF32;
        getHeap = () => GROWABLE_HEAP_U32();
        shift = 2;
      }
      registerType(rawType, {
        name: name,
        fromWireType: (value) => {
          var length = GROWABLE_HEAP_U32()[(value >>> 2) >>> 0];
          var HEAP = getHeap();
          var str;
          var decodeStartPtr = value + 4;
          for (var i = 0; i <= length; ++i) {
            var currentBytePtr = value + 4 + i * charSize;
            if (i == length || HEAP[currentBytePtr >>> shift] == 0) {
              var maxReadBytes = currentBytePtr - decodeStartPtr;
              var stringSegment = decodeString(decodeStartPtr, maxReadBytes);
              if (str === undefined) {
                str = stringSegment;
              } else {
                str += String.fromCharCode(0);
                str += stringSegment;
              }
              decodeStartPtr = currentBytePtr + charSize;
            }
          }
          _free(value);
          return str;
        },
        toWireType: (destructors, value) => {
          if (!(typeof value == "string")) {
            throwBindingError(
              `Cannot pass non-string to C++ string type ${name}`,
            );
          }
          var length = lengthBytesUTF(value);
          var ptr = _malloc(4 + length + charSize);
          GROWABLE_HEAP_U32()[ptr >>> 2] = length >> shift;
          encodeString(value, ptr + 4, length + charSize);
          if (destructors !== null) {
            destructors.push(_free, ptr);
          }
          return ptr;
        },
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: simpleReadValueFromPointer,
        destructorFunction(ptr) {
          _free(ptr);
        },
      });
    };
    var __embind_register_void = function (rawType, name) {
      rawType >>>= 0;
      name >>>= 0;
      name = readLatin1String(name);
      registerType(rawType, {
        isVoid: true,
        name: name,
        argPackAdvance: 0,
        fromWireType: () => undefined,
        toWireType: (destructors, o) => undefined,
      });
    };
    var nowIsMonotonic = true;
    var __emscripten_get_now_is_monotonic = () => nowIsMonotonic;
    function __emscripten_thread_mailbox_await(pthread_ptr) {
      pthread_ptr >>>= 0;
      if (typeof Atomics.waitAsync === "function") {
        var wait = Atomics.waitAsync(
          GROWABLE_HEAP_I32(),
          pthread_ptr >>> 2,
          pthread_ptr,
        );
        wait.value.then(checkMailbox);
        var waitingAsync = pthread_ptr + 128;
        Atomics.store(GROWABLE_HEAP_I32(), waitingAsync >>> 2, 1);
      }
    }
    Module["__emscripten_thread_mailbox_await"] =
      __emscripten_thread_mailbox_await;
    var checkMailbox = () => {
      var pthread_ptr = _pthread_self();
      if (pthread_ptr) {
        __emscripten_thread_mailbox_await(pthread_ptr);
        callUserCallback(() => __emscripten_check_mailbox());
      }
    };
    Module["checkMailbox"] = checkMailbox;
    var __emscripten_notify_mailbox_postmessage = function (
      targetThreadId,
      currThreadId,
      mainThreadId,
    ) {
      targetThreadId >>>= 0;
      currThreadId >>>= 0;
      mainThreadId >>>= 0;
      if (targetThreadId == currThreadId) {
        setTimeout(() => checkMailbox());
      } else if (ENVIRONMENT_IS_PTHREAD) {
        postMessage({ targetThread: targetThreadId, cmd: "checkMailbox" });
      } else {
        var worker = PThread.pthreads[targetThreadId];
        if (!worker) {
          return;
        }
        worker.postMessage({ cmd: "checkMailbox" });
      }
    };
    var withStackSave = (f) => {
      var stack = stackSave();
      var ret = f();
      stackRestore(stack);
      return ret;
    };
    var proxyToMainThread = function (index, sync) {
      var numCallArgs = arguments.length - 2;
      var outerArgs = arguments;
      return withStackSave(() => {
        var serializedNumCallArgs = numCallArgs;
        var args = stackAlloc(serializedNumCallArgs * 8);
        var b = args >>> 3;
        for (var i = 0; i < numCallArgs; i++) {
          var arg = outerArgs[2 + i];
          GROWABLE_HEAP_F64()[(b + i) >>> 0] = arg;
        }
        return __emscripten_run_on_main_thread_js(
          index,
          serializedNumCallArgs,
          args,
          sync,
        );
      });
    };
    var proxiedJSCallArgs = [];
    function __emscripten_receive_on_main_thread_js(
      index,
      callingThread,
      numCallArgs,
      args,
    ) {
      callingThread >>>= 0;
      args >>>= 0;
      proxiedJSCallArgs.length = numCallArgs;
      var b = args >>> 3;
      for (var i = 0; i < numCallArgs; i++) {
        proxiedJSCallArgs[i] = GROWABLE_HEAP_F64()[(b + i) >>> 0];
      }
      var func = proxiedFunctionTable[index];
      PThread.currentProxiedOperationCallerThread = callingThread;
      var rtn = func.apply(null, proxiedJSCallArgs);
      PThread.currentProxiedOperationCallerThread = 0;
      return rtn;
    }
    function __emscripten_runtime_keepalive_clear() {
      if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(20, 1);
      noExitRuntime = false;
      runtimeKeepaliveCounter = 0;
    }
    function __emscripten_thread_set_strongref(thread) {
      thread >>>= 0;
      if (ENVIRONMENT_IS_NODE) {
        PThread.pthreads[thread].ref();
      }
    }
    function __emval_as(handle, returnType, destructorsRef) {
      handle >>>= 0;
      returnType >>>= 0;
      destructorsRef >>>= 0;
      handle = Emval.toValue(handle);
      returnType = requireRegisteredType(returnType, "emval::as");
      var destructors = [];
      var rd = Emval.toHandle(destructors);
      GROWABLE_HEAP_U32()[(destructorsRef >>> 2) >>> 0] = rd;
      return returnType["toWireType"](destructors, handle);
    }
    function __emval_as_int64(handle, returnType) {
      handle >>>= 0;
      returnType >>>= 0;
      handle = Emval.toValue(handle);
      returnType = requireRegisteredType(returnType, "emval::as");
      return returnType["toWireType"](null, handle);
    }
    function __emval_as_uint64(handle, returnType) {
      handle >>>= 0;
      returnType >>>= 0;
      handle = Emval.toValue(handle);
      returnType = requireRegisteredType(returnType, "emval::as");
      return returnType["toWireType"](null, handle);
    }
    var emval_lookupTypes = (argCount, argTypes) => {
      var a = new Array(argCount);
      for (var i = 0; i < argCount; ++i) {
        a[i] = requireRegisteredType(
          GROWABLE_HEAP_U32()[((argTypes + i * 4) >>> 2) >>> 0],
          "parameter " + i,
        );
      }
      return a;
    };
    function __emval_call(handle, argCount, argTypes, argv) {
      handle >>>= 0;
      argTypes >>>= 0;
      argv >>>= 0;
      handle = Emval.toValue(handle);
      var types = emval_lookupTypes(argCount, argTypes);
      var args = new Array(argCount);
      for (var i = 0; i < argCount; ++i) {
        var type = types[i];
        args[i] = type["readValueFromPointer"](argv);
        argv += type["argPackAdvance"];
      }
      var rv = handle.apply(undefined, args);
      return Emval.toHandle(rv);
    }
    var emval_symbols = {};
    var getStringOrSymbol = (address) => {
      var symbol = emval_symbols[address];
      if (symbol === undefined) {
        return readLatin1String(address);
      }
      return symbol;
    };
    var emval_methodCallers = [];
    function __emval_call_method(
      caller,
      handle,
      methodName,
      destructorsRef,
      args,
    ) {
      caller >>>= 0;
      handle >>>= 0;
      methodName >>>= 0;
      destructorsRef >>>= 0;
      args >>>= 0;
      caller = emval_methodCallers[caller];
      handle = Emval.toValue(handle);
      methodName = getStringOrSymbol(methodName);
      var destructors = [];
      var result = caller(handle, methodName, destructors, args);
      if (destructors.length) {
        GROWABLE_HEAP_U32()[(destructorsRef >>> 2) >>> 0] =
          Emval.toHandle(destructors);
      }
      return result;
    }
    function __emval_equals(first, second) {
      first >>>= 0;
      second >>>= 0;
      first = Emval.toValue(first);
      second = Emval.toValue(second);
      return first == second;
    }
    var emval_get_global = () => {
      if (typeof globalThis == "object") {
        return globalThis;
      }
      return (function () {
        return Function;
      })()("return this")();
    };
    function __emval_get_global(name) {
      name >>>= 0;
      if (name === 0) {
        return Emval.toHandle(emval_get_global());
      } else {
        name = getStringOrSymbol(name);
        return Emval.toHandle(emval_get_global()[name]);
      }
    }
    var emval_addMethodCaller = (caller) => {
      var id = emval_methodCallers.length;
      emval_methodCallers.push(caller);
      return id;
    };
    function __emval_get_method_caller(argCount, argTypes) {
      argTypes >>>= 0;
      var types = emval_lookupTypes(argCount, argTypes);
      var retType = types.shift();
      argCount--;
      var params = ["retType"];
      var args = [retType];
      var argsList = "";
      for (var i = 0; i < argCount; ++i) {
        argsList += (i !== 0 ? ", " : "") + "arg" + i;
        params.push("argType" + i);
        args.push(types[i]);
      }
      var signatureName =
        retType.name + "_$" + types.map((t) => t.name).join("_") + "$";
      var functionName = makeLegalFunctionName("methodCaller_" + signatureName);
      var functionBody =
        "return function " +
        functionName +
        "(handle, name, destructors, args) {\n";
      var offset = 0;
      for (var i = 0; i < argCount; ++i) {
        functionBody +=
          "    var arg" +
          i +
          " = argType" +
          i +
          ".readValueFromPointer(args" +
          (offset ? "+" + offset : "") +
          ");\n";
        offset += types[i]["argPackAdvance"];
      }
      functionBody += "    var rv = handle[name](" + argsList + ");\n";
      for (var i = 0; i < argCount; ++i) {
        if (types[i]["deleteObject"]) {
          functionBody += "    argType" + i + ".deleteObject(arg" + i + ");\n";
        }
      }
      if (!retType.isVoid) {
        functionBody += "    return retType.toWireType(destructors, rv);\n";
      }
      functionBody += "};\n";
      params.push(functionBody);
      var invokerFunction = newFunc(Function, params).apply(null, args);
      return emval_addMethodCaller(invokerFunction);
    }
    function __emval_get_property(handle, key) {
      handle >>>= 0;
      key >>>= 0;
      handle = Emval.toValue(handle);
      key = Emval.toValue(key);
      return Emval.toHandle(handle[key]);
    }
    function __emval_incref(handle) {
      handle >>>= 0;
      if (handle > 4) {
        emval_handles.get(handle).refcount += 1;
      }
    }
    function __emval_instanceof(object, constructor) {
      object >>>= 0;
      constructor >>>= 0;
      object = Emval.toValue(object);
      constructor = Emval.toValue(constructor);
      return object instanceof constructor;
    }
    function __emval_new_array() {
      return Emval.toHandle([]);
    }
    function __emval_new_cstring(v) {
      v >>>= 0;
      return Emval.toHandle(getStringOrSymbol(v));
    }
    function __emval_new_object() {
      return Emval.toHandle({});
    }
    function __emval_run_destructors(handle) {
      handle >>>= 0;
      var destructors = Emval.toValue(handle);
      runDestructors(destructors);
      __emval_decref(handle);
    }
    function __emval_set_property(handle, key, value) {
      handle >>>= 0;
      key >>>= 0;
      value >>>= 0;
      handle = Emval.toValue(handle);
      key = Emval.toValue(key);
      value = Emval.toValue(value);
      handle[key] = value;
    }
    function __emval_take_value(type, arg) {
      type >>>= 0;
      arg >>>= 0;
      type = requireRegisteredType(type, "_emval_take_value");
      var v = type["readValueFromPointer"](arg);
      return Emval.toHandle(v);
    }
    function __emval_typeof(handle) {
      handle >>>= 0;
      handle = Emval.toValue(handle);
      return Emval.toHandle(typeof handle);
    }
    function __mmap_js(
      len,
      prot,
      flags,
      fd,
      offset_low,
      offset_high,
      allocated,
      addr,
    ) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(
          21,
          1,
          len,
          prot,
          flags,
          fd,
          offset_low,
          offset_high,
          allocated,
          addr,
        );
      len >>>= 0;
      var offset = convertI32PairToI53Checked(offset_low, offset_high);
      allocated >>>= 0;
      addr >>>= 0;
      try {
        if (isNaN(offset)) return 61;
        var stream = SYSCALLS.getStreamFromFD(fd);
        var res = FS.mmap(stream, len, offset, prot, flags);
        var ptr = res.ptr;
        GROWABLE_HEAP_I32()[(allocated >>> 2) >>> 0] = res.allocated;
        GROWABLE_HEAP_U32()[(addr >>> 2) >>> 0] = ptr;
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function __munmap_js(addr, len, prot, flags, fd, offset_low, offset_high) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(
          22,
          1,
          addr,
          len,
          prot,
          flags,
          fd,
          offset_low,
          offset_high,
        );
      addr >>>= 0;
      len >>>= 0;
      var offset = convertI32PairToI53Checked(offset_low, offset_high);
      try {
        if (isNaN(offset)) return 61;
        var stream = SYSCALLS.getStreamFromFD(fd);
        if (prot & 2) {
          SYSCALLS.doMsync(addr, stream, len, flags, offset);
        }
        FS.munmap(stream);
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    var timers = {};
    var _emscripten_get_now;
    _emscripten_get_now = () => performance.timeOrigin + performance.now();
    function __setitimer_js(which, timeout_ms) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(23, 1, which, timeout_ms);
      if (timers[which]) {
        clearTimeout(timers[which].id);
        delete timers[which];
      }
      if (!timeout_ms) return 0;
      var id = setTimeout(() => {
        delete timers[which];
        callUserCallback(() =>
          __emscripten_timeout(which, _emscripten_get_now()),
        );
      }, timeout_ms);
      timers[which] = { id: id, timeout_ms: timeout_ms };
      return 0;
    }
    var _abort = () => {
      abort("");
    };
    var warnOnce = (text) => {
      if (!warnOnce.shown) warnOnce.shown = {};
      if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1;
        if (ENVIRONMENT_IS_NODE) text = "warning: " + text;
        err(text);
      }
    };
    var _emscripten_check_blocking_allowed = () => {};
    var _emscripten_date_now = () => Date.now();
    var _emscripten_exit_with_live_runtime = () => {
      runtimeKeepalivePush();
      throw "unwind";
    };
    function _emscripten_force_exit(status) {
      if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(24, 1, status);
      __emscripten_runtime_keepalive_clear();
      _exit(status);
    }
    var getHeapMax = () => 4294901760;
    function _emscripten_get_heap_max() {
      return getHeapMax();
    }
    var _emscripten_num_logical_cores = () => {
      if (ENVIRONMENT_IS_NODE) return require("os").cpus().length;
      return navigator["hardwareConcurrency"];
    };
    var growMemory = (size) => {
      var b = wasmMemory.buffer;
      var pages = (size - b.byteLength + 65535) / 65536;
      try {
        wasmMemory.grow(pages);
        updateMemoryViews();
        return 1;
      } catch (e) {}
    };
    function _emscripten_resize_heap(requestedSize) {
      requestedSize >>>= 0;
      var oldSize = GROWABLE_HEAP_U8().length;
      if (requestedSize <= oldSize) {
        return false;
      }
      var maxHeapSize = getHeapMax();
      if (requestedSize > maxHeapSize) {
        return false;
      }
      var alignUp = (x, multiple) =>
        x + ((multiple - (x % multiple)) % multiple);
      for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
        var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
        overGrownHeapSize = Math.min(
          overGrownHeapSize,
          requestedSize + 100663296,
        );
        var newSize = Math.min(
          maxHeapSize,
          alignUp(Math.max(requestedSize, overGrownHeapSize), 65536),
        );
        var replacement = growMemory(newSize);
        if (replacement) {
          return true;
        }
      }
      return false;
    }
    var ENV = {};
    var getExecutableName = () => thisProgram || "./this.program";
    var getEnvStrings = () => {
      if (!getEnvStrings.strings) {
        var lang =
          (
            (typeof navigator == "object" &&
              navigator.languages &&
              navigator.languages[0]) ||
            "C"
          ).replace("-", "_") + ".UTF-8";
        var env = {
          USER: "web_user",
          LOGNAME: "web_user",
          PATH: "/",
          PWD: "/",
          HOME: "/home/web_user",
          LANG: lang,
          _: getExecutableName(),
        };
        for (var x in ENV) {
          if (ENV[x] === undefined) delete env[x];
          else env[x] = ENV[x];
        }
        var strings = [];
        for (var x in env) {
          strings.push(`${x}=${env[x]}`);
        }
        getEnvStrings.strings = strings;
      }
      return getEnvStrings.strings;
    };
    var stringToAscii = (str, buffer) => {
      for (var i = 0; i < str.length; ++i) {
        GROWABLE_HEAP_I8()[(buffer++ >>> 0) >>> 0] = str.charCodeAt(i);
      }
      GROWABLE_HEAP_I8()[(buffer >>> 0) >>> 0] = 0;
    };
    var _environ_get = function (__environ, environ_buf) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(25, 1, __environ, environ_buf);
      __environ >>>= 0;
      environ_buf >>>= 0;
      var bufSize = 0;
      getEnvStrings().forEach((string, i) => {
        var ptr = environ_buf + bufSize;
        GROWABLE_HEAP_U32()[((__environ + i * 4) >>> 2) >>> 0] = ptr;
        stringToAscii(string, ptr);
        bufSize += string.length + 1;
      });
      return 0;
    };
    var _environ_sizes_get = function (penviron_count, penviron_buf_size) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(26, 1, penviron_count, penviron_buf_size);
      penviron_count >>>= 0;
      penviron_buf_size >>>= 0;
      var strings = getEnvStrings();
      GROWABLE_HEAP_U32()[(penviron_count >>> 2) >>> 0] = strings.length;
      var bufSize = 0;
      strings.forEach((string) => (bufSize += string.length + 1));
      GROWABLE_HEAP_U32()[(penviron_buf_size >>> 2) >>> 0] = bufSize;
      return 0;
    };
    function _fd_close(fd) {
      if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(27, 1, fd);
      try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        FS.close(stream);
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return e.errno;
      }
    }
    function _fd_fdstat_get(fd, pbuf) {
      if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(28, 1, fd, pbuf);
      pbuf >>>= 0;
      try {
        var rightsBase = 0;
        var rightsInheriting = 0;
        var flags = 0;
        {
          var stream = SYSCALLS.getStreamFromFD(fd);
          var type = stream.tty
            ? 2
            : FS.isDir(stream.mode)
              ? 3
              : FS.isLink(stream.mode)
                ? 7
                : 4;
        }
        GROWABLE_HEAP_I8()[(pbuf >>> 0) >>> 0] = type;
        GROWABLE_HEAP_I16()[((pbuf + 2) >>> 1) >>> 0] = flags;
        (tempI64 = [
          rightsBase >>> 0,
          ((tempDouble = rightsBase),
          +Math.abs(tempDouble) >= 1
            ? tempDouble > 0
              ? +Math.floor(tempDouble / 4294967296) >>> 0
              : ~~+Math.ceil(
                  (tempDouble - +(~~tempDouble >>> 0)) / 4294967296,
                ) >>> 0
            : 0),
        ]),
          (GROWABLE_HEAP_I32()[((pbuf + 8) >>> 2) >>> 0] = tempI64[0]),
          (GROWABLE_HEAP_I32()[((pbuf + 12) >>> 2) >>> 0] = tempI64[1]);
        (tempI64 = [
          rightsInheriting >>> 0,
          ((tempDouble = rightsInheriting),
          +Math.abs(tempDouble) >= 1
            ? tempDouble > 0
              ? +Math.floor(tempDouble / 4294967296) >>> 0
              : ~~+Math.ceil(
                  (tempDouble - +(~~tempDouble >>> 0)) / 4294967296,
                ) >>> 0
            : 0),
        ]),
          (GROWABLE_HEAP_I32()[((pbuf + 16) >>> 2) >>> 0] = tempI64[0]),
          (GROWABLE_HEAP_I32()[((pbuf + 20) >>> 2) >>> 0] = tempI64[1]);
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return e.errno;
      }
    }
    var doReadv = (stream, iov, iovcnt, offset) => {
      var ret = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = GROWABLE_HEAP_U32()[(iov >>> 2) >>> 0];
        var len = GROWABLE_HEAP_U32()[((iov + 4) >>> 2) >>> 0];
        iov += 8;
        var curr = FS.read(stream, GROWABLE_HEAP_I8(), ptr, len, offset);
        if (curr < 0) return -1;
        ret += curr;
        if (curr < len) break;
        if (typeof offset !== "undefined") {
          offset += curr;
        }
      }
      return ret;
    };
    function _fd_pread(fd, iov, iovcnt, offset_low, offset_high, pnum) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(
          29,
          1,
          fd,
          iov,
          iovcnt,
          offset_low,
          offset_high,
          pnum,
        );
      iov >>>= 0;
      iovcnt >>>= 0;
      var offset = convertI32PairToI53Checked(offset_low, offset_high);
      pnum >>>= 0;
      try {
        if (isNaN(offset)) return 61;
        var stream = SYSCALLS.getStreamFromFD(fd);
        var num = doReadv(stream, iov, iovcnt, offset);
        GROWABLE_HEAP_U32()[(pnum >>> 2) >>> 0] = num;
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return e.errno;
      }
    }
    var doWritev = (stream, iov, iovcnt, offset) => {
      var ret = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = GROWABLE_HEAP_U32()[(iov >>> 2) >>> 0];
        var len = GROWABLE_HEAP_U32()[((iov + 4) >>> 2) >>> 0];
        iov += 8;
        var curr = FS.write(stream, GROWABLE_HEAP_I8(), ptr, len, offset);
        if (curr < 0) return -1;
        ret += curr;
        if (typeof offset !== "undefined") {
          offset += curr;
        }
      }
      return ret;
    };
    function _fd_pwrite(fd, iov, iovcnt, offset_low, offset_high, pnum) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(
          30,
          1,
          fd,
          iov,
          iovcnt,
          offset_low,
          offset_high,
          pnum,
        );
      iov >>>= 0;
      iovcnt >>>= 0;
      var offset = convertI32PairToI53Checked(offset_low, offset_high);
      pnum >>>= 0;
      try {
        if (isNaN(offset)) return 61;
        var stream = SYSCALLS.getStreamFromFD(fd);
        var num = doWritev(stream, iov, iovcnt, offset);
        GROWABLE_HEAP_U32()[(pnum >>> 2) >>> 0] = num;
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return e.errno;
      }
    }
    function _fd_read(fd, iov, iovcnt, pnum) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(31, 1, fd, iov, iovcnt, pnum);
      iov >>>= 0;
      iovcnt >>>= 0;
      pnum >>>= 0;
      try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        var num = doReadv(stream, iov, iovcnt);
        GROWABLE_HEAP_U32()[(pnum >>> 2) >>> 0] = num;
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return e.errno;
      }
    }
    function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(
          32,
          1,
          fd,
          offset_low,
          offset_high,
          whence,
          newOffset,
        );
      var offset = convertI32PairToI53Checked(offset_low, offset_high);
      newOffset >>>= 0;
      try {
        if (isNaN(offset)) return 61;
        var stream = SYSCALLS.getStreamFromFD(fd);
        FS.llseek(stream, offset, whence);
        (tempI64 = [
          stream.position >>> 0,
          ((tempDouble = stream.position),
          +Math.abs(tempDouble) >= 1
            ? tempDouble > 0
              ? +Math.floor(tempDouble / 4294967296) >>> 0
              : ~~+Math.ceil(
                  (tempDouble - +(~~tempDouble >>> 0)) / 4294967296,
                ) >>> 0
            : 0),
        ]),
          (GROWABLE_HEAP_I32()[(newOffset >>> 2) >>> 0] = tempI64[0]),
          (GROWABLE_HEAP_I32()[((newOffset + 4) >>> 2) >>> 0] = tempI64[1]);
        if (stream.getdents && offset === 0 && whence === 0)
          stream.getdents = null;
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return e.errno;
      }
    }
    function _fd_write(fd, iov, iovcnt, pnum) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(33, 1, fd, iov, iovcnt, pnum);
      iov >>>= 0;
      iovcnt >>>= 0;
      pnum >>>= 0;
      try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        var num = doWritev(stream, iov, iovcnt);
        GROWABLE_HEAP_U32()[(pnum >>> 2) >>> 0] = num;
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return e.errno;
      }
    }
    function _llvm_eh_typeid_for(type) {
      type >>>= 0;
      return type;
    }
    var isLeapYear = (year) =>
      year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    var arraySum = (array, index) => {
      var sum = 0;
      for (var i = 0; i <= index; sum += array[i++]) {}
      return sum;
    };
    var MONTH_DAYS_LEAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var MONTH_DAYS_REGULAR = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var addDays = (date, days) => {
      var newDate = new Date(date.getTime());
      while (days > 0) {
        var leap = isLeapYear(newDate.getFullYear());
        var currentMonth = newDate.getMonth();
        var daysInCurrentMonth = (leap ? MONTH_DAYS_LEAP : MONTH_DAYS_REGULAR)[
          currentMonth
        ];
        if (days > daysInCurrentMonth - newDate.getDate()) {
          days -= daysInCurrentMonth - newDate.getDate() + 1;
          newDate.setDate(1);
          if (currentMonth < 11) {
            newDate.setMonth(currentMonth + 1);
          } else {
            newDate.setMonth(0);
            newDate.setFullYear(newDate.getFullYear() + 1);
          }
        } else {
          newDate.setDate(newDate.getDate() + days);
          return newDate;
        }
      }
      return newDate;
    };
    var writeArrayToMemory = (array, buffer) => {
      GROWABLE_HEAP_I8().set(array, buffer >>> 0);
    };
    function _strftime(s, maxsize, format, tm) {
      s >>>= 0;
      maxsize >>>= 0;
      format >>>= 0;
      tm >>>= 0;
      var tm_zone = GROWABLE_HEAP_U32()[((tm + 40) >>> 2) >>> 0];
      var date = {
        tm_sec: GROWABLE_HEAP_I32()[(tm >>> 2) >>> 0],
        tm_min: GROWABLE_HEAP_I32()[((tm + 4) >>> 2) >>> 0],
        tm_hour: GROWABLE_HEAP_I32()[((tm + 8) >>> 2) >>> 0],
        tm_mday: GROWABLE_HEAP_I32()[((tm + 12) >>> 2) >>> 0],
        tm_mon: GROWABLE_HEAP_I32()[((tm + 16) >>> 2) >>> 0],
        tm_year: GROWABLE_HEAP_I32()[((tm + 20) >>> 2) >>> 0],
        tm_wday: GROWABLE_HEAP_I32()[((tm + 24) >>> 2) >>> 0],
        tm_yday: GROWABLE_HEAP_I32()[((tm + 28) >>> 2) >>> 0],
        tm_isdst: GROWABLE_HEAP_I32()[((tm + 32) >>> 2) >>> 0],
        tm_gmtoff: GROWABLE_HEAP_I32()[((tm + 36) >>> 2) >>> 0],
        tm_zone: tm_zone ? UTF8ToString(tm_zone) : "",
      };
      var pattern = UTF8ToString(format);
      var EXPANSION_RULES_1 = {
        "%c": "%a %b %d %H:%M:%S %Y",
        "%D": "%m/%d/%y",
        "%F": "%Y-%m-%d",
        "%h": "%b",
        "%r": "%I:%M:%S %p",
        "%R": "%H:%M",
        "%T": "%H:%M:%S",
        "%x": "%m/%d/%y",
        "%X": "%H:%M:%S",
        "%Ec": "%c",
        "%EC": "%C",
        "%Ex": "%m/%d/%y",
        "%EX": "%H:%M:%S",
        "%Ey": "%y",
        "%EY": "%Y",
        "%Od": "%d",
        "%Oe": "%e",
        "%OH": "%H",
        "%OI": "%I",
        "%Om": "%m",
        "%OM": "%M",
        "%OS": "%S",
        "%Ou": "%u",
        "%OU": "%U",
        "%OV": "%V",
        "%Ow": "%w",
        "%OW": "%W",
        "%Oy": "%y",
      };
      for (var rule in EXPANSION_RULES_1) {
        pattern = pattern.replace(
          new RegExp(rule, "g"),
          EXPANSION_RULES_1[rule],
        );
      }
      var WEEKDAYS = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      var MONTHS = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
      function leadingSomething(value, digits, character) {
        var str = typeof value == "number" ? value.toString() : value || "";
        while (str.length < digits) {
          str = character[0] + str;
        }
        return str;
      }
      function leadingNulls(value, digits) {
        return leadingSomething(value, digits, "0");
      }
      function compareByDay(date1, date2) {
        function sgn(value) {
          return value < 0 ? -1 : value > 0 ? 1 : 0;
        }
        var compare;
        if ((compare = sgn(date1.getFullYear() - date2.getFullYear())) === 0) {
          if ((compare = sgn(date1.getMonth() - date2.getMonth())) === 0) {
            compare = sgn(date1.getDate() - date2.getDate());
          }
        }
        return compare;
      }
      function getFirstWeekStartDate(janFourth) {
        switch (janFourth.getDay()) {
          case 0:
            return new Date(janFourth.getFullYear() - 1, 11, 29);
          case 1:
            return janFourth;
          case 2:
            return new Date(janFourth.getFullYear(), 0, 3);
          case 3:
            return new Date(janFourth.getFullYear(), 0, 2);
          case 4:
            return new Date(janFourth.getFullYear(), 0, 1);
          case 5:
            return new Date(janFourth.getFullYear() - 1, 11, 31);
          case 6:
            return new Date(janFourth.getFullYear() - 1, 11, 30);
        }
      }
      function getWeekBasedYear(date) {
        var thisDate = addDays(
          new Date(date.tm_year + 1900, 0, 1),
          date.tm_yday,
        );
        var janFourthThisYear = new Date(thisDate.getFullYear(), 0, 4);
        var janFourthNextYear = new Date(thisDate.getFullYear() + 1, 0, 4);
        var firstWeekStartThisYear = getFirstWeekStartDate(janFourthThisYear);
        var firstWeekStartNextYear = getFirstWeekStartDate(janFourthNextYear);
        if (compareByDay(firstWeekStartThisYear, thisDate) <= 0) {
          if (compareByDay(firstWeekStartNextYear, thisDate) <= 0) {
            return thisDate.getFullYear() + 1;
          }
          return thisDate.getFullYear();
        }
        return thisDate.getFullYear() - 1;
      }
      var EXPANSION_RULES_2 = {
        "%a": (date) => WEEKDAYS[date.tm_wday].substring(0, 3),
        "%A": (date) => WEEKDAYS[date.tm_wday],
        "%b": (date) => MONTHS[date.tm_mon].substring(0, 3),
        "%B": (date) => MONTHS[date.tm_mon],
        "%C": (date) => {
          var year = date.tm_year + 1900;
          return leadingNulls((year / 100) | 0, 2);
        },
        "%d": (date) => leadingNulls(date.tm_mday, 2),
        "%e": (date) => leadingSomething(date.tm_mday, 2, " "),
        "%g": (date) => getWeekBasedYear(date).toString().substring(2),
        "%G": (date) => getWeekBasedYear(date),
        "%H": (date) => leadingNulls(date.tm_hour, 2),
        "%I": (date) => {
          var twelveHour = date.tm_hour;
          if (twelveHour == 0) twelveHour = 12;
          else if (twelveHour > 12) twelveHour -= 12;
          return leadingNulls(twelveHour, 2);
        },
        "%j": (date) =>
          leadingNulls(
            date.tm_mday +
              arraySum(
                isLeapYear(date.tm_year + 1900)
                  ? MONTH_DAYS_LEAP
                  : MONTH_DAYS_REGULAR,
                date.tm_mon - 1,
              ),
            3,
          ),
        "%m": (date) => leadingNulls(date.tm_mon + 1, 2),
        "%M": (date) => leadingNulls(date.tm_min, 2),
        "%n": () => "\n",
        "%p": (date) => {
          if (date.tm_hour >= 0 && date.tm_hour < 12) {
            return "AM";
          }
          return "PM";
        },
        "%S": (date) => leadingNulls(date.tm_sec, 2),
        "%t": () => "\t",
        "%u": (date) => date.tm_wday || 7,
        "%U": (date) => {
          var days = date.tm_yday + 7 - date.tm_wday;
          return leadingNulls(Math.floor(days / 7), 2);
        },
        "%V": (date) => {
          var val = Math.floor(
            (date.tm_yday + 7 - ((date.tm_wday + 6) % 7)) / 7,
          );
          if ((date.tm_wday + 371 - date.tm_yday - 2) % 7 <= 2) {
            val++;
          }
          if (!val) {
            val = 52;
            var dec31 = (date.tm_wday + 7 - date.tm_yday - 1) % 7;
            if (
              dec31 == 4 ||
              (dec31 == 5 && isLeapYear((date.tm_year % 400) - 1))
            ) {
              val++;
            }
          } else if (val == 53) {
            var jan1 = (date.tm_wday + 371 - date.tm_yday) % 7;
            if (jan1 != 4 && (jan1 != 3 || !isLeapYear(date.tm_year))) val = 1;
          }
          return leadingNulls(val, 2);
        },
        "%w": (date) => date.tm_wday,
        "%W": (date) => {
          var days = date.tm_yday + 7 - ((date.tm_wday + 6) % 7);
          return leadingNulls(Math.floor(days / 7), 2);
        },
        "%y": (date) => (date.tm_year + 1900).toString().substring(2),
        "%Y": (date) => date.tm_year + 1900,
        "%z": (date) => {
          var off = date.tm_gmtoff;
          var ahead = off >= 0;
          off = Math.abs(off) / 60;
          off = (off / 60) * 100 + (off % 60);
          return (ahead ? "+" : "-") + String("0000" + off).slice(-4);
        },
        "%Z": (date) => date.tm_zone,
        "%%": () => "%",
      };
      pattern = pattern.replace(/%%/g, "\0\0");
      for (var rule in EXPANSION_RULES_2) {
        if (pattern.includes(rule)) {
          pattern = pattern.replace(
            new RegExp(rule, "g"),
            EXPANSION_RULES_2[rule](date),
          );
        }
      }
      pattern = pattern.replace(/\0\0/g, "%");
      var bytes = intArrayFromString(pattern, false);
      if (bytes.length > maxsize) {
        return 0;
      }
      writeArrayToMemory(bytes, s);
      return bytes.length - 1;
    }
    function _strftime_l(s, maxsize, format, tm, loc) {
      s >>>= 0;
      maxsize >>>= 0;
      format >>>= 0;
      tm >>>= 0;
      loc >>>= 0;
      return _strftime(s, maxsize, format, tm);
    }
    PThread.init();
    var FSNode = function (parent, name, mode, rdev) {
      if (!parent) {
        parent = this;
      }
      this.parent = parent;
      this.mount = parent.mount;
      this.mounted = null;
      this.id = FS.nextInode++;
      this.name = name;
      this.mode = mode;
      this.node_ops = {};
      this.stream_ops = {};
      this.rdev = rdev;
    };
    var readMode = 292 | 73;
    var writeMode = 146;
    Object.defineProperties(FSNode.prototype, {
      read: {
        get: function () {
          return (this.mode & readMode) === readMode;
        },
        set: function (val) {
          val ? (this.mode |= readMode) : (this.mode &= ~readMode);
        },
      },
      write: {
        get: function () {
          return (this.mode & writeMode) === writeMode;
        },
        set: function (val) {
          val ? (this.mode |= writeMode) : (this.mode &= ~writeMode);
        },
      },
      isFolder: {
        get: function () {
          return FS.isDir(this.mode);
        },
      },
      isDevice: {
        get: function () {
          return FS.isChrdev(this.mode);
        },
      },
    });
    FS.FSNode = FSNode;
    FS.createPreloadedFile = FS_createPreloadedFile;
    FS.staticInit();
    Module["FS_createPath"] = FS.createPath;
    Module["FS_createDataFile"] = FS.createDataFile;
    Module["FS_createPreloadedFile"] = FS.createPreloadedFile;
    Module["FS_unlink"] = FS.unlink;
    Module["FS_createLazyFile"] = FS.createLazyFile;
    Module["FS_createDevice"] = FS.createDevice;
    embind_init_charCodes();
    BindingError = Module["BindingError"] = class BindingError extends Error {
      constructor(message) {
        super(message);
        this.name = "BindingError";
      }
    };
    InternalError = Module["InternalError"] = class InternalError extends (
      Error
    ) {
      constructor(message) {
        super(message);
        this.name = "InternalError";
      }
    };
    init_ClassHandle();
    init_embind();
    init_RegisteredPointer();
    UnboundTypeError = Module["UnboundTypeError"] = extendError(
      Error,
      "UnboundTypeError",
    );
    handleAllocatorInit();
    init_emval();
    var proxiedFunctionTable = [
      _proc_exit,
      exitOnMainThread,
      pthreadCreateProxied,
      ___syscall_chmod,
      ___syscall_faccessat,
      ___syscall_fadvise64,
      ___syscall_fchmod,
      ___syscall_fcntl64,
      ___syscall_fstat64,
      ___syscall_getcwd,
      ___syscall_getdents64,
      ___syscall_ioctl,
      ___syscall_lstat64,
      ___syscall_mkdirat,
      ___syscall_newfstatat,
      ___syscall_openat,
      ___syscall_readlinkat,
      ___syscall_renameat,
      ___syscall_stat64,
      ___syscall_unlinkat,
      __emscripten_runtime_keepalive_clear,
      __mmap_js,
      __munmap_js,
      __setitimer_js,
      _emscripten_force_exit,
      _environ_get,
      _environ_sizes_get,
      _fd_close,
      _fd_fdstat_get,
      _fd_pread,
      _fd_pwrite,
      _fd_read,
      _fd_seek,
      _fd_write,
    ];
    var wasmImports = {
      Qb: __asyncjs__fetch_asset,
      Lc: ___call_sighandler,
      r: ___cxa_begin_catch,
      D: ___cxa_end_catch,
      b: ___cxa_find_matching_catch_2,
      l: ___cxa_find_matching_catch_3,
      Na: ___cxa_find_matching_catch_4,
      nb: ___cxa_get_exception_ptr,
      Ua: ___cxa_rethrow,
      Bc: ___cxa_rethrow_primary_exception,
      y: ___cxa_throw,
      Cc: ___cxa_uncaught_exceptions,
      Rc: ___emscripten_init_main_thread_js,
      bb: ___emscripten_thread_cleanup,
      Nc: ___pthread_create_js,
      f: ___resumeException,
      gb: ___syscall_chmod,
      $c: ___syscall_faccessat,
      _b: ___syscall_fadvise64,
      Xc: ___syscall_fchmod,
      hb: ___syscall_fcntl64,
      Wc: ___syscall_fstat64,
      Sc: ___syscall_getcwd,
      Kc: ___syscall_getdents64,
      cd: ___syscall_ioctl,
      Tc: ___syscall_lstat64,
      Pc: ___syscall_mkdirat,
      Uc: ___syscall_newfstatat,
      eb: ___syscall_openat,
      Jc: ___syscall_readlinkat,
      Ic: ___syscall_renameat,
      Vc: ___syscall_stat64,
      Ec: ___syscall_unlinkat,
      cc: __embind_register_bigint,
      gd: __embind_register_bool,
      H: __embind_register_class,
      da: __embind_register_class_class_function,
      wa: __embind_register_class_class_property,
      N: __embind_register_class_constructor,
      z: __embind_register_class_function,
      x: __embind_register_class_property,
      fd: __embind_register_emval,
      sb: __embind_register_enum,
      Ea: __embind_register_enum_value,
      jb: __embind_register_float,
      ld: __embind_register_function,
      oa: __embind_register_integer,
      T: __embind_register_memory_view,
      qa: __embind_register_smart_ptr,
      ib: __embind_register_std_string,
      Wa: __embind_register_std_wstring,
      hd: __embind_register_void,
      _c: __emscripten_get_now_is_monotonic,
      Fc: __emscripten_notify_mailbox_postmessage,
      Oc: __emscripten_receive_on_main_thread_js,
      Mc: __emscripten_runtime_keepalive_clear,
      Qc: __emscripten_thread_mailbox_await,
      Zc: __emscripten_thread_set_strongref,
      ra: __emval_as,
      lc: __emval_as_int64,
      kc: __emval_as_uint64,
      Ha: __emval_call,
      la: __emval_call_method,
      yd: __emval_decref,
      kd: __emval_equals,
      od: __emval_get_global,
      ka: __emval_get_method_caller,
      Ad: __emval_get_property,
      $a: __emval_incref,
      pd: __emval_instanceof,
      Ub: __emval_new_array,
      Rb: __emval_new_cstring,
      Tb: __emval_new_object,
      Vb: __emval_run_destructors,
      Sb: __emval_set_property,
      F: __emval_take_value,
      qd: __emval_typeof,
      $b: __mmap_js,
      ac: __munmap_js,
      ab: __setitimer_js,
      fa: _abort,
      Pb: addToLoadedFiles,
      rd: downloadJS,
      cb: _emscripten_check_blocking_allowed,
      fb: _emscripten_date_now,
      Yc: _emscripten_exit_with_live_runtime,
      tb: _emscripten_force_exit,
      Gc: _emscripten_get_heap_max,
      ba: _emscripten_get_now,
      Hc: _emscripten_num_logical_cores,
      Dc: _emscripten_resize_heap,
      dd: _environ_get,
      ed: _environ_sizes_get,
      xa: _exit,
      Ia: _fd_close,
      db: _fd_fdstat_get,
      Zb: _fd_pread,
      Yb: _fd_pwrite,
      bd: _fd_read,
      bc: _fd_seek,
      Va: _fd_write,
      ub: invoke_dddd,
      jd: invoke_ddiiiii,
      s: invoke_di,
      P: invoke_did,
      nd: invoke_didii,
      pa: invoke_dif,
      Ta: invoke_dii,
      sa: invoke_diii,
      mc: invoke_dj,
      Aa: invoke_fi,
      Kb: invoke_fid,
      Gb: invoke_fif,
      mb: invoke_fii,
      Sa: invoke_fiii,
      xd: invoke_fiiid,
      k: invoke_i,
      Ab: invoke_idddii,
      Bb: invoke_idddiii,
      La: invoke_iddii,
      Ma: invoke_iddiii,
      zb: invoke_idi,
      Fa: invoke_idii,
      ob: invoke_idiiiiii,
      Ja: invoke_idiiiiiii,
      Eb: invoke_ifii,
      c: invoke_ii,
      Q: invoke_iid,
      J: invoke_iidd,
      _a: invoke_iiddddddiiii,
      xb: invoke_iidi,
      na: invoke_iidii,
      aa: invoke_iidiii,
      vd: invoke_iidiiii,
      Za: invoke_iidiiiii,
      M: invoke_iif,
      ta: invoke_iiffi,
      id: invoke_iifi,
      e: invoke_iii,
      q: invoke_iiid,
      sd: invoke_iiidd,
      ma: invoke_iiidddii,
      td: invoke_iiiddi,
      zd: invoke_iiiddii,
      ca: invoke_iiidi,
      w: invoke_iiidii,
      vb: invoke_iiidiiidiiiidiif,
      wb: invoke_iiidiiiii,
      ya: invoke_iiiff,
      Ra: invoke_iiifi,
      h: invoke_iiii,
      R: invoke_iiiid,
      I: invoke_iiiiddd,
      wd: invoke_iiiidii,
      ua: invoke_iiiidiii,
      md: invoke_iiiidiiii,
      yb: invoke_iiiidiiiiii,
      Hb: invoke_iiiifffffiiff,
      m: invoke_iiiii,
      L: invoke_iiiiid,
      Ca: invoke_iiiiidiiii,
      o: invoke_iiiiii,
      Pa: invoke_iiiiiid,
      B: invoke_iiiiiii,
      rb: invoke_iiiiiiidddi,
      C: invoke_iiiiiiii,
      ud: invoke_iiiiiiiidi,
      A: invoke_iiiiiiiii,
      va: invoke_iiiiiiiiii,
      kb: invoke_iiiiiiiiiii,
      Da: invoke_iiiiiiiiiiii,
      za: invoke_iiiiiiiiiiiii,
      Oa: invoke_iiiiiiiiiiiiii,
      Cb: invoke_iiiiiiiiiiiiiiiiiiii,
      Xb: invoke_iiiiij,
      dc: invoke_iiiij,
      ec: invoke_iiiijii,
      gc: invoke_iiiijjii,
      sc: invoke_iiijj,
      rc: invoke_iiijji,
      jc: invoke_iij,
      zc: invoke_j,
      wc: invoke_ji,
      pc: invoke_jii,
      yc: invoke_jiii,
      Wb: invoke_jiiii,
      xc: invoke_jiij,
      p: invoke_v,
      Z: invoke_vd,
      pb: invoke_vdiii,
      Fb: invoke_vfiiii,
      j: invoke_vi,
      _: invoke_vid,
      Mb: invoke_vidddi,
      Jb: invoke_viddi,
      Qa: invoke_vidi,
      ea: invoke_vidii,
      Ka: invoke_vidiii,
      qb: invoke_vidiiii,
      U: invoke_vif,
      V: invoke_vifii,
      d: invoke_vii,
      W: invoke_viid,
      Lb: invoke_viiddddi,
      Nb: invoke_viiddi,
      ja: invoke_viidi,
      Xa: invoke_viidii,
      t: invoke_viif,
      g: invoke_viii,
      Y: invoke_viiid,
      Ob: invoke_viiiddddi,
      O: invoke_viiidi,
      ha: invoke_viiidii,
      Ba: invoke_viiidiiiii,
      Db: invoke_viiif,
      i: invoke_viiii,
      E: invoke_viiiid,
      ia: invoke_viiiidi,
      Ya: invoke_viiiidiiiiii,
      n: invoke_viiiii,
      S: invoke_viiiiid,
      X: invoke_viiiiidi,
      v: invoke_viiiiii,
      G: invoke_viiiiiii,
      Ib: invoke_viiiiiiid,
      K: invoke_viiiiiiii,
      $: invoke_viiiiiiiii,
      ga: invoke_viiiiiiiiii,
      lb: invoke_viiiiiiiiiiiii,
      Ga: invoke_viiiiiiiiiiiiiii,
      ic: invoke_viiiijii,
      fc: invoke_viiijii,
      hc: invoke_viiijjii,
      vc: invoke_viij,
      nc: invoke_viiji,
      qc: invoke_vij,
      uc: invoke_viji,
      tc: invoke_vijii,
      oc: invoke_vijji,
      u: _llvm_eh_typeid_for,
      a: wasmMemory || Module["wasmMemory"],
      ad: _proc_exit,
      Ac: _strftime_l,
    };
    var wasmExports = createWasm();
    var ___wasm_call_ctors = () => (___wasm_call_ctors = wasmExports["Bd"])();
    var _pthread_self = (Module["_pthread_self"] = () =>
      (_pthread_self = Module["_pthread_self"] = wasmExports["Cd"])());
    var ___cxa_free_exception = (a0) =>
      (___cxa_free_exception = wasmExports["__cxa_free_exception"])(a0);
    var _free = (a0) => (_free = wasmExports["Ed"])(a0);
    var _malloc = (a0) => (_malloc = wasmExports["Fd"])(a0);
    var ___errno_location = () => (___errno_location = wasmExports["Gd"])();
    var __emscripten_tls_init = (Module["__emscripten_tls_init"] = () =>
      (__emscripten_tls_init = Module["__emscripten_tls_init"] =
        wasmExports["Hd"])());
    var _emscripten_builtin_memalign = (a0, a1) =>
      (_emscripten_builtin_memalign = wasmExports["Id"])(a0, a1);
    var ___getTypeName = (a0) => (___getTypeName = wasmExports["Jd"])(a0);
    var __embind_initialize_bindings = (Module["__embind_initialize_bindings"] =
      () =>
        (__embind_initialize_bindings = Module["__embind_initialize_bindings"] =
          wasmExports["Kd"])());
    var __emscripten_thread_init = (Module["__emscripten_thread_init"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
    ) =>
      (__emscripten_thread_init = Module["__emscripten_thread_init"] =
        wasmExports["Ld"])(a0, a1, a2, a3, a4, a5));
    var __emscripten_thread_crashed = (Module["__emscripten_thread_crashed"] =
      () =>
        (__emscripten_thread_crashed = Module["__emscripten_thread_crashed"] =
          wasmExports["Md"])());
    var _emscripten_main_thread_process_queued_calls = () =>
      (_emscripten_main_thread_process_queued_calls =
        wasmExports["emscripten_main_thread_process_queued_calls"])();
    var _emscripten_main_runtime_thread_id = () =>
      (_emscripten_main_runtime_thread_id =
        wasmExports["emscripten_main_runtime_thread_id"])();
    var __emscripten_run_on_main_thread_js = (a0, a1, a2, a3) =>
      (__emscripten_run_on_main_thread_js = wasmExports["Nd"])(a0, a1, a2, a3);
    var __emscripten_thread_free_data = (a0) =>
      (__emscripten_thread_free_data = wasmExports["Od"])(a0);
    var __emscripten_thread_exit = (Module["__emscripten_thread_exit"] = (a0) =>
      (__emscripten_thread_exit = Module["__emscripten_thread_exit"] =
        wasmExports["Pd"])(a0));
    var __emscripten_timeout = (a0, a1) =>
      (__emscripten_timeout = wasmExports["Qd"])(a0, a1);
    var __emscripten_check_mailbox = (Module["__emscripten_check_mailbox"] =
      () =>
        (__emscripten_check_mailbox = Module["__emscripten_check_mailbox"] =
          wasmExports["Rd"])());
    var _setThrew = (a0, a1) => (_setThrew = wasmExports["Sd"])(a0, a1);
    var setTempRet0 = (a0) => (setTempRet0 = wasmExports["Td"])(a0);
    var _emscripten_stack_set_limits = (a0, a1) =>
      (_emscripten_stack_set_limits = wasmExports["Ud"])(a0, a1);
    var stackSave = () => (stackSave = wasmExports["Vd"])();
    var stackRestore = (a0) => (stackRestore = wasmExports["Wd"])(a0);
    var stackAlloc = (a0) => (stackAlloc = wasmExports["Xd"])(a0);
    var ___cxa_decrement_exception_refcount = (a0) =>
      (___cxa_decrement_exception_refcount = wasmExports["Yd"])(a0);
    var ___cxa_increment_exception_refcount = (a0) =>
      (___cxa_increment_exception_refcount = wasmExports["Zd"])(a0);
    var ___cxa_can_catch = (a0, a1, a2) =>
      (___cxa_can_catch = wasmExports["_d"])(a0, a1, a2);
    var ___cxa_is_pointer_type = (a0) =>
      (___cxa_is_pointer_type = wasmExports["$d"])(a0);
    var dynCall_iii = (Module["dynCall_iii"] = (a0, a1, a2) =>
      (dynCall_iii = Module["dynCall_iii"] = wasmExports["ae"])(a0, a1, a2));
    var dynCall_iiii = (Module["dynCall_iiii"] = (a0, a1, a2, a3) =>
      (dynCall_iiii = Module["dynCall_iiii"] = wasmExports["be"])(
        a0,
        a1,
        a2,
        a3,
      ));
    var dynCall_vi = (Module["dynCall_vi"] = (a0, a1) =>
      (dynCall_vi = Module["dynCall_vi"] = wasmExports["ce"])(a0, a1));
    var dynCall_ii = (Module["dynCall_ii"] = (a0, a1) =>
      (dynCall_ii = Module["dynCall_ii"] = wasmExports["de"])(a0, a1));
    var dynCall_iiiiii = (Module["dynCall_iiiiii"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_iiiiii = Module["dynCall_iiiiii"] = wasmExports["ee"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_vii = (Module["dynCall_vii"] = (a0, a1, a2) =>
      (dynCall_vii = Module["dynCall_vii"] = wasmExports["fe"])(a0, a1, a2));
    var dynCall_i = (Module["dynCall_i"] = (a0) =>
      (dynCall_i = Module["dynCall_i"] = wasmExports["ge"])(a0));
    var dynCall_viiiii = (Module["dynCall_viiiii"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_viiiii = Module["dynCall_viiiii"] = wasmExports["he"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_v = (Module["dynCall_v"] = (a0) =>
      (dynCall_v = Module["dynCall_v"] = wasmExports["ie"])(a0));
    var dynCall_viii = (Module["dynCall_viii"] = (a0, a1, a2, a3) =>
      (dynCall_viii = Module["dynCall_viii"] = wasmExports["je"])(
        a0,
        a1,
        a2,
        a3,
      ));
    var dynCall_vid = (Module["dynCall_vid"] = (a0, a1, a2) =>
      (dynCall_vid = Module["dynCall_vid"] = wasmExports["ke"])(a0, a1, a2));
    var dynCall_di = (Module["dynCall_di"] = (a0, a1) =>
      (dynCall_di = Module["dynCall_di"] = wasmExports["le"])(a0, a1));
    var dynCall_iiiii = (Module["dynCall_iiiii"] = (a0, a1, a2, a3, a4) =>
      (dynCall_iiiii = Module["dynCall_iiiii"] = wasmExports["me"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_viiii = (Module["dynCall_viiii"] = (a0, a1, a2, a3, a4) =>
      (dynCall_viiii = Module["dynCall_viiii"] = wasmExports["ne"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_viid = (Module["dynCall_viid"] = (a0, a1, a2, a3) =>
      (dynCall_viid = Module["dynCall_viid"] = wasmExports["oe"])(
        a0,
        a1,
        a2,
        a3,
      ));
    var dynCall_dii = (Module["dynCall_dii"] = (a0, a1, a2) =>
      (dynCall_dii = Module["dynCall_dii"] = wasmExports["pe"])(a0, a1, a2));
    var dynCall_viiid = (Module["dynCall_viiid"] = (a0, a1, a2, a3, a4) =>
      (dynCall_viiid = Module["dynCall_viiid"] = wasmExports["qe"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_iiiid = (Module["dynCall_iiiid"] = (a0, a1, a2, a3, a4) =>
      (dynCall_iiiid = Module["dynCall_iiiid"] = wasmExports["re"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_iiiiiiii = (Module["dynCall_iiiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
    ) =>
      (dynCall_iiiiiiii = Module["dynCall_iiiiiiii"] = wasmExports["se"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
      ));
    var dynCall_viiiiii = (Module["dynCall_viiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
    ) =>
      (dynCall_viiiiii = Module["dynCall_viiiiii"] = wasmExports["te"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
      ));
    var dynCall_iiiiiii = (Module["dynCall_iiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
    ) =>
      (dynCall_iiiiiii = Module["dynCall_iiiiiii"] = wasmExports["ue"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
      ));
    var dynCall_diii = (Module["dynCall_diii"] = (a0, a1, a2, a3) =>
      (dynCall_diii = Module["dynCall_diii"] = wasmExports["ve"])(
        a0,
        a1,
        a2,
        a3,
      ));
    var dynCall_j = (Module["dynCall_j"] = (a0) =>
      (dynCall_j = Module["dynCall_j"] = wasmExports["we"])(a0));
    var dynCall_iiid = (Module["dynCall_iiid"] = (a0, a1, a2, a3) =>
      (dynCall_iiid = Module["dynCall_iiid"] = wasmExports["xe"])(
        a0,
        a1,
        a2,
        a3,
      ));
    var dynCall_iiiiid = (Module["dynCall_iiiiid"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_iiiiid = Module["dynCall_iiiiid"] = wasmExports["ye"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_vd = (Module["dynCall_vd"] = (a0, a1) =>
      (dynCall_vd = Module["dynCall_vd"] = wasmExports["ze"])(a0, a1));
    var dynCall_iiiiiiiiiiii = (Module["dynCall_iiiiiiiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
    ) =>
      (dynCall_iiiiiiiiiiii = Module["dynCall_iiiiiiiiiiii"] =
        wasmExports["Ae"])(a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11));
    var dynCall_iid = (Module["dynCall_iid"] = (a0, a1, a2) =>
      (dynCall_iid = Module["dynCall_iid"] = wasmExports["Be"])(a0, a1, a2));
    var dynCall_viidi = (Module["dynCall_viidi"] = (a0, a1, a2, a3, a4) =>
      (dynCall_viidi = Module["dynCall_viidi"] = wasmExports["Ce"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_iidiii = (Module["dynCall_iidiii"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_iidiii = Module["dynCall_iidiii"] = wasmExports["De"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_iiiiiiiii = (Module["dynCall_iiiiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
    ) =>
      (dynCall_iiiiiiiii = Module["dynCall_iiiiiiiii"] = wasmExports["Ee"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
      ));
    var dynCall_iiiiiiiiii = (Module["dynCall_iiiiiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
    ) =>
      (dynCall_iiiiiiiiii = Module["dynCall_iiiiiiiiii"] = wasmExports["Fe"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
      ));
    var dynCall_iiidi = (Module["dynCall_iiidi"] = (a0, a1, a2, a3, a4) =>
      (dynCall_iiidi = Module["dynCall_iiidi"] = wasmExports["Ge"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_fiii = (Module["dynCall_fiii"] = (a0, a1, a2, a3) =>
      (dynCall_fiii = Module["dynCall_fiii"] = wasmExports["He"])(
        a0,
        a1,
        a2,
        a3,
      ));
    var dynCall_iiifi = (Module["dynCall_iiifi"] = (a0, a1, a2, a3, a4) =>
      (dynCall_iiifi = Module["dynCall_iiifi"] = wasmExports["Ie"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_viif = (Module["dynCall_viif"] = (a0, a1, a2, a3) =>
      (dynCall_viif = Module["dynCall_viif"] = wasmExports["Je"])(
        a0,
        a1,
        a2,
        a3,
      ));
    var dynCall_iiffi = (Module["dynCall_iiffi"] = (a0, a1, a2, a3, a4) =>
      (dynCall_iiffi = Module["dynCall_iiffi"] = wasmExports["Ke"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_fif = (Module["dynCall_fif"] = (a0, a1, a2) =>
      (dynCall_fif = Module["dynCall_fif"] = wasmExports["Le"])(a0, a1, a2));
    var dynCall_iif = (Module["dynCall_iif"] = (a0, a1, a2) =>
      (dynCall_iif = Module["dynCall_iif"] = wasmExports["Me"])(a0, a1, a2));
    var dynCall_dif = (Module["dynCall_dif"] = (a0, a1, a2) =>
      (dynCall_dif = Module["dynCall_dif"] = wasmExports["Ne"])(a0, a1, a2));
    var dynCall_viiiiiii = (Module["dynCall_viiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
    ) =>
      (dynCall_viiiiiii = Module["dynCall_viiiiiii"] = wasmExports["Oe"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
      ));
    var dynCall_viiiiiiii = (Module["dynCall_viiiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
    ) =>
      (dynCall_viiiiiiii = Module["dynCall_viiiiiiii"] = wasmExports["Pe"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
      ));
    var dynCall_iidii = (Module["dynCall_iidii"] = (a0, a1, a2, a3, a4) =>
      (dynCall_iidii = Module["dynCall_iidii"] = wasmExports["Qe"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_viiidiiiii = (Module["dynCall_viiidiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
    ) =>
      (dynCall_viiidiiiii = Module["dynCall_viiidiiiii"] = wasmExports["Re"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
      ));
    var dynCall_viiiidi = (Module["dynCall_viiiidi"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
    ) =>
      (dynCall_viiiidi = Module["dynCall_viiiidi"] = wasmExports["Se"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
      ));
    var dynCall_viiidii = (Module["dynCall_viiidii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
    ) =>
      (dynCall_viiidii = Module["dynCall_viiidii"] = wasmExports["Te"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
      ));
    var dynCall_viiiid = (Module["dynCall_viiiid"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_viiiid = Module["dynCall_viiiid"] = wasmExports["Ue"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_iiiidiii = (Module["dynCall_iiiidiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
    ) =>
      (dynCall_iiiidiii = Module["dynCall_iiiidiii"] = wasmExports["Ve"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
      ));
    var dynCall_iiiiidiiii = (Module["dynCall_iiiiidiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
    ) =>
      (dynCall_iiiiidiiii = Module["dynCall_iiiiidiiii"] = wasmExports["We"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
      ));
    var dynCall_viiiiid = (Module["dynCall_viiiiid"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
    ) =>
      (dynCall_viiiiid = Module["dynCall_viiiiid"] = wasmExports["Xe"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
      ));
    var dynCall_viiiiidi = (Module["dynCall_viiiiidi"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
    ) =>
      (dynCall_viiiiidi = Module["dynCall_viiiiidi"] = wasmExports["Ye"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
      ));
    var dynCall_viiiddddi = (Module["dynCall_viiiddddi"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
    ) =>
      (dynCall_viiiddddi = Module["dynCall_viiiddddi"] = wasmExports["Ze"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
      ));
    var dynCall_viiddi = (Module["dynCall_viiddi"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_viiddi = Module["dynCall_viiddi"] = wasmExports["_e"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_vidddi = (Module["dynCall_vidddi"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_vidddi = Module["dynCall_vidddi"] = wasmExports["$e"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_viiddddi = (Module["dynCall_viiddddi"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
    ) =>
      (dynCall_viiddddi = Module["dynCall_viiddddi"] = wasmExports["af"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
      ));
    var dynCall_fid = (Module["dynCall_fid"] = (a0, a1, a2) =>
      (dynCall_fid = Module["dynCall_fid"] = wasmExports["bf"])(a0, a1, a2));
    var dynCall_iiiiiid = (Module["dynCall_iiiiiid"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
    ) =>
      (dynCall_iiiiiid = Module["dynCall_iiiiiid"] = wasmExports["cf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
      ));
    var dynCall_vif = (Module["dynCall_vif"] = (a0, a1, a2) =>
      (dynCall_vif = Module["dynCall_vif"] = wasmExports["df"])(a0, a1, a2));
    var dynCall_viiidi = (Module["dynCall_viiidi"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_viiidi = Module["dynCall_viiidi"] = wasmExports["ef"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_viddi = (Module["dynCall_viddi"] = (a0, a1, a2, a3, a4) =>
      (dynCall_viddi = Module["dynCall_viddi"] = wasmExports["ff"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_viiiiiiid = (Module["dynCall_viiiiiiid"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
    ) =>
      (dynCall_viiiiiiid = Module["dynCall_viiiiiiid"] = wasmExports["gf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
      ));
    var dynCall_jiij = (Module["dynCall_jiij"] = (a0, a1, a2, a3, a4) =>
      (dynCall_jiij = Module["dynCall_jiij"] = wasmExports["hf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_ji = (Module["dynCall_ji"] = (a0, a1) =>
      (dynCall_ji = Module["dynCall_ji"] = wasmExports["jf"])(a0, a1));
    var dynCall_iiiifffffiiff = (Module["dynCall_iiiifffffiiff"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
      a12,
    ) =>
      (dynCall_iiiifffffiiff = Module["dynCall_iiiifffffiiff"] =
        wasmExports["kf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
        a10,
        a11,
        a12,
      ));
    var dynCall_jif = (Module["dynCall_jif"] = (a0, a1, a2) =>
      (dynCall_jif = Module["dynCall_jif"] = wasmExports["lf"])(a0, a1, a2));
    var dynCall_vifii = (Module["dynCall_vifii"] = (a0, a1, a2, a3, a4) =>
      (dynCall_vifii = Module["dynCall_vifii"] = wasmExports["mf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_vfiiii = (Module["dynCall_vfiiii"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_vfiiii = Module["dynCall_vfiiii"] = wasmExports["nf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_ifii = (Module["dynCall_ifii"] = (a0, a1, a2, a3) =>
      (dynCall_ifii = Module["dynCall_ifii"] = wasmExports["of"])(
        a0,
        a1,
        a2,
        a3,
      ));
    var dynCall_jiiijji = (Module["dynCall_jiiijji"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
    ) =>
      (dynCall_jiiijji = Module["dynCall_jiiijji"] = wasmExports["pf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
      ));
    var dynCall_viiif = (Module["dynCall_viiif"] = (a0, a1, a2, a3, a4) =>
      (dynCall_viiif = Module["dynCall_viiif"] = wasmExports["qf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_iiiiiiiiiiiiiiiiiiii = (Module["dynCall_iiiiiiiiiiiiiiiiiiii"] =
      (
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
        a10,
        a11,
        a12,
        a13,
        a14,
        a15,
        a16,
        a17,
        a18,
        a19,
      ) =>
        (dynCall_iiiiiiiiiiiiiiiiiiii = Module["dynCall_iiiiiiiiiiiiiiiiiiii"] =
          wasmExports["rf"])(
          a0,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a8,
          a9,
          a10,
          a11,
          a12,
          a13,
          a14,
          a15,
          a16,
          a17,
          a18,
          a19,
        ));
    var dynCall_viiiiiiiiii = (Module["dynCall_viiiiiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
    ) =>
      (dynCall_viiiiiiiiii = Module["dynCall_viiiiiiiiii"] = wasmExports["sf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
        a10,
      ));
    var dynCall_viiiiiiiii = (Module["dynCall_viiiiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
    ) =>
      (dynCall_viiiiiiiii = Module["dynCall_viiiiiiiii"] = wasmExports["tf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
      ));
    var dynCall_iiiiiiiiiiiii = (Module["dynCall_iiiiiiiiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
      a12,
    ) =>
      (dynCall_iiiiiiiiiiiii = Module["dynCall_iiiiiiiiiiiii"] =
        wasmExports["uf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
        a10,
        a11,
        a12,
      ));
    var dynCall_ff = (Module["dynCall_ff"] = (a0, a1) =>
      (dynCall_ff = Module["dynCall_ff"] = wasmExports["vf"])(a0, a1));
    var dynCall_fff = (Module["dynCall_fff"] = (a0, a1, a2) =>
      (dynCall_fff = Module["dynCall_fff"] = wasmExports["wf"])(a0, a1, a2));
    var dynCall_iiijiii = (Module["dynCall_iiijiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
    ) =>
      (dynCall_iiijiii = Module["dynCall_iiijiii"] = wasmExports["xf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
      ));
    var dynCall_jii = (Module["dynCall_jii"] = (a0, a1, a2) =>
      (dynCall_jii = Module["dynCall_jii"] = wasmExports["yf"])(a0, a1, a2));
    var dynCall_iiij = (Module["dynCall_iiij"] = (a0, a1, a2, a3, a4) =>
      (dynCall_iiij = Module["dynCall_iiij"] = wasmExports["zf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_iiiji = (Module["dynCall_iiiji"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_iiiji = Module["dynCall_iiiji"] = wasmExports["Af"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_iiiiiiiiiiiiii = (Module["dynCall_iiiiiiiiiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
      a12,
      a13,
    ) =>
      (dynCall_iiiiiiiiiiiiii = Module["dynCall_iiiiiiiiiiiiii"] =
        wasmExports["Bf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
        a10,
        a11,
        a12,
        a13,
      ));
    var dynCall_iiddddddiiii = (Module["dynCall_iiddddddiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
    ) =>
      (dynCall_iiddddddiiii = Module["dynCall_iiddddddiiii"] =
        wasmExports["Cf"])(a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11));
    var dynCall_iidiiiii = (Module["dynCall_iidiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
    ) =>
      (dynCall_iidiiiii = Module["dynCall_iidiiiii"] = wasmExports["Df"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
      ));
    var dynCall_iddiii = (Module["dynCall_iddiii"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_iddiii = Module["dynCall_iddiii"] = wasmExports["Ef"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_iddii = (Module["dynCall_iddii"] = (a0, a1, a2, a3, a4) =>
      (dynCall_iddii = Module["dynCall_iddii"] = wasmExports["Ff"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_idddiii = (Module["dynCall_idddiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
    ) =>
      (dynCall_idddiii = Module["dynCall_idddiii"] = wasmExports["Gf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
      ));
    var dynCall_idddii = (Module["dynCall_idddii"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_idddii = Module["dynCall_idddii"] = wasmExports["Hf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_idii = (Module["dynCall_idii"] = (a0, a1, a2, a3) =>
      (dynCall_idii = Module["dynCall_idii"] = wasmExports["If"])(
        a0,
        a1,
        a2,
        a3,
      ));
    var dynCall_idi = (Module["dynCall_idi"] = (a0, a1, a2) =>
      (dynCall_idi = Module["dynCall_idi"] = wasmExports["Jf"])(a0, a1, a2));
    var dynCall_fiiid = (Module["dynCall_fiiid"] = (a0, a1, a2, a3, a4) =>
      (dynCall_fiiid = Module["dynCall_fiiid"] = wasmExports["Kf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_iidi = (Module["dynCall_iidi"] = (a0, a1, a2, a3) =>
      (dynCall_iidi = Module["dynCall_iidi"] = wasmExports["Lf"])(
        a0,
        a1,
        a2,
        a3,
      ));
    var dynCall_iiiidii = (Module["dynCall_iiiidii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
    ) =>
      (dynCall_iiiidii = Module["dynCall_iiiidii"] = wasmExports["Mf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
      ));
    var dynCall_iiiidiiiiii = (Module["dynCall_iiiidiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
    ) =>
      (dynCall_iiiidiiiiii = Module["dynCall_iiiidiiiiii"] = wasmExports["Nf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
        a10,
      ));
    var dynCall_iiidiiiii = (Module["dynCall_iiidiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
    ) =>
      (dynCall_iiidiiiii = Module["dynCall_iiidiiiii"] = wasmExports["Of"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
      ));
    var dynCall_iiidiiidiiiidiif = (Module["dynCall_iiidiiidiiiidiif"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
      a12,
      a13,
      a14,
      a15,
    ) =>
      (dynCall_iiidiiidiiiidiif = Module["dynCall_iiidiiidiiiidiif"] =
        wasmExports["Pf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
        a10,
        a11,
        a12,
        a13,
        a14,
        a15,
      ));
    var dynCall_dddd = (Module["dynCall_dddd"] = (a0, a1, a2, a3) =>
      (dynCall_dddd = Module["dynCall_dddd"] = wasmExports["Qf"])(
        a0,
        a1,
        a2,
        a3,
      ));
    var dynCall_iidiiii = (Module["dynCall_iidiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
    ) =>
      (dynCall_iidiiii = Module["dynCall_iidiiii"] = wasmExports["Rf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
      ));
    var dynCall_iiiddii = (Module["dynCall_iiiddii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
    ) =>
      (dynCall_iiiddii = Module["dynCall_iiiddii"] = wasmExports["Sf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
      ));
    var dynCall_iiiiiiiidi = (Module["dynCall_iiiiiiiidi"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
    ) =>
      (dynCall_iiiiiiiidi = Module["dynCall_iiiiiiiidi"] = wasmExports["Tf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
      ));
    var dynCall_iiiddi = (Module["dynCall_iiiddi"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_iiiddi = Module["dynCall_iiiddi"] = wasmExports["Uf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_iiidd = (Module["dynCall_iiidd"] = (a0, a1, a2, a3, a4) =>
      (dynCall_iiidd = Module["dynCall_iiidd"] = wasmExports["Vf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_iiiif = (Module["dynCall_iiiif"] = (a0, a1, a2, a3, a4) =>
      (dynCall_iiiif = Module["dynCall_iiiif"] = wasmExports["Wf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_fi = (Module["dynCall_fi"] = (a0, a1) =>
      (dynCall_fi = Module["dynCall_fi"] = wasmExports["Xf"])(a0, a1));
    var dynCall_did = (Module["dynCall_did"] = (a0, a1, a2) =>
      (dynCall_did = Module["dynCall_did"] = wasmExports["Yf"])(a0, a1, a2));
    var dynCall_iiidii = (Module["dynCall_iiidii"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_iiidii = Module["dynCall_iiidii"] = wasmExports["Zf"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_iiidddii = (Module["dynCall_iiidddii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
    ) =>
      (dynCall_iiidddii = Module["dynCall_iiidddii"] = wasmExports["_f"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
      ));
    var dynCall_didii = (Module["dynCall_didii"] = (a0, a1, a2, a3, a4) =>
      (dynCall_didii = Module["dynCall_didii"] = wasmExports["$f"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_iiiiiiidddi = (Module["dynCall_iiiiiiidddi"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
    ) =>
      (dynCall_iiiiiiidddi = Module["dynCall_iiiiiiidddi"] = wasmExports["ag"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
        a10,
      ));
    var dynCall_iidd = (Module["dynCall_iidd"] = (a0, a1, a2, a3) =>
      (dynCall_iidd = Module["dynCall_iidd"] = wasmExports["bg"])(
        a0,
        a1,
        a2,
        a3,
      ));
    var dynCall_viij = (Module["dynCall_viij"] = (a0, a1, a2, a3, a4) =>
      (dynCall_viij = Module["dynCall_viij"] = wasmExports["cg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_viji = (Module["dynCall_viji"] = (a0, a1, a2, a3, a4) =>
      (dynCall_viji = Module["dynCall_viji"] = wasmExports["dg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_vijii = (Module["dynCall_vijii"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_vijii = Module["dynCall_vijii"] = wasmExports["eg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_iiijj = (Module["dynCall_iiijj"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
    ) =>
      (dynCall_iiijj = Module["dynCall_iiijj"] = wasmExports["fg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
      ));
    var dynCall_iiijji = (Module["dynCall_iiijji"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
    ) =>
      (dynCall_iiijji = Module["dynCall_iiijji"] = wasmExports["gg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
      ));
    var dynCall_vij = (Module["dynCall_vij"] = (a0, a1, a2, a3) =>
      (dynCall_vij = Module["dynCall_vij"] = wasmExports["hg"])(
        a0,
        a1,
        a2,
        a3,
      ));
    var dynCall_vijji = (Module["dynCall_vijji"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
    ) =>
      (dynCall_vijji = Module["dynCall_vijji"] = wasmExports["ig"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
      ));
    var dynCall_viiji = (Module["dynCall_viiji"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_viiji = Module["dynCall_viiji"] = wasmExports["jg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_jiii = (Module["dynCall_jiii"] = (a0, a1, a2, a3) =>
      (dynCall_jiii = Module["dynCall_jiii"] = wasmExports["kg"])(
        a0,
        a1,
        a2,
        a3,
      ));
    var dynCall_iiiiddd = (Module["dynCall_iiiiddd"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
    ) =>
      (dynCall_iiiiddd = Module["dynCall_iiiiddd"] = wasmExports["lg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
      ));
    var dynCall_vidii = (Module["dynCall_vidii"] = (a0, a1, a2, a3, a4) =>
      (dynCall_vidii = Module["dynCall_vidii"] = wasmExports["mg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_vidiiii = (Module["dynCall_vidiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
    ) =>
      (dynCall_vidiiii = Module["dynCall_vidiiii"] = wasmExports["ng"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
      ));
    var dynCall_vidiii = (Module["dynCall_vidiii"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_vidiii = Module["dynCall_vidiii"] = wasmExports["og"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_dj = (Module["dynCall_dj"] = (a0, a1, a2) =>
      (dynCall_dj = Module["dynCall_dj"] = wasmExports["pg"])(a0, a1, a2));
    var dynCall_vdiii = (Module["dynCall_vdiii"] = (a0, a1, a2, a3, a4) =>
      (dynCall_vdiii = Module["dynCall_vdiii"] = wasmExports["qg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_idiiiiii = (Module["dynCall_idiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
    ) =>
      (dynCall_idiiiiii = Module["dynCall_idiiiiii"] = wasmExports["rg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
      ));
    var dynCall_idiiiiiii = (Module["dynCall_idiiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
    ) =>
      (dynCall_idiiiiiii = Module["dynCall_idiiiiiii"] = wasmExports["sg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
      ));
    var dynCall_iiiidiiii = (Module["dynCall_iiiidiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
    ) =>
      (dynCall_iiiidiiii = Module["dynCall_iiiidiiii"] = wasmExports["tg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
      ));
    var dynCall_viiiidiiiiii = (Module["dynCall_viiiidiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
    ) =>
      (dynCall_viiiidiiiiii = Module["dynCall_viiiidiiiiii"] =
        wasmExports["ug"])(a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11));
    var dynCall_iiiff = (Module["dynCall_iiiff"] = (a0, a1, a2, a3, a4) =>
      (dynCall_iiiff = Module["dynCall_iiiff"] = wasmExports["vg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_viiiiiiiiiii = (Module["dynCall_viiiiiiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
    ) =>
      (dynCall_viiiiiiiiiii = Module["dynCall_viiiiiiiiiii"] =
        wasmExports["wg"])(a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11));
    var dynCall_iij = (Module["dynCall_iij"] = (a0, a1, a2, a3) =>
      (dynCall_iij = Module["dynCall_iij"] = wasmExports["xg"])(
        a0,
        a1,
        a2,
        a3,
      ));
    var dynCall_vidi = (Module["dynCall_vidi"] = (a0, a1, a2, a3) =>
      (dynCall_vidi = Module["dynCall_vidi"] = wasmExports["yg"])(
        a0,
        a1,
        a2,
        a3,
      ));
    var dynCall_fii = (Module["dynCall_fii"] = (a0, a1, a2) =>
      (dynCall_fii = Module["dynCall_fii"] = wasmExports["zg"])(a0, a1, a2));
    var dynCall_viiiiiiiiiiiii = (Module["dynCall_viiiiiiiiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
      a12,
      a13,
    ) =>
      (dynCall_viiiiiiiiiiiii = Module["dynCall_viiiiiiiiiiiii"] =
        wasmExports["Ag"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
        a10,
        a11,
        a12,
        a13,
      ));
    var dynCall_iiiiiiiiiii = (Module["dynCall_iiiiiiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
    ) =>
      (dynCall_iiiiiiiiiii = Module["dynCall_iiiiiiiiiii"] = wasmExports["Bg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
        a10,
      ));
    var dynCall_viidii = (Module["dynCall_viidii"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_viidii = Module["dynCall_viidii"] = wasmExports["Cg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_viiiijii = (Module["dynCall_viiiijii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
    ) =>
      (dynCall_viiiijii = Module["dynCall_viiiijii"] = wasmExports["Dg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
      ));
    var dynCall_viiijjii = (Module["dynCall_viiijjii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
    ) =>
      (dynCall_viiijjii = Module["dynCall_viiijjii"] = wasmExports["Eg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
      ));
    var dynCall_iiiijjii = (Module["dynCall_iiiijjii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
    ) =>
      (dynCall_iiiijjii = Module["dynCall_iiiijjii"] = wasmExports["Fg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
      ));
    var dynCall_viiijii = (Module["dynCall_viiijii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
    ) =>
      (dynCall_viiijii = Module["dynCall_viiijii"] = wasmExports["Gg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
      ));
    var dynCall_iiiijii = (Module["dynCall_iiiijii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
    ) =>
      (dynCall_iiiijii = Module["dynCall_iiiijii"] = wasmExports["Hg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
      ));
    var dynCall_ddiiiii = (Module["dynCall_ddiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
    ) =>
      (dynCall_ddiiiii = Module["dynCall_ddiiiii"] = wasmExports["Ig"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
      ));
    var dynCall_iifi = (Module["dynCall_iifi"] = (a0, a1, a2, a3) =>
      (dynCall_iifi = Module["dynCall_iifi"] = wasmExports["Jg"])(
        a0,
        a1,
        a2,
        a3,
      ));
    var dynCall_iiiij = (Module["dynCall_iiiij"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_iiiij = Module["dynCall_iiiij"] = wasmExports["Kg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
      ));
    var dynCall_jiji = (Module["dynCall_jiji"] = (a0, a1, a2, a3, a4) =>
      (dynCall_jiji = Module["dynCall_jiji"] = wasmExports["Lg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_iiiiij = (Module["dynCall_iiiiij"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
    ) =>
      (dynCall_iiiiij = Module["dynCall_iiiiij"] = wasmExports["Mg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
      ));
    var dynCall_viijii = (Module["dynCall_viijii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
    ) =>
      (dynCall_viijii = Module["dynCall_viijii"] = wasmExports["Ng"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
      ));
    var dynCall_jiiii = (Module["dynCall_jiiii"] = (a0, a1, a2, a3, a4) =>
      (dynCall_jiiii = Module["dynCall_jiiii"] = wasmExports["Og"])(
        a0,
        a1,
        a2,
        a3,
        a4,
      ));
    var dynCall_viiiiiiiiiiiiiii = (Module["dynCall_viiiiiiiiiiiiiii"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
      a12,
      a13,
      a14,
      a15,
    ) =>
      (dynCall_viiiiiiiiiiiiiii = Module["dynCall_viiiiiiiiiiiiiii"] =
        wasmExports["Pg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
        a10,
        a11,
        a12,
        a13,
        a14,
        a15,
      ));
    var dynCall_iiiiijj = (Module["dynCall_iiiiijj"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
    ) =>
      (dynCall_iiiiijj = Module["dynCall_iiiiijj"] = wasmExports["Qg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
      ));
    var dynCall_iiiiiijj = (Module["dynCall_iiiiiijj"] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
    ) =>
      (dynCall_iiiiiijj = Module["dynCall_iiiiiijj"] = wasmExports["Rg"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a8,
        a9,
      ));
    var _asyncify_start_unwind = (a0) =>
      (_asyncify_start_unwind = wasmExports["Sg"])(a0);
    var _asyncify_stop_unwind = () =>
      (_asyncify_stop_unwind = wasmExports["Tg"])();
    var _asyncify_start_rewind = (a0) =>
      (_asyncify_start_rewind = wasmExports["Ug"])(a0);
    var _asyncify_stop_rewind = () =>
      (_asyncify_stop_rewind = wasmExports["Vg"])();
    var ___start_em_js = (Module["___start_em_js"] = 3890876);
    var ___stop_em_js = (Module["___stop_em_js"] = 3892200);
    function invoke_iii(index, a1, a2) {
      var sp = stackSave();
      try {
        return dynCall_iii(index, a1, a2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiii(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        return dynCall_iiii(index, a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_vi(index, a1) {
      var sp = stackSave();
      try {
        dynCall_vi(index, a1);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_ii(index, a1) {
      var sp = stackSave();
      try {
        return dynCall_ii(index, a1);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiiii(index, a1, a2, a3, a4, a5) {
      var sp = stackSave();
      try {
        return dynCall_iiiiii(index, a1, a2, a3, a4, a5);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_vii(index, a1, a2) {
      var sp = stackSave();
      try {
        dynCall_vii(index, a1, a2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_i(index) {
      var sp = stackSave();
      try {
        return dynCall_i(index);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiiii(index, a1, a2, a3, a4, a5) {
      var sp = stackSave();
      try {
        dynCall_viiiii(index, a1, a2, a3, a4, a5);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiii(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        return dynCall_iiiii(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viii(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        dynCall_viii(index, a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiii(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        dynCall_viiii(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_v(index) {
      var sp = stackSave();
      try {
        dynCall_v(index);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_vid(index, a1, a2) {
      var sp = stackSave();
      try {
        dynCall_vid(index, a1, a2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
      var sp = stackSave();
      try {
        return dynCall_iiiiiiii(index, a1, a2, a3, a4, a5, a6, a7);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiiiii(index, a1, a2, a3, a4, a5, a6) {
      var sp = stackSave();
      try {
        dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiiiii(index, a1, a2, a3, a4, a5, a6) {
      var sp = stackSave();
      try {
        return dynCall_iiiiiii(index, a1, a2, a3, a4, a5, a6);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
      var sp = stackSave();
      try {
        dynCall_viiiiiii(index, a1, a2, a3, a4, a5, a6, a7);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiidi(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        return dynCall_iiidi(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiidi(index, a1, a2, a3, a4, a5) {
      var sp = stackSave();
      try {
        dynCall_viiidi(index, a1, a2, a3, a4, a5);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viid(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        dynCall_viid(index, a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viidi(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        dynCall_viidi(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiid(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        return dynCall_iiid(index, a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
      var sp = stackSave();
      try {
        return dynCall_iiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_di(index, a1) {
      var sp = stackSave();
      try {
        return dynCall_di(index, a1);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iid(index, a1, a2) {
      var sp = stackSave();
      try {
        return dynCall_iid(index, a1, a2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_dii(index, a1, a2) {
      var sp = stackSave();
      try {
        return dynCall_dii(index, a1, a2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiiid(index, a1, a2, a3, a4, a5) {
      var sp = stackSave();
      try {
        return dynCall_iiiiid(index, a1, a2, a3, a4, a5);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiiiiiiiiii(
      index,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
    ) {
      var sp = stackSave();
      try {
        return dynCall_iiiiiiiiiiii(
          index,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a8,
          a9,
          a10,
          a11,
        );
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_vd(index, a1) {
      var sp = stackSave();
      try {
        dynCall_vd(index, a1);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iif(index, a1, a2) {
      var sp = stackSave();
      try {
        return dynCall_iif(index, a1, a2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iidiii(index, a1, a2, a3, a4, a5) {
      var sp = stackSave();
      try {
        return dynCall_iidiii(index, a1, a2, a3, a4, a5);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiid(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        dynCall_viiid(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiid(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        return dynCall_iiiid(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
      var sp = stackSave();
      try {
        return dynCall_iiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_fiii(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        return dynCall_fiii(index, a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiifi(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        return dynCall_iiifi(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiffi(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        return dynCall_iiffi(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viif(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        dynCall_viif(index, a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_diii(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        return dynCall_diii(index, a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
      var sp = stackSave();
      try {
        dynCall_viiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iidii(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        return dynCall_iidii(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_dif(index, a1, a2) {
      var sp = stackSave();
      try {
        return dynCall_dif(index, a1, a2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiiid(index, a1, a2, a3, a4, a5) {
      var sp = stackSave();
      try {
        dynCall_viiiid(index, a1, a2, a3, a4, a5);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiiidi(index, a1, a2, a3, a4, a5, a6) {
      var sp = stackSave();
      try {
        dynCall_viiiidi(index, a1, a2, a3, a4, a5, a6);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiidiii(index, a1, a2, a3, a4, a5, a6, a7) {
      var sp = stackSave();
      try {
        return dynCall_iiiidiii(index, a1, a2, a3, a4, a5, a6, a7);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiiiidi(index, a1, a2, a3, a4, a5, a6, a7) {
      var sp = stackSave();
      try {
        dynCall_viiiiidi(index, a1, a2, a3, a4, a5, a6, a7);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiiidiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
      var sp = stackSave();
      try {
        return dynCall_iiiiidiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiidii(index, a1, a2, a3, a4, a5, a6) {
      var sp = stackSave();
      try {
        dynCall_viiidii(index, a1, a2, a3, a4, a5, a6);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiiiid(index, a1, a2, a3, a4, a5, a6) {
      var sp = stackSave();
      try {
        dynCall_viiiiid(index, a1, a2, a3, a4, a5, a6);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiidiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
      var sp = stackSave();
      try {
        dynCall_viiidiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_vidi(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        dynCall_vidi(index, a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiiddddi(index, a1, a2, a3, a4, a5, a6, a7, a8) {
      var sp = stackSave();
      try {
        dynCall_viiiddddi(index, a1, a2, a3, a4, a5, a6, a7, a8);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiddi(index, a1, a2, a3, a4, a5) {
      var sp = stackSave();
      try {
        dynCall_viiddi(index, a1, a2, a3, a4, a5);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_vidddi(index, a1, a2, a3, a4, a5) {
      var sp = stackSave();
      try {
        dynCall_vidddi(index, a1, a2, a3, a4, a5);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiddddi(index, a1, a2, a3, a4, a5, a6, a7) {
      var sp = stackSave();
      try {
        dynCall_viiddddi(index, a1, a2, a3, a4, a5, a6, a7);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_fid(index, a1, a2) {
      var sp = stackSave();
      try {
        return dynCall_fid(index, a1, a2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiiiid(index, a1, a2, a3, a4, a5, a6) {
      var sp = stackSave();
      try {
        return dynCall_iiiiiid(index, a1, a2, a3, a4, a5, a6);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_vif(index, a1, a2) {
      var sp = stackSave();
      try {
        dynCall_vif(index, a1, a2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viddi(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        dynCall_viddi(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiiiiiid(index, a1, a2, a3, a4, a5, a6, a7, a8) {
      var sp = stackSave();
      try {
        dynCall_viiiiiiid(index, a1, a2, a3, a4, a5, a6, a7, a8);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiifffffiiff(
      index,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
      a12,
    ) {
      var sp = stackSave();
      try {
        return dynCall_iiiifffffiiff(
          index,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a8,
          a9,
          a10,
          a11,
          a12,
        );
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_fif(index, a1, a2) {
      var sp = stackSave();
      try {
        return dynCall_fif(index, a1, a2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_vifii(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        dynCall_vifii(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_vfiiii(index, a1, a2, a3, a4, a5) {
      var sp = stackSave();
      try {
        dynCall_vfiiii(index, a1, a2, a3, a4, a5);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_ifii(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        return dynCall_ifii(index, a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiiiiiiiiiiiiii(
      index,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
      a12,
      a13,
      a14,
      a15,
    ) {
      var sp = stackSave();
      try {
        dynCall_viiiiiiiiiiiiiii(
          index,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a8,
          a9,
          a10,
          a11,
          a12,
          a13,
          a14,
          a15,
        );
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiiiiiiiii(
      index,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
    ) {
      var sp = stackSave();
      try {
        dynCall_viiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
      var sp = stackSave();
      try {
        dynCall_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiif(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        dynCall_viiif(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_fi(index, a1) {
      var sp = stackSave();
      try {
        return dynCall_fi(index, a1);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiiiiiiiiiiiiiiiiii(
      index,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
      a12,
      a13,
      a14,
      a15,
      a16,
      a17,
      a18,
      a19,
    ) {
      var sp = stackSave();
      try {
        return dynCall_iiiiiiiiiiiiiiiiiiii(
          index,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a8,
          a9,
          a10,
          a11,
          a12,
          a13,
          a14,
          a15,
          a16,
          a17,
          a18,
          a19,
        );
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiiiiiiiiiii(
      index,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
      a12,
    ) {
      var sp = stackSave();
      try {
        return dynCall_iiiiiiiiiiiii(
          index,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a8,
          a9,
          a10,
          a11,
          a12,
        );
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiiiiiiiiiiii(
      index,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
      a12,
      a13,
    ) {
      var sp = stackSave();
      try {
        return dynCall_iiiiiiiiiiiiii(
          index,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a8,
          a9,
          a10,
          a11,
          a12,
          a13,
        );
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiddddddiiii(
      index,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
    ) {
      var sp = stackSave();
      try {
        return dynCall_iiddddddiiii(
          index,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a8,
          a9,
          a10,
          a11,
        );
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iidiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
      var sp = stackSave();
      try {
        return dynCall_iidiiiii(index, a1, a2, a3, a4, a5, a6, a7);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiddii(index, a1, a2, a3, a4, a5, a6) {
      var sp = stackSave();
      try {
        return dynCall_iiiddii(index, a1, a2, a3, a4, a5, a6);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iddiii(index, a1, a2, a3, a4, a5) {
      var sp = stackSave();
      try {
        return dynCall_iddiii(index, a1, a2, a3, a4, a5);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iddii(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        return dynCall_iddii(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_idddiii(index, a1, a2, a3, a4, a5, a6) {
      var sp = stackSave();
      try {
        return dynCall_idddiii(index, a1, a2, a3, a4, a5, a6);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_idddii(index, a1, a2, a3, a4, a5) {
      var sp = stackSave();
      try {
        return dynCall_idddii(index, a1, a2, a3, a4, a5);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_idii(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        return dynCall_idii(index, a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_idi(index, a1, a2) {
      var sp = stackSave();
      try {
        return dynCall_idi(index, a1, a2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_fiiid(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        return dynCall_fiiid(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiidiiiiii(
      index,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
    ) {
      var sp = stackSave();
      try {
        return dynCall_iiiidiiiiii(
          index,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a8,
          a9,
          a10,
        );
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iidi(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        return dynCall_iidi(index, a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiidii(index, a1, a2, a3, a4, a5, a6) {
      var sp = stackSave();
      try {
        return dynCall_iiiidii(index, a1, a2, a3, a4, a5, a6);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiidiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
      var sp = stackSave();
      try {
        return dynCall_iiidiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiidiiidiiiidiif(
      index,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
      a12,
      a13,
      a14,
      a15,
    ) {
      var sp = stackSave();
      try {
        return dynCall_iiidiiidiiiidiif(
          index,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a8,
          a9,
          a10,
          a11,
          a12,
          a13,
          a14,
          a15,
        );
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_dddd(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        return dynCall_dddd(index, a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iidiiii(index, a1, a2, a3, a4, a5, a6) {
      var sp = stackSave();
      try {
        return dynCall_iidiiii(index, a1, a2, a3, a4, a5, a6);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiiiiiidi(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
      var sp = stackSave();
      try {
        return dynCall_iiiiiiiidi(index, a1, a2, a3, a4, a5, a6, a7, a8, a9);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiddi(index, a1, a2, a3, a4, a5) {
      var sp = stackSave();
      try {
        return dynCall_iiiddi(index, a1, a2, a3, a4, a5);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiidd(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        return dynCall_iiidd(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_did(index, a1, a2) {
      var sp = stackSave();
      try {
        return dynCall_did(index, a1, a2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiidii(index, a1, a2, a3, a4, a5) {
      var sp = stackSave();
      try {
        return dynCall_iiidii(index, a1, a2, a3, a4, a5);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiidddii(index, a1, a2, a3, a4, a5, a6, a7) {
      var sp = stackSave();
      try {
        return dynCall_iiidddii(index, a1, a2, a3, a4, a5, a6, a7);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_didii(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        return dynCall_didii(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiiiiidddi(
      index,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
    ) {
      var sp = stackSave();
      try {
        return dynCall_iiiiiiidddi(
          index,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a8,
          a9,
          a10,
        );
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iidd(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        return dynCall_iidd(index, a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiiddd(index, a1, a2, a3, a4, a5, a6) {
      var sp = stackSave();
      try {
        return dynCall_iiiiddd(index, a1, a2, a3, a4, a5, a6);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_vidii(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        dynCall_vidii(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_vidiiii(index, a1, a2, a3, a4, a5, a6) {
      var sp = stackSave();
      try {
        dynCall_vidiiii(index, a1, a2, a3, a4, a5, a6);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_vidiii(index, a1, a2, a3, a4, a5) {
      var sp = stackSave();
      try {
        dynCall_vidiii(index, a1, a2, a3, a4, a5);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_vdiii(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        dynCall_vdiii(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiidiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
      var sp = stackSave();
      try {
        return dynCall_iiiidiiii(index, a1, a2, a3, a4, a5, a6, a7, a8);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_idiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
      var sp = stackSave();
      try {
        return dynCall_idiiiiii(index, a1, a2, a3, a4, a5, a6, a7);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_idiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
      var sp = stackSave();
      try {
        return dynCall_idiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiiidiiiiii(
      index,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
    ) {
      var sp = stackSave();
      try {
        dynCall_viiiidiiiiii(
          index,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a8,
          a9,
          a10,
          a11,
        );
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiff(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        return dynCall_iiiff(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_fii(index, a1, a2) {
      var sp = stackSave();
      try {
        return dynCall_fii(index, a1, a2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiiiiiiiiiiii(
      index,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
      a11,
      a12,
      a13,
    ) {
      var sp = stackSave();
      try {
        dynCall_viiiiiiiiiiiii(
          index,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a8,
          a9,
          a10,
          a11,
          a12,
          a13,
        );
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiiiiiiiii(
      index,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
      a7,
      a8,
      a9,
      a10,
    ) {
      var sp = stackSave();
      try {
        return dynCall_iiiiiiiiiii(
          index,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a8,
          a9,
          a10,
        );
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viidii(index, a1, a2, a3, a4, a5) {
      var sp = stackSave();
      try {
        dynCall_viidii(index, a1, a2, a3, a4, a5);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_ddiiiii(index, a1, a2, a3, a4, a5, a6) {
      var sp = stackSave();
      try {
        return dynCall_ddiiiii(index, a1, a2, a3, a4, a5, a6);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iifi(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        return dynCall_iifi(index, a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_j(index) {
      var sp = stackSave();
      try {
        return dynCall_j(index);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_jiii(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        return dynCall_jiii(index, a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_jiij(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        return dynCall_jiij(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_ji(index, a1) {
      var sp = stackSave();
      try {
        return dynCall_ji(index, a1);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viij(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        dynCall_viij(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viji(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        dynCall_viji(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_vijii(index, a1, a2, a3, a4, a5) {
      var sp = stackSave();
      try {
        dynCall_vijii(index, a1, a2, a3, a4, a5);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiijj(index, a1, a2, a3, a4, a5, a6) {
      var sp = stackSave();
      try {
        return dynCall_iiijj(index, a1, a2, a3, a4, a5, a6);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiijji(index, a1, a2, a3, a4, a5, a6, a7) {
      var sp = stackSave();
      try {
        return dynCall_iiijji(index, a1, a2, a3, a4, a5, a6, a7);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_vij(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        dynCall_vij(index, a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_jii(index, a1, a2) {
      var sp = stackSave();
      try {
        return dynCall_jii(index, a1, a2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_vijji(index, a1, a2, a3, a4, a5, a6) {
      var sp = stackSave();
      try {
        dynCall_vijji(index, a1, a2, a3, a4, a5, a6);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiji(index, a1, a2, a3, a4, a5) {
      var sp = stackSave();
      try {
        dynCall_viiji(index, a1, a2, a3, a4, a5);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_dj(index, a1, a2) {
      var sp = stackSave();
      try {
        return dynCall_dj(index, a1, a2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iij(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        return dynCall_iij(index, a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiiijii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
      var sp = stackSave();
      try {
        dynCall_viiiijii(index, a1, a2, a3, a4, a5, a6, a7, a8);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiijjii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
      var sp = stackSave();
      try {
        dynCall_viiijjii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiijjii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
      var sp = stackSave();
      try {
        return dynCall_iiiijjii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiijii(index, a1, a2, a3, a4, a5, a6, a7) {
      var sp = stackSave();
      try {
        dynCall_viiijii(index, a1, a2, a3, a4, a5, a6, a7);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiijii(index, a1, a2, a3, a4, a5, a6, a7) {
      var sp = stackSave();
      try {
        return dynCall_iiiijii(index, a1, a2, a3, a4, a5, a6, a7);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiij(index, a1, a2, a3, a4, a5) {
      var sp = stackSave();
      try {
        return dynCall_iiiij(index, a1, a2, a3, a4, a5);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiiij(index, a1, a2, a3, a4, a5, a6) {
      var sp = stackSave();
      try {
        return dynCall_iiiiij(index, a1, a2, a3, a4, a5, a6);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_jiiii(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        return dynCall_jiiii(index, a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function applySignatureConversions(wasmExports) {
      wasmExports = Object.assign({}, wasmExports);
      var makeWrapper_p = (f) => () => f() >>> 0;
      var makeWrapper_pp = (f) => (a0) => f(a0) >>> 0;
      var makeWrapper_ppp = (f) => (a0, a1) => f(a0, a1) >>> 0;
      wasmExports["Cd"] = makeWrapper_p(wasmExports["Cd"]);
      wasmExports["Fd"] = makeWrapper_pp(wasmExports["Fd"]);
      wasmExports["Gd"] = makeWrapper_p(wasmExports["Gd"]);
      wasmExports["Id"] = makeWrapper_ppp(wasmExports["Id"]);
      wasmExports["Jd"] = makeWrapper_pp(wasmExports["Jd"]);
      wasmExports["Vd"] = makeWrapper_p(wasmExports["Vd"]);
      wasmExports["Xd"] = makeWrapper_pp(wasmExports["Xd"]);
      return wasmExports;
    }
    Module["addRunDependency"] = addRunDependency;
    Module["removeRunDependency"] = removeRunDependency;
    Module["FS_createPath"] = FS.createPath;
    Module["FS_createLazyFile"] = FS.createLazyFile;
    Module["FS_createDevice"] = FS.createDevice;
    Module["wasmMemory"] = wasmMemory;
    Module["keepRuntimeAlive"] = keepRuntimeAlive;
    Module["ExitStatus"] = ExitStatus;
    Module["FS_createPreloadedFile"] = FS.createPreloadedFile;
    Module["FS_createDataFile"] = FS.createDataFile;
    Module["FS_unlink"] = FS.unlink;
    Module["PThread"] = PThread;
    Module["FS_readdir"]=FS.readdir;
    Module["FS_analyzePath"]=FS.analyzePath;
    var calledRun;
    dependenciesFulfilled = function runCaller() {
      if (!calledRun) run();
      if (!calledRun) dependenciesFulfilled = runCaller;
    };
    function run() {
      if (runDependencies > 0) {
        return;
      }
      if (ENVIRONMENT_IS_PTHREAD) {
        readyPromiseResolve(Module);
        initRuntime();
        startWorker(Module);
        return;
      }
      preRun();
      if (runDependencies > 0) {
        return;
      }
      function doRun() {
        if (calledRun) return;
        calledRun = true;
        Module["calledRun"] = true;
        if (ABORT) return;
        initRuntime();
        readyPromiseResolve(Module);
        if (Module["onRuntimeInitialized"]) Module["onRuntimeInitialized"]();
        postRun();
      }
      if (Module["setStatus"]) {
        Module["setStatus"]("Running...");
        setTimeout(function () {
          setTimeout(function () {
            Module["setStatus"]("");
          }, 1);
          doRun();
        }, 1);
      } else {
        doRun();
      }
    }
    if (Module["preInit"]) {
      if (typeof Module["preInit"] == "function")
        Module["preInit"] = [Module["preInit"]];
      while (Module["preInit"].length > 0) {
        Module["preInit"].pop()();
      }
    }
    run();

    return moduleArg.ready;
  };
})();
if (typeof exports === "object" && typeof module === "object")
  module.exports = getUsdModule;
else if (typeof define === "function" && define["amd"])
  define([], () => getUsdModule);

globalThis["NEEDLE:USD:GET"] = getUsdModule;
