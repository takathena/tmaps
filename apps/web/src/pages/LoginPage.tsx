import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ErrorNotice } from "../components/ErrorNotice";
import { errorMessage } from "../lib/api";
import { AuthLayout } from "./AuthLayout";

type LoginPageProps = {
  initialError?: string;
  onSubmit: (email: string, password: string) => Promise<void>;
};

export function LoginPage({ initialError, onSubmit }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await onSubmit(email.trim(), password);
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div className="auth-heading">
        <h1>Masuk ke TMaps</h1>
        <p>Gunakan akun yang diberikan admin untuk membuka peta perangkat jaringan.</p>
      </div>

      {error ? <ErrorNotice message={error} /> : null}

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            placeholder="nama@perusahaan.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
            autoFocus
            required
            disabled={submitting}
          />
        </label>

        <label className="field">
          <span className="field-label">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="Masukkan password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
            required
            disabled={submitting}
          />
        </label>

        <button type="submit" className="btn-primary auth-submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 size={20} className="spin" aria-hidden="true" />
              Memeriksa...
            </>
          ) : (
            "Masuk"
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
