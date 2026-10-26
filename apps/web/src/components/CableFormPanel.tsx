import {
  ArrowRight,
  Cable as CableIcon,
  Check,
  Loader2,
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
  type CableCreateInput,
  type CableDetail,
  type CablePathPoint,
  type CableType,
  type DeviceSummary,
} from "../lib/api";
import { formatLength, lengthInputValue, pathLengthMeters } from "../lib/geo";
import { ErrorNotice } from "./ErrorNotice";

export type CableDraft = {
  from: DeviceSummary;
  to: DeviceSummary;
  path: CablePathPoint[];
};

type CableFormPanelProps = {
  mode: "create" | "edit";
  user: AuthUser;
  draft?: CableDraft;
  cable?: CableDetail;
  loading?: boolean;
  loadError?: string | null;
  onClose: () => void;
  onOpenCatalog: () => void;
  onCreated: (cable: CableDetail) => void;
  onUpdated: (cable: CableDetail) => void;
  onDeleted: (id: string) => void;
};

export function CableFormPanel({
  mode,
  user,
  draft,
  cable,
  loading = false,
  loadError = null,
  onClose,
  onOpenCatalog,
  onCreated,
  onUpdated,
  onDeleted,
}: CableFormPanelProps) {
  const isCreate = mode === "create";
  const canWrite = Boolean(user.role.permissions.cables?.write);
  const canDelete = Boolean(user.role.permissions.cables?.delete);
  const readOnly = !canWrite;

  const [cableTypes, setCableTypes] = useState<CableType[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [loadErrorState, setLoadErrorState] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(
    cable?.cableTypeId ?? null,
  );
  const [length, setLength] = useState(() =>
    lengthInputValue(
      isCreate && draft ? pathLengthMeters(draft.path) : (cable?.length ?? 0),
    ),
  );
  const [coreUsed, setCoreUsed] = useState(
    isCreate ? "1" : String(cable?.coreUsed ?? 1),
  );

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const loadCableTypes = useCallback(async () => {
    setTypesLoading(true);
    setLoadErrorState(null);

    try {
      const response = await api.getCableTypes();
      setCableTypes(response.cableTypes);
    } catch (error) {
      setLoadErrorState(errorMessage(error));
    } finally {
      setTypesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCableTypes();
  }, [loadCableTypes]);

  // Detail kabel dimuat setelah panel tampil; sinkronkan field saat datanya tiba.
  useEffect(() => {
    if (!cable) return;
    setSelectedTypeId(cable.cableTypeId);
    setLength(lengthInputValue(cable.length));
    setCoreUsed(String(cable.coreUsed));
  }, [cable]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return cableTypes;

    return cableTypes.filter((type) =>
      `${type.vendor} ${type.modelName} ${type.coreCapacity}`
        .toLowerCase()
        .includes(query),
    );
  }, [cableTypes, search]);

  const selectedType =
    cableTypes.find((type) => type.id === selectedTypeId) ?? null;
  const endpoints = isCreate
    ? draft
      ? { from: draft.from, to: draft.to }
      : null
    : cable
      ? { from: cable.deviceFrom, to: cable.deviceTo }
      : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!canWrite) {
      setSubmitError("Anda tidak punya izin mengubah kabel.");
      return;
    }

    if (!selectedType) {
      setSubmitError("Pilih tipe kabel terlebih dahulu.");
      return;
    }

    const parsedCore = Number(coreUsed);
    if (!Number.isInteger(parsedCore) || parsedCore < 1) {
      setSubmitError("Core terpakai harus bilangan bulat minimal 1.");
      return;
    }
    if (parsedCore > selectedType.coreCapacity) {
      setSubmitError(
        `Core terpakai (${parsedCore}) melebihi kapasitas kabel (${selectedType.coreCapacity}).`,
      );
      return;
    }

    const parsedLength = Number(length);
    if (!Number.isFinite(parsedLength) || parsedLength <= 0) {
      setSubmitError("Panjang kabel harus lebih dari 0 meter.");
      return;
    }

    setSubmitting(true);
    try {
      if (isCreate && draft) {
        const body: CableCreateInput = {
          cableTypeId: selectedType.id,
          deviceFromId: draft.from.id,
          deviceToId: draft.to.id,
          path: draft.path,
          length: parsedLength,
          coreUsed: parsedCore,
        };
        const response = await api.createCable(body);
        onCreated(response.cable);
      } else if (cable) {
        const response = await api.updateCable(cable.id, {
          cableTypeId: selectedType.id,
          length: parsedLength,
          coreUsed: parsedCore,
        });
        onUpdated(response.cable);
      }
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!cable) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      await api.deleteCable(cable.id);
      onDeleted(cable.id);
    } catch (error) {
      setDeleteError(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section
      className="device-panel panel"
      role="dialog"
      aria-label={isCreate ? "Tambah kabel" : "Edit kabel"}
    >
      <header className="catalog-header device-panel-header">
        <div className="catalog-heading">
          <h2>{isCreate ? "Tambah kabel" : "Edit kabel"}</h2>
          <p>
            {loading
              ? "Memuat detail kabel..."
              : loadError
                ? "Detail kabel gagal dimuat."
                : isCreate
                  ? "Jalur sudah ditentukan. Pilih tipe kabel lalu isi core dan panjang."
                  : cable
                    ? `${cable.cableType.vendor} ${cable.cableType.modelName}`
                    : "Detail kabel tidak tersedia."}
          </p>
        </div>
        <button
          type="button"
          className="icon-button catalog-close device-panel-close"
          aria-label="Tutup form kabel"
          title="Tutup form kabel"
          onClick={onClose}
        >
          <X size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </header>

      <div className="device-panel-body">
        {loading ? (
          <div className="catalog-state">
            <Loader2 size={20} className="spin" aria-hidden="true" />
            <span>Memuat detail kabel...</span>
          </div>
        ) : loadError ? (
          <div className="catalog-state">
            <ErrorNotice message={loadError} />
            <button type="button" className="btn-link" onClick={onClose}>
              Tutup
            </button>
          </div>
        ) : typesLoading ? (
          <div className="catalog-state">
            <Loader2 size={20} className="spin" aria-hidden="true" />
            <span>Memuat tipe kabel...</span>
          </div>
        ) : loadErrorState ? (
          <div className="catalog-state">
            <ErrorNotice message={loadErrorState} />
            <button type="button" className="btn-link" onClick={() => void loadCableTypes()}>
              Coba lagi
            </button>
          </div>
        ) : cableTypes.length === 0 ? (
          <div className="device-empty">
            <div className="catalog-empty">
              <strong>Katalog kabel masih kosong.</strong>
              <span>
                Tambahkan tipe kabel lebih dulu, lalu kembali ke peta untuk menarik
                kabel antar perangkat.
              </span>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-link" onClick={onClose}>
                Batal
              </button>
              <button
                type="button"
                className="btn-primary btn-small"
                onClick={onOpenCatalog}
              >
                Buka katalog kabel
              </button>
            </div>
          </div>
        ) : (
          <form
            className="device-form"
            noValidate
            onSubmit={(event) => void handleSubmit(event)}
          >
            {endpoints ? (
              <div className="cable-endpoints">
                <span className="cable-endpoint">
                  <CableIcon size={20} strokeWidth={2} aria-hidden="true" />
                  <strong>{endpoints.from.name}</strong>
                </span>
                <ArrowRight size={20} strokeWidth={2} aria-hidden="true" />
                <span className="cable-endpoint">
                  <CableIcon size={20} strokeWidth={2} aria-hidden="true" />
                  <strong>{endpoints.to.name}</strong>
                </span>
              </div>
            ) : null}

            <div className="field">
              <label className="field-label" htmlFor="cable-type-search">
                Tipe kabel
              </label>
              <div className="model-search">
                <Search size={20} strokeWidth={2} aria-hidden="true" />
                <input
                  id="cable-type-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari vendor atau model kabel..."
                  aria-label="Cari tipe kabel"
                  autoComplete="off"
                  autoFocus={!readOnly}
                  disabled={submitting || deleting || readOnly}
                />
              </div>

              <div className="model-list" role="listbox" aria-label="Pilih tipe kabel">
                {filtered.length === 0 ? (
                  <p className="model-empty">
                    Tidak ada tipe kabel yang cocok.{" "}
                    <button type="button" className="btn-link" onClick={onOpenCatalog}>
                      Buka katalog
                    </button>
                  </p>
                ) : (
                  filtered.map((type) => {
                    const active = type.id === selectedTypeId;

                    return (
                      <button
                        key={type.id}
                        type="button"
                        className="model-option"
                        role="option"
                        aria-selected={active}
                        data-selected={active}
                        onClick={() => setSelectedTypeId(type.id)}
                        disabled={submitting || deleting || readOnly}
                      >
                        <span className="model-option-icon">
                          <span
                            className="cable-color-dot"
                            style={{ backgroundColor: type.color }}
                            aria-hidden="true"
                          />
                        </span>
                        <span className="model-option-main">
                          <span className="model-option-title">
                            {type.vendor} {type.modelName}
                          </span>
                          <span className="model-option-meta">
                            {type.coreCapacity} core · {type.color.toUpperCase()}
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
                Vendor dan kapasitas core mengikuti tipe kabel di katalog.
              </span>
            </div>

            {selectedType ? (
              <div className="device-model-note">
                <span>
                  {selectedType.vendor} {selectedType.modelName}
                </span>
                <span>
                  {selectedType.coreCapacity} core · warna {selectedType.color.toUpperCase()}
                </span>
              </div>
            ) : null}

            <label className="field">
              <span className="field-label">Core terpakai</span>
              <input
                type="number"
                value={coreUsed}
                onChange={(event) => setCoreUsed(event.target.value)}
                min={1}
                max={selectedType?.coreCapacity ?? undefined}
                step={1}
                required
                disabled={submitting || deleting || readOnly}
              />
              <span className="field-hint">
                {selectedType
                  ? `Kapasitas kabel ${selectedType.coreCapacity} core.`
                  : "Pilih tipe kabel untuk melihat kapasitas core."}
              </span>
            </label>

            <label className="field">
              <span className="field-label">Panjang kabel (meter)</span>
              <input
                type="number"
                value={length}
                onChange={(event) => setLength(event.target.value)}
                min={0.1}
                step={0.1}
                required
                disabled={submitting || deleting || readOnly}
              />
              <span className="field-hint">
                Otomatis dari jalur (
                {formatLength(
                  pathLengthMeters(isCreate ? (draft?.path ?? []) : (cable?.path ?? [])),
                )}
                ).{readOnly ? " Panjang tersimpan mengikuti data kabel." : " Ubah bila perlu."}
              </span>
            </label>

            {submitError ? <ErrorNotice message={submitError} /> : null}

            {readOnly ? (
              <p className="readonly-note">Anda hanya dapat melihat detail kabel.</p>
            ) : null}

            <div className="form-actions">
              <button
                type="button"
                className="btn-link"
                onClick={onClose}
                disabled={submitting || deleting}
              >
                {readOnly ? "Tutup" : "Batal"}
              </button>
              {readOnly ? null : (
                <button
                  type="submit"
                  className="btn-primary btn-small"
                  disabled={submitting || deleting || !selectedType}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={20} className="spin" aria-hidden="true" />
                      Menyimpan...
                    </>
                  ) : isCreate ? (
                    <>
                      <Plus size={20} strokeWidth={2} aria-hidden="true" />
                      Tambah kabel
                    </>
                  ) : (
                    <>
                      <Pencil size={20} strokeWidth={2} aria-hidden="true" />
                      Simpan perubahan
                    </>
                  )}
                </button>
              )}
            </div>

            {!isCreate && cable && canDelete ? (
              confirmDelete ? (
                <div className="delete-confirm" role="group" aria-label="Konfirmasi hapus kabel">
                  <p>
                    Hapus kabel <strong>{cable.cableType.vendor} {cable.cableType.modelName}</strong>?
                    Relasi topologi antara {cable.deviceFrom.name} dan {cable.deviceTo.name}
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
                  Hapus kabel
                </button>
              )
            ) : null}
          </form>
        )}
      </div>
    </section>
  );
}
