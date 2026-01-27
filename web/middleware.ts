import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth

  // Public paths that don't require authentication
  const publicPaths = ["/", "/api/auth"]
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path))

  // If not logged in and trying to access protected route, redirect to home
  if (!isLoggedIn && !isPublicPath) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  // If logged in and trying to access home page, redirect based on role
  if (isLoggedIn && pathname === "/" && req.auth) {
    const userRole = req.auth.user?.role
    if (userRole === "admin") {
      return NextResponse.redirect(new URL("/admin", req.url))
    } else {
      return NextResponse.redirect(new URL("/client", req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
