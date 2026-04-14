# Find in Files (Raycast Extension)

Eine hocheffiziente Raycast-Erweiterung für die blitzschnelle Volltextsuche innerhalb von Dateien. 

## Features

- **Radikale Performance**: Nutzt `ripgrep` (rg) für die schnellste Suche auf dem Markt.
- **Echtzeit-Ergebnisse**: Suchergebnisse werden gestreamt und sofort angezeigt, sobald sie gefunden werden.
- **Intelligente Filterung**: Ignoriert automatisch `node_modules`, `.venv`, `Library`, `Caches`, `.git`, `dist`, `build` und viele weitere Systemverzeichnisse.
- **Exakte Suche**: Findet exakt den eingegebenen Begriff (keine Fuzzy-Suche im Dateicontent).
- **Integrierte Vorschau**: Permanentes Detail-Fenster mit Dateipfad, Zeilennummer und Code-Vorschau für den schnellen Überblick.
- **Plattformübergreifend**: Optimiert für Raycast (macOS) und SuperCMD (macOS & Windows).
- **Erweiterte Aktionen**:
  - In Standard-Editor öffnen.
  - Öffnen mit... (Manuelle App-Auswahl).
  - In Antigravity öffnen.
  - In JetBrains IDEs öffnen (IntelliJ, WebStorm, PyCharm etc.).
  - Im Finder anzeigen.
  - Pfad in die Zwischenablage kopieren (Cmd+Shift+C).
  - Textinhalt kopieren (Cmd+C).

## Voraussetzungen

Für diese Erweiterung muss `ripgrep` (rg) auf deinem System installiert sein.

### Installation von ripgrep

Am einfachsten über Homebrew (macOS):

```bash
brew install ripgrep
```

Auf Windows (z.B. über Chocolatey oder Scoop):

```powershell
choco install ripgrep
# oder
scoop install ripgrep
```

## Konfiguration

Du kannst in den Raycast-Einstellungen der Erweiterung ein Standard-Suchverzeichnis festlegen (z. B. dein Home-Verzeichnis `~/` oder ein spezifischer Projektordner). Standardmäßig wird im Home-Verzeichnis des aktuellen Benutzers gesucht.

## Warum ist diese Suche so schnell?

- **Streaming**: Wir warten nicht auf den Abschluss des gesamten Suchvorgangs. Ergebnisse werden angezeigt, sobald der erste Treffer vorliegt.
- **Batched UI Updates**: Die Benutzeroberfläche wird in Intervallen (80ms) aktualisiert, um auch bei tausenden Treffern flüssig zu bleiben.
- **Flüssiges Tippen**: Alte Suchergebnisse bleiben sichtbar, bis die neue Suche Ergebnisse liefert. Dies verhindert Flackern und Unterbrechungen beim Tippen.
- **Intelligente Abbrüche**: Sobald du weiter tippst, wird die vorherige Suche sofort auf Systemebene beendet.
- **Optimierte Parameter**: Wir nutzen Flags wie `--no-unicode`, `--max-count 5`, Vorabberechnung von Ausschlussmustern und aggressive Filterung von Systemverzeichnissen.
- **Throttle**: Raycast-natives Throttling verhindert unnötige Prozess-Spawns bei schnellem Tippen.

---

Entwickelt für maximale Produktivität.