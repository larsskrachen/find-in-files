import { List, ActionPanel, Action, getPreferenceValues, Icon, Detail, environment } from "@raycast/api";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { spawn } from "child_process";
import readline from "readline";
import path from "path";
import os from "os";
import { rgPath as vscodeRgPath } from "@vscode/ripgrep";
import fs from "fs";

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

const MAX_RESULTS = 100;
const IGNORE_ARGS = IGNORED_DIRS.flatMap((dir) => ["-g", `!**/${dir}/**`]);
const IS_WINDOWS = os.platform() === "win32";

// Ermittle den robusten Pfad zur ripgrep-Binärdatei
function getRipgrepPath(): { path: string; testedPaths: string[] } {
  const testedPaths: string[] = [];
  const binName = IS_WINDOWS ? "rg.exe" : "rg";

  // 1. Versuche den Pfad im Assets-Ordner (für Raycast Bundle optimiert)
  const assetsPath = path.join(environment.assetsPath, binName);
  testedPaths.push(`assetsPath: ${assetsPath}`);
  if (fs.existsSync(assetsPath)) {
    try {
      // Stelle sicher, dass die Binärdatei ausführbar ist (wichtig für Mac/Linux)
      if (!IS_WINDOWS) {
        fs.chmodSync(assetsPath, "755");
      }
      return { path: assetsPath, testedPaths };
    } catch (e) {
      testedPaths.push(`chmod failed for assetsPath: ${e}`);
    }
  }

  // 2. Versuche den Pfad aus dem Paket direkt
  if (vscodeRgPath) {
    testedPaths.push(`vscodeRgPath: ${vscodeRgPath}`);
    if (fs.existsSync(vscodeRgPath)) {
      return { path: vscodeRgPath, testedPaths };
    }
  }

  // 3. Versuche den Pfad über require.resolve
  try {
    const resolvedPath = require.resolve(`@vscode/ripgrep/bin/${binName}`);
    testedPaths.push(`require.resolve: ${resolvedPath}`);
    if (fs.existsSync(resolvedPath)) {
      return { path: resolvedPath, testedPaths };
    }
  } catch (e) {
    testedPaths.push(`require.resolve failed`);
  }

  // 4. Versuche lokale node_modules relativ zum Command (Hilfreich bei Raycast Dev)
  const devPath = path.join(environment.extensionPath, "node_modules", "@vscode", "ripgrep", "bin", binName);
  testedPaths.push(`devPath: ${devPath}`);
  if (fs.existsSync(devPath)) {
    return { path: devPath, testedPaths };
  }

  // 5. Fallback auf systemweites ripgrep (als letzter Rettungsanker)
  const fallback = IS_WINDOWS ? "rg.exe" : "rg";
  testedPaths.push(`fallback: ${fallback}`);
  return { path: fallback, testedPaths };
}

const rgInfo = getRipgrepPath();
const rgPath = rgInfo.path;

export default function Command() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  const performSearch = useCallback(
    async (text: string) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      
      setIsLoading(true);
      setErrorMsg(null);
      resultsRef.current = [];

      try {
        const args = [
          "--json",
          "--smart-case",
          "--fixed-strings",
          "--max-columns", "500",
          "--max-count", "5",
          "--max-filesize", "1M",
          "--no-messages",
          "--no-unicode",
          "--no-config",
          ...IGNORE_ARGS,
          text,
          searchDir
        ];

        const child = spawn(rgPath, args, {
          signal: controller.signal,
          shell: IS_WINDOWS,
        });

        const rl = readline.createInterface({
          input: child.stdout,
          terminal: false,
        });

        let isKilled = false;
        rl.on("line", (line) => {
          if (isKilled || resultsRef.current.length >= MAX_RESULTS) {
            if (!isKilled) {
              isKilled = true;
              child.kill();
              rl.close();
            }
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
            const pathsInfo = rgInfo.testedPaths.map(p => `- ${p}`).join("\n");
            setErrorMsg(
              `ripgrep konnte nicht unter dem Pfad "${rgPath}" gestartet werden. Das integrierte Paket scheint beschädigt zu sein oder die Binärdatei fehlt.\n\nGeprüfte Pfade:\n${pathsInfo}`
            );
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

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchText || searchText.length < 2) {
      setResults([]);
      resultsRef.current = [];
      setIsLoading(false);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch(searchText);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchText, performSearch]);

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
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Suchen nach Text in Dateien..."
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
              <Action.Open title="In Google Antigravity öffnen" target={res.file} application="Google Antigravity" icon={Icon.Code} />
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
