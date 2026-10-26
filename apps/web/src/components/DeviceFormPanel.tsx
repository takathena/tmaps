import {
  Check,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  api,
  errorMessage,
  type AuthUser,
  type DeviceCreateInput,
  type DeviceDetail,
  type DeviceModel,
  type DeviceType,
  type DeviceUpdateInput,
} from "../lib/api";
import { usesPonCapacity } from "../lib/catalog";
import { getDeviceIcon } from "../lib/device-icons";
import { ErrorNotice } from "./ErrorNotice";

export type DeviceLocation = {
  latitude: number;
  longitude: number;
};

type DeviceFormPanelProps = {
  mode: "create" | "edit";
  user: AuthUser;
  location?: DeviceLocation;
  device?: DeviceDetail;
  loading?: boolean;
  loadError?: string | null;
  onClose: () => void;
  onOpenCatalog: () => void;
  onCreated: (device: DeviceDetail) => void;
  onUpdated: (device: DeviceDetail) => void;
  onDeleted: (id: string) => void;
};

type CatalogEntry = {
  model: DeviceModel;
  type: DeviceType;
};

const MIN_INTERVAL_SECONDS = 5;
const MAX_INTERVAL_SECONDS = 86_400;
const DEFAULT_INTERVAL_SECONDS = 60;

function capacityInfo(
  type: Pick<DeviceType, "name" | "category">,
  model: Pick<DeviceModel, "portCapacity" | "ponCapacity">,
) {
  const pon = usesPonCapacity(type);
  return {
    pon,
    label: pon ? "PON" : "port",
    capacity: pon ? model.ponCapacity : model.portCapacity,
  };
}

function capacityText(
  type: Pick<DeviceType, "name" | "category">,
  model: Pick<DeviceModel, "portCapacity" | "ponCapacity">,
): string {
  const { label, capacity } = capacityInfo(type, model);
  return capacity === null ? "Kapasitas belum diisi" : `${capacity} ${label}`;
}

function validationError(
  type: Pick<DeviceType, "name" | "category">,
  model: Pick<DeviceModel, "portCapacity" | "ponCapacity">,
  portUsed: number,
  intervalSeconds: number,
  monitoringEnabled: boolean,
): string | null {
  const { label, capacity } = capacityInfo(type, model);

  if (capacity === null) {
    return "Kapasitas model belum diisi di katalog. Lengkapi dulu sebelum menambah perangkat.";
  }

  if (!Number.isInteger(portUsed) || portUsed < 0) {
    return "Port terpakai harus bilangan bulat dan tidak boleh negatif.";
  }

  if (portUsed > capacity) {
    return `${label} terpakai (${portUsed}) melebihi kapasitas model (${capacity}).`;
  }

  if (
    monitoringEnabled &&
    (!Number.isInteger(intervalSeconds) ||
      intervalSeconds < MIN_INTERVAL_SECONDS ||
      intervalSeconds > MAX_INTERVAL_SECONDS)
  ) {
    return `Interval monitoring harus bilangan bulat ${MIN_INTERVAL_SECONDS}–${MAX_INTERVAL_SECONDS} detik.`;
  }

  return null;
}

