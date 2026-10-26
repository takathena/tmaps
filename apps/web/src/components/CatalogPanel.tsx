import {
  Boxes,
  Cable,
  ChevronRight,
  ExternalLink,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  errorMessage,
  type AuthUser,
  type CableType,
  type CableTypeInput,
  type DeviceModel,
  type DeviceModelInput,
  type DeviceType,
  type DeviceTypeInput,
} from "../lib/api";
import { getDeviceIcon } from "../lib/device-icons";
import { CableTypeForm, DeviceModelForm, DeviceTypeForm } from "./CatalogForms";
import { ErrorNotice } from "./ErrorNotice";

export type CatalogTab = "device" | "cable";

type CatalogPanelProps = {
  user: AuthUser;
  tab: CatalogTab;
  onTabChange: (tab: CatalogTab) => void;
  onClose: () => void;
};

type Editor =
  | { kind: "device-type"; item?: DeviceType }
  | { kind: "device-model"; item?: DeviceModel; deviceTypeId: string }
  | { kind: "cable-type"; item?: CableType };

type DeleteTarget =
  | { kind: "device-type"; id: string; label: string }
  | { kind: "device-model"; id: string; label: string }
  | { kind: "cable-type"; id: string; label: string };

function sortDeviceTypes(rows: DeviceType[]): DeviceType[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, "id"));
}

function sortDeviceModels(rows: DeviceModel[]): DeviceModel[] {
  return [...rows].sort(
    (a, b) =>
      a.vendor.localeCompare(b.vendor, "id") ||
      a.modelName.localeCompare(b.modelName, "id"),
  );
}

function sortCableTypes(rows: CableType[]): CableType[] {
  return [...rows].sort(
    (a, b) =>
      a.vendor.localeCompare(b.vendor, "id") ||
      a.modelName.localeCompare(b.modelName, "id"),
  );
}

function modelCapacity(model: DeviceModel): string {
  if (model.ponCapacity !== null) return `${model.ponCapacity} PON`;
  return `${model.portCapacity ?? 0} port`;
}

