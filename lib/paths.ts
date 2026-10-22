/** True on the login page. Static export uses trailing slashes, so usePathname() may return "/login/". */
export function isLoginPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === "/login"
}
