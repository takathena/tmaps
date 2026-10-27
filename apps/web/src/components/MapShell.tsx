import { Cable, CircleAlert, Loader2, X } from "lucide-react";
import type { Map as LeafletMap } from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { DeviceSidebar } from "./DeviceSidebar";
import { MainMenu } from "./MainMenu";
import { MapView } from "./MapView";
import { NotificationBell } from "./NotificationBell";
import { SearchPanel } from "./SearchPanel";
import { FilterPanel } from "./FilterPanel";
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
    tagIds: device.tags.map((t) => t.id),
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
  const canReadDevices = Boolean(user.role.permissions.devices?.read);
  const canWriteCables = Boolean(user.role.permissions.cables?.write);
  const canReadCables = Boolean(user.role.permissions.cables?.read);

  const mapRef = useRef<LeafletMap | null>(null);
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
  const [sidebarId, setSidebarId] = useState<string | null>(null);
  const [editingCable, setEditingCable] = useState<EditingCable | null>(null);
  const [cableStartId, setCableStartId] = useState<string | null>(null);
  const [cableMidpoints, setCableMidpoints] = useState<CablePathPoint[]>([]);
  const [cableDraft, setCableDraft] = useState<CableDraft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filters, setFilters] = useState<Array<{ type: "deviceType" | "tag"; id: string; name: string }>>([]);
  const [clusteringEnabled, setClusteringEnabled] = useState(() => {
    const saved = localStorage.getItem("clusteringEnabled");
    return saved === "true";
  });

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

  // Polling status real-time
  useEffect(() => {
    const interval = Number(import.meta.env.VITE_STATUS_POLL_INTERVAL_MS) || 3000;
    let timer: number | null = null;
    let polling = false;

    async function poll() {
      if (polling) return;
      polling = true;

      try {
        const response = await api.getDeviceStatuses();
        const statusMap = new Map(response.devices.map((d) => [d.id, d.status]));
        
        setDevices((current) =>
          current.map((device) => {
            const newStatus = statusMap.get(device.id);
            return newStatus && newStatus !== device.status
              ? { ...device, status: newStatus }
              : device;
          }),
        );
      } catch {
        // Polling gagal tidak mengganggu UI
      } finally {
        polling = false;
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

    if (!document.hidden) {
      void poll();
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Polling unread count
  useEffect(() => {
    const interval = Number(import.meta.env.VITE_STATUS_POLL_INTERVAL_MS) || 3000;
    let timer: number | null = null;

    async function poll() {
      try {
        const response = await api.getUnreadCount();
        setUnreadCount(response.count);
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

    if (!document.hidden) {
      void poll();
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

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
    const returnId = editing?.id ?? null;
    if (createLocation) setActiveTool("select");
    setCreateLocation(null);
    setEditing(null);
    if (returnId && canReadDevices) setSidebarId(returnId);
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
    setSidebarId(null);
    setCableDraft(null);
    setEditingCable(null);
    resetCableDrawing();
    setActiveTool("select");
    setCatalogTab(tab);
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
      setSidebarId(null);
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

    if ((activeTool !== "select" && activeTool !== "pan") || !canReadDevices) return;

    setCatalogTab(null);
    setCreateLocation(null);
    setEditing(null);
    setEditingCable(null);
    setCableDraft(null);
    resetCableDrawing();
    setSidebarId(id);
  }

  function handleCableSelect(id: string) {
    if (activeTool !== "select" || !canReadCables) return;

    setCatalogTab(null);
    setCreateLocation(null);
    setEditing(null);
    setSidebarId(null);
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
    setSidebarId(null);
    setActiveTool("select");
  }

  function handleUpdated(device: DeviceDetail) {
    setDevices((rows) =>
      sortDevices(
        rows.map((row) => (row.id === device.id ? toSummary(device) : row)),
      ),
    );
    setEditing(null);
    setSidebarId(device.id);
  }

  function handleDeleted(id: string) {
    setDevices((rows) => rows.filter((row) => row.id !== id));
    setEditing(null);
    setSidebarId(null);
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

  function handleNotificationClick(deviceId: string) {
    const device = devices.find((d) => d.id === deviceId);
    if (!device) return;

    // Fly to device
    if (mapRef.current) {
      mapRef.current.flyTo([device.latitude, device.longitude], 16, {
        duration: 1,
      });
    }

    // Open sidebar
    setNotificationOpen(false);
    setActiveTool("select");
    setCatalogTab(null);
    setCreateLocation(null);
    setEditing(null);
    setEditingCable(null);
    setCableDraft(null);
    resetCableDrawing();
    setSidebarId(deviceId);
  }

  function handleToolSelect(tool: ToolId) {
    if (tool === "search") {
      setSearchOpen(!searchOpen);
      return;
    }

    if (tool === "notifications") {
      setNotificationOpen(!notificationOpen);
      return;
    }

    if (tool === "more") {
      setFilterOpen(!filterOpen);
      return;
    }

    if (tool === "clustering") {
      const newValue = !clusteringEnabled;
      setClusteringEnabled(newValue);
      localStorage.setItem("clusteringEnabled", String(newValue));
      return;
    }

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
      setSidebarId(null);
    }
    if (tool !== "add-cable") {
      setCableDraft(null);
      resetCableDrawing();
    } else {
      setCatalogTab(null);
      setCreateLocation(null);
      setEditing(null);
      setSidebarId(null);
      setEditingCable(null);
      setCableDraft(null);
      resetCableDrawing();
    }
  }

  function handleSearchDeviceSelect(deviceId: string) {
    const device = devices.find((d) => d.id === deviceId);
    if (!device) return;

    if (mapRef.current) {
      mapRef.current.flyTo([device.latitude, device.longitude], 16, {
        duration: 1,
      });
    }

    setSidebarId(deviceId);
  }

  function handleFilterAdd(type: "deviceType" | "tag", id: string, name: string) {
    setFilters((current) => {
      const exists = current.some((f) => f.type === type && f.id === id);
      if (exists) return current;
      return [...current, { type, id, name }];
    });
  }

  function handleFilterRemove(type: "deviceType" | "tag", id: string) {
    setFilters((current) => current.filter((f) => !(f.type === type && f.id === id)));
  }

  const filteredDevices = useMemo(() => {
    if (filters.length === 0) return devices;

    const typeFilters = filters.filter((f) => f.type === "deviceType").map((f) => f.id);
    const tagFilters = filters.filter((f) => f.type === "tag").map((f) => f.id);

    return devices.filter((device) => {
      // AND logic: device must match all active filter types
      if (typeFilters.length > 0 && !typeFilters.includes(device.deviceTypeId)) {
        return false;
      }

      if (tagFilters.length > 0) {
        // Device must have all active tags
        const hasAllTags = tagFilters.every((tagId) => device.tagIds.includes(tagId));
        if (!hasAllTags) return false;
      }

      return true;
    });
  }, [devices, filters]);

  return (
    <div className="app-shell" data-tool={activeTool}>
      <MapView
        mapRef={mapRef}
        activeTool={activeTool}
        devices={filteredDevices}
        cables={cables}
        selectedDeviceId={editingId ?? sidebarId}
        selectedCableId={editingCableId}
        cableStartDeviceId={previewStart?.id ?? null}
        cablePreviewPath={cablePreviewPath}
        cableMidpoints={cableMidpoints}
        pendingLocation={createLocation}
        canMoveDevices={canWriteDevices}
        clusteringEnabled={clusteringEnabled}
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

        {searchOpen ? (
          <SearchPanel
            onDeviceSelect={handleSearchDeviceSelect}
            onFilterAdd={handleFilterAdd}
            onClose={() => setSearchOpen(false)}
          />
        ) : null}

        {filterOpen ? (
          <FilterPanel
            activeFilters={filters}
            onFilterAdd={handleFilterAdd}
            onFilterRemove={handleFilterRemove}
            onClose={() => setFilterOpen(false)}
          />
        ) : null}

        {filters.length > 0 ? (
          <div className="filter-chips overlay-top-center">
            {filters.map((filter) => (
              <button
                key={`${filter.type}-${filter.id}`}
                type="button"
                className="filter-chip"
                onClick={() => handleFilterRemove(filter.type, filter.id)}
              >
                <span>{filter.name}</span>
                <X size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}

        {sidebarId && !editing ? (
          <DeviceSidebar
            key={sidebarId}
            deviceId={sidebarId}
            user={user}
            onClose={() =>
              setSidebarId((current) => (current === sidebarId ? null : current))
            }
            onEdit={(device) => {
              setSidebarId(null);
              setEditing({
                id: device.id,
                device,
                loading: false,
                error: null,
              });
            }}
          />
        ) : null}

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
          <Toolbar
            activeTool={activeTool}
            clusteringEnabled={clusteringEnabled}
            notificationOpen={notificationOpen}
            unreadCount={unreadCount}
            onSelect={handleToolSelect}
          />
        </div>

        {notificationOpen ? (
          <NotificationBell
            open={notificationOpen}
            unreadCount={unreadCount}
            onOpenChange={setNotificationOpen}
            onUnreadCountChange={setUnreadCount}
            onNotificationClick={handleNotificationClick}
          />
        ) : null}
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
