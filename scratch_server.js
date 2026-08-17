const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/upload') {
    const filePath = path.join(__dirname, 'swc.tgz');
    const writeStream = fs.createWriteStream(filePath);
    req.pipe(writeStream);
    writeStream.on('finish', () => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(8080, () => {
  console.log('Server listening on port 8080');
});
