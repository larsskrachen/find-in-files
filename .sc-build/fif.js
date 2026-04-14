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
var import_readline = __toESM(require("readline"));
var import_path = __toESM(require("path"));
var import_os = __toESM(require("os"));
var import_jsx_runtime = require("react/jsx-runtime");
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
  ".npm",
  ".idea",
  ".vscode",
  ".settings",
  ".gradle",
  ".m2",
  "bower_components",
  "__pycache__",
  ".pytest_cache",
  ".sass-cache",
  "Pods",
  "DerivedData",
  ".yarn",
  ".pnpm",
  ".pnpm-store",
  "jspm_packages",
  ".composer",
  ".fleet",
  ".cursor",
  ".vscode-server",
  ".history",
  ".metadata",
  ".recommenders",
  ".nuxt",
  ".docusaurus",
  ".turbo",
  ".vercel",
  ".expo",
  "_build",
  ".elixir_ls",
  ".mypy_cache",
  ".ruff_cache",
  "coverage",
  ".nyc_output",
  ".tox",
  ".nox",
  ".terraform",
  ".serverless",
  ".aws",
  ".azure",
  ".gcloud",
  ".kube",
  ".docker",
  ".minikube",
  ".zsh_sessions",
  "Applications"
];
var COMMON_PATHS = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";
var MAX_RESULTS = 100;
function Command() {
  const [results, setResults] = (0, import_react.useState)([]);
  const [isLoading, setIsLoading] = (0, import_react.useState)(false);
  const [errorMsg, setErrorMsg] = (0, import_react.useState)(null);
  const abortControllerRef = (0, import_react.useRef)(null);
  const updateTimeoutRef = (0, import_react.useRef)(null);
  const resultsRef = (0, import_react.useRef)([]);
  const preferences = (0, import_api.getPreferenceValues)();
  const searchDir = preferences.searchPath || import_os.default.homedir();
  (0, import_react.useEffect)(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);
  const handleSearch = (0, import_react.useCallback)(
    async (text) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
      if (!text || text.length < 2) {
        setResults([]);
        resultsRef.current = [];
        setIsLoading(false);
        return;
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsLoading(true);
      setErrorMsg(null);
      setResults([]);
      resultsRef.current = [];
      try {
        const ignoreArgs = IGNORED_DIRS.flatMap((dir) => ["-g", `!**/${dir}/**`]);
        const args = [
          "--json",
          "--fixed-strings",
          "--word-regexp",
          "--case-sensitive",
          "--max-columns",
          "500",
          "--max-count",
          "5",
          "--max-filesize",
          "1M",
          "--no-messages",
          "--no-unicode",
          ...ignoreArgs,
          text,
          searchDir
        ];
        const child = (0, import_child_process.spawn)("rg", args, {
          env: { ...process.env, PATH: `${process.env.PATH}:${COMMON_PATHS}` },
          signal: controller.signal
        });
        const rl = import_readline.default.createInterface({
          input: child.stdout,
          terminal: false
        });
        rl.on("line", (line) => {
          if (resultsRef.current.length >= MAX_RESULTS) {
            child.kill();
            rl.close();
            return;
          }
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === "match") {
              const data = parsed.data;
              const newResult = {
                file: data.path.text,
                line: data.line_number.toString(),
                text: data.lines.text.trim()
              };
              resultsRef.current.push(newResult);
              if (!updateTimeoutRef.current) {
                updateTimeoutRef.current = setTimeout(() => {
                  setResults([...resultsRef.current]);
                  updateTimeoutRef.current = null;
                }, 50);
              }
            }
          } catch (e) {
          }
        });
        child.on("error", (error) => {
          if (error.name === "AbortError")
            return;
          if (error.code === "ENOENT") {
            setErrorMsg("ripgrep (rg) wurde nicht gefunden. Bitte installiere es mit 'brew install ripgrep'.");
          } else {
            console.error("Spawn error:", error);
          }
          setIsLoading(false);
        });
        child.on("close", (code) => {
          setIsLoading(false);
          if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
            updateTimeoutRef.current = null;
          }
          setResults([...resultsRef.current]);
          if (resultsRef.current.length === 0 && code !== 0 && code !== 1 && !controller.signal.aborted) {
          }
        });
      } catch (error) {
        if (error.name === "AbortError")
          return;
        setIsLoading(false);
        console.error("Search error:", error);
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
      isShowingDetail: results.length > 0,
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
            subtitle: import_path.default.basename(res.file),
            detail: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              import_api.List.Item.Detail,
              {
                markdown: `
### ${import_path.default.basename(res.file)}
**Pfad:** \`${res.file.replace(import_os.default.homedir(), "~")}\`
**Zeile:** ${res.line}

\`\`\`
${res.text}
\`\`\`
              `,
                metadata: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_api.List.Item.Detail.Metadata, { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.List.Item.Detail.Metadata.Label, { title: "Datei", text: import_path.default.basename(res.file) }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.List.Item.Detail.Metadata.Label, { title: "Pfad", text: res.file.replace(import_os.default.homedir(), "~") }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.List.Item.Detail.Metadata.Label, { title: "Zeile", text: res.line }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.List.Item.Detail.Metadata.Separator, {}),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.List.Item.Detail.Metadata.Label, { title: "Gefundener Text", text: res.text })
                ] })
              }
            ),
            actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_api.ActionPanel, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.Action.Open, { title: "In Editor \xF6ffnen", target: res.file }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.Action.OpenWith, { path: res.file, title: "\xD6ffnen mit..." }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.Action.Open, { title: "In Antigravity \xF6ffnen", target: res.file, application: "Antigravity", icon: import_api.Icon.Code }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_api.ActionPanel.Submenu, { title: "In JetBrains IDE \xF6ffnen", icon: import_api.Icon.Code, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.Action.Open, { title: "IntelliJ IDEA", target: res.file, application: "IntelliJ IDEA" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.Action.Open, { title: "WebStorm", target: res.file, application: "WebStorm" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.Action.Open, { title: "PyCharm", target: res.file, application: "PyCharm" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.Action.Open, { title: "PhpStorm", target: res.file, application: "PhpStorm" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.Action.Open, { title: "GoLand", target: res.file, application: "GoLand" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.Action.Open, { title: "CLion", target: res.file, application: "CLion" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.Action.Open, { title: "Rider", target: res.file, application: "Rider" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.Action.ShowInFinder, { path: res.file }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.Action.CopyToClipboard, { title: "Pfad kopieren", content: res.file, shortcut: { modifiers: ["cmd", "shift"], key: "c" } }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api.Action.CopyToClipboard, { title: "Text kopieren", content: res.text, shortcut: { modifiers: ["cmd"], key: "c" } })
            ] })
          },
          `${res.file}-${res.line}-${index}`
        ))
      ]
    }
  );
}