export function CatalogPanel({ user, tab, onTabChange, onClose }: CatalogPanelProps) {
  const permissions = user.role.permissions.catalog;
  const canWrite = Boolean(permissions?.write);
  const canDelete = Boolean(permissions?.delete);

  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [deviceModels, setDeviceModels] = useState<DeviceModel[]>([]);
  const [cableTypes, setCableTypes] = useState<CableType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const [typesResponse, modelsResponse, cablesResponse] = await Promise.all([
        api.getDeviceTypes(),
        api.getDeviceModels(),
        api.getCableTypes(),
      ]);

      setDeviceTypes(sortDeviceTypes(typesResponse.deviceTypes));
      setDeviceModels(sortDeviceModels(modelsResponse.deviceModels));
      setCableTypes(sortCableTypes(cablesResponse.cableTypes));
      setSelectedTypeId((current) =>
        current && typesResponse.deviceTypes.some((type) => type.id === current)
          ? current
          : (typesResponse.deviceTypes[0]?.id ?? null),
      );
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    setEditor(null);
    setDeleteTarget(null);
    setDeleteError(null);
  }, [tab]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const modelCountByType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const model of deviceModels) {
      counts.set(model.deviceTypeId, (counts.get(model.deviceTypeId) ?? 0) + 1);
    }
    return counts;
  }, [deviceModels]);

  const selectedType =
    deviceTypes.find((type) => type.id === selectedTypeId) ?? deviceTypes[0] ?? null;
  const selectedModels = useMemo(
    () =>
      selectedType
        ? deviceModels.filter((model) => model.deviceTypeId === selectedType.id)
        : [],
    [deviceModels, selectedType],
  );

  function changeTab(nextTab: CatalogTab) {
    setEditor(null);
    setDeleteTarget(null);
    setDeleteError(null);
    onTabChange(nextTab);
  }

  function openTypeEditor(item?: DeviceType) {
    setEditor({ kind: "device-type", item });
    setDeleteTarget(null);
    setDeleteError(null);
  }

  function openModelEditor(item?: DeviceModel) {
    const deviceTypeId = item?.deviceTypeId ?? selectedType?.id;
    if (!deviceTypeId) return;

    setEditor({ kind: "device-model", item, deviceTypeId });
    setDeleteTarget(null);
    setDeleteError(null);
  }

  function openCableEditor(item?: CableType) {
    setEditor({ kind: "cable-type", item });
    setDeleteTarget(null);
    setDeleteError(null);
  }

  async function submitDeviceType(input: DeviceTypeInput) {
    const current = editor;
    if (current?.kind !== "device-type") return;

    if (current.item) {
      const { deviceType } = await api.updateDeviceType(current.item.id, input);
      setDeviceTypes((rows) =>
        sortDeviceTypes(rows.map((row) => (row.id === deviceType.id ? deviceType : row))),
      );
    } else {
      const { deviceType } = await api.createDeviceType(input);
      setDeviceTypes((rows) => sortDeviceTypes([...rows, deviceType]));
      setSelectedTypeId(deviceType.id);
    }

    setEditor(null);
  }

  async function submitDeviceModel(input: DeviceModelInput) {
    const current = editor;
    if (current?.kind !== "device-model") return;

    if (current.item) {
      const { deviceModel } = await api.updateDeviceModel(current.item.id, input);
      setDeviceModels((rows) =>
        sortDeviceModels(
          rows.map((row) => (row.id === deviceModel.id ? deviceModel : row)),
        ),
      );
    } else {
      const { deviceModel } = await api.createDeviceModel(input);
      setDeviceModels((rows) => sortDeviceModels([...rows, deviceModel]));
    }

    setSelectedTypeId(input.deviceTypeId);
    setEditor(null);
  }

  async function submitCableType(input: CableTypeInput) {
    const current = editor;
    if (current?.kind !== "cable-type") return;

    if (current.item) {
      const { cableType } = await api.updateCableType(current.item.id, input);
      setCableTypes((rows) =>
        sortCableTypes(rows.map((row) => (row.id === cableType.id ? cableType : row))),
      );
    } else {
      const { cableType } = await api.createCableType(input);
      setCableTypes((rows) => sortCableTypes([...rows, cableType]));
    }

    setEditor(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      if (deleteTarget.kind === "device-type") {
        await api.deleteDeviceType(deleteTarget.id);
        const remaining = deviceTypes.filter((type) => type.id !== deleteTarget.id);
        setDeviceTypes(remaining);
        if (selectedTypeId === deleteTarget.id) {
          setSelectedTypeId(remaining[0]?.id ?? null);
        }
        if (editor?.kind === "device-type" && editor.item?.id === deleteTarget.id) {
          setEditor(null);
        }
      } else if (deleteTarget.kind === "device-model") {
        await api.deleteDeviceModel(deleteTarget.id);
        setDeviceModels((rows) => rows.filter((row) => row.id !== deleteTarget.id));
        if (editor?.kind === "device-model" && editor.item?.id === deleteTarget.id) {
          setEditor(null);
        }
      } else {
        await api.deleteCableType(deleteTarget.id);
        setCableTypes((rows) => rows.filter((row) => row.id !== deleteTarget.id));
        if (editor?.kind === "cable-type" && editor.item?.id === deleteTarget.id) {
          setEditor(null);
        }
      }

      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section
      className="catalog-panel panel"
      role="dialog"
      aria-label="Katalog perangkat dan kabel"
    >
      <header className="catalog-header">
        <div className="catalog-heading">
          <h2>Katalog</h2>
          <p>Bangun sekali, pakai berulang saat menambah perangkat atau kabel.</p>
        </div>
        <button
          type="button"
          className="icon-button catalog-close"
          aria-label="Tutup katalog"
          title="Tutup katalog"
          onClick={onClose}
        >
          <X size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </header>

      <div className="catalog-tabs" role="tablist" aria-label="Jenis katalog">
        <button
          type="button"
          className="catalog-tab"
          role="tab"
          aria-selected={tab === "device"}
          data-active={tab === "device"}
          onClick={() => changeTab("device")}
        >
          <Boxes size={20} strokeWidth={2} aria-hidden="true" />
          Perangkat
        </button>
        <button
          type="button"
          className="catalog-tab"
          role="tab"
          aria-selected={tab === "cable"}
          data-active={tab === "cable"}
          onClick={() => changeTab("cable")}
        >
          <Cable size={20} strokeWidth={2} aria-hidden="true" />
          Kabel
        </button>
      </div>

      <div className="catalog-body">
        {loading ? (
          <div className="catalog-state">
            <Loader2 size={20} className="spin" aria-hidden="true" />
            <span>Memuat katalog...</span>
          </div>
        ) : loadError ? (
          <div className="catalog-state">
            <ErrorNotice message={loadError} />
            <button type="button" className="btn-link" onClick={() => void loadCatalog()}>
              Coba lagi
            </button>
          </div>
        ) : tab === "device" ? (
          <>
            {!canWrite ? (
              <div className="catalog-ro-note">
                <Lock size={20} strokeWidth={2} aria-hidden="true" />
                <span>Mode lihat — hanya Admin yang dapat mengubah katalog.</span>
              </div>
            ) : null}

            {editor?.kind === "device-type" ? (
              <section className="catalog-editor" aria-label="Form tipe perangkat">
                <div className="catalog-editor-head">
                  <h3>{editor.item ? "Edit tipe perangkat" : "Tambah tipe perangkat"}</h3>
                  <button
                    type="button"
                    className="icon-button catalog-close"
                    aria-label="Tutup form tipe perangkat"
                    onClick={() => setEditor(null)}
                  >
                    <X size={20} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
                <DeviceTypeForm
                  initial={editor.item}
                  onCancel={() => setEditor(null)}
                  onSubmit={submitDeviceType}
                />
              </section>
            ) : null}

            {editor?.kind === "device-model" ? (
              <section className="catalog-editor" aria-label="Form model perangkat">
                <div className="catalog-editor-head">
                  <h3>{editor.item ? "Edit model perangkat" : "Tambah model perangkat"}</h3>
                  <button
                    type="button"
                    className="icon-button catalog-close"
                    aria-label="Tutup form model perangkat"
                    onClick={() => setEditor(null)}
                  >
                    <X size={20} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
                <DeviceModelForm
                  deviceTypes={deviceTypes}
                  initial={editor.item}
                  defaultTypeId={editor.deviceTypeId}
                  onCancel={() => setEditor(null)}
                  onSubmit={submitDeviceModel}
                />
              </section>
            ) : null}

            <section className="catalog-section">
              <div className="catalog-section-head">
                <div>
                  <h3>Tipe perangkat</h3>
                  <p>
                    {deviceTypes.length === 0
                      ? "Belum ada tipe."
                      : `${deviceTypes.length} tipe tersedia.`}
                  </p>
                </div>
                {canWrite && !editor ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => openTypeEditor()}
                  >
                    <Plus size={20} strokeWidth={2} aria-hidden="true" />
                    Tambah tipe
                  </button>
                ) : null}
              </div>

              {deviceTypes.length === 0 ? (
                <div className="catalog-empty">
                  <strong>Katalog perangkat masih kosong.</strong>
                  <span>
                    {canWrite
                      ? "Mulai dari tipe seperti Router, OLT, ODP, atau ODC."
                      : "Minta Admin menambahkan tipe perangkat terlebih dahulu."}
                  </span>
                </div>
              ) : (
                <ul className="catalog-list">
                  {deviceTypes.map((type) => {
                    const Icon = getDeviceIcon(type.icon);
                    const active = selectedType?.id === type.id;
                    const modelCount = modelCountByType.get(type.id) ?? 0;

                    return (
                      <li className="catalog-item" key={type.id}>
                        <button
                          type="button"
                          className="catalog-row"
                          data-active={active}
                          aria-pressed={active}
                          onClick={() => {
                            setSelectedTypeId(type.id);
                            setEditor(null);
                            setDeleteTarget(null);
                            setDeleteError(null);
                          }}
                        >
                          <span className="catalog-row-icon">
                            <Icon size={20} strokeWidth={2} aria-hidden="true" />
                          </span>
                          <span className="catalog-row-main">
                            <span className="catalog-row-title">{type.name}</span>
                            <span className="catalog-row-meta">
                              {type.category} · {modelCount} model
                              {type.requiresIp ? " · butuh IP" : ""}
                            </span>
                          </span>
                          {active ? (
                            <ChevronRight
                              size={20}
                              strokeWidth={2}
                              aria-hidden="true"
                              className="catalog-row-chevron"
                            />
                          ) : null}
                        </button>

                        {canWrite || canDelete ? (
                          <span className="catalog-row-actions">
                            {canWrite ? (
                              <button
                                type="button"
                                className="catalog-row-action"
                                aria-label={`Edit tipe ${type.name}`}
                                title="Edit tipe"
                                onClick={() => openTypeEditor(type)}
                              >
                                <Pencil size={20} strokeWidth={2} aria-hidden="true" />
                              </button>
                            ) : null}
                            {canDelete ? (
                              <button
                                type="button"
                                className="catalog-row-action"
                                aria-label={`Hapus tipe ${type.name}`}
                                title="Hapus tipe"
                                onClick={() => {
                                  setDeleteTarget({
                                    kind: "device-type",
                                    id: type.id,
                                    label: type.name,
                                  });
                                  setDeleteError(null);
                                }}
                              >
                                <Trash2 size={20} strokeWidth={2} aria-hidden="true" />
                              </button>
                            ) : null}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}

              {deleteTarget?.kind === "device-type" ? (
                <DeleteConfirm
                  label={deleteTarget.label}
                  description="Model di dalam tipe ini juga harus sudah tidak ada."
                  deleting={deleting}
                  error={deleteError}
                  onCancel={() => {
                    setDeleteTarget(null);
                    setDeleteError(null);
                  }}
                  onConfirm={() => void confirmDelete()}
                />
              ) : null}
            </section>

            {deviceTypes.length > 0 ? (
              <section className="catalog-section">
                <div className="catalog-section-head">
                  <div>
                    <h3>Model perangkat</h3>
                    <p>
                      {selectedType
                        ? `Model untuk ${selectedType.name}.`
                        : "Pilih tipe perangkat untuk melihat model."}
                    </p>
                  </div>
                  {canWrite && selectedType && !editor ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => openModelEditor()}
                    >
                      <Plus size={20} strokeWidth={2} aria-hidden="true" />
                      Tambah model
                    </button>
                  ) : null}
                </div>

                {!selectedType ? (
                  <div className="catalog-empty">
                    <strong>Belum ada tipe yang dipilih.</strong>
                    <span>Tambahkan tipe perangkat terlebih dahulu.</span>
                  </div>
                ) : selectedModels.length === 0 ? (
                  <div className="catalog-empty">
                    <strong>Belum ada model untuk {selectedType.name}.</strong>
                    <span>
                      {canWrite
                        ? "Model menyimpan vendor, nama, dan kapasitas agar tidak perlu diisi ulang di peta."
                        : "Minta Admin menambahkan model perangkat."}
                    </span>
                  </div>
                ) : (
                  <ul className="catalog-list">
                    {selectedModels.map((model) => (
                      <li className="catalog-item" key={model.id}>
                        <div className="catalog-row catalog-row-static">
                          <span className="catalog-row-main">
                            <span className="catalog-row-title">
                              {model.vendor} {model.modelName}
                            </span>
                            <span className="catalog-row-meta">
                              {modelCapacity(model)}
                              {model.productUrl ? (
                                <a
                                  className="catalog-meta-link"
                                  href={model.productUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  URL produk
                                  <ExternalLink
                                    size={20}
                                    strokeWidth={2}
                                    aria-hidden="true"
                                  />
                                </a>
                              ) : null}
                              {model.referenceImageUrl ? (
                                <a
                                  className="catalog-meta-link"
                                  href={model.referenceImageUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Gambar referensi
                                  <ExternalLink
                                    size={20}
                                    strokeWidth={2}
                                    aria-hidden="true"
                                  />
                                </a>
                              ) : null}
                            </span>
                          </span>
                        </div>

                        {canWrite || canDelete ? (
                          <span className="catalog-row-actions">
                            {canWrite ? (
                              <button
                                type="button"
                                className="catalog-row-action"
                                aria-label={`Edit model ${model.vendor} ${model.modelName}`}
                                title="Edit model"
                                onClick={() => openModelEditor(model)}
                              >
                                <Pencil size={20} strokeWidth={2} aria-hidden="true" />
                              </button>
                            ) : null}
                            {canDelete ? (
                              <button
                                type="button"
                                className="catalog-row-action"
                                aria-label={`Hapus model ${model.vendor} ${model.modelName}`}
                                title="Hapus model"
                                onClick={() => {
                                  setDeleteTarget({
                                    kind: "device-model",
                                    id: model.id,
                                    label: `${model.vendor} ${model.modelName}`,
                                  });
                                  setDeleteError(null);
                                }}
                              >
                                <Trash2 size={20} strokeWidth={2} aria-hidden="true" />
                              </button>
                            ) : null}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}

                {deleteTarget?.kind === "device-model" ? (
                  <DeleteConfirm
                    label={deleteTarget.label}
                    description="Model yang masih dipakai perangkat tidak bisa dihapus."
                    deleting={deleting}
                    error={deleteError}
                    onCancel={() => {
                      setDeleteTarget(null);
                      setDeleteError(null);
                    }}
                    onConfirm={() => void confirmDelete()}
                  />
                ) : null}
              </section>
            ) : null}
          </>
        ) : (
          <>
            {!canWrite ? (
              <div className="catalog-ro-note">
                <Lock size={20} strokeWidth={2} aria-hidden="true" />
                <span>Mode lihat — hanya Admin yang dapat mengubah katalog.</span>
              </div>
            ) : null}

            {editor?.kind === "cable-type" ? (
              <section className="catalog-editor" aria-label="Form tipe kabel">
                <div className="catalog-editor-head">
                  <h3>{editor.item ? "Edit tipe kabel" : "Tambah tipe kabel"}</h3>
                  <button
                    type="button"
                    className="icon-button catalog-close"
                    aria-label="Tutup form tipe kabel"
                    onClick={() => setEditor(null)}
                  >
                    <X size={20} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
                <CableTypeForm
                  initial={editor.item}
                  onCancel={() => setEditor(null)}
                  onSubmit={submitCableType}
                />
              </section>
            ) : null}

            <section className="catalog-section">
              <div className="catalog-section-head">
                <div>
                  <h3>Tipe kabel</h3>
                  <p>
                    {cableTypes.length === 0
                      ? "Belum ada tipe kabel."
                      : `${cableTypes.length} tipe tersedia.`}
                  </p>
                </div>
                {canWrite && !editor ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => openCableEditor()}
                  >
                    <Plus size={20} strokeWidth={2} aria-hidden="true" />
                    Tambah tipe kabel
                  </button>
                ) : null}
              </div>

              {cableTypes.length === 0 ? (
                <div className="catalog-empty">
                  <strong>Katalog kabel masih kosong.</strong>
                  <span>
                    {canWrite
                      ? "Tambahkan model kabel seperti Furukawa Fiber Optic 24 Core."
                      : "Minta Admin menambahkan tipe kabel terlebih dahulu."}
                  </span>
                </div>
              ) : (
                <ul className="catalog-list">
                  {cableTypes.map((cable) => (
                    <li className="catalog-item" key={cable.id}>
                      <div className="catalog-row catalog-row-static">
                        <span
                          className="cable-swatch"
                          style={{ backgroundColor: cable.color }}
                          aria-label={`Warna ${cable.color}`}
                          title={cable.color}
                        />
                        <span className="catalog-row-main">
                          <span className="catalog-row-title">
                            {cable.vendor} {cable.modelName}
                          </span>
                          <span className="catalog-row-meta">
                            {cable.coreCapacity} core · {cable.color}
                            {cable.productUrl ? (
                              <a
                                className="catalog-meta-link"
                                href={cable.productUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                URL produk
                                <ExternalLink
                                  size={20}
                                  strokeWidth={2}
                                  aria-hidden="true"
                                />
                              </a>
                            ) : null}
                          </span>
                        </span>
                      </div>

                      {canWrite || canDelete ? (
                        <span className="catalog-row-actions">
                          {canWrite ? (
                            <button
                              type="button"
                              className="catalog-row-action"
                              aria-label={`Edit kabel ${cable.vendor} ${cable.modelName}`}
                              title="Edit tipe kabel"
                              onClick={() => openCableEditor(cable)}
                            >
                              <Pencil size={20} strokeWidth={2} aria-hidden="true" />
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              className="catalog-row-action"
                              aria-label={`Hapus kabel ${cable.vendor} ${cable.modelName}`}
                              title="Hapus tipe kabel"
                              onClick={() => {
                                setDeleteTarget({
                                  kind: "cable-type",
                                  id: cable.id,
                                  label: `${cable.vendor} ${cable.modelName}`,
                                });
                                setDeleteError(null);
                              }}
                            >
                              <Trash2 size={20} strokeWidth={2} aria-hidden="true" />
                            </button>
                          ) : null}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {deleteTarget?.kind === "cable-type" ? (
                <DeleteConfirm
                  label={deleteTarget.label}
                  description="Tipe kabel yang masih dipakai kabel di peta tidak bisa dihapus."
                  deleting={deleting}
                  error={deleteError}
                  onCancel={() => {
                    setDeleteTarget(null);
                    setDeleteError(null);
                  }}
                  onConfirm={() => void confirmDelete()}
                />
              ) : null}
            </section>
          </>
        )}
      </div>
    </section>
  );
}

function DeleteConfirm({
  label,
  description,
  deleting,
  error,
  onCancel,
  onConfirm,
}: {
  label: string;
  description: string;
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="delete-confirm" role="group" aria-label="Konfirmasi hapus">
      <p>
        Hapus <strong>{label}</strong>? {description}
      </p>
      {error ? <ErrorNotice message={error} /> : null}
      <div className="delete-confirm-actions">
        <button type="button" className="btn-link" onClick={onCancel} disabled={deleting}>
          Batal
        </button>
        <button
          type="button"
          className="btn-primary btn-small"
          onClick={onConfirm}
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
  );
}
