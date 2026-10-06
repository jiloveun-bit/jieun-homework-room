const http = require('http');

const TARGET = 'https://uvaetmejrqclrdfromlm.supabase.co/functions/v1/homework-room';

const server = http.createServer(async (req, res) => {
  try {
    const incoming = new URL(req.url, 'http://localhost');
    const target = TARGET + incoming.search;

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;

    const headers = {};
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
    if (req.headers['cookie']) headers['cookie'] = req.headers['cookie'];

    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET','HEAD'].includes(req.method) ? undefined : body,
      redirect: 'manual'
    });

    console.log("[proxy]", req.method, req.url, "=>", upstream.status, "location=", upstream.headers.get("location") || "-", "cookie=", upstream.headers.get("set-cookie") ? "yes" : "no");
    res.statusCode = upstream.status;

    const loc = upstream.headers.get('location');
    if (loc) {
      const fixed = (loc === '/homework-room' || loc.endsWith('/homework-room')) ? '/' : loc;
      res.setHeader('Location', fixed);
    }

    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) {
      const fixedCookie = setCookie
        .replace(/;\s*Domain=[^;]+/ig, '')
        .replace(/;\s*Path=[^;]+/ig, '')
        + '; Path=/; HttpOnly; Secure; SameSite=Lax';
      res.setHeader('Set-Cookie', fixedCookie);
    }

    const upstreamType = upstream.headers.get('content-type');
    const upstreamDisposition = upstream.headers.get('content-disposition');
    const upstreamCache = upstream.headers.get('cache-control');

    const isAttachment = !!upstreamDisposition;
    const responseType = isAttachment
      ? (upstreamType || 'application/octet-stream')
      : 'text/html; charset=UTF-8';
    res.setHeader('Content-Type', responseType);
    if (upstreamDisposition) res.setHeader('Content-Disposition', upstreamDisposition);
    res.setHeader('Cache-Control', upstreamCache || 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Length', String(bytes.length));
    res.end(bytes);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    res.end('<!doctype html><meta charset="utf-8"><h1>잠시 오류가 났어요.</h1><p>페이지를 새로고침해 주세요.</p>');
  }
});

const port = process.env.PORT || 3000;
server.listen(port, '0.0.0.0');