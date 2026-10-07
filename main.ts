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

    const action = incoming.searchParams.get("action") || "";
    const isFileDownload =
      action === "download_resource" || action === "download_shared";

    if (isFileDownload) {
      out.set(
        "content-type",
        upstream.headers.get("content-type") || "application/octet-stream",
      );
      const disposition = upstream.headers.get("content-disposition");
      if (disposition) out.set("content-disposition", disposition);
    } else {
      out.set("content-type", "text/html; charset=UTF-8");
    }

    out.set(
      "cache-control",
      upstream.headers.get("cache-control") ||
        "no-store, no-cache, must-revalidate",
    );
    out.set("x-content-type-options", "nosniff");
    out.set("x-jieun-proxy-version", "2026-10-07-v2");

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

Deno.serve({ automaticCompression: true }, handler);
