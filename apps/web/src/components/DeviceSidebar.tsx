import {
  Activity,
  Check,
  Clock3,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Upload,
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
import Chart from "react-apexcharts";
import {
  api,
  assetUrl,
  errorMessage,
  type AuthUser,
  type DeviceDetail,
  type DeviceLogEntry,
  type DeviceStatus,
  type PingLog,
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

  const [pingLogs, setPingLogs] = useState<PingLog[]>([]);
  const [pingLogsLoading, setPingLogsLoading] = useState(true);
  const [pingLogsError, setPingLogsError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [descriptionSaved, setDescriptionSaved] = useState(false);

  const [tagInput, setTagInput] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [removingTagId, setRemovingTagId] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const loadPingLogs = useCallback(async () => {
    setPingLogsLoading(true);
    setPingLogsError(null);

    try {
      const response = await api.getDevicePingLogs(deviceId, 10);
      setPingLogs(response.logs);
    } catch (error) {
      setPingLogsError(errorMessage(error));
    } finally {
      setPingLogsLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    void loadDevice();
    void loadLogs();
    void loadPingLogs();
  }, [loadDevice, loadLogs, loadPingLogs]);

  // Polling status dan ping logs untuk sidebar live update
  useEffect(() => {
    const interval = Number(import.meta.env.VITE_STATUS_POLL_INTERVAL_MS) || 3000;
    let timer: number | null = null;

    async function poll() {
      if (!device) return;
      try {
        const response = await api.getDevice(deviceId);
        setDevice((current) => {
          if (!current) return response.device;
          // Update hanya status, latency, dan checked_at tanpa menimpa form input
          return {
            ...current,
            status: response.device.status,
            updatedAt: response.device.updatedAt,
          };
        });
        // Reload ping logs
        const pingResponse = await api.getDevicePingLogs(deviceId, 10);
        setPingLogs(pingResponse.logs);
      } catch {
        // Silent fail
      }
    }

    function startPolling() {
      timer = window.setInterval(() => void poll(), interval);
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
        void poll();
        startPolling();
      }
    }

    if (!document.hidden && device) {
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [deviceId, device]);

  useEffect(() => {
    if (!descriptionSaved) return;
    const timeout = window.setTimeout(() => setDescriptionSaved(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [descriptionSaved]);

  useEffect(() => {
    if (!uploadFile) {
      setUploadPreview(null);
      return;
    }

    const url = URL.createObjectURL(uploadFile);
    setUploadPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [uploadFile]);

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

  function resetUploadForm() {
    if (uploading) return;

    setUploadOpen(false);
    setUploadFile(null);
    setUploadCaption("");
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleUploadImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!device || !canWrite || !uploadFile) return;

    setUploading(true);
    setUploadError(null);

    try {
      const response = await api.uploadDeviceImage(
        device.id,
        uploadFile,
        uploadCaption,
      );
      setDevice((current) =>
        current ? { ...current, images: response.images } : current,
      );
      setUploadOpen(false);
      setUploadFile(null);
      setUploadCaption("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      void loadLogs();
    } catch (error) {
      setUploadError(errorMessage(error));
    } finally {
      setUploading(false);
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
              {device.monitoring?.enabled ? (
                <div className="sidebar-monitoring-active">
                  <div className="sidebar-info">
                    <div className="sidebar-info-row">
                      <dt>Status</dt>
                      <dd>
                        <span className="device-status" data-status={device.status}>
                          <span className="device-status-dot" aria-hidden="true" />
                          {statusLabels[device.status]}
                        </span>
                      </dd>
                    </div>
                    {pingLogs.length > 0 && pingLogs[0] ? (
                      <>
                        <div className="sidebar-info-row">
                          <dt>Latency</dt>
                          <dd>
                            {pingLogs[0].latencyMs !== null
                              ? `${pingLogs[0].latencyMs} ms`
                              : "—"}
                          </dd>
                        </div>
                        <div className="sidebar-info-row">
                          <dt>Cek terakhir</dt>
                          <dd>{formatDateTime(pingLogs[0].checkedAt)}</dd>
                        </div>
                      </>
                    ) : null}
                    <div className="sidebar-info-row">
                      <dt>Interval</dt>
                      <dd>{device.monitoring.intervalSeconds} detik</dd>
                    </div>
                  </div>

                  {pingLogsLoading ? (
                    <div className="sidebar-inline-state" role="status">
                      <Loader2 size={20} className="spin" aria-hidden="true" />
                      <span>Memuat riwayat ping...</span>
                    </div>
                  ) : pingLogsError ? (
                    <ErrorNotice message={pingLogsError} />
                  ) : pingLogs.length > 0 ? (
                    <div className="sidebar-ping-history">
                      <strong>Grafik latency 10 ping terakhir</strong>
                      <Chart
                        type="area"
                        height={180}
                        options={{
                          chart: {
                            toolbar: { show: false },
                            zoom: { enabled: false },
                            background: "transparent",
                          },
                          stroke: {
                            curve: "smooth",
                            width: 2,
                          },
                          fill: {
                            type: "gradient",
                            gradient: {
                              shadeIntensity: 1,
                              opacityFrom: 0.5,
                              opacityTo: 0.1,
                              stops: [0, 90, 100],
                            },
                          },
                          colors: ["#4465e9"],
                          dataLabels: { enabled: false },
                          grid: {
                            borderColor: "var(--color-border)",
                            strokeDashArray: 4,
                            xaxis: { lines: { show: false } },
                            yaxis: { lines: { show: true } },
                            padding: {
                              top: 10,
                              right: 10,
                              bottom: 10,
                              left: 10,
                            },
                          },
                          xaxis: {
                            categories: pingLogs
                              .slice()
                              .reverse()
                              .map((log) => {
                                const date = new Date(log.checkedAt);
                                return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;
                              }),
                            labels: {
                              style: {
                                colors: "var(--color-text-tertiary)",
                                fontSize: "10px",
                              },
                            },
                            axisBorder: { show: false },
                            axisTicks: { show: false },
                            tooltip: { enabled: true },
                          },
                          yaxis: {
                            min: 0,
                            forceNiceScale: true,
                            tickAmount: 6,
                            labels: {
                              style: {
                                colors: "var(--color-text-tertiary)",
                                fontSize: "10px",
                              },
                              formatter: (val) => `${Math.round(val)} ms`,
                            },
                          },
                          tooltip: {
                            theme: "dark",
                            x: {
                              show: true,
                              formatter: (_val, opts) => {
                                if (!opts) return "";
                                const index = opts.dataPointIndex;
                                const log = pingLogs.slice().reverse()[index];
                                if (!log) return "";
                                const date = new Date(log.checkedAt);
                                return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;
                              },
                            },
                            y: {
                              formatter: (val, opts) => {
                                if (!opts) return `${val} ms`;
                                const index = opts.dataPointIndex;
                                const log = pingLogs.slice().reverse()[index];
                                if (!log) return `${val} ms`;
                                const status = log.isUp ? "Up" : "Down";
                                return `${val} ms (${status})`;
                              },
                            },
                          },
                          markers: {
                            size: 0,
                            strokeWidth: 0,
                            hover: {
                              size: 5,
                              sizeOffset: 3,
                            },
                          },
                        }}
                        series={[
                          {
                            name: "Latency",
                            data: pingLogs
                              .slice()
                              .reverse()
                              .map((log) => log.latencyMs ?? 0),
                          },
                        ]}
                      />
                    </div>
                  ) : (
                    <p className="sidebar-muted">Belum ada riwayat ping.</p>
                  )}
                </div>
              ) : (
                <div className="sidebar-monitoring">
                  <Activity size={20} strokeWidth={2} aria-hidden="true" />
                  <div>
                    <strong>Belum dimonitor</strong>
                    <span>Aktifkan monitoring lewat tombol Edit perangkat.</span>
                  </div>
                </div>
              )}
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
              <div className="sidebar-section-heading">
                <h3 className="sidebar-section-title">Galeri</h3>
                {canWrite && !uploadOpen ? (
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() => {
                      setUploadError(null);
                      setUploadOpen(true);
                    }}
                  >
                    <Plus size={20} strokeWidth={2} aria-hidden="true" />
                    Tambah Gambar
                  </button>
                ) : null}
              </div>

              {canWrite && uploadOpen ? (
                <form
                  className="gallery-upload"
                  aria-label="Tambah gambar instalasi"
                  onSubmit={(event) => void handleUploadImage(event)}
                >
                  <div className="gallery-upload-head">
                    <strong>Tambah gambar instalasi</strong>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Tutup form gambar"
                      title="Tutup form gambar"
                      disabled={uploading}
                      onClick={resetUploadForm}
                    >
                      <X size={20} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>

                  <label className="field">
                    <span className="field-label">File gambar</span>
                    <input
                      ref={fileInputRef}
                      className="gallery-file-input"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      disabled={uploading}
                      onChange={(event) => {
                        setUploadError(null);
                        setUploadFile(event.target.files?.[0] ?? null);
                      }}
                    />
                    <span className="field-hint">
                      JPG, PNG, WebP, atau GIF. Ukuran maksimal mengikuti
                      konfigurasi server.
                    </span>
                  </label>

                  {uploadPreview ? (
                    <div className="gallery-preview">
                      <img
                        src={uploadPreview}
                        alt="Pratinjau gambar yang akan diunggah"
                      />
                    </div>
                  ) : null}

                  <label className="field">
                    <span className="field-label">Caption (opsional)</span>
                    <input
                      type="text"
                      value={uploadCaption}
                      onChange={(event) => {
                        setUploadError(null);
                        setUploadCaption(event.target.value);
                      }}
                      maxLength={200}
                      placeholder="Mis. kondisi ODP setelah instalasi"
                      disabled={uploading}
                    />
                  </label>

                  {uploadError ? <ErrorNotice message={uploadError} /> : null}

                  <div className="gallery-upload-actions">
                    <button
                      type="button"
                      className="btn-link"
                      onClick={resetUploadForm}
                      disabled={uploading}
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="btn-primary btn-small"
                      disabled={!uploadFile || uploading}
                    >
                      {uploading ? (
                        <Loader2
                          size={20}
                          className="spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Upload size={20} strokeWidth={2} aria-hidden="true" />
                      )}
                      {uploading ? "Mengunggah..." : "Unggah gambar"}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="sidebar-gallery-block">
                <span className="sidebar-gallery-label">
                  Foto referensi katalog
                </span>
                {device.deviceModel.referenceImageUrl ? (
                  <a
                    className="gallery-reference"
                    href={assetUrl(device.deviceModel.referenceImageUrl)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Buka foto referensi katalog di tab baru"
                  >
                    <img
                      src={assetUrl(device.deviceModel.referenceImageUrl)}
                      alt={`Foto referensi ${device.deviceModel.vendor} ${device.deviceModel.modelName}`}
                      loading="lazy"
                      decoding="async"
                    />
                  </a>
                ) : (
                  <p className="sidebar-muted">
                    Model ini belum punya foto referensi di katalog.
                  </p>
                )}
              </div>

              <div className="sidebar-gallery-block">
                <span className="sidebar-gallery-label">Foto instalasi</span>
                {device.images.length > 0 ? (
                  <ul className="gallery-grid">
                    {device.images.map((image) => (
                      <li key={image.id}>
                        <figure className="gallery-item">
                          <a
                            href={assetUrl(image.imageUrl)}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={
                              image.caption
                                ? `Buka foto: ${image.caption}`
                                : "Buka foto instalasi di tab baru"
                            }
                          >
                            <img
                              src={assetUrl(image.imageUrl)}
                              alt={
                                image.caption ?? "Foto instalasi perangkat"
                              }
                              loading="lazy"
                              decoding="async"
                            />
                          </a>
                          <figcaption className="gallery-caption">
                            {image.caption ? (
                              <span>{image.caption}</span>
                            ) : null}
                            <time dateTime={image.uploadedAt}>
                              {formatDate(image.uploadedAt)}
                            </time>
                          </figcaption>
                        </figure>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="sidebar-gallery-empty">
                    <ImageIcon size={20} strokeWidth={2} aria-hidden="true" />
                    <span>
                      Belum ada foto instalasi. Tambahkan foto kondisi
                      perangkat di lapangan.
                    </span>
                  </div>
                )}
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
