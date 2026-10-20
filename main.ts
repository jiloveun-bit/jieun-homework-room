const TARGET = "https://uvaetmejrqclrdfromlm.supabase.co/functions/v1/homework-room";
// proxy-build: 2026-10-07-v2

function copySetCookies(from: Headers, to: Headers) {
  const h = from as Headers & { getSetCookie?: () => string[] };
  const cookies = typeof h.getSetCookie === "function"
    ? h.getSetCookie()
    : (from.get("set-cookie") ? [from.get("set-cookie")!] : []);

  for (const cookie of cookies) {
    const fixed =
      cookie
        .replace(/;\s*Domain=[^;]+/gi, "")
        .replace(/;\s*Path=[^;]+/gi, "")
        .replace(/;\s*HttpOnly/gi, "")
        .replace(/;\s*Secure/gi, "")
        .replace(/;\s*SameSite=[^;]+/gi, "") +
      "; Path=/; HttpOnly; Secure; SameSite=Lax";
    to.append("set-cookie", fixed);
  }
}

async function handler(request: Request): Promise<Response> {
  try {
    const incoming = new URL(request.url);
    const target = new URL(TARGET);
    target.search = incoming.search;
    target.searchParams.set("forceFunctionRegion", "ap-northeast-2");

    const headers = new Headers();
    for (const name of [
      "content-type",
      "cookie",
      "accept",
      "accept-language",
      "user-agent",
    ]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    });

    const action = incoming.searchParams.get("action") || "";
    const isFileDownload =
      action === "download_resource" || action === "download_shared" || action === "library_download";

    // For downloads, keep the browser on jieun.class.deno.net.
    // Supabase returns a short-lived signed URL; Deno fetches it server-side
    // so phones in mainland China never need to open supabase.co directly.
    if (isFileDownload) {
      const signedLocation = upstream.headers.get("location");
      if (upstream.status >= 300 && upstream.status < 400 && signedLocation) {
        const fileRes = await fetch(signedLocation, {
          method: "GET",
          redirect: "follow",
          headers: {
            "user-agent": request.headers.get("user-agent") || "Mozilla/5.0",
            "accept": "*/*",
          },
        });

        const fileOut = new Headers();
        fileOut.set(
          "content-type",
          fileRes.headers.get("content-type") || "application/octet-stream",
        );
        const encodedName = upstream.headers.get("x-jieun-download-name");
        if (encodedName) {
          let fileName = "download";
          try { fileName = decodeURIComponent(encodedName); } catch {}
          const extMatch = fileName.match(/(\.[A-Za-z0-9]+)$/);
          const fallback = "download" + (extMatch?.[1] || "");
          fileOut.set(
            "content-disposition",
            'attachment; filename="' + fallback + '"; filename*=UTF-8\'\'' + encodeURIComponent(fileName),
          );
        } else {
          const disposition = fileRes.headers.get("content-disposition");
          if (disposition) fileOut.set("content-disposition", disposition);
        }
        const len = fileRes.headers.get("content-length");
        if (len) fileOut.set("content-length", len);
        fileOut.set("cache-control", "private, no-store");
        fileOut.set("content-transfer-encoding", "binary");
        fileOut.set("x-content-type-options", "nosniff");
        fileOut.set("x-download-options", "noopen");
        fileOut.set("x-jieun-proxy-version", "2026-10-08-v8");

        return new Response(fileRes.body, {
          status: fileRes.status,
          headers: fileOut,
        });
      }
    }

    const out = new Headers();
    copySetCookies(upstream.headers, out);

    const location = upstream.headers.get("location");
    if (location) {
      const fixed =
        location === "/homework-room" || location.endsWith("/homework-room")
          ? "/"
          : location;
      out.set("location", fixed);
    }

    if (isFileDownload) {
      out.set(
        "content-type",
        upstream.headers.get("content-type") || "application/octet-stream",
      );
      const disposition = upstream.headers.get("content-disposition");
      if (disposition) out.set("content-disposition", disposition);
      const len = upstream.headers.get("content-length");
      if (len) out.set("content-length", len);
      out.set("content-transfer-encoding", "binary");
      out.set("x-download-options", "noopen");
    } else {
      out.set("content-type", "text/html; charset=UTF-8");
    }

    out.set(
      "cache-control",
      upstream.headers.get("cache-control") ||
        "no-store, no-cache, must-revalidate",
    );
    out.set("x-content-type-options", "nosniff");
    out.set("x-jieun-proxy-version", "2026-10-08-v8");

    // Apply the same attendance layout to the actual Deno-operated student site.
    if (!isFileDownload && upstream.status === 200 && request.method === "GET") {
      let html = await upstream.text();
      if (/<(?:!doctype\s+html|html|body)(?:\s|>)/i.test(html)) {
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
    wrapper.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:14px;margin:4px 0 14px';
    const existing=document.createElement('div');
    while(attendance.firstChild)existing.appendChild(attendance.firstChild);
    const buildSlot=(period,active,timeLabel)=>{
      const card=document.createElement('div');
      card.style.cssText='background:'+(active?'#ffffff':'#f8fafc')+';border:1px solid '+(active?'#d8e3ef':'#e5e9ef')+';border-radius:18px;padding:18px;color:#253449;box-shadow:0 3px 15px rgba(32,53,77,.035);min-width:0';
      const title=document.createElement('div');
      title.style.cssText='font-size:20px;letter-spacing:-.35px;font-weight:800;margin-bottom:14px;line-height:1.45';
      title.textContent=active?timeLabel:(period==='pm'?'下午无课':'晚上无课');
      const label=document.createElement('div');
      label.style.cssText='font-size:12px;font-weight:750;letter-spacing:.6px;margin-bottom:5px;color:'+(active?'#446b91':'#8993a1');
      label.textContent=period==='pm'?'下午':'晚上';
      card.appendChild(label);
      card.appendChild(title);
      const details=document.createElement('details');
      details.style.cssText='border-top:1px solid #e8edf3;padding-top:12px';
      const summary=document.createElement('summary');
      summary.style.cssText='cursor:pointer;font-size:13px;font-weight:650;line-height:1.6;color:#426587;padding:2px 0;touch-action:manipulation';
      summary.textContent='请假或缺席的同学，请点击展开';
      details.appendChild(summary);
      if(!active){
        details.removeAttribute('open');
        const msg=document.createElement('div');
        msg.style.cssText='font-size:12px;color:#7c8795;margin-top:9px';
        msg.textContent='今天没有这节课';
        details.appendChild(msg);
      }
      card.appendChild(details);
      wrapper.appendChild(card);
      return details;
    };
    attendance.style.cssText='border:1px solid #edf1f5;border-radius:20px;background:#fff;padding:16px;box-shadow:0 5px 20px rgba(28,45,66,.035)';
    const afternoon=buildSlot('pm',hasAfternoon,'13:30 · 下午课');
    const evening=buildSlot('eve',hasEvening,'18:30 · 晚课');
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
  // Style the closed header only; leave the expanded test records untouched.
  if(vocab){
    vocab.style.setProperty('background','#ffffff','important');
    vocab.style.setProperty('border','1px solid #eac8d6','important');
    vocab.style.setProperty('border-radius','16px','important');
    vocab.style.setProperty('padding','15px','important');
    vocab.style.setProperty('box-shadow','0 2px 8px rgba(177,57,105,.025)','important');
    const summary=vocab.querySelector(':scope > summary');
    if(summary){
      summary.style.setProperty('background','#ffffff','important');
      summary.style.setProperty('border-radius','12px','important');
      const heading=summary.querySelector('span');
      if(heading)heading.style.setProperty('color','#945875','important');
      const arrow=summary.querySelectorAll('span')[2]||summary.lastElementChild;
      if(arrow)arrow.style.setProperty('color','#a88093','important');
      const hint=summary.querySelector('small');
      if(hint)hint.style.setProperty('color','#987e8a','important');
    }
  }
});
</script>`;
      html = html.replaceAll("정상 출석이면 체크하지 않아도 돼요. / 正常出席无需操作", "正常出席无需操作").replaceAll("정상 출석이면 체크하지 않아도 돼요.", "正常出席无需操作");
      html = html.replaceAll("이미 입력된 테스트입니다. 수정하시겠습니까?", "该学生的本次考试成绩已录入，确定要修改吗？");
      html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, uiPatch + "</body>") : html + uiPatch;
      out.delete("content-length");
      return new Response(html, { status: upstream.status, headers: out });
      }
      return new Response(html, { status: upstream.status, headers: out });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: out,
    });
  } catch (error) {
    console.error("proxy error", error);
    return new Response(
      '<!doctype html><meta charset="utf-8"><h1>잠시 오류가 났어요.</h1><p>페이지를 새로고침해 주세요.</p>',
      {
        status: 500,
        headers: {
          "content-type": "text/html; charset=UTF-8",
          "cache-control": "no-store",
        },
      },
    );
  }
}

Deno.serve(handler);
