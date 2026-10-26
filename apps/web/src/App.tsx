import { CircleAlert, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Brand } from "./components/Brand";
import { MapShell } from "./components/MapShell";
import {
  ApiError,
  api,
  errorMessage,
  type AuthResponse,
  type AuthUser,
  type TotpSetup,
} from "./lib/api";
import { LoginPage } from "./pages/LoginPage";
import { TwoFactorSetupPage } from "./pages/TwoFactorSetupPage";
import { TwoFactorVerifyPage } from "./pages/TwoFactorVerifyPage";

type Screen = "loading" | "login" | "2fa-setup" | "2fa-verify" | "map";

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [bootError, setBootError] = useState<string | undefined>();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .me()
      .then((response) => {
        if (cancelled) return;
        setUser(response.user);
        setScreen("map");
      })
      .catch((error) => {
        if (cancelled) return;
        if (!(error instanceof ApiError && error.status === 401)) {
          setBootError(errorMessage(error));
        }
        setScreen("login");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function finishAuthentication(response: AuthResponse) {
    if (response.status !== "authenticated") {
      throw new ApiError(500, "Respons autentikasi tidak dikenali. Coba login ulang.");
    }

    setUser(response.user);
    setPendingEmail("");
    setScreen("map");
  }

  async function handleLogin(email: string, password: string) {
    const response = await api.login(email, password);

    if (response.status === "authenticated") {
      setBootError(undefined);
      finishAuthentication(response);
      return;
    }

    setBootError(undefined);
    setPendingEmail(email);
    setScreen(response.status === "2fa_setup_required" ? "2fa-setup" : "2fa-verify");
  }

  const handleLoadSetup = useCallback(async (): Promise<TotpSetup> => {
    const response = await api.setup2fa();
    return response.setup;
  }, []);

  async function handleVerifySetup(code: string) {
    finishAuthentication(await api.verifySetup2fa(code));
  }

  async function handleVerify2fa(code: string) {
    finishAuthentication(await api.verify2fa(code));
  }

  async function handleCancelTwoFactor() {
    try {
      await api.logout();
    } catch {
      // Sesi sementara tetap akan diganti saat login berikutnya.
    }
    setPendingEmail("");
    setScreen("login");
  }

  async function handleLogout() {
    try {
      await api.logout();
      setUser(null);
      setPendingEmail("");
      setScreen("login");
    } catch (error) {
      setToast(errorMessage(error));
    }
  }

  if (screen === "loading") {
    return (
      <div className="boot-screen">
        <Brand />
        <div className="boot-status">
          <Loader2 size={20} className="spin" aria-hidden="true" />
          <span>Menyiapkan peta...</span>
        </div>
      </div>
    );
  }

  if (screen === "map" && user) {
    return (
      <>
        <MapShell onLogout={handleLogout} />
        {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
      </>
    );
  }

  if (screen === "2fa-setup") {
    return (
      <TwoFactorSetupPage
        email={pendingEmail}
        onLoad={handleLoadSetup}
        onVerify={handleVerifySetup}
        onCancel={handleCancelTwoFactor}
      />
    );
  }

  if (screen === "2fa-verify") {
    return (
      <TwoFactorVerifyPage
        email={pendingEmail}
        onVerify={handleVerify2fa}
        onCancel={handleCancelTwoFactor}
      />
    );
  }

  return <LoginPage initialError={bootError} onSubmit={handleLogin} />;
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="toast panel" role="alert">
      <CircleAlert size={20} strokeWidth={2} aria-hidden="true" />
      <span>{message}</span>
      <button type="button" className="toast-close" aria-label="Tutup pesan" onClick={onClose}>
        <X size={20} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
