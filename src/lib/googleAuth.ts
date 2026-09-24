import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
  Auth
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

let app: any = null;
export let auth: Auth | null = null;

try {
  const envKey = (import.meta as any).env?.VITE_FIREBASE_API_KEY;
  const resolvedApiKey = (typeof envKey === 'string' && envKey.trim() !== '') 
    ? envKey 
    : (firebaseConfig && firebaseConfig.apiKey);
    
  if (resolvedApiKey && resolvedApiKey.trim() !== '') {
    const finalConfig = {
      ...firebaseConfig,
      apiKey: resolvedApiKey
    };
    app = getApps().length === 0 ? initializeApp(finalConfig) : getApps()[0];
    auth = getAuth(app);
  } else {
    console.warn('Firebase apiKey is missing or empty. Google Auth will run in offline mode.');
  }
} catch (err) {
  console.warn('Could not initialize Firebase Auth:', err);
}

const provider = new GoogleAuthProvider();
// Workspace scopes for Calendar management
provider.addScope('https://www.googleapis.com/auth/calendar.events');
provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
provider.setCustomParameters({
  prompt: 'consent'
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initGoogleAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (!auth) {
    if (onAuthFailure) onAuthFailure();
    return () => {};
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string }> => {
  if (!auth) {
    throw new Error('Google Sign-In is unavailable because Firebase API Key is not configured.');
  }

  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get Google Calendar access token from sign-in');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getCachedAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

export const googleLogout = async () => {
  if (auth) {
    await signOut(auth);
  }
  cachedAccessToken = null;
};
