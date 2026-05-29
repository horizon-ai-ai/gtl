import { NextResponse, type NextRequest } from "next/server";

function isStaticAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/uploads") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}

function isLocalHost(host: string) {
  return (
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("0.0.0.0")
  );
}

// Platform hosts serve the app itself (front page, login, dashboard) rather
// than being treated as tenant custom domains.
function isPlatformHost(host: string) {
  return isLocalHost(host) || host.split(":")[0] === "gtl-xi.vercel.app";
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const { pathname } = req.nextUrl;

  if (host.endsWith(":3001")) {
    if (isStaticAsset(pathname) || pathname.startsWith("/api")) {
      return NextResponse.next();
    }

    if (pathname === "/") {
      const url = req.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }

    if (pathname === "/login" || pathname === "/register") {
      return NextResponse.next();
    }

    if (!pathname.startsWith("/admin")) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (!isPlatformHost(host) && !host.endsWith(":3001")) {
    if (!isStaticAsset(pathname) && !pathname.startsWith("/api")) {
      if (pathname === "/") {
        const url = req.nextUrl.clone();
        url.pathname = `/site-host/${host.split(":")[0]}`;
        return NextResponse.rewrite(url);
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
