# Find in Files (Raycast Extension)

Eine hocheffiziente Raycast-Erweiterung für die blitzschnelle Volltextsuche innerhalb von Dateien. 

## Features

- **Radikale Performance**: Nutzt `ripgrep` (rg) für die schnellste Suche auf dem Markt.
- **Echtzeit-Ergebnisse**: Suchergebnisse werden gestreamt und sofort angezeigt, sobald sie gefunden werden.
- **Intelligente Filterung**: Ignoriert automatisch `node_modules`, `.venv`, `Library`, `Caches`, `.git`, `dist`, `build` und viele weitere Systemverzeichnisse.
- **Exakte Suche**: Findet exakt den eingegebenen Begriff (keine Fuzzy-Suche im Dateicontent).
- **Integrierte Vorschau**: Schnelles Durchsuchen der Fundstellen mit Dateipfad und Zeilennummer.
- **Aktionen**:
  - In Standard-Editor öffnen.
  - Im Finder anzeigen.
  - Pfad in die Zwischenablage kopieren.
  - Textinhalt kopieren.

## Voraussetzungen

Für diese Erweiterung muss `ripgrep` (rg) auf deinem System installiert sein.

### Installation von ripgrep

Am einfachsten über Homebrew:

```bash
brew install ripgrep
```

## Konfiguration

Du kannst in den Raycast-Einstellungen der Erweiterung ein Standard-Suchverzeichnis festlegen (z. B. dein Home-Verzeichnis `~/` oder ein spezifischer Projektordner). Standardmäßig wird im Home-Verzeichnis des aktuellen Benutzers gesucht.

## Warum ist diese Suche so schnell?

- **Streaming**: Wir warten nicht auf den Abschluss des gesamten Suchvorgangs. Ergebnisse werden angezeigt, sobald der erste Treffer vorliegt.
- **JSON-Processing**: Die Kommunikation mit `ripgrep` erfolgt über einen hocheffizienten JSON-Stream.
- **Intelligente Abbrüche**: Sobald du weiter tippst, wird die vorherige Suche sofort auf Systemebene beendet, um Ressourcen zu sparen.
- **Optimierte Parameter**: Wir nutzen Flags wie `--max-filesize`, `--no-messages` und gezielte Ausschlussmuster, um unnötige Dateizugriffe zu vermeiden.

---

Entwickelt für maximale Produktivität.