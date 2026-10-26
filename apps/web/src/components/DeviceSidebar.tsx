import {
  Activity,
  Check,
  Clock3,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  api,
  errorMessage,
  type AuthUser,
  type DeviceDetail,
  type DeviceLogEntry,
  type DeviceStatus,
} from "../lib/api";
import { usesPonCapacity } from "../lib/catalog";
import { getDeviceIcon } from "../lib/device-icons";
import { ErrorNotice } from "./ErrorNotice";

type DeviceSidebarProps = {
  deviceId: string;
  user: AuthUser;
  onClose: () => void;
  onEdit: (device: DeviceDetail) => void;
};

const TAG_COLORS = [
  "#4465e9",
  "#099268",
  "#e8590c",
  "#ae3ec9",
  "#f06595",
  "#f2b84c",
  "#a78bfa",
];

const statusLabels: Record<DeviceStatus, string> = {
  active: "Aktif",
  offline: "Down",
  unmonitored: "Belum dimonitor",
};

const actionLabels: Record<string, string> = {
  create: "Perangkat ditambahkan",
  update: "Data perangkat diperbarui",
  delete: "Perangkat dihapus",
};

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function tagColor(name: string): string {
  let hash = 0;
  for (const character of name.toLowerCase()) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return TAG_COLORS[hash % TAG_COLORS.length]!;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormatter.format(date);
}

