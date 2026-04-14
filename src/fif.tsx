import { List, ActionPanel, Action, getPreferenceValues, Icon, Detail } from "@raycast/api";
import { useState, useCallback, useRef, useEffect } from "react";
import { spawn } from "child_process";
import readline from "readline";
import path from "path";
import os from "os";

interface SearchResult {
  file: string;
  line: string;
  text: string;
}

interface Preferences {
  searchPath?: string;
}

const IGNORED_DIRS = [
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
  "Applications",
];

const COMMON_PATHS = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";
const MAX_RESULTS = 100;

export default function Command() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resultsRef = useRef<SearchResult[]>([]);

  const preferences = getPreferenceValues<Preferences>();
  const searchDir = preferences.searchPath || os.homedir();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleSearch = useCallback(
    async (text: string) => {
      // Vorherige Suche abbrechen
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
        
        // Ripgrep args:
        // --json: hocheffizientes streaming format
        // --fixed-strings: wörtliche suche
        // --word-regexp: ganze wörter
        // --case-sensitive: groß-/kleinschreibung
        // --max-columns 500: lange zeilen kappen
        // --max-count 5: limit pro datei (optimiert)
        // --max-filesize 1M: riesige dateien ignorieren
        // --no-messages: keine berechtigungsfehler anzeigen
        // --no-unicode: schneller bei literaler suche
        const args = [
          "--json",
          "--fixed-strings",
          "--word-regexp",
          "--case-sensitive",
          "--max-columns", "500",
          "--max-count", "5",
          "--max-filesize", "1M",
          "--no-messages",
          "--no-unicode",
          ...ignoreArgs,
          text,
          searchDir
        ];

        const child = spawn("rg", args, {
          env: { ...process.env, PATH: `${process.env.PATH}:${COMMON_PATHS}` },
          signal: controller.signal,
        });

        const rl = readline.createInterface({
          input: child.stdout,
          terminal: false,
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
              const newResult: SearchResult = {
                file: data.path.text,
                line: data.line_number.toString(),
                text: data.lines.text.trim(),
              };
              
              resultsRef.current.push(newResult);

              // Batched UI updates: Update every 50ms to prevent UI lag
              if (!updateTimeoutRef.current) {
                updateTimeoutRef.current = setTimeout(() => {
                  setResults([...resultsRef.current]);
                  updateTimeoutRef.current = null;
                }, 50);
              }
            }
          } catch (e) {
            // Ignoriere fehlerhafte JSON zeilen
          }
        });

        child.on("error", (error: any) => {
          if (error.name === "AbortError") return;
          if (error.code === "ENOENT") {
            setErrorMsg("ripgrep (rg) wurde nicht gefunden. Bitte installiere es mit 'brew install ripgrep'.");
          } else {
            console.error("Spawn error:", error);
          }
          setIsLoading(false);
        });

        child.on("close", (code) => {
          setIsLoading(false);
          // Letztes Update erzwingen
          if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
            updateTimeoutRef.current = null;
          }
          setResults([...resultsRef.current]);

          // Wenn wir keine ergebnisse haben und der code nicht 0 ist (und nicht 1, was "keine treffer" bedeutet)
          if (resultsRef.current.length === 0 && code !== 0 && code !== 1 && !controller.signal.aborted) {
             // Möglicherweise ein fehler, aber wir zeigen einfach "Keine Ergebnisse" oder den bisherigen Stand
          }
        });

      } catch (error: any) {
        if (error.name === "AbortError") return;
        setIsLoading(false);
        console.error("Search error:", error);
      }
    },
    [searchDir],
  );

  if (errorMsg) {
    return (
      <Detail
        markdown={`# Fehler\n\n${errorMsg}`}
        actions={
          <ActionPanel>
            <Action.OpenInBrowser title="ripgrep auf GitHub" url="https://github.com/BurntSushi/ripgrep" />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={handleSearch}
      searchBarPlaceholder="Suchen nach Text in Dateien..."
      throttle={true}
      filtering={false}
    >
      <List.EmptyView 
        title={isLoading ? "Suchen..." : results.length === 0 ? "Keine Ergebnisse" : "Text eingeben"} 
        icon={Icon.MagnifyingGlass} 
      />
      {results.map((res, index) => (
        <List.Item
          key={`${res.file}-${res.line}-${index}`}
          title={res.text}
          subtitle={`${path.basename(res.file)}:${res.line}`}
          accessories={[{ text: path.dirname(res.file).replace(os.homedir(), "~") }]}
          actions={
            <ActionPanel>
              <Action.Open title="In Editor öffnen" target={res.file} />
              <Action.ShowInFinder path={res.file} />
              <Action.CopyToClipboard title="Pfad kopieren" content={res.file} />
              <Action.CopyToClipboard title="Text kopieren" content={res.text} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
