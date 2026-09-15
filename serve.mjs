import http from 'node:http';import fs from 'node:fs';
http.createServer((req,res)=>{
  if(req.url==='/'||req.url==='/Index.html'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(fs.readFileSync(new URL('Index.html',import.meta.url),'utf8').replace('/* DOMAIN_MODULE */',fs.readFileSync(new URL('client-domain.js',import.meta.url),'utf8')).replace('/* SYNC_MODULE */',fs.readFileSync(new URL('client-sync.js',import.meta.url),'utf8')));
  } else if (req.url === '/sw.js') {
    const swPath = new URL('sw.js', import.meta.url);
    if (fs.existsSync(swPath)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Service-Worker-Allowed': '/' });
      res.end(fs.readFileSync(swPath));
    } else {
      res.writeHead(404); res.end('Not found');
    }
  } else if (req.url.startsWith('/assets/')) {
    const filePath = new URL('.' + req.url, import.meta.url);
    if (fs.existsSync(filePath)) {
      const ext = req.url.split('.').pop();
      const mimeTypes = { png: 'image/png', svg: 'image/svg+xml', json: 'application/json' };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404); res.end('Not found');
    }
  } else {
    res.writeHead(404); res.end('Not found');
  }
}).listen(Number(process.env.PREVIEW_PORT)||8767,'127.0.0.1',()=>console.log('Preview ready'));
