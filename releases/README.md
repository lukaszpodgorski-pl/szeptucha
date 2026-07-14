# Releases

Gotowe instalatory Szeptuchy do dystrybucji.

## Wersja 1.0.0

| System | Plik | Uwagi |
| ------ | ---- | ----- |
| macOS (Apple Silicon) | `macos/Szeptucha_1.0.0_aarch64.dmg` | Tylko aarch64. Podpisany ad-hoc, bez notaryzacji. |
| Windows (x64) | `windows/szeptucha_1.0.0_x64-setup.exe` | Instalator NSIS. |

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
