import { divIcon, type Marker as LeafletMarker } from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapContainer, Marker, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import type { DeviceSummary } from "../lib/api";
import { getDeviceIcon } from "../lib/device-icons";
import type { ToolId } from "./Toolbar";

const ESRI_SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

// Tampilan awal peta: Indonesia. Pengguna bebas menggeser dan memperbesar peta.
const INITIAL_CENTER: [number, number] = [-2.5489, 118.0149];
const INITIAL_ZOOM = 5;

type PendingLocation = {
  latitude: number;
  longitude: number;
};

type MapViewProps = {
  activeTool: ToolId;
  devices: DeviceSummary[];
  selectedDeviceId: string | null;
  pendingLocation: PendingLocation | null;
  canMoveDevices: boolean;
  onMapClick: (latitude: number, longitude: number) => void;
  onDeviceSelect: (id: string) => void;
  onDeviceMove: (id: string, latitude: number, longitude: number) => void;
};

function MapClickHandler({
  enabled,
  onClick,
}: {
  enabled: boolean;
  onClick: (latitude: number, longitude: number) => void;
}) {
  useMapEvents({
    click(event) {
      if (enabled) onClick(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

function DeviceMarker({
  device,
  selected,
  selectable,
  draggable,
  onSelect,
  onMove,
}: {
  device: DeviceSummary;
  selected: boolean;
  selectable: boolean;
  draggable: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, latitude: number, longitude: number) => void;
}) {
  const DeviceIcon = getDeviceIcon(device.icon);
  const markerRef = useRef<LeafletMarker | null>(null);

  // react-leaflet hanya memakai title/alt saat marker dibuat, jadi atribut
  // aksesibilitas diperbarui manual ketika nama perangkat berubah.
  useEffect(() => {
    const element = markerRef.current?.getElement();
    if (!element) return;
    element.setAttribute("title", device.name);
    element.setAttribute("alt", device.name);
  }, [device.name]);

  const icon = useMemo(() => {
    const glyph = renderToStaticMarkup(
      <DeviceIcon size={20} strokeWidth={2} aria-hidden="true" />,
    );

    return divIcon({
      className: "device-marker-icon",
      html: `<div class="device-marker" data-status="${device.status}" data-selected="${selected}" data-device-id="${device.id}"><span class="device-marker-glyph">${glyph}</span><span class="device-marker-status"></span></div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
  }, [DeviceIcon, device.id, device.status, selected]);

  return (
    <Marker
      ref={markerRef}
      position={[device.latitude, device.longitude]}
      icon={icon}
      title={device.name}
      alt={device.name}
      draggable={draggable}
      bubblingMouseEvents={false}
      eventHandlers={{
        click: () => {
          if (selectable) onSelect(device.id);
        },
        dragend: (event) => {
          const marker = event.target as LeafletMarker;
          const next = marker.getLatLng();
          onMove(device.id, next.lat, next.lng);
        },
      }}
    >
      <Tooltip
        direction="top"
        offset={[0, -20]}
        opacity={1}
        className="device-tooltip"
      >
        <span className="device-tooltip-name">{device.name}</span>
        <span className="device-tooltip-type">{device.typeName}</span>
      </Tooltip>
    </Marker>
  );
}

export function MapView({
  activeTool,
  devices,
  selectedDeviceId,
  pendingLocation,
  canMoveDevices,
  onMapClick,
  onDeviceSelect,
  onDeviceMove,
}: MapViewProps) {
  const pendingIcon = useMemo(
    () =>
      divIcon({
        className: "pending-marker-icon",
        html: '<span class="pending-marker-dot"></span>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    [],
  );

  const selectEnabled = activeTool === "select";

  return (
    <MapContainer
      center={INITIAL_CENTER}
      zoom={INITIAL_ZOOM}
      minZoom={2}
      maxZoom={19}
      zoomControl={false}
      className="map-canvas"
    >
      <TileLayer
        url={ESRI_SATELLITE_URL}
        attribution={ESRI_ATTRIBUTION}
        maxZoom={19}
      />

      <MapClickHandler
        enabled={activeTool === "add-device"}
        onClick={onMapClick}
      />

      {devices.map((device) => (
        <DeviceMarker
          key={device.id}
          device={device}
          selected={device.id === selectedDeviceId}
          selectable={selectEnabled}
          draggable={canMoveDevices && selectEnabled}
          onSelect={onDeviceSelect}
          onMove={onDeviceMove}
        />
      ))}

      {pendingLocation ? (
        <Marker
          position={[pendingLocation.latitude, pendingLocation.longitude]}
          icon={pendingIcon}
          interactive={false}
          keyboard={false}
        />
      ) : null}
    </MapContainer>
  );
}
