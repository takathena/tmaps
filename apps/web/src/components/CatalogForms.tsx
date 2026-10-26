import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  errorMessage,
  type CableType,
  type CableTypeInput,
  type DeviceModel,
  type DeviceModelInput,
  type DeviceType,
  type DeviceTypeInput,
} from "../lib/api";
import { capacityLabel, usesPonCapacity } from "../lib/catalog";
import { DEVICE_ICON_OPTIONS } from "../lib/device-icons";
import { ErrorNotice } from "./ErrorNotice";

type DeviceTypeFormProps = {
  initial?: DeviceType;
  onCancel: () => void;
  onSubmit: (input: DeviceTypeInput) => Promise<void>;
};

export function DeviceTypeForm({ initial, onCancel, onSubmit }: DeviceTypeFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [requiresIp, setRequiresIp] = useState(initial?.requiresIp ?? false);
  const [icon, setIcon] = useState(initial?.icon ?? "Router");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await onSubmit({ name, category, requiresIp, icon });
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="catalog-form" onSubmit={handleSubmit}>
      {error ? <ErrorNotice message={error} /> : null}

      <label className="field">
        <span className="field-label">Nama tipe</span>
        <input
          type="text"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Contoh: Router, OLT, ODP"
          maxLength={80}
          required
          autoFocus
          disabled={submitting}
        />
      </label>

      <label className="field">
        <span className="field-label">Kategori</span>
        <input
          type="text"
          name="category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          placeholder="Contoh: Active, Passive"
          list="device-type-categories"
          maxLength={80}
          required
          disabled={submitting}
        />
        <datalist id="device-type-categories">
          <option value="Active" />
          <option value="Passive" />
          <option value="Access" />
          <option value="Distribution" />
        </datalist>
        <span className="field-hint">
          Nama atau kategori yang memuat “OLT” memakai kapasitas PON.
        </span>
      </label>

      <div className="field">
        <span className="field-label">Icon peta</span>
        <div className="icon-picker" role="group" aria-label="Pilih icon perangkat">
          {DEVICE_ICON_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = icon === option.value;

            return (
              <button
                key={option.value}
                type="button"
                className="icon-choice"
                data-active={active}
                aria-label={option.label}
                aria-pressed={active}
                title={option.label}
                onClick={() => setIcon(option.value)}
                disabled={submitting}
              >
                <Icon size={20} strokeWidth={2} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={requiresIp}
          onChange={(event) => setRequiresIp(event.target.checked)}
          disabled={submitting}
        />
        <span>Perangkat tipe ini membutuhkan IP untuk monitoring</span>
      </label>

      <FormActions
        submitting={submitting}
        onCancel={onCancel}
        submitLabel={initial ? "Simpan perubahan" : "Tambah tipe"}
      />
    </form>
  );
}

type DeviceModelFormProps = {
  deviceTypes: DeviceType[];
  initial?: DeviceModel;
  defaultTypeId?: string;
  onCancel: () => void;
  onSubmit: (input: DeviceModelInput) => Promise<void>;
};

export function DeviceModelForm({
  deviceTypes,
  initial,
  defaultTypeId,
  onCancel,
  onSubmit,
}: DeviceModelFormProps) {
  const [deviceTypeId, setDeviceTypeId] = useState(
    initial?.deviceTypeId ?? defaultTypeId ?? deviceTypes[0]?.id ?? "",
  );
  const selectedType = deviceTypes.find((type) => type.id === deviceTypeId);
  const pon = selectedType ? usesPonCapacity(selectedType) : false;
  const [vendor, setVendor] = useState(initial?.vendor ?? "");
  const [modelName, setModelName] = useState(initial?.modelName ?? "");
  const [capacity, setCapacity] = useState(() => {
    const value = pon
      ? initial?.ponCapacity
      : initial?.portCapacity;
    return value == null ? "" : String(value);
  });
  const [productUrl, setProductUrl] = useState(initial?.productUrl ?? "");
  const [referenceImageUrl, setReferenceImageUrl] = useState(
    initial?.referenceImageUrl ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleTypeChange(nextTypeId: string) {
    setDeviceTypeId(nextTypeId);
    setCapacity("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!selectedType) {
      setError("Pilih device type terlebih dahulu.");
      return;
    }

    const numericCapacity = Number(capacity);

    if (!Number.isInteger(numericCapacity) || numericCapacity < 0) {
      setError(`${capacityLabel(selectedType)} harus bilangan bulat dan tidak boleh negatif.`);
      return;
    }

    const input: DeviceModelInput = {
      deviceTypeId,
      vendor,
      modelName,
      portCapacity: pon ? null : numericCapacity,
      ponCapacity: pon ? numericCapacity : null,
      productUrl: productUrl.trim() || null,
      referenceImageUrl: referenceImageUrl.trim() || null,
    };

    setSubmitting(true);
    try {
      await onSubmit(input);
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="catalog-form" onSubmit={handleSubmit}>
      {error ? <ErrorNotice message={error} /> : null}

      <label className="field">
        <span className="field-label">Device type</span>
        <select
          value={deviceTypeId}
          onChange={(event) => handleTypeChange(event.target.value)}
          disabled={submitting || deviceTypes.length === 0}
          required
        >
          {deviceTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name} — {type.category}
            </option>
          ))}
        </select>
      </label>

      <div className="form-split">
        <label className="field">
          <span className="field-label">Vendor</span>
          <input
            type="text"
            value={vendor}
            onChange={(event) => setVendor(event.target.value)}
            placeholder="Contoh: Mikrotik"
            maxLength={80}
            required
            autoFocus
            disabled={submitting}
          />
        </label>

        <label className="field">
          <span className="field-label">Model</span>
          <input
            type="text"
            value={modelName}
            onChange={(event) => setModelName(event.target.value)}
            placeholder="Contoh: CCR2116-12G-4S+"
            maxLength={120}
            required
            disabled={submitting}
          />
        </label>
      </div>

      <label className="field">
        <span className="field-label">
          {selectedType ? capacityLabel(selectedType) : "Kapasitas"}
        </span>
        <input
          type="number"
          min={0}
          step={1}
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
          placeholder="Contoh: 16"
          required
          disabled={submitting}
        />
        <span className="field-hint">
          {pon
            ? "Tipe OLT memakai jumlah port PON."
            : "Tipe non-OLT memakai jumlah port perangkat."}
        </span>
      </label>

      <label className="field">
        <span className="field-label">Product URL (opsional)</span>
        <input
          type="url"
          value={productUrl}
          onChange={(event) => setProductUrl(event.target.value)}
          placeholder="https://..."
          maxLength={2048}
          disabled={submitting}
        />
      </label>

      <label className="field">
        <span className="field-label">URL gambar referensi (opsional)</span>
        <input
          type="url"
          value={referenceImageUrl}
          onChange={(event) => setReferenceImageUrl(event.target.value)}
          placeholder="https://..."
          maxLength={2048}
          disabled={submitting}
        />
      </label>

      <FormActions
        submitting={submitting}
        onCancel={onCancel}
        submitLabel={initial ? "Simpan perubahan" : "Tambah model"}
      />
    </form>
  );
}

