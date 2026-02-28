import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { type AuthSession, fetchAuthSession } from 'aws-amplify/auth';

const AuthSessionContext = createContext<AuthSession>(null!);

// eslint-disable-next-line react-refresh/only-export-components
export function useAuthSession() {
  return useContext(AuthSessionContext);
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchAuthSession()
      .then(setSession)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div>
        <p>Couldn't connect. Please check your connection.</p>
      </div>
    );
  }

  if (!session) return null;

  return (
    <AuthSessionContext.Provider value={session}>
      {children}
    </AuthSessionContext.Provider>
  );
}
