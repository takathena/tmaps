import { Check, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { CableDetail, CablePathPoint } from "../lib/api";
import { api, errorMessage } from "../lib/api";
import { ErrorNotice } from "./ErrorNotice";

type CableEditorProps = {
  cable: CableDetail;
  editedPath: CablePathPoint[];
  onSave: () => Promise<void>;
  onCancel: () => void;
};

export function CableEditorPanel({ cable, editedPath, onSave, onCancel }: CableEditorProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      await onSave();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }, [onSave]);

  const hasChanges = JSON.stringify(editedPath) !== JSON.stringify(cable.path);
  
  // Calculate estimated length
  const estimatedLength = (() => {
    let total = 0;
    for (let i = 1; i < editedPath.length; i++) {
      const prev = editedPath[i - 1];
      const curr = editedPath[i];
      if (!prev || !curr) continue;
      const R = 6371008.8;
      const toRad = (v: number) => (v * Math.PI) / 180;
      const dLat = toRad(curr.lat - prev.lat);
      const dLng = toRad(curr.lng - prev.lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(prev.lat)) *
          Math.cos(toRad(curr.lat)) *
          Math.sin(dLng / 2) ** 2;
      total += 2 * R * Math.asin(Math.sqrt(a));
    }
    return total >= 1000
      ? `${(total / 1000).toFixed(2)} km`
      : `${total.toFixed(1)} m`;
  })();

  return (
    <div className="cable-editor-panel panel">
      <div className="cable-editor-header">
        <div>
          <h3>Edit Jalur Kabel</h3>
          <p className="cable-editor-devices">
            {cable.deviceFrom.name} → {cable.deviceTo.name}
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Tutup editor"
          onClick={onCancel}
          disabled={saving}
        >
          <X size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="cable-editor-body">
        <div className="cable-editor-hint">
          <strong>Cara edit jalur:</strong>
          <ul>
            <li>Drag titik biru untuk menggeser posisi</li>
            <li>Titik awal dan akhir mengikuti device</li>
          </ul>
        </div>

        <div className="cable-editor-stats">
          <div className="cable-editor-stat">
            <span className="cable-editor-stat-label">Titik path:</span>
            <span className="cable-editor-stat-value">{editedPath.length}</span>
          </div>
          <div className="cable-editor-stat">
            <span className="cable-editor-stat-label">Panjang estimasi:</span>
            <span className="cable-editor-stat-value">{estimatedLength}</span>
          </div>
        </div>

        {error ? <ErrorNotice message={error} /> : null}
      </div>

      <div className="cable-editor-actions">
        <button
          type="button"
          className="btn-link"
          onClick={onCancel}
          disabled={saving}
        >
          Batal
        </button>
        <button
          type="button"
          className="btn-primary btn-small"
          onClick={() => void handleSave()}
          disabled={saving || !hasChanges}
        >
          {saving ? (
            "Menyimpan..."
          ) : (
            <>
              <Check size={20} strokeWidth={2} aria-hidden="true" />
              Simpan Perubahan
            </>
          )}
        </button>
      </div>
    </div>
  );
}
