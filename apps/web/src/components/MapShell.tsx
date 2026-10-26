import { Cable, CircleAlert, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  api,
  errorMessage,
  type AuthUser,
  type CableDetail,
  type CablePathPoint,
  type CableSummary,
  type DeviceDetail,
  type DeviceSummary,
} from "../lib/api";
import { Brand } from "./Brand";
import { CableFormPanel, type CableDraft } from "./CableFormPanel";
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

type EditingCable = {
  id: string;
  cable: CableDetail | null;
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

function moveCableEndpoint(
  cable: CableSummary,
  deviceId: string,
  latitude: number,
  longitude: number,
): CableSummary {
  if (cable.path.length < 2) return cable;
  if (cable.deviceFromId !== deviceId && cable.deviceToId !== deviceId) return cable;

  const path = [...cable.path];
  if (cable.deviceFromId === deviceId) {
    path[0] = { lat: latitude, lng: longitude };
  }
  if (cable.deviceToId === deviceId) {
    path[path.length - 1] = { lat: latitude, lng: longitude };
  }

  return { ...cable, path };
}

export function MapShell({ user, onLogout }: MapShellProps) {
  const canWriteDevices = Boolean(user.role.permissions.devices?.write);
  const canWriteCables = Boolean(user.role.permissions.cables?.write);
  const canReadCables = Boolean(user.role.permissions.cables?.read);

  const [activeTool, setActiveTool] = useState<ToolId>("select");
  const [catalogTab, setCatalogTab] = useState<CatalogTab | null>(null);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [cables, setCables] = useState<CableSummary[]>([]);
  const [cablesLoading, setCablesLoading] = useState(true);
  const [cablesError, setCablesError] = useState<string | null>(null);
  const [createLocation, setCreateLocation] = useState<DeviceLocation | null>(null);
  const [editing, setEditing] = useState<EditingDevice | null>(null);
  const [editingCable, setEditingCable] = useState<EditingCable | null>(null);
  const [cableStartId, setCableStartId] = useState<string | null>(null);
  const [cableMidpoints, setCableMidpoints] = useState<CablePathPoint[]>([]);
  const [cableDraft, setCableDraft] = useState<CableDraft | null>(null);
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

  const loadCables = useCallback(async () => {
    setCablesLoading(true);
    setCablesError(null);

    try {
      const response = await api.getCables();
      setCables(response.cables);
    } catch (error) {
      setCablesError(errorMessage(error));
    } finally {
      setCablesLoading(false);
    }
  }, []);

  const reloadMap = useCallback(async () => {
    await Promise.all([loadDevices(), loadCables()]);
  }, [loadDevices, loadCables]);

  useEffect(() => {
    void reloadMap();
  }, [reloadMap]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function resetCableDrawing() {
    setCableStartId(null);
    setCableMidpoints([]);
  }

  function closeDeviceEditor() {
    if (createLocation) setActiveTool("select");
    setCreateLocation(null);
    setEditing(null);
  }

  function closeCableEditor() {
    setCableDraft(null);
    setEditingCable(null);
    resetCableDrawing();
    setActiveTool("select");
  }

  function openCatalog(tab: CatalogTab) {
    setCreateLocation(null);
    setEditing(null);
    setCableDraft(null);
    setEditingCable(null);
    resetCableDrawing();
    setActiveTool("select");
    setCatalogTab(tab);
  }

  function handleToolSelect(tool: ToolId) {
    if (tool === "add-cable" && !canWriteCables) {
      setNotice("Anda tidak punya izin menambah kabel.");
      setActiveTool("select");
      return;
    }

    setActiveTool(tool);

    if (tool !== "add-device") setCreateLocation(null);
    if (tool !== "select") {
      setEditing(null);
      setEditingCable(null);
    }
    if (tool !== "add-cable") {
      setCableDraft(null);
      resetCableDrawing();
    } else {
      setCatalogTab(null);
      setCreateLocation(null);
      setEditing(null);
      setEditingCable(null);
      setCableDraft(null);
      resetCableDrawing();
    }
  }

  function handleMapClick(latitude: number, longitude: number) {
    if (activeTool === "add-device") {
      if (createLocation) return;

      if (!canWriteDevices) {
        setNotice("Anda tidak punya izin menambah perangkat.");
        setActiveTool("select");
        return;
      }

      setCatalogTab(null);
      setEditing(null);
      setEditingCable(null);
      setCreateLocation({ latitude, longitude });
      return;
    }

    if (activeTool === "add-cable") {
      if (cableDraft || editingCable) return;

      if (!canWriteCables) {
        setNotice("Anda tidak punya izin menambah kabel.");
        setActiveTool("select");
        return;
      }

      if (!cableStartId) {
        setNotice("Klik perangkat awal terlebih dahulu untuk mulai menarik kabel.");
        return;
      }

      setCableMidpoints((points) => [...points, { lat: latitude, lng: longitude }]);
    }
  }

  function handleCableDeviceSelect(id: string) {
    if (cableDraft || editingCable) return;

    if (!canWriteCables) {
      setNotice("Anda tidak punya izin menambah kabel.");
      setActiveTool("select");
      return;
    }

    const device = devices.find((row) => row.id === id);
    if (!device) return;

    if (!cableStartId) {
      setCableStartId(id);
      setCableMidpoints([]);
      return;
    }

    if (id === cableStartId) {
      setNotice("Perangkat awal dan tujuan kabel harus berbeda.");
      return;
    }

    const start = devices.find((row) => row.id === cableStartId);
    if (!start) {
      setCableStartId(id);
      setCableMidpoints([]);
      return;
    }

    setCableDraft({
      from: start,
      to: device,
      path: [
        { lat: start.latitude, lng: start.longitude },
        ...cableMidpoints,
        { lat: device.latitude, lng: device.longitude },
      ],
    });
    resetCableDrawing();
  }

  function handleDeviceSelect(id: string) {
    if (activeTool === "add-cable") {
      handleCableDeviceSelect(id);
      return;
    }

    if (activeTool !== "select" || !canWriteDevices) return;

    setCatalogTab(null);
    setCreateLocation(null);
    setEditingCable(null);
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

  function handleCableSelect(id: string) {
    if (activeTool !== "select" || !canReadCables) return;

    setCatalogTab(null);
    setCreateLocation(null);
    setEditing(null);
    setCableDraft(null);
    resetCableDrawing();
    setEditingCable({ id, cable: null, loading: true, error: null });

    api
      .getCable(id)
      .then((response) => {
        setEditingCable((current) =>
          current?.id === id
            ? { id, cable: response.cable, loading: false, error: null }
            : current,
        );
      })
      .catch((error) => {
        setEditingCable((current) =>
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

  function handleCableCreated(cable: CableDetail) {
    setCables((rows) => [...rows, cable]);
    setCableDraft(null);
    resetCableDrawing();
    setActiveTool("select");
  }

  function handleCableUpdated(cable: CableDetail) {
    setCables((rows) => rows.map((row) => (row.id === cable.id ? cable : row)));
    setEditingCable(null);
  }

  function handleCableDeleted(id: string) {
    setCables((rows) => rows.filter((row) => row.id !== id));
    setEditingCable(null);
  }

  async function handleDeviceMove(id: string, latitude: number, longitude: number) {
    if (!canWriteDevices) return;

    const previous = devices.find((device) => device.id === id);
    if (!previous) return;

    setDevices((rows) =>
      rows.map((row) => (row.id === id ? { ...row, latitude, longitude } : row)),
    );
    setCables((rows) =>
      rows.map((cable) => moveCableEndpoint(cable, id, latitude, longitude)),
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
      setCables((rows) =>
        rows.map((cable) =>
          moveCableEndpoint(cable, id, previous.latitude, previous.longitude),
        ),
      );
      setNotice(errorMessage(error));
    }
  }

  const editingId = editing?.id ?? null;
  const editingCableId = editingCable?.id ?? null;
  const mapLoading = devicesLoading || cablesLoading;
  const mapError = devicesError ?? cablesError;

  const previewStart = cableDraft
    ? cableDraft.from
    : devices.find((device) => device.id === cableStartId) ?? null;
  const cablePreviewPath: CablePathPoint[] = cableDraft
    ? cableDraft.path
    : previewStart
      ? [
          { lat: previewStart.latitude, lng: previewStart.longitude },
          ...cableMidpoints,
        ]
      : [];

  const cableHint =
    activeTool === "add-cable" && !cableDraft && !editingCable
      ? cableStartId
        ? "Klik titik tengah mengikuti jalur fisik, lalu klik perangkat tujuan. Klik tool + Kabel lagi untuk mengulang."
        : "Klik perangkat awal untuk mulai menarik kabel."
      : null;

  return (
    <div className="app-shell" data-tool={activeTool}>
      <MapView
        activeTool={activeTool}
        devices={devices}
        cables={cables}
        selectedDeviceId={editingId}
        selectedCableId={editingCableId}
        cableStartDeviceId={previewStart?.id ?? null}
        cablePreviewPath={cablePreviewPath}
        cableMidpoints={cableMidpoints}
        pendingLocation={createLocation}
        canMoveDevices={canWriteDevices}
        onMapClick={handleMapClick}
        onDeviceSelect={handleDeviceSelect}
        onDeviceMove={(id, latitude, longitude) =>
          void handleDeviceMove(id, latitude, longitude)
        }
        onCableSelect={handleCableSelect}
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

        {cableDraft ? (
          <CableFormPanel
            key="cable-create"
            mode="create"
            user={user}
            draft={cableDraft}
            onClose={closeCableEditor}
            onOpenCatalog={() => openCatalog("cable")}
            onCreated={handleCableCreated}
            onUpdated={handleCableUpdated}
            onDeleted={handleCableDeleted}
          />
        ) : editingCable ? (
          <CableFormPanel
            key={`cable-edit-${editingCable.id}`}
            mode="edit"
            user={user}
            cable={editingCable.cable ?? undefined}
            loading={editingCable.loading}
            loadError={editingCable.error}
            onClose={closeCableEditor}
            onOpenCatalog={() => openCatalog("cable")}
            onCreated={handleCableCreated}
            onUpdated={handleCableUpdated}
            onDeleted={handleCableDeleted}
          />
        ) : null}

        {mapLoading ? (
          <div className="map-status panel" role="status">
            <Loader2 size={20} className="spin" aria-hidden="true" />
            <span>Memuat peta...</span>
          </div>
        ) : mapError ? (
          <div className="map-status panel" role="alert">
            <CircleAlert size={20} strokeWidth={2} aria-hidden="true" />
            <span>{mapError}</span>
            <button type="button" className="btn-link" onClick={() => void reloadMap()}>
              Coba lagi
            </button>
          </div>
        ) : cableHint ? (
          <div className="map-status panel" role="status">
            <Cable size={20} strokeWidth={2} aria-hidden="true" />
            <span>{cableHint}</span>
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
