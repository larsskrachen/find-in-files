import { List, ActionPanel, Action, getPreferenceValues, Icon, Detail, environment, LocalStorage } from "@raycast/api";
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
  score?: number;
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
  "tmp",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "out",
  ".next",
  "vendor",
  "target",
  "bin",
  "sbin",
  "obj",
  "Library",
  "Pictures",
  "Music",
  "Movies",
  ".Trash",
  ".cache",
  "Caches",
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
  "System",
  "Volumes",
  "private",
  "dev",
  "etc",
  "opt",
  "var",
  "usr",
  "boot",
  "mnt",
  "media",
  "srv",
  "run",
  ".cargo",
  ".rustup",
  ".npm-global",
  ".nvm",
  ".rbenv",
  ".asdf",
  ".pyenv",
  ".oh-my-zsh",
  ".bun",
  ".deno",
  "debug",
  "release",
  "ipch",
  ".output",
  ".wrangler",
  ".svelte-kit",
  ".parcel-cache",
  ".eslintcache",
  ".stylelintcache",
  "dist-ssr",
  ".yarn/cache",
  ".yarn/unplugged",
  "go",
  "miniconda3",
];

const MAX_RESULTS = 100;
const IGNORE_ARGS = IGNORED_DIRS.flatMap((dir) => ["-g", `!**/${dir}/**`]);
const IS_WINDOWS = os.platform() === "win32";
const IS_MACOS = os.platform() === "darwin";

// Usage tracking helpers
async function getUsageCount(filePath: string): Promise<number> {
  const count = await LocalStorage.getItem<number>(`usage:${filePath}`);
  return count || 0;
}