export function DeviceFormPanel({
  mode,
  user,
  location,
  device,
  loading = false,
  loadError = null,
  onClose,
  onOpenCatalog,
  onCreated,
  onUpdated,
  onDeleted,
}: DeviceFormPanelProps) {
  const isCreate = mode === "create";

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const canWrite = Boolean(user.role.permissions.devices?.write);

  return (
    <section
      className="device-panel panel"
      role="dialog"
      aria-label={isCreate ? "Tambah perangkat" : "Edit perangkat"}
    >
      <header className="catalog-header device-panel-header">
        <div className="catalog-heading">
          <h2>{isCreate ? "Tambah perangkat" : "Edit perangkat"}</h2>
          <p>
            {isCreate
              ? "Lokasi sudah ditentukan. Pilih model dari katalog lalu isi label."
              : device
                ? `${device.deviceType.name} · ${device.deviceModel.vendor} ${device.deviceModel.modelName}`
                : "Memuat detail perangkat..."}
          </p>
        </div>
        <button
          type="button"
          className="icon-button catalog-close device-panel-close"
          aria-label="Tutup form perangkat"
          title="Tutup form perangkat"
          onClick={onClose}
        >
          <X size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </header>

      <div className="device-panel-body">
        {isCreate ? (
          location ? (
            <CreateDeviceForm
              canWrite={canWrite}
              location={location}
              onCancel={onClose}
              onOpenCatalog={onOpenCatalog}
              onCreated={onCreated}
            />
          ) : null
        ) : loading ? (
          <div className="catalog-state">
            <Loader2 size={20} className="spin" aria-hidden="true" />
            <span>Memuat detail perangkat...</span>
          </div>
        ) : loadError ? (
          <div className="catalog-state">
            <ErrorNotice message={loadError} />
            <button type="button" className="btn-link" onClick={onClose}>
              Tutup
            </button>
          </div>
        ) : device ? (
          <EditDeviceForm
            canWrite={canWrite}
            canDelete={Boolean(user.role.permissions.devices?.delete)}
            device={device}
            onCancel={onClose}
            onUpdated={onUpdated}
            onDeleted={onDeleted}
          />
        ) : null}
      </div>
    </section>
  );
}

