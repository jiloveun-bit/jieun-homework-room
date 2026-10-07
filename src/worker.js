const TARGET = "https://uvaetmejrqclrdfromlm.supabase.co/functions/v1/homework-room";

export default {
  async fetch(request) {
    try {
      const incoming = new URL(request.url);
      const target = new URL(TARGET);
      target.search = incoming.search;

      const headers = new Headers();
      const contentType = request.headers.get("content-type");
      const cookie = request.headers.get("cookie");
      if (contentType) headers.set("content-type", contentType);
      if (cookie) headers.set("cookie", cookie);

      const upstream = await fetch(target.toString(), {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "manual"
      });

      const out = new Headers();

      const location = upstream.headers.get("location");
      if (location) {
        const fixed =
          location === "/homework-room" || location.endsWith("/homework-room")
            ? "/"
            : location;
        out.set("location", fixed);
      }

      const setCookie = upstream.headers.get("set-cookie");
      if (setCookie) {
        const fixedCookie =
          setCookie
            .replace(/;\s*Domain=[^;]+/gi, "")
            .replace(/;\s*Path=[^;]+/gi, "")
            .replace(/;\s*HttpOnly/gi, "")
            .replace(/;\s*Secure/gi, "")
            .replace(/;\s*SameSite=[^;]+/gi, "") +
          "; Path=/; HttpOnly; Secure; SameSite=Lax";
        out.set("set-cookie", fixedCookie);
      }

      const action = incoming.searchParams.get("action") || "";
      const isFileDownload =
        action === "download_resource" || action === "download_shared";

      if (isFileDownload) {
        out.set(
          "content-type",
          upstream.headers.get("content-type") || "application/octet-stream"
        );
        const disposition = upstream.headers.get("content-disposition");
        if (disposition) out.set("content-disposition", disposition);
      } else {
        out.set("content-type", "text/html; charset=UTF-8");
      }

      out.set(
        "cache-control",
        upstream.headers.get("cache-control") ||
          "no-store, no-cache, must-revalidate"
      );
      out.set("x-content-type-options", "nosniff");

      return new Response(upstream.body, {
        status: upstream.status,
        headers: out
      });
    } catch {
      return new Response(
        '<!doctype html><meta charset="utf-8"><h1>잠시 오류가 났어요.</h1><p>페이지를 새로고침해 주세요.</p>',
        {
          status: 500,
          headers: {
            "content-type": "text/html; charset=UTF-8",
            "cache-control": "no-store"
          }
        }
      );
    }
  }
};