export function DeviceSidebar({
  deviceId,
  user,
  onClose,
  onEdit,
}: DeviceSidebarProps) {
  const canWrite = Boolean(user.role.permissions.devices?.write);

  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [logs, setLogs] = useState<DeviceLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [descriptionSaved, setDescriptionSaved] = useState(false);

  const [tagInput, setTagInput] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [removingTagId, setRemovingTagId] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);

  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const loadDevice = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const response = await api.getDevice(deviceId);
      setDevice(response.device);
      setDescription(response.device.description ?? "");
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError(null);

    try {
      const response = await api.getDeviceLogs(deviceId);
      setLogs(response.logs);
    } catch (error) {
      setLogsError(errorMessage(error));
    } finally {
      setLogsLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    void loadDevice();
    void loadLogs();
  }, [loadDevice, loadLogs]);

  useEffect(() => {
    if (!descriptionSaved) return;
    const timeout = window.setTimeout(() => setDescriptionSaved(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [descriptionSaved]);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, 170);
  }, [closing, onClose]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [requestClose]);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const capacityInfo = useMemo(() => {
    if (!device) return null;

    const pon = usesPonCapacity(device.deviceType);
    const capacity = pon
      ? device.deviceModel.ponCapacity
      : device.deviceModel.portCapacity;

    return {
      label: pon ? "PON" : "Port",
      capacity,
      percent:
        capacity && capacity > 0
          ? Math.min(100, Math.round((device.portUsed / capacity) * 100))
          : 0,
    };
  }, [device]);

  const descriptionDirty = Boolean(
    device && description.trim() !== (device.description ?? ""),
  );

  async function handleSaveDescription() {
    if (!device || !canWrite) return;

    setSavingDescription(true);
    setDescriptionError(null);
    setDescriptionSaved(false);

    try {
      const trimmed = description.trim();
      const response = await api.updateDevice(device.id, {
        description: trimmed.length > 0 ? trimmed : null,
      });
      setDevice(response.device);
      setDescription(response.device.description ?? "");
      setDescriptionSaved(true);
      void loadLogs();
    } catch (error) {
      setDescriptionError(errorMessage(error));
    } finally {
      setSavingDescription(false);
    }
  }

  async function handleAddTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!device || !canWrite) return;

    const name = tagInput.trim();
    if (!name) return;

    setAddingTag(true);
    setTagError(null);

    try {
      const response = await api.addDeviceTag(device.id, name);
      setDevice((current) =>
        current ? { ...current, tags: response.tags } : current,
      );
      setTagInput("");
      void loadLogs();
    } catch (error) {
      setTagError(errorMessage(error));
    } finally {
      setAddingTag(false);
    }
  }

  async function handleRemoveTag(tagId: string) {
    if (!device || !canWrite) return;

    setRemovingTagId(tagId);
    setTagError(null);

    try {
      const response = await api.removeDeviceTag(device.id, tagId);
      setDevice((current) =>
        current ? { ...current, tags: response.tags } : current,
      );
      void loadLogs();
    } catch (error) {
      setTagError(errorMessage(error));
    } finally {
      setRemovingTagId(null);
    }
  }

  const DeviceIcon = getDeviceIcon(device?.deviceType.icon ?? "Router");

  return (
    <aside
      className="device-sidebar panel"
      role="dialog"
      aria-label={device ? `Detail perangkat ${device.name}` : "Detail perangkat"}
      data-closing={closing ? "true" : undefined}
    >
      <header className="device-sidebar-header">
        <span className="device-sidebar-icon" aria-hidden="true">
          <DeviceIcon size={20} strokeWidth={2} />
        </span>
        <div className="device-sidebar-heading">
          <h2>{device?.name ?? "Detail perangkat"}</h2>
          <p>
            {device
              ? `${device.deviceType.name} · ${device.deviceModel.vendor} ${device.deviceModel.modelName}`
              : "Memuat detail perangkat..."}
          </p>
        </div>
        <div className="device-sidebar-actions">
          {canWrite && device ? (
            <button
              type="button"
              className="icon-button"
              aria-label="Edit perangkat"
              title="Edit perangkat"
              onClick={() => onEdit(device)}
            >
              <Pencil size={20} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            className="icon-button"
            aria-label="Tutup detail perangkat"
            title="Tutup detail perangkat"
            onClick={requestClose}
          >
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="device-sidebar-body">
        {loading ? (
          <div className="catalog-state">
            <Loader2 size={20} className="spin" aria-hidden="true" />
            <span>Memuat detail perangkat...</span>
          </div>
        ) : loadError ? (
          <div className="catalog-state">
            <ErrorNotice message={loadError} />
            <button
              type="button"
              className="btn-link"
              onClick={() => void loadDevice()}
            >
              Coba lagi
            </button>
          </div>
        ) : device && capacityInfo ? (
          <>
            <section className="sidebar-section" aria-label="Informasi umum">
              <h3 className="sidebar-section-title">Informasi umum</h3>
              <dl className="sidebar-info">
                <div className="sidebar-info-row">
                  <dt>Vendor</dt>
                  <dd>{device.deviceModel.vendor}</dd>
                </div>
                <div className="sidebar-info-row">
                  <dt>Model</dt>
                  <dd>{device.deviceModel.modelName}</dd>
                </div>
                <div className="sidebar-info-row">
                  <dt>Tipe</dt>
                  <dd>{device.deviceType.name}</dd>
                </div>
                <div className="sidebar-info-row">
                  <dt>IP address</dt>
                  <dd>
                    {device.ipAddress ??
                      (device.deviceType.requiresIp
                        ? "Belum diisi"
                        : "Tidak memerlukan IP")}
                  </dd>
                </div>
                <div className="sidebar-info-row">
                  <dt>Status</dt>
                  <dd>
                    <span
                      className="device-status"
                      data-status={device.status}
                    >
                      <span className="device-status-dot" aria-hidden="true" />
                      {statusLabels[device.status]}
                    </span>
                  </dd>
                </div>
                <div className="sidebar-info-row">
                  <dt>Terpasang</dt>
                  <dd>{formatDate(device.installedAt)}</dd>
                </div>
              </dl>
            </section>

            <section className="sidebar-section" aria-label="Kapasitas port">
              <h3 className="sidebar-section-title">Kapasitas port</h3>
              {capacityInfo.capacity === null ? (
                <p className="sidebar-muted">
                  Kapasitas belum diisi di katalog.
                </p>
              ) : (
                <>
                  <div className="sidebar-port-summary">
                    <span className="sidebar-port-value">
                      {device.portUsed} / {capacityInfo.capacity}
                    </span>
                    <span className="sidebar-port-label">
                      {capacityInfo.label}
                    </span>
                  </div>
                  <div
                    className="sidebar-meter"
                    role="progressbar"
                    aria-label={`${capacityInfo.label} terpakai`}
                    aria-valuemin={0}
                    aria-valuemax={capacityInfo.capacity}
                    aria-valuenow={device.portUsed}
                  >
                    <span
                      className="sidebar-meter-fill"
                      style={{ width: `${capacityInfo.percent}%` }}
                    />
                  </div>
                </>
              )}
            </section>

            <section className="sidebar-section" aria-label="Status monitoring">
              <h3 className="sidebar-section-title">Monitoring</h3>
              <div className="sidebar-monitoring">
                <Activity size={20} strokeWidth={2} aria-hidden="true" />
                <div>
                  <strong>Belum dimonitor</strong>
                  <span>
                    {device.monitoring?.enabled
                      ? `Interval ${device.monitoring.intervalSeconds} detik sudah disiapkan. Mesin ping aktif di Fase 3.`
                      : "Aktifkan lewat Edit perangkat. Mesin ping aktif di Fase 3."}
                  </span>
                </div>
              </div>
            </section>

            <section className="sidebar-section" aria-label="Deskripsi">
              <h3 className="sidebar-section-title">Deskripsi</h3>
              {canWrite ? (
                <>
                  <label className="field sidebar-description">
                    <span className="field-label">Deskripsi perangkat</span>
                    <textarea
                      value={description}
                      onChange={(event) => {
                        setDescription(event.target.value);
                        setDescriptionSaved(false);
                      }}
                      maxLength={2000}
                      rows={3}
                      placeholder="Catatan bebas tentang perangkat ini..."
                      disabled={savingDescription}
                    />
                  </label>
                  {descriptionError ? (
                    <ErrorNotice message={descriptionError} />
                  ) : null}
                  <div className="sidebar-save-row">
                    {descriptionSaved ? (
                      <span className="sidebar-saved" role="status">
                        <Check size={20} strokeWidth={2} aria-hidden="true" />
                        Deskripsi tersimpan.
                      </span>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      disabled={!descriptionDirty || savingDescription}
                      onClick={() => void handleSaveDescription()}
                    >
                      {savingDescription ? (
                        <>
                          <Loader2
                            size={20}
                            className="spin"
                            aria-hidden="true"
                          />
                          Menyimpan...
                        </>
                      ) : (
                        "Simpan deskripsi"
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <p
                  className={
                    device.description
                      ? "sidebar-description-text"
                      : "sidebar-muted"
                  }
                >
                  {device.description ?? "Belum ada deskripsi."}
                </p>
              )}
            </section>

            <section className="sidebar-section" aria-label="Tag">
              <h3 className="sidebar-section-title">Tag</h3>
              {device.tags.length > 0 ? (
                <ul className="tag-list">
                  {device.tags.map((tag) => (
                    <li key={tag.id} className="tag-chip">
                      <span
                        className="tag-color-dot"
                        style={{ background: tagColor(tag.name) }}
                        aria-hidden="true"
                      />
                      <span className="tag-chip-label">{tag.name}</span>
                      {canWrite ? (
                        <button
                          type="button"
                          className="tag-remove"
                          aria-label={`Hapus tag ${tag.name}`}
                          title={`Hapus tag ${tag.name}`}
                          disabled={removingTagId === tag.id}
                          onClick={() => void handleRemoveTag(tag.id)}
                        >
                          {removingTagId === tag.id ? (
                            <Loader2
                              size={20}
                              className="spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <X size={20} strokeWidth={2} aria-hidden="true" />
                          )}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sidebar-muted">Belum ada tag.</p>
              )}

              {canWrite ? (
                <form className="tag-form" onSubmit={(event) => void handleAddTag(event)}>
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    maxLength={40}
                    placeholder="Tambah tag..."
                    aria-label="Tambah tag baru"
                    autoComplete="off"
                    disabled={addingTag}
                  />
                  <button
                    type="submit"
                    className="btn-secondary tag-add-button"
                    aria-label="Tambahkan tag"
                    title="Tambahkan tag"
                    disabled={!tagInput.trim() || addingTag}
                  >
                    {addingTag ? (
                      <Loader2 size={20} className="spin" aria-hidden="true" />
                    ) : (
                      <Plus size={20} strokeWidth={2} aria-hidden="true" />
                    )}
                  </button>
                </form>
              ) : null}
              {tagError ? <ErrorNotice message={tagError} /> : null}
            </section>

            <section className="sidebar-section" aria-label="Galeri">
              <h3 className="sidebar-section-title">Galeri</h3>
              <div className="sidebar-gallery-empty">
                <ImageIcon size={20} strokeWidth={2} aria-hidden="true" />
                <span>
                  Belum ada gambar. Foto referensi katalog dan foto instalasi
                  dapat diunggah pada langkah berikutnya.
                </span>
              </div>
            </section>

            <section className="sidebar-section" aria-label="Riwayat perangkat">
              <h3 className="sidebar-section-title">Riwayat</h3>
              {logsLoading ? (
                <div className="sidebar-inline-state" role="status">
                  <Loader2 size={20} className="spin" aria-hidden="true" />
                  <span>Memuat riwayat...</span>
                </div>
              ) : logsError ? (
                <div className="sidebar-history-error">
                  <ErrorNotice message={logsError} />
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => void loadLogs()}
                  >
                    Coba lagi
                  </button>
                </div>
              ) : logs.length === 0 ? (
                <p className="sidebar-muted">Belum ada riwayat.</p>
              ) : (
                <ol className="device-history">
                  {logs.map((log) => (
                    <li key={log.id} className="device-history-item">
                      <Clock3
                        size={20}
                        strokeWidth={2}
                        className="history-icon"
                        aria-hidden="true"
                      />
                      <div className="history-main">
                        <span className="history-action">
                          {actionLabels[log.action] ?? log.action}
                        </span>
                        <span className="history-meta">{log.changedBy}</span>
                      </div>
                      <time
                        className="history-time"
                        dateTime={log.createdAt}
                      >
                        {formatDateTime(log.createdAt)}
                      </time>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        ) : null}
      </div>
    </aside>
  );
}