function CreateDeviceForm({
  canWrite,
  location,
  onCancel,
  onOpenCatalog,
  onCreated,
}: {
  canWrite: boolean;
  location: DeviceLocation;
  onCancel: () => void;
  onOpenCatalog: () => void;
  onCreated: (device: DeviceDetail) => void;
}) {
  const [types, setTypes] = useState<DeviceType[]>([]);
  const [models, setModels] = useState<DeviceModel[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [portUsed, setPortUsed] = useState("0");
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState(
    String(DEFAULT_INTERVAL_SECONDS),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);

    try {
      const [typesResponse, modelsResponse] = await Promise.all([
        api.getDeviceTypes(),
        api.getDeviceModels(),
      ]);
      setTypes(typesResponse.deviceTypes);
      setModels(modelsResponse.deviceModels);
    } catch (error) {
      setCatalogError(errorMessage(error));
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const typeById = useMemo(
    () => new Map(types.map((type) => [type.id, type])),
    [types],
  );

  const entries = useMemo<CatalogEntry[]>(() => {
    return models.flatMap((model) => {
      const type = typeById.get(model.deviceTypeId);
      return type ? [{ model, type }] : [];
    });
  }, [models, typeById]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entries;

    return entries.filter(({ model, type }) =>
      [model.vendor, model.modelName, type.name, type.category]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [entries, search]);

  const selected =
    entries.find((entry) => entry.model.id === selectedModelId) ?? null;
  const selectedCapacity = selected ? capacityInfo(selected.type, selected.model) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!canWrite) {
      setSubmitError("Anda tidak punya izin menambah perangkat.");
      return;
    }

    if (!selected) {
      setSubmitError("Pilih model perangkat terlebih dahulu.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setSubmitError("Nama perangkat wajib diisi.");
      return;
    }

    const parsedPort = selected.type.requiresIp ? 0 : Number(portUsed);
    const parsedInterval = monitoringEnabled
      ? Number(intervalSeconds)
      : DEFAULT_INTERVAL_SECONDS;

    const error = validationError(
      selected.type,
      selected.model,
      parsedPort,
      parsedInterval,
      monitoringEnabled,
    );
    if (error) {
      setSubmitError(error);
      return;
    }

    let trimmedIp: string | null = null;
    if (selected.type.requiresIp) {
      trimmedIp = ipAddress.trim();
      if (!trimmedIp) {
        setSubmitError("IP address wajib diisi untuk tipe perangkat ini.");
        return;
      }
    }

    const body: DeviceCreateInput = {
      name: trimmedName,
      deviceModelId: selected.model.id,
      latitude: location.latitude,
      longitude: location.longitude,
      portUsed: parsedPort,
      status: "unmonitored",
      ipAddress: trimmedIp,
      ...(selected.type.requiresIp
        ? {
            monitoring: {
              enabled: monitoringEnabled,
              intervalSeconds: parsedInterval,
            },
          }
        : {}),
    };

    setSubmitting(true);
    try {
      const response = await api.createDevice(body);
      onCreated(response.device);
    } catch (submitFailure) {
      setSubmitError(errorMessage(submitFailure));
    } finally {
      setSubmitting(false);
    }
  }

  if (catalogLoading) {
    return (
      <div className="catalog-state">
        <Loader2 size={20} className="spin" aria-hidden="true" />
        <span>Memuat katalog perangkat...</span>
      </div>
    );
  }

  if (catalogError) {
    return (
      <div className="catalog-state">
        <ErrorNotice message={catalogError} />
        <button type="button" className="btn-link" onClick={() => void loadCatalog()}>
          Coba lagi
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="device-empty">
        <div className="catalog-empty">
          <strong>Katalog perangkat masih kosong.</strong>
          <span>
            Tambahkan tipe dan model perangkat lebih dulu, lalu kembali ke peta untuk
            menempatkannya.
          </span>
        </div>
        <div className="form-actions">
          <button type="button" className="btn-link" onClick={onCancel}>
            Batal
          </button>
          <button type="button" className="btn-primary btn-small" onClick={onOpenCatalog}>
            Buka katalog perangkat
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="device-form" onSubmit={(event) => void handleSubmit(event)}>
      <div className="device-location">
        <MapPin size={20} strokeWidth={2} aria-hidden="true" />
        <span>
          Lokasi: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
        </span>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="device-model-search">
          Model perangkat
        </label>
        <div className="model-search">
          <Search size={20} strokeWidth={2} aria-hidden="true" />
          <input
            id="device-model-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari vendor, model, atau tipe..."
            aria-label="Cari model perangkat"
            autoComplete="off"
            autoFocus
            disabled={submitting}
          />
        </div>

        <div
          className="model-list"
          role="listbox"
          aria-label="Pilih model perangkat"
        >
          {filtered.length === 0 ? (
            <p className="model-empty">
              Tidak ada model yang cocok.{" "}
              <button type="button" className="btn-link" onClick={onOpenCatalog}>
                Buka katalog
              </button>
            </p>
          ) : (
            filtered.map(({ model, type }) => {
              const Icon = getDeviceIcon(type.icon);
              const active = model.id === selectedModelId;

              return (
                <button
                  key={model.id}
                  type="button"
                  className="model-option"
                  role="option"
                  aria-selected={active}
                  data-selected={active}
                  onClick={() => setSelectedModelId(model.id)}
                  disabled={submitting}
                >
                  <span className="model-option-icon">
                    <Icon size={20} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className="model-option-main">
                    <span className="model-option-title">
                      {model.vendor} {model.modelName}
                    </span>
                    <span className="model-option-meta">
                      {type.name} · {capacityText(type, model)}
                    </span>
                  </span>
                  {active ? (
                    <Check
                      size={20}
                      strokeWidth={2}
                      aria-hidden="true"
                      className="model-option-check"
                    />
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <span className="field-hint">
          Kapasitas dan vendor mengikuti model di katalog, tidak perlu diisi ulang.
        </span>
      </div>

      <label className="field">
        <span className="field-label">Nama perangkat</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Contoh: Mikrotik Core - Gudang A"
          maxLength={120}
          required
          disabled={submitting}
          autoFocus={Boolean(selected)}
        />
      </label>

      {selected && selectedCapacity ? (
        <>
          <div className="device-model-note">
            <span>
              {selected.model.vendor} {selected.model.modelName}
            </span>
            <span>
              {selected.type.name} · {capacityText(selected.type, selected.model)}
            </span>
          </div>

          {selected.type.requiresIp ? (
            <>
              <label className="field">
                <span className="field-label">IP address</span>
                <input
                  value={ipAddress}
                  onChange={(event) => setIpAddress(event.target.value)}
                  placeholder="Contoh: 10.10.0.1"
                  maxLength={45}
                  inputMode="decimal"
                  autoComplete="off"
                  required
                  disabled={submitting}
                />
                <span className="field-hint">
                  Alamat yang akan di-ping saat monitoring aktif.
                </span>
              </label>

              <div className="monitoring-box">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={monitoringEnabled}
                    onChange={(event) => setMonitoringEnabled(event.target.checked)}
                    disabled={submitting}
                  />
                  <span>
                    <strong>Aktifkan monitoring</strong>
                    <span className="checkbox-hint">
                      Perangkat di-ping berkala setelah mesin monitoring berjalan.
                    </span>
                  </span>
                </label>

                {monitoringEnabled ? (
                  <label className="field monitoring-interval">
                    <span className="field-label">Interval monitoring (detik)</span>
                    <input
                      type="number"
                      value={intervalSeconds}
                      onChange={(event) => setIntervalSeconds(event.target.value)}
                      min={MIN_INTERVAL_SECONDS}
                      max={MAX_INTERVAL_SECONDS}
                      step={1}
                      required
                      disabled={submitting}
                    />
                    <span className="field-hint">
                      Minimal {MIN_INTERVAL_SECONDS} detik, maksimal 24 jam.
                    </span>
                  </label>
                ) : null}
              </div>
            </>
          ) : (
            <label className="field">
              <span className="field-label">
                {selectedCapacity.label === "PON" ? "PON terpakai" : "Port terpakai"}
              </span>
              <input
                type="number"
                value={portUsed}
                onChange={(event) => setPortUsed(event.target.value)}
                min={0}
                max={selectedCapacity.capacity ?? undefined}
                step={1}
                required
                disabled={submitting}
              />
              <span className="field-hint">
                Kapasitas model {selectedCapacity.capacity ?? 0}{" "}
                {selectedCapacity.label}.
              </span>
            </label>
          )}
        </>
      ) : null}

      {submitError ? <ErrorNotice message={submitError} /> : null}

      <div className="form-actions">
        <button
          type="button"
          className="btn-link"
          onClick={onCancel}
          disabled={submitting}
        >
          Batal
        </button>
        <button
          type="submit"
          className="btn-primary btn-small"
          disabled={submitting || !selected}
        >
          {submitting ? (
            <>
              <Loader2 size={20} className="spin" aria-hidden="true" />
              Menyimpan...
            </>
          ) : (
            <>
              <Plus size={20} strokeWidth={2} aria-hidden="true" />
              Tambah perangkat
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function EditDeviceForm({
  canWrite,
  canDelete,
  device,
  onCancel,
  onUpdated,
  onDeleted,
}: {
  canWrite: boolean;
  canDelete: boolean;
  device: DeviceDetail;
  onCancel: () => void;
  onUpdated: (device: DeviceDetail) => void;
  onDeleted: (id: string) => void;
}) {
  const requiresIp = device.deviceType.requiresIp;
  const capacity = capacityInfo(device.deviceType, device.deviceModel);

  const [name, setName] = useState(device.name);
  const [ipAddress, setIpAddress] = useState(device.ipAddress ?? "");
  const [portUsed, setPortUsed] = useState(String(device.portUsed));
  const [monitoringEnabled, setMonitoringEnabled] = useState(
    device.monitoring?.enabled ?? false,
  );
  const [intervalSeconds, setIntervalSeconds] = useState(
    String(device.monitoring?.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS),
  );

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const DeviceIcon = getDeviceIcon(device.deviceType.icon);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!canWrite) {
      setSubmitError("Anda tidak punya izin mengubah perangkat.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setSubmitError("Nama perangkat wajib diisi.");
      return;
    }

    const parsedPort = Number(portUsed);
    const parsedInterval = monitoringEnabled
      ? Number(intervalSeconds)
      : DEFAULT_INTERVAL_SECONDS;
    const error = validationError(
      device.deviceType,
      device.deviceModel,
      parsedPort,
      parsedInterval,
      monitoringEnabled,
    );
    if (error) {
      setSubmitError(error);
      return;
    }

    let trimmedIp: string | null = null;
    if (requiresIp) {
      trimmedIp = ipAddress.trim();
      if (!trimmedIp) {
        setSubmitError("IP address wajib diisi untuk tipe perangkat ini.");
        return;
      }
    }

    const body: DeviceUpdateInput = {
      name: trimmedName,
      portUsed: parsedPort,
      ...(requiresIp
        ? {
            ipAddress: trimmedIp,
            monitoring: {
              enabled: monitoringEnabled,
              intervalSeconds: parsedInterval,
            },
          }
        : {}),
    };

    setSubmitting(true);
    try {
      const response = await api.updateDevice(device.id, body);
      onUpdated(response.device);
    } catch (submitFailure) {
      setSubmitError(errorMessage(submitFailure));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);

    try {
      await api.deleteDevice(device.id);
      onDeleted(device.id);
    } catch (deleteFailure) {
      setDeleteError(errorMessage(deleteFailure));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form className="device-form" onSubmit={(event) => void handleSubmit(event)}>
      <div className="device-model-summary">
        <span className="device-model-summary-icon">
          <DeviceIcon size={20} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="device-model-summary-main">
          <strong>
            {device.deviceModel.vendor} {device.deviceModel.modelName}
          </strong>
          <span>
            {device.deviceType.name} · {capacityText(device.deviceType, device.deviceModel)}
          </span>
        </span>
      </div>

      <label className="field">
        <span className="field-label">Nama perangkat</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          required
          disabled={submitting || deleting}
        />
      </label>

      {requiresIp ? (
        <>
          <label className="field">
            <span className="field-label">IP address</span>
            <input
              value={ipAddress}
              onChange={(event) => setIpAddress(event.target.value)}
              maxLength={45}
              inputMode="decimal"
              autoComplete="off"
              required
              disabled={submitting || deleting}
            />
          </label>

          <div className="monitoring-box">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={monitoringEnabled}
                onChange={(event) => setMonitoringEnabled(event.target.checked)}
                disabled={submitting || deleting}
              />
              <span>
                <strong>Aktifkan monitoring</strong>
                <span className="checkbox-hint">
                  Perangkat di-ping berkala setelah mesin monitoring berjalan.
                </span>
              </span>
            </label>

            {monitoringEnabled ? (
              <label className="field monitoring-interval">
                <span className="field-label">Interval monitoring (detik)</span>
                <input
                  type="number"
                  value={intervalSeconds}
                  onChange={(event) => setIntervalSeconds(event.target.value)}
                  min={MIN_INTERVAL_SECONDS}
                  max={MAX_INTERVAL_SECONDS}
                  step={1}
                  required
                  disabled={submitting || deleting}
                />
                <span className="field-hint">
                  Minimal {MIN_INTERVAL_SECONDS} detik, maksimal 24 jam.
                </span>
              </label>
            ) : null}
          </div>
        </>
      ) : null}

      <label className="field">
        <span className="field-label">
          {capacity.label === "PON" ? "PON terpakai" : "Port terpakai"}
        </span>
        <input
          type="number"
          value={portUsed}
          onChange={(event) => setPortUsed(event.target.value)}
          min={0}
          max={capacity.capacity ?? undefined}
          step={1}
          required
          disabled={submitting || deleting}
        />
        <span className="field-hint">
          Kapasitas model {capacity.capacity ?? 0} {capacity.label}.
        </span>
      </label>

      {submitError ? <ErrorNotice message={submitError} /> : null}

      <div className="form-actions">
        <button
          type="button"
          className="btn-link"
          onClick={onCancel}
          disabled={submitting || deleting}
        >
          Batal
        </button>
        <button
          type="submit"
          className="btn-primary btn-small"
          disabled={submitting || deleting}
        >
          {submitting ? (
            <>
              <Loader2 size={20} className="spin" aria-hidden="true" />
              Menyimpan...
            </>
          ) : (
            <>
              <Pencil size={20} strokeWidth={2} aria-hidden="true" />
              Simpan perubahan
            </>
          )}
        </button>
      </div>

      {canDelete ? (
        confirmDelete ? (
          <div className="delete-confirm" role="group" aria-label="Konfirmasi hapus">
            <p>
              Hapus <strong>{device.name}</strong>? Data perangkat dan riwayat monitoringnya
              ikut dihapus.
            </p>
            {deleteError ? <ErrorNotice message={deleteError} /> : null}
            <div className="delete-confirm-actions">
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  setConfirmDelete(false);
                  setDeleteError(null);
                }}
                disabled={deleting}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn-primary btn-small"
                onClick={() => void handleDelete()}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <Loader2 size={20} className="spin" aria-hidden="true" />
                    Menghapus...
                  </>
                ) : (
                  "Hapus"
                )}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn-secondary device-delete"
            onClick={() => setConfirmDelete(true)}
            disabled={submitting || deleting}
          >
            <Trash2 size={20} strokeWidth={2} aria-hidden="true" />
            Hapus perangkat
          </button>
        )
      ) : null}
    </form>
  );
}
