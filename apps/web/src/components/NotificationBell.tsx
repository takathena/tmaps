import { Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, type Notification } from "../lib/api";

type NotificationBellProps = {
  open: boolean;
  unreadCount: number;
  onOpenChange: (open: boolean) => void;
  onUnreadCountChange: (count: number) => void;
  onNotificationClick: (deviceId: string) => void;
};

export function NotificationBell({ open, unreadCount, onOpenChange, onUnreadCountChange, onNotificationClick }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.getNotifications();
      setNotifications(response.notifications);
    } catch (error) {
      console.error("Load notifications failed:", errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load notifications saat dropdown dibuka
  useEffect(() => {
    if (open) {
      void loadNotifications();
    }
  }, [open, loadNotifications]);

  // Close dropdown saat klik di luar
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      
      // Ignore clicks on notification bell button itself
      if (target.closest('[aria-label="Notifikasi"]')) {
        return;
      }
      
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        onOpenChange(false);
      }
    }

    if (open) {
      // Use setTimeout to avoid immediate close on button click
      const timeoutId = setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 0);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [open, onOpenChange]);

  async function handleNotificationClick(notification: Notification) {
    onOpenChange(false);
    onNotificationClick(notification.deviceId);

    if (!notification.isRead) {
      try {
        await api.markNotificationRead(notification.id);
        onUnreadCountChange(Math.max(0, unreadCount - 1));
        setNotifications((items) =>
          items.map((item) =>
            item.id === notification.id ? { ...item, isRead: true } : item
          )
        );
      } catch (error) {
        console.error("Mark read failed:", errorMessage(error));
      }
    }
  }

  async function handleMarkAllRead() {
    try {
      await api.markAllNotificationsRead();
      onUnreadCountChange(0);
      setNotifications((items) =>
        items.map((item) => ({ ...item, isRead: true }))
      );
    } catch (error) {
      console.error("Mark all read failed:", errorMessage(error));
    }
  }

  return (
    <div className="notification-bell" ref={dropdownRef}>
      {unreadCount > 0 ? <span className="notification-badge">{unreadCount}</span> : null}

      {open ? (
        <div className="notification-dropdown panel">
          <div className="notification-dropdown-header">
            <h3>Notifikasi</h3>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="btn-link btn-small"
                onClick={() => void handleMarkAllRead()}
              >
                <Check size={16} strokeWidth={2} aria-hidden="true" />
                Tandai semua dibaca
              </button>
            ) : null}
          </div>

          <div className="notification-dropdown-body">
            {loading ? (
              <div className="notification-empty">Memuat notifikasi...</div>
            ) : notifications.length === 0 ? (
              <div className="notification-empty">Belum ada notifikasi.</div>
            ) : (
              <ul className="notification-list">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      className="notification-item"
                      data-unread={!notification.isRead ? "true" : undefined}
                      onClick={() => void handleNotificationClick(notification)}
                    >
                      <span
                        className="notification-status-dot"
                        data-up={notification.isUp ? "true" : "false"}
                        aria-hidden="true"
                      />
                      <div className="notification-content">
                        <span className="notification-message">{notification.message}</span>
                        <time className="notification-time">
                          {new Date(notification.createdAt).toLocaleString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
