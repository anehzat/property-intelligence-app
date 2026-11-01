/** True on the login page. Static export uses trailing slashes, so usePathname() may return "/login/". */
export function isLoginPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === "/login"
}

const strip = (pathname: string) => pathname.replace(/\/+$/, "")

/** The RP Data connect page and OAuth callback. */
export function isRpDataPath(pathname: string): boolean {
  const p = strip(pathname)
  return p === "/connect-rpdata" || p === "/auth/rpdata/callback"
}

/** Pages reachable without a full session: login and the RP Data pages. */
export function isPublicAuthPath(pathname: string): boolean {
  return isLoginPath(pathname) || isRpDataPath(pathname)
}