async function incrementUsage(filePath: string, cache?: Map<string, number>) {
  const count = await getUsageCount(filePath);
  const newCount = count + 1;
  await LocalStorage.setItem(`usage:${filePath}`, newCount);
  if (cache) cache.set(filePath, newCount);
}

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resultsRef = useRef<SearchResult[]>([]);
  const usageCacheRef = useRef<Map<string, number>>(new Map());
  const userIsNavigatingRef = useRef(false);

  const preferences = getPreferenceValues<Preferences>();
  const searchDir = useMemo(() => preferences.searchPath || os.homedir(), [preferences.searchPath]);

  // Usage-Counts einmalig beim Start laden
  useEffect(() => {
    LocalStorage.allItems().then((items) => {
      const map = new Map<string, number>();
      for (const [key, value] of Object.entries(items)) {
        if (key.startsWith("usage:")) {
          map.set(key.slice(6), Number(value) || 0);
        }
      }
      usageCacheRef.current = map;
    });
  }, []);

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

      // Regex für Wortgrenzen-Match im Dateinamen vorbereiten (Case-Insensitive)
      const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const wordBoundaryRegex = new RegExp(`\\b${escapedText}\\b`, "i");

      const runRipgrep = (candidateFiles?: string[]) => {
        const args = [
          "--json",
          "--fixed-strings", // "100% match" - kein Regex
          "--word-regexp", // Nur ganze Wörter
          "--ignore-case", // Groß-/Kleinschreibung ignorieren
          "--hidden", // Versteckte Dateien (Dotfiles) einschließen
          "--no-ignore", // .gitignore ignorieren (für site-packages etc)
          "--max-columns", "500",
          "--max-count", "3", // Reduziere pro-Datei-Treffer für bessere Übersicht
          "--max-filesize", "1M",
          "--no-messages",
          "--no-unicode",
          "--no-config",
          "--no-binary",
          ...IGNORE_ARGS,
          text,
        ];

        if (!candidateFiles) {
          args.push(searchDir);
        } else {
          // Begrenze auf 200 Dateien, um ARG_MAX sicher zu umgehen
          args.push(...candidateFiles.slice(0, 200));
        }

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
              const filePath = data.path.text;
              const fileName = path.basename(filePath);

              // Scoring-Logik (synchron aus Cache)
              let score = 0;
              if (wordBoundaryRegex.test(fileName)) score += 100;
              score += (usageCacheRef.current.get(filePath) || 0) * 50;

              const rawText: string = data.lines?.text ?? "";
              // Null-Bytes und Steuerzeichen entfernen (z.B. aus Binärdateien)
              const cleanText = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
              if (!cleanText) return; // Binärdatei-Treffer überspringen

              const newResult: SearchResult = {
                file: filePath,
                line: data.line_number.toString(),
                text: cleanText,
                score: score,
              };

              resultsRef.current.push(newResult);

              // Batched UI updates (Sortieren nur einmal pro Batch)
              // Kein Update wenn User gerade navigiert – würde Raycast crashen
              if (!updateTimeoutRef.current && !userIsNavigatingRef.current) {
                updateTimeoutRef.current = setTimeout(() => {
                  updateTimeoutRef.current = null;
                  if (userIsNavigatingRef.current) return;
                  resultsRef.current.sort((a, b) => (b.score || 0) - (a.score || 0));
                  setResults([...resultsRef.current]);
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
          if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
            updateTimeoutRef.current = null;
          }
          if (!controller.signal.aborted) {
            setResults([...resultsRef.current]);
          }
        });

        return child;
      };

      try {
        if (IS_MACOS) {
          // Stage 1: macOS Spotlight Index nutzen
          // Hinweis: mdfind ist oft case-insensitive, ripgrep filtert dann case-sensitive nach.
          const mdfind = spawn("mdfind", ["-onlyin", searchDir, text], {
            signal: controller.signal
          });

          const rlMdfind = readline.createInterface({
            input: mdfind.stdout,
            terminal: false,
          });

          const MAX_CANDIDATES = 50;
          const IGNORED_SET = new Set(IGNORED_DIRS);
          const candidatePaths: string[] = [];
          let mdfindKilled = false;

          rlMdfind.on("line", (filePath) => {
            if (controller.signal.aborted || mdfindKilled) return;
            // Schnelle Prüfung: Pfad-Segmente gegen Set testen
            const parts = filePath.split("/");
            if (parts.some((p) => IGNORED_SET.has(p))) return;
            candidatePaths.push(filePath);
            // Frühzeitig abbrechen wenn genug Kandidaten gefunden
            if (candidatePaths.length >= MAX_CANDIDATES) {
              mdfindKilled = true;
              mdfind.kill();
              rlMdfind.close();
            }
          });

          mdfind.on("close", (code) => {
            if (controller.signal.aborted) return;

            if (candidatePaths.length > 0) {
              runRipgrep(candidatePaths);
            } else {
              // Fallback auf Full Ripgrep Scan
              runRipgrep();
            }
          });

          mdfind.on("error", (err) => {
            if (err.name === "AbortError") return;
            console.error("mdfind error:", err);
            runRipgrep(); // Fallback
          });

        } else {
          runRipgrep();
        }

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

    userIsNavigatingRef.current = false;

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
      onSelectionChange={(id) => { userIsNavigatingRef.current = true; setSelectedId(id); }}
      searchBarPlaceholder="Suchen nach Text in Dateien..."
      filtering={false}
      isShowingDetail={true}
    >
      <List.EmptyView 
        title={isLoading ? "Suchen..." : results.length === 0 ? "Keine Ergebnisse" : "Text eingeben"} 
        description={results.length === 0 && !isLoading ? "Tippe mindestens 2 Zeichen ein, um die Suche zu starten." : undefined}
        icon={Icon.MagnifyingGlass} 
      />
      {results.map((res) => {
        const itemId = `${res.file}:${res.line}`;
        const isSelected = selectedId === itemId;
        return (
        <List.Item
          key={itemId}
          id={itemId}
          title={res.text.slice(0, 100)}
          subtitle={path.basename(res.file)}
          detail={isSelected ? (
            <List.Item.Detail
              metadata={
                <List.Item.Detail.Metadata>
                  <List.Item.Detail.Metadata.Label title="Datei" text={path.basename(res.file)} />
                  <List.Item.Detail.Metadata.Label title="Pfad" text={res.file.replace(os.homedir(), "~")} />
                  <List.Item.Detail.Metadata.Label title="Zeile" text={res.line} />
                  <List.Item.Detail.Metadata.Separator />
                  <List.Item.Detail.Metadata.Label title="Gefundener Text" text={res.text.slice(0, 300)} />
                </List.Item.Detail.Metadata>
              }
            />
          ) : undefined}
          actions={
            <ActionPanel>
              <Action.Open title="In Editor öffnen" target={res.file} onOpen={() => incrementUsage(res.file, usageCacheRef.current)} />
              <Action.OpenWith path={res.file} title="Öffnen mit..." onOpen={() => incrementUsage(res.file, usageCacheRef.current)} />
              <Action.Open title="In Google Antigravity öffnen" target={res.file} application="Google Antigravity" icon={Icon.Code} onOpen={() => incrementUsage(res.file, usageCacheRef.current)} />
              <ActionPanel.Submenu title="In JetBrains IDE öffnen" icon={Icon.Code}>
                <Action.Open title="IntelliJ IDEA" target={res.file} application="IntelliJ IDEA" onOpen={() => incrementUsage(res.file, usageCacheRef.current)} />
                <Action.Open title="WebStorm" target={res.file} application="WebStorm" onOpen={() => incrementUsage(res.file, usageCacheRef.current)} />
                <Action.Open title="PyCharm" target={res.file} application="PyCharm" onOpen={() => incrementUsage(res.file, usageCacheRef.current)} />
                <Action.Open title="PhpStorm" target={res.file} application="PhpStorm" onOpen={() => incrementUsage(res.file, usageCacheRef.current)} />
                <Action.Open title="GoLand" target={res.file} application="GoLand" onOpen={() => incrementUsage(res.file, usageCacheRef.current)} />
                <Action.Open title="CLion" target={res.file} application="CLion" onOpen={() => incrementUsage(res.file, usageCacheRef.current)} />
                <Action.Open title="Rider" target={res.file} application="Rider" onOpen={() => incrementUsage(res.file, usageCacheRef.current)} />
              </ActionPanel.Submenu>
              <Action.ShowInFinder path={res.file} onOpen={() => incrementUsage(res.file, usageCacheRef.current)} />
              <Action.CopyToClipboard 
                title="Pfad kopieren" 
                content={res.file} 
                shortcut={{ modifiers: ["cmd", "shift"], key: "c" }} 
                onCopy={() => incrementUsage(res.file, usageCacheRef.current)}
              />
              <Action.CopyToClipboard 
                title="Text kopieren" 
                content={res.text} 
                shortcut={{ modifiers: ["cmd"], key: "c" }} 
                onCopy={() => incrementUsage(res.file, usageCacheRef.current)}
              />
            </ActionPanel>
          }
        />
      )})}
    </List>
  );
}
