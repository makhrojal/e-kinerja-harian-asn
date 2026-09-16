import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const allowed = new Set([
  '.claspignore','.gitignore','appsscript.json','benchmark-results.json','benchmark.mjs',
  'ASSET-PROVENANCE.md','build.mjs','CHANGELOG.md','client-domain.js','client-sync.js','CONTRIBUTING.md',
  'Index.html','Kode.gs','LICENSE','manifest.json','package.json','README.md','SECURITY.md',
  'serve.mjs','Server.gs','sw.js','test.mjs','verify-public.mjs',
  'assets/manifest.json','assets/icons/apple-touch-icon.png','assets/icons/favicon-16x16.png',
  'assets/icons/favicon-32x32.png','assets/icons/icon-192.png','assets/icons/icon-512.png',
  'assets/icons/icon-maskable-192.png','assets/icons/icon-maskable-512.png',
  'assets/icons/logo-ekinerja.svg','assets/icons/manifest.json',
  'release-v0.3.1/regression.mjs','release-v0.3.1/results.json','scripts/generate-icon-kit.mjs'
]);
const excluded = new Set(['.git','node_modules']);
const root = path.dirname(fileURLToPath(import.meta.url)), files=[];
function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(excluded.has(entry.name))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())visit(full);else files.push(path.relative(root,full).replaceAll('\\','/'));}}
visit(root);
const unexpected=files.filter(file=>!allowed.has(file)),missing=[...allowed].filter(file=>!files.includes(file));
if(unexpected.length||missing.length)throw Error(`Allowlist gagal. Tak dikenal: ${unexpected.join(', ')||'-'}; hilang: ${missing.join(', ')||'-'}`);
const forbidden=[
  ['private Windows path',/C:\\Users\\|ACER M12/i],
  ['government workspace path',/ITJEN|Setitjen - Laporan Keuangan/i],
  ['private identifier',/\b\d{16,18}\b|[a-z0-9._%+-]+@gmail\.com/i],
  ['spreadsheet URL',/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9_-]{20,}/i],
  ['document URL',/docs\.google\.com\/document\/d\/[a-zA-Z0-9_-]{20,}/i],
  ['deployment URL',/script\.google\.com\/macros\/s\/AKfy[a-zA-Z0-9_-]{20,}/i],
  ['credential assignment',/(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*['"][^'"]{8,}/i]
];
const textExtensions=new Set(['.js','.mjs','.gs','.html','.json','.md','.svg','.gitignore','.claspignore']);
for(const file of files){
  if(file==='verify-public.mjs')continue;
  const ext=path.extname(file)||path.basename(file);if(!textExtensions.has(ext))continue;
  const body=fs.readFileSync(path.join(root,file),'utf8');
  for(const [label,pattern] of forbidden)if(pattern.test(body))throw Error(`${label} ditemukan pada ${file}`);
}
if(files.includes('.clasp.json'))throw Error('.clasp.json tidak boleh masuk paket publik.');
if(files.some(file=>/logo-google|official-google/i.test(file)))throw Error('Nama aset tidak boleh menyiratkan afiliasi resmi Google.');
const brandText=files.filter(file=>file!=='verify-public.mjs'&&textExtensions.has(path.extname(file)||path.basename(file))).map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
if(/Official Google-style|official Google product/i.test(brandText))throw Error('Klaim afiliasi Google ditemukan.');
const provenance=fs.readFileSync(path.join(root,'ASSET-PROVENANCE.md'),'utf8');
if(!provenance.includes('logo-ekinerja.svg')||!provenance.includes('SIL Open Font License 1.1')||!provenance.includes('86b2496092894d1fa22016dcde9721460c01d079dc8a2a14e526fd8602f63ac3'))throw Error('Ledger provenance aset tidak lengkap.');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'appsscript.json'),'utf8'));
if(manifest.webapp?.executeAs!=='USER_DEPLOYING'||manifest.webapp?.access!=='MYSELF')throw Error('Manifest akses pribadi berubah.');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),license=fs.readFileSync(path.join(root,'LICENSE'),'utf8');
if(pkg.license!=='MIT'||!/^MIT License\r?\n/.test(license)||!license.includes('Copyright (c) 2026 Mhd. Makhrojal Nasution')||!license.includes('THE SOFTWARE IS PROVIDED "AS IS"'))throw Error('Lisensi MIT belum lengkap.');
const build=fs.readFileSync(path.join(root,'build.mjs'),'utf8');if(build.includes('new Date()')||!build.includes('Build: deterministic'))throw Error('Build belum deterministik.');
console.log(`Paket publik lulus allowlist, scan privasi, manifest pribadi, lisensi MIT, dan gate build: ${files.length} file.`);
