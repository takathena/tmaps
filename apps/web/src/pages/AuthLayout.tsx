import type { ReactNode } from "react";
import { Brand } from "../components/Brand";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-content">
        <div className="auth-brand">
          <Brand />
        </div>
        <section className="auth-card panel">{children}</section>
      </div>
    </div>
  );
}
