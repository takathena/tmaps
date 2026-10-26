import { Bell } from "lucide-react";

export function NotificationBell() {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label="Notifikasi"
      aria-disabled="true"
      title="Notifikasi belum tersedia"
    >
      <Bell size={20} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
