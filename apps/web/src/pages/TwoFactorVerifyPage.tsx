import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ErrorNotice } from "../components/ErrorNotice";
import { errorMessage } from "../lib/api";
import { AuthLayout } from "./AuthLayout";

type TwoFactorVerifyPageProps = {
  email: string;
  onVerify: (code: string) => Promise<void>;
  onCancel: () => Promise<void>;
};

export function TwoFactorVerifyPage({
  email,
  onVerify,
  onCancel,
}: TwoFactorVerifyPageProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== 6) return;

    setError(null);
    setSubmitting(true);

    try {
      await onVerify(code);
    } catch (submitError) {
      setError(errorMessage(submitError));
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
        <h1>Verifikasi 2FA</h1>
        <p>
          Masukkan kode 6 digit dari aplikasi authenticator untuk akun{" "}
          <strong>{email}</strong>.
        </p>
      </div>

      {error ? <ErrorNotice message={error} /> : null}

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
              setError(null);
            }}
            autoFocus
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
            "Verifikasi"
          )}
        </button>
      </form>

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
