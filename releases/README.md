# Releases

Gotowe instalatory Szeptuchy do dystrybucji.

## Wersja 1.1.0

| System        | Plik                                    | Uwagi            |
| ------------- | --------------------------------------- | ---------------- |
| Windows (x64) | `windows/szeptucha_1.1.0_x64-setup.exe` | Instalator NSIS. |

### Nowości w tym buildzie

- **Podgląd na żywo** — pokazuje transkrypcję w trakcie mówienia (opcja, domyślnie wyłączona; Ustawienia → Zaawansowane → „Podgląd na żywo").
- **Edycja przed wklejeniem** — okno do przejrzenia i poprawienia tekstu przed wstawieniem (opcja, domyślnie wyłączona).

> Build macOS 1.1.0 do zrobienia z maszyny macOS.

## Wersja 1.0.0

| System                | Plik                                    | Uwagi                                             |
| --------------------- | --------------------------------------- | ------------------------------------------------- |
| macOS (Apple Silicon) | `macos/Szeptucha_1.0.0_aarch64.dmg`     | Tylko aarch64. Podpisany ad-hoc, bez notaryzacji. |
| Windows (x64)         | `windows/szeptucha_1.0.0_x64-setup.exe` | Instalator NSIS.                                  |

### Nowości w tym buildzie (macOS)

- **Podgląd na żywo** — pokazuje transkrypcję w trakcie mówienia (opcja, domyślnie wyłączona; Ustawienia → Zaawansowane → „Podgląd na żywo").
- **Edycja przed wklejeniem** — okno do przejrzenia i poprawienia tekstu przed wstawieniem (opcja, domyślnie wyłączona).

> Instalator Windows (`windows/…`) pochodzi z wcześniejszego builda i **nie zawiera** tych funkcji — do odświeżenia z maszyny Windows.

### macOS — uwagi

- Build jest tylko dla **Apple Silicon** (aarch64). Build uniwersalny (Intel) jest zablokowany, bo ONNX Runtime (`ort-sys`, potrzebny do VAD i modeli Parakeet) nie dostarcza prekompilowanych binarek dla `x86_64-apple-darwin`.
- Apple Intelligence (natywny post-processing) jest dostępny tylko na Apple Silicon z macOS 26+.
- Instalator jest podpisany ad-hoc (`signingIdentity: "-"`) i **nie jest notaryzowany** — przy pierwszym uruchomieniu Gatekeeper może wymagać ręcznego zezwolenia (Prawy klik → Otwórz, lub Ustawienia → Prywatność i bezpieczeństwo).

### Odtworzenie buildów

```bash
# macOS (Apple Silicon)
bun run tauri build

# Windows (x64) — na maszynie Windows
bun run tauri build
```
