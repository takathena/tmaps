import { Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ErrorNotice } from "../components/ErrorNotice";
import { errorMessage, type TotpSetup } from "../lib/api";
import { AuthLayout } from "./AuthLayout";

type TwoFactorSetupPageProps = {
  email: string;
  onLoad: () => Promise<TotpSetup>;
  onVerify: (code: string) => Promise<void>;
  onCancel: () => Promise<void>;
};

export function TwoFactorSetupPage({
  email,
  onLoad,
  onVerify,
  onCancel,
}: TwoFactorSetupPageProps) {
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setLoadError(null);

    onLoad()
      .then((value) => {
        if (!cancelled) setSetup(value);
      })
      .catch((loadFailure) => {
        if (!cancelled) setLoadError(errorMessage(loadFailure));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [onLoad]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!setup || code.length !== 6) return;

    setVerifyError(null);
    setSubmitting(true);

    try {
      await onVerify(code);
    } catch (submitError) {
      setVerifyError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      await onCancel();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <AuthLayout>
      <div className="auth-heading">
        <h1>Aktifkan 2FA</h1>
        <p>
          Akun <strong>{email}</strong> mewajibkan verifikasi dua faktor. Pindai QR di
          bawah dengan aplikasi authenticator, lalu masukkan kode 6 digit untuk
          mengaktifkannya.
        </p>
      </div>

      {loading ? (
        <div className="setup-loading">
          <Loader2 size={20} className="spin" aria-hidden="true" />
          <span>Menyiapkan QR...</span>
        </div>
      ) : null}

      {loadError ? <ErrorNotice message={loadError} /> : null}

      {setup ? (
        <>
          <div className="qr-block">
            <div className="qr-frame">
              <img src={setup.qrCodeDataUrl} alt="QR code untuk aplikasi authenticator" />
            </div>

            <details className="secret-details">
              <summary>Tidak bisa memindai QR? Masukkan kode manual</summary>
              <code>{setup.secret}</code>
            </details>
          </div>

          {verifyError ? <ErrorNotice message={verifyError} /> : null}

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="field">
              <span className="field-label">Kode 6 digit</span>
              <input
                className="code-input"
                type="text"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  setVerifyError(null);
                }}
                required
                disabled={submitting}
              />
            </label>

            <button
              type="submit"
              className="btn-primary auth-submit"
              disabled={submitting || code.length !== 6}
            >
              {submitting ? (
                <>
                  <Loader2 size={20} className="spin" aria-hidden="true" />
                  Memverifikasi...
                </>
              ) : (
                "Aktifkan 2FA"
              )}
            </button>
          </form>
        </>
      ) : null}

      <div className="auth-actions">
        <button
          type="button"
          className="btn-link"
          onClick={handleCancel}
          disabled={cancelling}
        >
          {cancelling ? "Keluar..." : "Kembali ke login"}
        </button>
      </div>
    </AuthLayout>
  );
}
