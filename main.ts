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
      const uiPatch = `<style>
/* Unified student classroom: short attendance row and polished compact study cards */
body:has(.jhAttendanceGrid) .studentAttendanceCard{
  border:0!important;background:transparent!important;padding:0!important;
  box-shadow:none!important;margin:8px 0 10px!important;
}
.jhAttendanceHeader{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0 0 10px;padding:0 2px}
.jhAttendanceHeader strong{color:#3e5577;font-size:15px;font-weight:830;line-height:1.4}
.jhAttendanceHeader small{display:block;margin-top:3px;color:#8699b0;font-size:11px}
.jhNoClassNote{display:inline-flex;gap:6px;align-items:center;color:#8093a9;background:#f4f6fc;border:1px solid #dfe7f1;border-radius:8px;padding:6px 9px;font-size:11px}
.jhAttendanceGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,355px),1fr));gap:11px;align-items:start}
.jhAttendanceSlot{padding:13px 15px;border:1px solid #dbe5f1;border-radius:13px;background:#fff;box-shadow:0 3px 13px rgba(60,82,125,.04);min-width:0}
.jhAttendanceSlotHeader{display:flex;gap:9px;align-items:center;padding:0 0 9px;border-bottom:1px solid #e8edf5;margin-bottom:7px}
.jhAttendanceIcon{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#e9ecfb;color:#6876a7;font-weight:860;font-size:11px;flex-shrink:0}
.jhAttendanceSlotHeader strong{display:block;font-size:13px;color:#3c597a;line-height:1.4}
.jhAttendanceSlotHeader small{display:block;font-size:10px;color:#96a5b5;line-height:1.4;margin-top:1px}
.jhAttendanceGrid .attendanceLesson{border:0!important;background:transparent!important;padding:0!important;margin:0!important;box-shadow:none!important}
.jhAttendanceGrid .attendanceLesson+.attendanceLesson{margin-top:10px!important;padding-top:10px!important;border-top:1px dashed #dbe4ee!important}
.jhAttendanceGrid .attendanceLessonTitle{display:none!important}
.jhAttendanceGrid .attendanceLesson .attendanceSelector{margin:5px 0 0!important;width:100%!important;min-width:0!important}
.jhAttendanceGrid .attendanceButtons{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;align-items:stretch!important}
.jhAttendanceGrid .attendanceButtons>button,.jhAttendanceGrid .attendanceButtons button{
 display:flex!important;align-items:center!important;justify-content:center!important;
 box-sizing:border-box!important;min-height:41px!important;height:41px!important;
 margin:0!important;padding:6px 9px!important;border-radius:9px!important;
 font-size:12px!important;font-weight:780!important;line-height:1.3!important;min-width:0!important;
}
.jhAttendanceGrid .attendancePostForm{
 margin:9px 0 0!important;padding:10px 11px!important;
 border:1px solid #dbe6f0!important;background:#f8faff!important;border-radius:10px!important;
}
.jhAttendanceGrid .attendancePostForm textarea{min-height:70px!important;font-size:12px!important}
.jhAttendanceGrid .attendancePostForm button{min-height:37px!important;border-radius:8px!important;font-size:12px!important}
.jhAttendanceGrid .majorClash{margin:7px 0!important;padding:11px 12px!important;border:1px solid #dbe5ef!important;background:#f5f8fc!important;border-radius:10px!important;font-size:12px!important}
.jhAttendanceGrid .majorClash>div{font-size:12px!important;line-height:1.6!important}
.jhAttendanceGrid .majorClash button{min-height:36px!important;font-size:11px!important;padding:6px 8px!important;border-radius:8px!important}
.jhAttendanceNote{display:flex;align-items:center;gap:6px;color:#8495a9;font-size:10.5px;line-height:1.6;padding:9px 2px 0}
body:has(.studentCompactHero) #studentTodayFold{
 background:#fff!important;border:1px solid #dce5f0!important;border-radius:13px!important;padding:11px 12px!important;
 box-shadow:0 3px 12px rgba(60,83,130,.04)!important;margin:11px 0!important}
body:has(.studentCompactHero) #studentTodayFold>summary{
 background:linear-gradient(90deg,#e9ecfc,#f1f8fd)!important;color:#496486!important;
 font-size:13px!important;padding:9px 11px!important;border-radius:9px!important;
}
body:has(.studentCompactHero) #studentTodayFold .studentTabbed{margin-top:8px!important}
body:has(.studentCompactHero) #studentTodayFold .studentTabbed>.card,
body:has(.studentCompactHero) #studentTodayFold .card{
 padding:10px 12px!important;margin:7px 0!important;border-radius:10px!important;
 background:#fff!important;border-color:#dce6f2!important;box-shadow:none!important}
body:has(.studentCompactHero) #studentTodayFold .lessonGroup,
body:has(.studentCompactHero) #studentTodayFold .polishedLesson{
 padding:9px 11px!important;margin:8px 0 0!important;border:1px solid #e2e9f5!important;
 border-radius:9px!important;background:#fff!important}
body:has(.studentCompactHero) #studentTodayFold .lessonGroupTitle{font-size:12px!important;font-weight:780!important;color:#54708e!important;margin:0 0 5px!important}
body:has(.studentCompactHero) #studentTodayFold .item{padding:6px 2px!important;font-size:12.5px!important;line-height:1.5!important}
body:has(.studentCompactHero) #studentTodayFold .item b{font-size:12.5px!important}
body:has(.studentCompactHero) #studentTodayFold .itemNum{width:22px!important;min-width:22px!important;height:22px!important;border-radius:7px!important;font-size:12px!important}
body:has(.studentCompactHero) #studentTodayFold .hwContent{font-size:12px!important;line-height:1.55!important}
body:has(.studentCompactHero) #studentVocabPanel{border-color:#dce5f0!important;background:#fff!important;border-radius:12px!important}
@media(max-width:610px){
 .jhAttendanceGrid{grid-template-columns:minmax(0,1fr)}
 .jhAttendanceSlot{padding:11px 12px}
 .jhAttendanceHeader strong{font-size:14px}
 .jhAttendanceGrid .attendanceButtons>button,.jhAttendanceGrid .attendanceButtons button{font-size:11.5px!important}
 body:has(.studentCompactHero) #studentTodayFold .card{padding:9px!important}
}
</style><script>
document.addEventListener('DOMContentLoaded',function(){
 const attendance=document.querySelector('.studentAttendanceCard');
 if(!attendance||attendance.dataset.compact==='2026-refined')return;
 try{
  const lessons=[...attendance.querySelectorAll('.attendanceLesson')];
  if(!lessons.length)return;
  attendance.dataset.compact='2026-refined';
  const header=document.createElement('div');header.className='jhAttendanceHeader';
  const head=document.createElement('div');head.innerHTML='<strong>出勤确认</strong><small>课堂出席与缺席 · 简洁记录</small>';
  header.appendChild(head);
  const slotRows=[
   {period:'afternoon',label:'下午课',badge:'午',times:lessons.filter(el=>Number((el.querySelector('.attendanceTime')?.textContent||'').slice(0,2))<18)},
   {period:'evening',label:'晚课',badge:'晚',times:lessons.filter(el=>Number((el.querySelector('.attendanceTime')?.textContent||'').slice(0,2))>=18)}
  ];
  const empty=slotRows.filter(row=>row.times.length===0).map(row=>row.label+'暂无课程');
  if(empty.length){
    const chip=document.createElement('span');chip.className='jhNoClassNote';chip.textContent=empty.join(' · ');
    header.appendChild(chip);
  }
  const grid=document.createElement('div');grid.className='jhAttendanceGrid';
  for(const row of slotRows){
   if(!row.times.length)continue;
   const card=document.createElement('section');card.className='jhAttendanceSlot';
   const label=document.createElement('div');label.className='jhAttendanceSlotHeader';
   const icon=document.createElement('span');icon.className='jhAttendanceIcon';icon.textContent=row.badge;
   const caption=document.createElement('div');
   caption.innerHTML='<strong>'+row.label+'</strong><small>'+row.times.map(el=>(el.querySelector('.attendanceTime')?.textContent||'').replace('课程','').trim()).join(' · ')+' · 出勤记录</small>';
   label.appendChild(icon);label.appendChild(caption);card.appendChild(label);
   for(const lesson of row.times){
    // Move full forms without rebuilding any action or changing event handlers.
    lesson.querySelector('.attendanceLessonTitle')?.remove();
    const notice=lesson.querySelector('div[style*="默认已选择出席"]');
    if(notice)notice.remove();
    if(lesson.querySelector('.majorClash')){
      const selector=lesson.querySelector('.attendanceSelector');
      if(selector)selector.style.setProperty('display','none','important');
    }
    card.appendChild(lesson);
   }
   grid.appendChild(card);
  }
  const foot=document.createElement('div');foot.className='jhAttendanceNote';
  foot.textContent='ⓘ 上课开始10分钟后不可修改出勤状态。';
  attendance.replaceChildren(header,grid,foot);
  // Keep advance leave functionality and other page content intact.
 }catch(err){console.error('compact attendance layout:',err);}
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