type CableTypeFormProps = {
  initial?: CableType;
  onCancel: () => void;
  onSubmit: (input: CableTypeInput) => Promise<void>;
};

export function CableTypeForm({ initial, onCancel, onSubmit }: CableTypeFormProps) {
  const [vendor, setVendor] = useState(initial?.vendor ?? "");
  const [modelName, setModelName] = useState(initial?.modelName ?? "");
  const [color, setColor] = useState(initial?.color ?? "#4465e9");
  const [coreCapacity, setCoreCapacity] = useState(
    initial ? String(initial.coreCapacity) : "",
  );
  const [productUrl, setProductUrl] = useState(initial?.productUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const numericCapacity = Number(coreCapacity);

    if (!Number.isInteger(numericCapacity) || numericCapacity <= 0) {
      setError("Core capacity harus bilangan bulat lebih dari 0.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        vendor,
        modelName,
        color,
        coreCapacity: numericCapacity,
        productUrl: productUrl.trim() || null,
      });
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="catalog-form" onSubmit={handleSubmit}>
      {error ? <ErrorNotice message={error} /> : null}

      <div className="form-split">
        <label className="field">
          <span className="field-label">Vendor</span>
          <input
            type="text"
            value={vendor}
            onChange={(event) => setVendor(event.target.value)}
            placeholder="Contoh: Furukawa"
            maxLength={80}
            required
            autoFocus
            disabled={submitting}
          />
        </label>

        <label className="field">
          <span className="field-label">Model</span>
          <input
            type="text"
            value={modelName}
            onChange={(event) => setModelName(event.target.value)}
            placeholder="Contoh: Fiber Optic 24 Core"
            maxLength={120}
            required
            disabled={submitting}
          />
        </label>
      </div>

      <div className="form-split">
        <label className="field">
          <span className="field-label">Core capacity</span>
          <input
            type="number"
            min={1}
            step={1}
            value={coreCapacity}
            onChange={(event) => setCoreCapacity(event.target.value)}
            placeholder="Contoh: 24"
            required
            disabled={submitting}
          />
        </label>

        <div className="field">
          <span className="field-label">Warna garis</span>
          <div className="color-input">
            <input
              type="color"
              value={color}
              aria-label="Pilih warna garis kabel"
              onChange={(event) => setColor(event.target.value)}
              disabled={submitting}
            />
            <code>{color}</code>
          </div>
        </div>
      </div>

      <label className="field">
        <span className="field-label">Product URL (opsional)</span>
        <input
          type="url"
          value={productUrl}
          onChange={(event) => setProductUrl(event.target.value)}
          placeholder="https://..."
          maxLength={2048}
          disabled={submitting}
        />
      </label>

      <FormActions
        submitting={submitting}
        onCancel={onCancel}
        submitLabel={initial ? "Simpan perubahan" : "Tambah tipe kabel"}
      />
    </form>
  );
}

function FormActions({
  submitting,
  onCancel,
  submitLabel,
}: {
  submitting: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="form-actions">
      <button type="button" className="btn-link" onClick={onCancel} disabled={submitting}>
        Batal
      </button>
      <button type="submit" className="btn-primary" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 size={20} className="spin" aria-hidden="true" />
            Menyimpan...
          </>
        ) : (
          submitLabel
        )}
      </button>
    </div>
  );
}
