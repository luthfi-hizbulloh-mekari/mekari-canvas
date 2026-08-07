import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { devBypassEmail } from "@/lib/dev-bypass";

export function middleware(request: NextRequest) {
  const bypassEmail = devBypassEmail();
  if (bypassEmail) {
    if (request.nextUrl.pathname === "/sign-in") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (request.nextUrl.pathname === "/sign-in") {
    return NextResponse.next();
  }

  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/sign-in"],
};
