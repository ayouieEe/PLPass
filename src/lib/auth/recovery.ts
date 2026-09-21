type AuthResult = { error: unknown | null };

type RecoveryAuthClient = {
  auth: {
    exchangeCodeForSession: (code: string) => Promise<AuthResult>;
    setSession: (tokens: { access_token: string; refresh_token: string }) => Promise<AuthResult>;
    getSession: () => Promise<{ data: { session: unknown | null }; error: unknown | null }>;
    updateUser: (attributes: { password: string }) => Promise<AuthResult>;
    signOut: (options: { scope: "global" }) => Promise<AuthResult>;
  };
};

type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type PasswordRecoveryLocation = Pick<Location, "search" | "hash">;
export type PasswordLinkType = "invite" | "recovery";

const passwordRecoveryMarkerKey = "plpass-password-recovery";
const passwordRecoveryMarkerValue = "active";

function recoveryStorage(storage?: RecoveryStorage) {
  return storage ?? window.sessionStorage;
}

export function clearPasswordRecoveryMarker(storage?: RecoveryStorage) {
  recoveryStorage(storage).removeItem(passwordRecoveryMarkerKey);
}

function markPasswordRecoveryReady(storage?: RecoveryStorage) {
  recoveryStorage(storage).setItem(passwordRecoveryMarkerKey, passwordRecoveryMarkerValue);
}

function hasPasswordRecoveryMarker(storage?: RecoveryStorage) {
  return recoveryStorage(storage).getItem(passwordRecoveryMarkerKey) === passwordRecoveryMarkerValue;
}

function hasRecoveryPayload(location: PasswordRecoveryLocation) {
  return Boolean(location.search || location.hash);
}

/** Identifies a Supabase password setup link without exposing its token. */
export function getPasswordLinkType(location: PasswordRecoveryLocation = window.location): PasswordLinkType | null {
  const type = new URLSearchParams(location.hash.startsWith("#") ? location.hash.slice(1) : location.hash).get("type");
  return type === "invite" || type === "recovery" ? type : null;
}

/** Returns true when the URL contains a one-time password setup payload. */
export function hasPasswordSetupPayload(location: PasswordRecoveryLocation = window.location) {
  return Boolean(getPasswordLinkType(location) || new URLSearchParams(location.search).get("code"));
}

/** Keeps the one-time payload attached while routing it to the public setup page. */
export function getPasswordSetupPath(location: PasswordRecoveryLocation, resetPath: string) {
  return `${resetPath}${location.search}${location.hash}`;
}

/**
 * Establishes a recovery session from either Supabase recovery URL format.
 * The tab-only marker permits a refresh after the sensitive URL is scrubbed.
 */
export async function establishPasswordRecoverySession(
  client: RecoveryAuthClient,
  location: PasswordRecoveryLocation = window.location,
  storage?: RecoveryStorage
) {
  const code = new URLSearchParams(location.search).get("code");
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      clearPasswordRecoveryMarker(storage);
      return false;
    }
    markPasswordRecoveryReady(storage);
    return true;
  }

  const fragment = new URLSearchParams(location.hash.startsWith("#") ? location.hash.slice(1) : location.hash);
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  const type = fragment.get("type");
  if ((type === "recovery" || type === "invite") && accessToken && refreshToken) {
    const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) {
      clearPasswordRecoveryMarker(storage);
      return false;
    }
    markPasswordRecoveryReady(storage);
    return true;
  }

  if (hasRecoveryPayload(location)) {
    clearPasswordRecoveryMarker(storage);
    return false;
  }

  if (!hasPasswordRecoveryMarker(storage)) return false;
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) {
    clearPasswordRecoveryMarker(storage);
    return false;
  }
  return true;
}

export async function saveRecoveredPassword(client: RecoveryAuthClient, password: string, storage?: RecoveryStorage) {
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;

  clearPasswordRecoveryMarker(storage);
  try {
    await client.auth.signOut({ scope: "global" });
  } catch {
    // The password update has already succeeded, so cleanup is best effort.
  }
}

export function shouldClearPasswordRecoveryMarker(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("session") || message.includes("token") || message.includes("jwt");
}
