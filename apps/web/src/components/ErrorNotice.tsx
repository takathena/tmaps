import { CircleAlert } from "lucide-react";

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="form-error" role="alert">
      <CircleAlert size={20} strokeWidth={2} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
