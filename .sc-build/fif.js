var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/fif.tsx
var fif_exports = {};
__export(fif_exports, {
  default: () => Command
});
module.exports = __toCommonJS(fif_exports);
var import_api = require("@raycast/api");
var import_react = require("react");
var import_child_process = require("child_process");
var import_util = require("util");
var import_path = __toESM(require("path"));
var import_os = __toESM(require("os"));
var import_jsx_runtime = require("react/jsx-runtime");
var execPromise = (0, import_util.promisify)(import_child_process.exec);
var IGNORED_DIRS = [
  "node_modules",
  ".node_modules",
  ".venv",
  "venv",
  "logs",
  "temp",
  ".git",
  "dist",
  "build",
  ".next",
  "vendor",
  "target",
  "bin",
  "obj",
  "Library",
  "Pictures",
  "Music",
  "Movies",
  ".Trash",
  ".cache",
  ".npm"
];
var COMMON_PATHS = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";
function Command() {
  const [results, setResults] = (0, import_react.useState)([]);
  const [isLoading, setIsLoading] = (0, import_react.useState)(false);
  const [errorMsg, setErrorMsg] = (0, import_react.useState)(null);
  const abortControllerRef = (0, import_react.useRef)(null);
  const preferences = (0, import_api.getPreferenceValues)();
  const searchDir = preferences.searchPath || import_os.default.homedir();
  const handleSearch = (0, import_react.useCallback)(
    async (text) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (!text || text.length < 2) {
        setResults([]);
        setIsLoading(false);
        return;
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const globArgs = IGNORED_DIRS.map((dir) => `--iglob '!**/${dir}/**'`).join(" ");
        const escapedText = text.replace(/"/g, '\\"');
        const cmd = `rg --vimgrep --fixed-strings --word-regexp --case-sensitive --max-columns 500 --max-count 10 --max-filesize 1M --no-messages ${globArgs} "${escapedText}" "${searchDir}" | head -n 100`;
        const processResults = (stdout2) => {
          const lines = stdout2.split("\n").filter(Boolean);
          const searchResults = lines.map((line) => {
            const parts = line.split(":");
            if (parts.length < 4)
              return null;
            const file = parts[0];
            const lineNum = parts[1];
            const textContent = parts.slice(3).join(":").trim();
            return {
              file,
              line: lineNum,
              text: textContent
            };
          }).filter((res) => res !== null);
          setResults(searchResults);
        };
        const { stdout } = await execPromise(cmd, {
          timeout: 1e4,
          env: { ...process.env, PATH: `${process.env.PATH}:${COMMON_PATHS}` },
          // Signal is tricky in old node via promisify, but Raycast runs modern Node
          signal: controller.signal
        });
        processResults(stdout);
        setIsLoading(false);
      } catch (error) {
        if (error.name === "AbortError" || controller.signal.aborted) {
          return;
        }
        if (error.stdout) {
          const lines = error.stdout.split("\n").filter(Boolean);
          const searchResults = lines.map((line) => {
            const parts = line.split(":");
            if (parts.length < 4)
              return null;
            const file = parts[0];
            const lineNum = parts[1];
            const textContent = parts.slice(3).join(":").trim();
            return {
              file,
              line: lineNum,
              text: textContent
            };
          }).filter((res) => res !== null);
          setResults(searchResults);
        } else if (error.code === 127) {
          setErrorMsg("ripgrep (rg) wurde nicht gefunden. Bitte installiere es mit 'brew install ripgrep'.");
        } else if (error.code !== 1 && error.code !== 2) {
          console.error("Search error:", error);
        } else {
          setResults([]);
        }
        setIsLoading(false);
      }
    },
    [searchDir]
  );
  if (errorMsg) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_api.Detail,
      {
        markdown: `# Fehler

${errorMsg}`,
        actions: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.ActionPanel, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.Action.OpenInBrowser, { title: "ripgrep auf GitHub", url: "https://github.com/BurntSushi/ripgrep" }) })
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    import_api.List,
    {
      isLoading,
      onSearchTextChange: handleSearch,
      searchBarPlaceholder: "Suchen nach Text in Dateien...",
      throttle: true,
      filtering: false,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_api.List.EmptyView,
          {
            title: isLoading ? "Suchen..." : results.length === 0 ? "Keine Ergebnisse" : "Text eingeben",
            icon: import_api.Icon.MagnifyingGlass
          }
        ),
        results.map((res, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_api.List.Item,
          {
            title: res.text,
            subtitle: `${import_path.default.basename(res.file)}:${res.line}`,
            accessories: [{ text: import_path.default.dirname(res.file).replace(import_os.default.homedir(), "~") }],
            actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_api.ActionPanel, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.Action.Open, { title: "In Editor \xF6ffnen", target: res.file }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.Action.ShowInFinder, { path: res.file }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.Action.CopyToClipboard, { title: "Pfad kopieren", content: res.file }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.Action.CopyToClipboard, { title: "Text kopieren", content: res.text })
            ] })
          },
          `${res.file}-${res.line}-${index}`
        ))
      ]
    }
  );
}
