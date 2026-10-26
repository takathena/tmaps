import { CircleAlert, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  api,
  errorMessage,
  type AuthUser,
  type DeviceDetail,
  type DeviceSummary,
} from "../lib/api";
import { Brand } from "./Brand";
import { CatalogPanel, type CatalogTab } from "./CatalogPanel";
import {
  DeviceFormPanel,
  type DeviceLocation,
} from "./DeviceFormPanel";
import { MainMenu } from "./MainMenu";
import { MapView } from "./MapView";
import { NotificationBell } from "./NotificationBell";
import { Toolbar, type ToolId } from "./Toolbar";

type MapShellProps = {
  user: AuthUser;
  onLogout: () => Promise<void>;
};

type EditingDevice = {
  id: string;
  device: DeviceDetail | null;
  loading: boolean;
  error: string | null;
};

function sortDevices(rows: DeviceSummary[]): DeviceSummary[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, "id"));
}

function toSummary(device: DeviceDetail): DeviceSummary {
  return {
    id: device.id,
    name: device.name,
    latitude: device.latitude,
    longitude: device.longitude,
    status: device.status,
    deviceTypeId: device.deviceType.id,
    typeName: device.deviceType.name,
    icon: device.deviceType.icon,
  };
}

export function MapShell({ user, onLogout }: MapShellProps) {
  const canWriteDevices = Boolean(user.role.permissions.devices?.write);

  const [activeTool, setActiveTool] = useState<ToolId>("select");
  const [catalogTab, setCatalogTab] = useState<CatalogTab | null>(null);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [createLocation, setCreateLocation] = useState<DeviceLocation | null>(null);
  const [editing, setEditing] = useState<EditingDevice | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    setDevicesError(null);

    try {
      const response = await api.getDevices();
      setDevices(sortDevices(response.devices));
    } catch (error) {
      setDevicesError(errorMessage(error));
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function closeDeviceEditor() {
    if (createLocation) setActiveTool("select");
    setCreateLocation(null);
    setEditing(null);
  }

  function openCatalog(tab: CatalogTab) {
    setCreateLocation(null);
    setEditing(null);
    setCatalogTab(tab);
  }

  function handleToolSelect(tool: ToolId) {
    setActiveTool(tool);

    if (tool !== "add-device") setCreateLocation(null);
    if (tool !== "select") setEditing(null);
  }

  function handleMapClick(latitude: number, longitude: number) {
    if (activeTool !== "add-device" || createLocation) return;

    if (!canWriteDevices) {
      setNotice("Anda tidak punya izin menambah perangkat.");
      setActiveTool("select");
      return;
    }

    setCatalogTab(null);
    setEditing(null);
    setCreateLocation({ latitude, longitude });
  }

  function handleDeviceSelect(id: string) {
    if (activeTool !== "select" || !canWriteDevices) return;

    setCatalogTab(null);
    setCreateLocation(null);
    setEditing({ id, device: null, loading: true, error: null });

    api
      .getDevice(id)
      .then((response) => {
        setEditing((current) =>
          current?.id === id
            ? { id, device: response.device, loading: false, error: null }
            : current,
        );
      })
      .catch((error) => {
        setEditing((current) =>
          current?.id === id
            ? { ...current, loading: false, error: errorMessage(error) }
            : current,
        );
      });
  }

  function handleCreated(device: DeviceDetail) {
    setDevices((rows) => sortDevices([...rows, toSummary(device)]));
    setCreateLocation(null);
    setEditing(null);
    setActiveTool("select");
  }

  function handleUpdated(device: DeviceDetail) {
    setDevices((rows) =>
      sortDevices(
        rows.map((row) => (row.id === device.id ? toSummary(device) : row)),
      ),
    );
    setEditing(null);
  }

  function handleDeleted(id: string) {
    setDevices((rows) => rows.filter((row) => row.id !== id));
    setEditing(null);
  }

  async function handleDeviceMove(id: string, latitude: number, longitude: number) {
    if (!canWriteDevices) return;

    const previous = devices.find((device) => device.id === id);
    if (!previous) return;

    setDevices((rows) =>
      rows.map((row) => (row.id === id ? { ...row, latitude, longitude } : row)),
    );

    try {
      const response = await api.updateDevice(id, { latitude, longitude });
      const saved = response.device;

      setDevices((rows) =>
        sortDevices(
          rows.map((row) => (row.id === saved.id ? toSummary(saved) : row)),
        ),
      );
      setEditing((current) =>
        current?.id === saved.id && current.device
          ? {
              ...current,
              device: {
                ...current.device,
                latitude: saved.latitude,
                longitude: saved.longitude,
                updatedAt: saved.updatedAt,
              },
            }
          : current,
      );
    } catch (error) {
      setDevices((rows) =>
        rows.map((row) => (row.id === id ? previous : row)),
      );
      setNotice(errorMessage(error));
    }
  }

  const editingId = editing?.id ?? null;

  return (
    <div className="app-shell" data-tool={activeTool}>
      <MapView
        activeTool={activeTool}
        devices={devices}
        selectedDeviceId={editingId}
        pendingLocation={createLocation}
        canMoveDevices={canWriteDevices}
        onMapClick={handleMapClick}
        onDeviceSelect={handleDeviceSelect}
        onDeviceMove={(id, latitude, longitude) =>
          void handleDeviceMove(id, latitude, longitude)
        }
      />

      <div className="ui-overlay">
        <header className="panel overlay-top-left">
          <Brand />
          <MainMenu onLogout={onLogout} onOpenCatalog={openCatalog} />
        </header>

        <div className="panel overlay-top-right">
          <NotificationBell />
        </div>

        {catalogTab ? (
          <CatalogPanel
            user={user}
            tab={catalogTab}
            onTabChange={(tab) => setCatalogTab(tab)}
            onClose={() => setCatalogTab(null)}
          />
        ) : null}

        {createLocation ? (
          <DeviceFormPanel
            key="device-create"
            mode="create"
            user={user}
            location={createLocation}
            onClose={closeDeviceEditor}
            onOpenCatalog={() => openCatalog("device")}
            onCreated={handleCreated}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
          />
        ) : editing ? (
          <DeviceFormPanel
            key={`device-edit-${editing.id}`}
            mode="edit"
            user={user}
            device={editing.device ?? undefined}
            loading={editing.loading}
            loadError={editing.error}
            onClose={closeDeviceEditor}
            onOpenCatalog={() => openCatalog("device")}
            onCreated={handleCreated}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
          />
        ) : null}

        {devicesLoading ? (
          <div className="map-status panel" role="status">
            <Loader2 size={20} className="spin" aria-hidden="true" />
            <span>Memuat perangkat...</span>
          </div>
        ) : devicesError ? (
          <div className="map-status panel" role="alert">
            <CircleAlert size={20} strokeWidth={2} aria-hidden="true" />
            <span>{devicesError}</span>
            <button type="button" className="btn-link" onClick={() => void loadDevices()}>
              Coba lagi
            </button>
          </div>
        ) : null}

        {notice ? <MapToast message={notice} onClose={() => setNotice(null)} /> : null}

        <div className="overlay-bottom-center">
          <Toolbar activeTool={activeTool} onSelect={handleToolSelect} />
        </div>
      </div>
    </div>
  );
}

function MapToast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="toast panel" role="alert">
      <CircleAlert size={20} strokeWidth={2} aria-hidden="true" />
      <span>{message}</span>
      <button
        type="button"
        className="toast-close"
        aria-label="Tutup pesan"
        onClick={onClose}
      >
        <X size={20} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
