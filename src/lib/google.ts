let googleClientId: string | undefined;

export function setGoogleClientId(clientId: string | undefined) {
  googleClientId = clientId;
}

export function getGoogleClientId() {
  return googleClientId || (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined);
}
