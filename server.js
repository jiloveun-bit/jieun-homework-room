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

    const action = incoming.searchParams.get('action') || '';
    const isFileDownload = action === 'download_resource' || action === 'download_shared' || action === 'library_download';

    if (isFileDownload) {
      res.setHeader('Content-Type', upstreamType || 'application/octet-stream');
      if (upstreamDisposition) res.setHeader('Content-Disposition', upstreamDisposition);
    } else {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.removeHeader('Content-Disposition');
    }
    res.setHeader('Cache-Control', upstreamCache || 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    let bytes = Buffer.from(await upstream.arrayBuffer());
    if (!isFileDownload && (upstreamType || '').includes('text/html')) {
      let html = bytes.toString('utf8');
      const uiPatch = `<script>
document.addEventListener('DOMContentLoaded',function(){
  const attendance=document.querySelector('.studentAttendanceCard');
  if(attendance&&!attendance.dataset.compact){
    attendance.dataset.compact='1';
    const times=[...attendance.querySelectorAll('.attendanceTime')].map(e=>e.textContent.trim());
    const unique=[...new Set(times)];
    const top=document.createElement('div');
    top.style.cssText='font-size:14px;font-weight:800;color:#405f7d;margin-bottom:10px;line-height:1.6';
    top.textContent='🕒 今日课程时间 / 오늘의 수업시간: '+(unique.length?unique.join(' · '):'暂无课程 / 수업 없음');
    attendance.insertBefore(top,attendance.firstChild);
    const details=document.createElement('details');
    details.style.cssText='border-top:1px solid #e8e0f4;padding-top:10px';
    const summary=document.createElement('summary');
    summary.style.cssText='cursor:pointer;font-size:16px;font-weight:850';
    summary.textContent='🩵 出勤确认 / 출석 체크 · 点击展开申报缺勤';
    details.appendChild(summary);
    const heading=attendance.querySelector('h3');
    if(heading)heading.remove();
    while(top.nextSibling) details.appendChild(top.nextSibling);
    attendance.appendChild(details);
  }
  const count=document.getElementById('studentAbsenceCount');
  const homework=document.getElementById('studentVocabHomeworkCard');
  if(count&&homework)homework.insertAdjacentElement('afterend',count);
  const today=document.querySelector('.studentTabbed');
  const vocab=document.getElementById('studentVocabPanel');
  if(today&&vocab&&today.previousElementSibling!==vocab)today.parentNode.insertBefore(vocab,today);
});
</script>`;
      if (html.includes('</body>')) html = html.replace('</body>', uiPatch + '</body>');
      bytes = Buffer.from(html, 'utf8');
    }
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