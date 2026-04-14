import { List, ActionPanel, Action, getPreferenceValues, Icon, Detail } from "@raycast/api";
import { useState, useCallback, useRef } from "react";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";

const execPromise = promisify(exec);

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
];

const COMMON_PATHS = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";

export default function Command() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const preferences = getPreferenceValues<Preferences>();
  const searchDir = preferences.searchPath || os.homedir();

  const handleSearch = useCallback(
    async (text: string) => {
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
        // Ripgrep command
        // --vimgrep: file:line:col:text
        // --fixed-strings: treat pattern as literal
        // --word-regexp: force whole word matches
        // --case-sensitive: case matters
        // --max-columns 500: limit long lines
        // --max-count 10: limit results per file
        // --max-filesize 1M: avoid huge files
        const escapedText = text.replace(/"/g, '\\"');
        const cmd = `rg --vimgrep --fixed-strings --word-regexp --case-sensitive --max-columns 500 --max-count 10 --max-filesize 1M --no-messages ${globArgs} "${escapedText}" "${searchDir}" | head -n 100`;

        const processResults = (stdout: string) => {
          const lines = stdout.split("\n").filter(Boolean);
          const searchResults: SearchResult[] = lines
            .map((line) => {
              const parts = line.split(":");
              if (parts.length < 4) return null;
              const file = parts[0];
              const lineNum = parts[1];
              const textContent = parts.slice(3).join(":").trim();
              return {
                file,
                line: lineNum,
                text: textContent,
              };
            })
            .filter((res): res is SearchResult => res !== null);

          setResults(searchResults);
        };

        const { stdout } = await execPromise(cmd, {
          timeout: 10000,
          env: { ...process.env, PATH: `${process.env.PATH}:${COMMON_PATHS}` },
          // Signal is tricky in old node via promisify, but Raycast runs modern Node
          signal: controller.signal as any,
        });

        processResults(stdout);
        setIsLoading(false);
      } catch (error: any) {
        if (error.name === "AbortError" || controller.signal.aborted) {
          return;
        }

        if (error.stdout) {
          const lines = error.stdout.split("\n").filter(Boolean);
          const searchResults: SearchResult[] = lines
            .map((line: string) => {
              const parts = line.split(":");
              if (parts.length < 4) return null;
              const file = parts[0];
              const lineNum = parts[1];
              const textContent = parts.slice(3).join(":").trim();
              return {
                file,
                line: lineNum,
                text: textContent,
              };
            })
            .filter((res: any): res is SearchResult => res !== null);

          setResults(searchResults);
        } else if (error.code === 127) {
          setErrorMsg("ripgrep (rg) wurde nicht gefunden. Bitte installiere es mit 'brew install ripgrep'.");
        } else if (error.code !== 1 && error.code !== 2) {
          // 1 means no results, 2 means error (e.g., some files could not be opened)
          console.error("Search error:", error);
        } else {
          setResults([]);
        }
        setIsLoading(false);
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
