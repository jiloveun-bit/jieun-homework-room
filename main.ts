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
      action === "download_resource" || action === "download_shared";

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
