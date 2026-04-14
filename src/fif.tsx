import { List, ActionPanel, Action, getPreferenceValues, Icon, Detail } from "@raycast/api";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
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

const COMMON_UNIX_PATHS = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];
const MAX_RESULTS = 100;
const IGNORE_ARGS = IGNORED_DIRS.flatMap((dir) => ["-g", `!**/${dir}/**`]);
const IS_WINDOWS = os.platform() === "win32";
const PATH_DELIMITER = path.delimiter;

export default function Command() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resultsRef = useRef<SearchResult[]>([]);

  const preferences = getPreferenceValues<Preferences>();
  const searchDir = useMemo(() => preferences.searchPath || os.homedir(), [preferences.searchPath]);

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
      
      // Wir leeren die UI nicht sofort (setResults([]) entfernt), 
      // damit das Tippen flüssiger wirkt (kein Flackern).
      // Die neuen Ergebnisse ersetzen die alten, sobald der erste Treffer da ist.
      setIsLoading(true);
      setErrorMsg(null);
      resultsRef.current = [];

      try {
        // Ripgrep args
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
          ...IGNORE_ARGS,
          text,
          searchDir
        ];

        // Prepare PATH
        const currentPath = process.env.PATH || "";
        const extraPaths = IS_WINDOWS ? [] : COMMON_UNIX_PATHS;
        const newPath = [...currentPath.split(PATH_DELIMITER), ...extraPaths].join(PATH_DELIMITER);

        const child = spawn("rg", args, {
          env: { ...process.env, PATH: newPath },
          signal: controller.signal,
          shell: IS_WINDOWS, // Benötigt für manche Windows-Environments
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

              // Batched UI updates: Update every 80ms (optimiert für Flüssigkeit)
              if (!updateTimeoutRef.current) {
                updateTimeoutRef.current = setTimeout(() => {
                  setResults([...resultsRef.current]);
                  updateTimeoutRef.current = null;
                }, 80);
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
          
          // Wenn der Prozess fertig ist und wir keine neuen Ergebnisse haben, leeren wir die Liste
          if (!controller.signal.aborted) {
            setResults([...resultsRef.current]);
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
      isShowingDetail={true}
    >
      <List.EmptyView 
        title={isLoading ? "Suchen..." : results.length === 0 ? "Keine Ergebnisse" : "Text eingeben"} 
        description={results.length === 0 && !isLoading ? "Tippe mindestens 2 Zeichen ein, um die Suche zu starten." : undefined}
        icon={Icon.MagnifyingGlass} 
      />
      {results.map((res, index) => (
        <List.Item
          key={`${res.file}-${res.line}-${index}`}
          title={res.text}
          subtitle={path.basename(res.file)}
          detail={
            <List.Item.Detail
              markdown={`
### ${path.basename(res.file)}
**Pfad:** \`${res.file.replace(os.homedir(), "~")}\`
**Zeile:** ${res.line}

\`\`\`
${res.text}
\`\`\`
              `}
              metadata={
                <List.Item.Detail.Metadata>
                  <List.Item.Detail.Metadata.Label title="Datei" text={path.basename(res.file)} />
                  <List.Item.Detail.Metadata.Label title="Pfad" text={res.file.replace(os.homedir(), "~")} />
                  <List.Item.Detail.Metadata.Label title="Zeile" text={res.line} />
                  <List.Item.Detail.Metadata.Separator />
                  <List.Item.Detail.Metadata.Label title="Gefundener Text" text={res.text} />
                </List.Item.Detail.Metadata>
              }
            />
          }
          actions={
            <ActionPanel>
              <Action.Open title="In Editor öffnen" target={res.file} />
              <Action.OpenWith path={res.file} title="Öffnen mit..." />
              <Action.Open title="In Antigravity öffnen" target={res.file} application="Antigravity" icon={Icon.Code} />
              <ActionPanel.Submenu title="In JetBrains IDE öffnen" icon={Icon.Code}>
                <Action.Open title="IntelliJ IDEA" target={res.file} application="IntelliJ IDEA" />
                <Action.Open title="WebStorm" target={res.file} application="WebStorm" />
                <Action.Open title="PyCharm" target={res.file} application="PyCharm" />
                <Action.Open title="PhpStorm" target={res.file} application="PhpStorm" />
                <Action.Open title="GoLand" target={res.file} application="GoLand" />
                <Action.Open title="CLion" target={res.file} application="CLion" />
                <Action.Open title="Rider" target={res.file} application="Rider" />
              </ActionPanel.Submenu>
              <Action.ShowInFinder path={res.file} />
              <Action.CopyToClipboard title="Pfad kopieren" content={res.file} shortcut={{ modifiers: ["cmd", "shift"], key: "c" }} />
              <Action.CopyToClipboard title="Text kopieren" content={res.text} shortcut={{ modifiers: ["cmd"], key: "c" }} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
