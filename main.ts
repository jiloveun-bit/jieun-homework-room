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
    const lessons=[...attendance.querySelectorAll('.attendanceLesson')];
    const intro=attendance.querySelector('.attendanceIntro');
    if(intro)intro.remove();
    const oldHeading=attendance.querySelector('h3');
    if(oldHeading)oldHeading.remove();
    const advance=document.getElementById('studentAbsenceCard');
    if(advance)advance.remove();
    const wrapper=document.createElement('div');
    wrapper.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:14px;align-items:stretch';
    const buildSlot=(period,time)=>{
      const lesson=lessons.find(el=>(el.querySelector('.attendanceTime')?.textContent||'').includes(time));
      const card=document.createElement('section');
      card.style.cssText='background:#fff;border:1px solid #d9e3ee;border-radius:18px;padding:18px;min-width:0;display:flex;flex-direction:column;gap:8px';
      const label=document.createElement('div');
      label.style.cssText='font-size:13px;font-weight:750;color:#446b91';
      label.textContent=period==='pm'?'下午':'晚上';
      const heading=document.createElement('div');
      heading.style.cssText='font-size:22px;font-weight:800;line-height:1.4;color:#253449;margin:0 0 9px';
      heading.textContent=lesson?(time+' · '+(period==='pm'?'下午课':'晚课')):(period==='pm'?'下午无课':'晚上无课');
      card.appendChild(label);card.appendChild(heading);
      if(lesson){
        lesson.style.cssText='border:0!important;border-top:1px solid #e8edf3!important;border-radius:0!important;background:transparent!important;padding:14px 0 0!important;margin:0!important;box-shadow:none!important';
        const duplicate=lesson.querySelector('.attendanceLessonTitle');
        if(duplicate)duplicate.remove();
        card.appendChild(lesson);
      }
      wrapper.appendChild(card);
    };
    buildSlot('pm','13:30');
    buildSlot('eve','18:30');
    attendance.querySelectorAll('.attendanceLesson').forEach(el=>el.remove());
    attendance.replaceChildren(wrapper);
    attendance.style.cssText='border:0;background:transparent;padding:0;box-shadow:none';
    const note=document.createElement('div');
    note.style.cssText='font-size:12px;color:#68788b;line-height:1.55;padding:10px 3px 2px';
    note.textContent='ⓘ 课程开始10分钟后不可修改出勤状态。';
    attendance.appendChild(note);
  }
  const count=document.getElementById('studentAbsenceCount');
  if(count)count.remove();
  const homework=document.getElementById('studentVocabHomeworkCard');
  
  const today=document.querySelector('.studentTabbed');
  const vocab=document.getElementById('studentVocabPanel');
  if(today&&!today.closest('#studentTodayFold')){
    const fold=document.createElement('details');
    fold.id='studentTodayFold';
    fold.style.cssText='background:#fff;border:1px solid #eac8d6;border-radius:16px;padding:15px;box-shadow:0 2px 8px rgba(177,57,105,.025);margin:0 0 12px';
    const head=document.createElement('summary');
    head.style.cssText='list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px;touch-action:manipulation';
    const title=document.createElement('span');
    title.style.cssText='font-size:17px;font-weight:850;color:#945875';
    title.textContent='📚 今日学习';
    const hint=document.createElement('span');
    hint.style.cssText='font-size:12px;font-weight:550;color:#987e8a';
    hint.textContent='点击展开查看';
    const arrow=document.createElement('span');
    arrow.style.cssText='font-size:21px;color:#a88093';
    arrow.textContent='⌄';
    const right=document.createElement('span');
    right.style.cssText='display:flex;align-items:center;gap:9px';
    right.appendChild(hint);right.appendChild(arrow);
    head.appendChild(title);head.appendChild(right);
    fold.appendChild(head);
    const originalHeader=today.querySelector(':scope > div > h3');
    if(originalHeader&&originalHeader.textContent.includes('今日学习'))originalHeader.parentElement.remove();
    today.style.setProperty('background','transparent','important');
    today.style.setProperty('box-shadow','none','important');
    today.style.setProperty('border','0','important');
    today.style.setProperty('margin','12px 0 0','important');
    today.style.setProperty('padding','0','important');
    const parent=today.parentNode;
    parent.insertBefore(fold,today);
    fold.appendChild(today);
    fold.addEventListener('toggle',()=>{hint.textContent=fold.open?'点击收起':'点击展开查看';arrow.textContent=fold.open?'⌃':'⌄'});
    if(vocab)fold.insertAdjacentElement('afterend',vocab);
  }
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
