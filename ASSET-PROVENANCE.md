+# Asset provenance and licensing

Status: reviewed 16 September 2026 for public Beta distribution.

| Asset family | Source and production path | License / boundary | Verification |
|---|---|---|---|
| Application code, HTML, CSS, manifests, and original copy | Authored for E-Kinerja Harian ASN in this repository | MIT, copyright Mhd. Makhrojal Nasution | Covered by `LICENSE`; public allowlist and privacy scan |
| Folded-ribbon application mark | Original geometric SVG at `assets/icons/logo-ekinerja.svg`; created for this project and maintained as editable paths | MIT as part of this repository | SHA-256 `86b2496092894d1fa22016dcde9721460c01d079dc8a2a14e526fd8602f63ac3` |
| PNG icon family | Generated from the SVG by `scripts/generate-icon-kit.mjs` at 16, 32, 180, 192, and 512 pixels, including maskable variants | MIT as generated project assets | PNG signature and declared dimensions are checked by the regression suite |
| Inter typeface | Loaded at runtime from Google Fonts; the font binary is not bundled in the release ZIP | Inter is distributed under the SIL Open Font License 1.1 by its upstream authors: https://github.com/rsms/inter/blob/master/LICENSE.txt | System-ui fallback remains available when the remote font cannot load |
| Google, Google Drive, Google Sheets, Google Docs, and BKN names | Used only to identify compatible third-party services | Their names and marks remain the property of their respective owners | README states that this application is not an official Google or BKN product |

The application mark uses a four-color productivity palette and generic folded-ribbon/check geometry. This audit found no bundled Google service logo or upstream Google artwork. The mark must not be described as official Google branding. The neutral filename and automated public-release gate prevent that implication from returning.

## Recorded generated assets

| File | SHA-256 |
|---|---|
| `apple-touch-icon.png` | `8680404dc3114c48624b65f5e9a5f3277691b05a21a621d39be3ea31f9748dba` |
| `favicon-16x16.png` | `35ee87e985af6463c5279034a13b4418f264cd60383d78ac35bd08dac6a0c477` |
| `favicon-32x32.png` | `5ce58abc8c7fc740f6170f935ca35e1c393fe3c8ce8c140fc45324379445531a` |
| `icon-192.png` | `74000c13f586da4686e0d5adb13f1a9334776b21cac77ba29b5cc511f66e9015` |
| `icon-512.png` | `aa7c6f150b80cc6965da19163097dd20af1714d892fae6b346845f1d3856f6c8` |
| `icon-maskable-192.png` | `0786ba62b98fb73e7ec62b8307250f07a6dc7e92d32370f7006ad0f1e7804b4d` |
| `icon-maskable-512.png` | `95f990af2e84f3c1fbe0003aeb82d23a40dfee26c6c8d16bc6bf9aced8e38e88` |

Any future bundled image, font, illustration, or copied UI asset must be added to this ledger with its source, permission or license, and hash before a public release.
