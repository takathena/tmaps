import { Boxes, Cable, LogOut, MoreVertical, Settings, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CatalogTab } from "./CatalogPanel";

type MainMenuProps = {
  onLogout: () => Promise<void>;
  onOpenCatalog: (tab: CatalogTab) => void;
};

const UPCOMING_HINT = "Tersedia pada fase berikutnya.";

export function MainMenu({ onLogout, onOpenCatalog }: MainMenuProps) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="main-menu" ref={rootRef}>
      <button
        type="button"
        className="icon-button"
        aria-label="Menu utama"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Menu utama"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreVertical size={20} strokeWidth={2} aria-hidden="true" />
      </button>

      {open ? (
        <div className="menu-dropdown panel" role="menu" aria-label="Menu utama">
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenCatalog("device");
            }}
          >
            <Boxes size={20} strokeWidth={2} aria-hidden="true" />
            <span>Katalog Perangkat</span>
          </button>
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenCatalog("cable");
            }}
          >
            <Cable size={20} strokeWidth={2} aria-hidden="true" />
            <span>Katalog Kabel</span>
          </button>
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            disabled
            title={UPCOMING_HINT}
          >
            <Settings size={20} strokeWidth={2} aria-hidden="true" />
            <span>Pengaturan</span>
            <span className="menu-soon">Segera</span>
          </button>
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            disabled
            title={UPCOMING_HINT}
          >
            <UserRound size={20} strokeWidth={2} aria-hidden="true" />
            <span>Akun</span>
            <span className="menu-soon">Segera</span>
          </button>

          <div className="menu-divider" role="separator" />

          <button
            type="button"
            className="menu-item"
            role="menuitem"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <LogOut size={20} strokeWidth={2} aria-hidden="true" />
            <span>{loggingOut ? "Keluar..." : "Logout"}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
