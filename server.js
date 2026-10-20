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
    if (!isFileDownload && (upstreamType || '').toLowerCase().includes('html') || (!isFileDownload && bytes.subarray(0,300).toString('utf8').toLowerCase().includes('<!doctype html'))) {
      let html = bytes.toString('utf8');
      const uiPatch = `<script>
document.addEventListener('DOMContentLoaded',function(){
  const attendance=document.querySelector('.studentAttendanceCard');
  if(attendance&&!attendance.dataset.compact){
    attendance.dataset.compact='1';
    const timeNodes=[...attendance.querySelectorAll('.attendanceTime')];
    const times=timeNodes.map(e=>e.textContent.trim());
    const hasAfternoon=times.some(t=>/13[:：]30|下午|오후/.test(t));
    const hasEvening=times.some(t=>/18[:：]30|晚上|晚间|저녁/.test(t));
    const oldHeading=attendance.querySelector('h3');
    if(oldHeading)oldHeading.remove();
    const advance=document.getElementById('studentAbsenceCard');
    if(advance)advance.remove();
    const wrapper=document.createElement('div');
    wrapper.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:12px;margin-bottom:12px';
    const existing=document.createElement('div');
    while(attendance.firstChild)existing.appendChild(attendance.firstChild);
    const buildSlot=(period,active,timeLabel)=>{
      const card=document.createElement('div');
      card.style.cssText='background:#fff5c4;border:1px solid #f4de88;border-radius:14px;padding:12px 14px;color:#745500';
      const title=document.createElement('div');
      title.style.cssText='font-size:16px;font-weight:850;margin-bottom:10px';
      title.textContent=active?'🕒 '+timeLabel:(period==='pm'?'☀️ 下午无课':'🌙 晚上无课');
      card.appendChild(title);
      const details=document.createElement('details');
      details.style.cssText='border-top:1px solid #e7d88d;padding-top:9px';
      const summary=document.createElement('summary');
      summary.style.cssText='cursor:pointer;font-size:14px;font-weight:750;line-height:1.55';
      summary.textContent='请假或缺席的同学，请展开这里 / 결석하는 학생은 여기를 펼쳐 주세요';
      details.appendChild(summary);
      if(!active){
        details.removeAttribute('open');
        const msg=document.createElement('div');
        msg.style.cssText='font-size:13px;margin-top:8px';
        msg.textContent='今天没有这节课 / 오늘은 이 수업이 없습니다';
        details.appendChild(msg);
      }
      card.appendChild(details);
      wrapper.appendChild(card);
      return details;
    };
    const afternoon=buildSlot('pm',hasAfternoon,'13:30 下午课');
    const evening=buildSlot('eve',hasEvening,'18:30 晚课');
    // Keep the existing attendance tools intact; never clone forms or break event listeners.
    if(hasAfternoon&&!hasEvening)afternoon.appendChild(existing);
    else if(hasEvening&&!hasAfternoon)evening.appendChild(existing);
    else if(hasAfternoon&&hasEvening){
      const blocks=[...existing.children];
      let moved=0;
      blocks.forEach(el=>{
        const t=(el.textContent||'').slice(0,300);
        const pm=/13[:：]30/.test(t), ev=/18[:：]30/.test(t);
        if(pm&&!ev){afternoon.appendChild(el);moved++}
        else if(ev&&!pm){evening.appendChild(el);moved++}
      });
      // Unclassified shared attendance controls remain visible in the evening panel.
      if(existing.childNodes.length)evening.appendChild(existing);
    } else evening.appendChild(existing);
    attendance.appendChild(wrapper);
  }
  const count=document.getElementById('studentAbsenceCount');
  if(count)count.remove();
  const homework=document.getElementById('studentVocabHomeworkCard');
  
  const today=document.querySelector('.studentTabbed');
  const vocab=document.getElementById('studentVocabPanel');
  if(today&&vocab&&today.previousElementSibling!==vocab)today.parentNode.insertBefore(vocab,today);
});
</script>`;
      html = html.replace('</body>', uiPatch + '</body>');
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