import fs from 'node:fs';
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', import.meta.url), 'utf8'));
const html = fs.readFileSync(new URL('Index.html', import.meta.url), 'utf8').replace('/* DOMAIN_MODULE */',fs.readFileSync(new URL('client-domain.js',import.meta.url),'utf8')).replace('/* SYNC_MODULE */',fs.readFileSync(new URL('client-sync.js',import.meta.url),'utf8'));
const server = fs.readFileSync(new URL('Server.gs', import.meta.url), 'utf8');
const banner = `/**\n * E-Kinerja Harian ASN v${pkg.version}\n * Standar Rilis: Semantic Versioning (SemVer)\n * Build: deterministic from checked-in sources\n */\n`;
fs.writeFileSync(new URL('Kode.gs', import.meta.url), banner + server + '\nconst APP_HTML = ' + JSON.stringify(html) + ';\n');
console.log(`Kode.gs v${pkg.version} siap dipasang (${Buffer.byteLength(server + html)} bytes sumber).`);
