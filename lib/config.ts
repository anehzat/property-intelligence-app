// Public identifiers (not secrets), inlined at build time from .env.
export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "",
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "",
  userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "",
  rpdataAuthUrl: process.env.NEXT_PUBLIC_RPDATA_AUTH_URL ?? "",
  rpdataClientId: process.env.NEXT_PUBLIC_RPDATA_CLIENT_ID ?? "",
}

// Hidden for now: the mocked AI analyst, the demo listings and the N3X7 property score. Flip to bring them back.
export const features = {
  ai: false,
  demo: false,
  score: false,
}
