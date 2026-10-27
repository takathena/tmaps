import { Bell, Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, type Notification } from "../lib/api";

type NotificationBellProps = {
  onNotificationClick: (deviceId: string) => void;
};

export function NotificationBell({ onNotificationClick }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const loadUnreadCount = useCallback(async () => {
    try {
      const response = await api.getUnreadCount();
      setUnreadCount(response.count);
    } catch {
      // Silent fail untuk polling
    }
  }, []);

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

  // Polling unread count
  useEffect(() => {
    const interval = Number(import.meta.env.VITE_STATUS_POLL_INTERVAL_MS) || 3000;
    let timer: number | null = null;

    function poll() {
      void loadUnreadCount();
    }

    function startPolling() {
      timer = window.setInterval(poll, interval);
    }

    function stopPolling() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        stopPolling();
      } else {
        poll();
        startPolling();
      }
    }

    if (!document.hidden) {
      poll();
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadUnreadCount]);

  // Load notifications saat dropdown dibuka
  useEffect(() => {
    if (open) {
      void loadNotifications();
    }
  }, [open, loadNotifications]);

  // Close dropdown saat klik di luar
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  async function handleNotificationClick(notification: Notification) {
    setOpen(false);
    onNotificationClick(notification.deviceId);

    if (!notification.isRead) {
      try {
        await api.markNotificationRead(notification.id);
        setUnreadCount((c) => Math.max(0, c - 1));
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
      setUnreadCount(0);
      setNotifications((items) =>
        items.map((item) => ({ ...item, isRead: true }))
      );
    } catch (error) {
      console.error("Mark all read failed:", errorMessage(error));
    }
  }

  return (
    <div className="notification-bell" ref={dropdownRef}>
      <button
        type="button"
        className="icon-button"
        aria-label={`Notifikasi${unreadCount > 0 ? ` (${unreadCount} belum dibaca)` : ""}`}
        onClick={() => setOpen(!open)}
      >
        <Bell size={20} strokeWidth={2} aria-hidden="true" />
        {unreadCount > 0 ? <span className="notification-badge">{unreadCount}</span> : null}
      </button>

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
