import { divIcon, type Marker as LeafletMarker, type Map as LeafletMap } from "leaflet";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { CablePathPoint, CableSummary, DeviceSummary } from "../lib/api";
import { getDeviceIcon } from "../lib/device-icons";
import { formatLength } from "../lib/geo";
import type { ToolId } from "./Toolbar";

const ESRI_SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

// Tampilan awal peta: Indonesia. Pengguna bebas menggeser dan memperbesar peta.
const INITIAL_CENTER: [number, number] = [-2.5489, 118.0149];
const INITIAL_ZOOM = 5;
const ACCENT_COLOR = "#4465e9";

type PendingLocation = {
  latitude: number;
  longitude: number;
};

type MapViewProps = {
  mapRef: MutableRefObject<LeafletMap | null>;
  activeTool: ToolId;
  devices: DeviceSummary[];
  cables: CableSummary[];
  selectedDeviceId: string | null;
  selectedCableId: string | null;
  cableStartDeviceId: string | null;
  cablePreviewPath: CablePathPoint[];
  cableMidpoints: CablePathPoint[];
  pendingLocation: PendingLocation | null;
  canMoveDevices: boolean;
  onMapClick: (latitude: number, longitude: number) => void;
  onDeviceSelect: (id: string) => void;
  onDeviceMove: (id: string, latitude: number, longitude: number) => void;
  onCableSelect: (id: string) => void;
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

function CableLine({
  cable,
  selected,
  interactive,
  onSelect,
}: {
  cable: CableSummary;
  selected: boolean;
  interactive: boolean;
  onSelect: (id: string) => void;
}) {
  const positions = cable.path.map((point) => [point.lat, point.lng] as [number, number]);

  return (
    <>
      <Polyline
        positions={positions}
        interactive={false}
        pathOptions={{
          color: "#ffffff",
          weight: selected ? 11 : 8,
          opacity: 0.75,
          lineCap: "round",
          lineJoin: "round",
        }}
      />
      <Polyline
        positions={positions}
        bubblingMouseEvents={false}
        interactive={interactive}
        pathOptions={{
          color: cable.cableType.color,
          weight: selected ? 7 : 4,
          opacity: 0.95,
          lineCap: "round",
          lineJoin: "round",
        }}
        eventHandlers={{
          click: () => onSelect(cable.id),
        }}
      >
        <Tooltip sticky direction="top" opacity={1} className="cable-tooltip">
          <span className="cable-tooltip-name">
            {cable.cableType.vendor} {cable.cableType.modelName}
          </span>
          <span className="cable-tooltip-meta">
            {cable.coreUsed}/{cable.cableType.coreCapacity} core ·{" "}
            {formatLength(cable.length)}
          </span>
        </Tooltip>
      </Polyline>
    </>
  );
}

function MapRefSetter({ mapRef }: { mapRef: MutableRefObject<LeafletMap | null> }) {
  const map = useMap();
  
  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);

  return null;
}

export function MapView({
  mapRef,
  activeTool,
  devices,
  cables,
  selectedDeviceId,
  selectedCableId,
  cableStartDeviceId,
  cablePreviewPath,
  cableMidpoints,
  pendingLocation,
  canMoveDevices,
  onMapClick,
  onDeviceSelect,
  onDeviceMove,
  onCableSelect,
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
  const cableDrawingEnabled = activeTool === "add-cable";
  const panEnabled = activeTool === "pan";
  const markerSelectable = selectEnabled || cableDrawingEnabled || panEnabled;
  const mapClickEnabled = activeTool === "add-device" || cableDrawingEnabled;

  return (
    <MapContainer
      center={INITIAL_CENTER}
      zoom={INITIAL_ZOOM}
      minZoom={2}
      maxZoom={19}
      zoomControl={false}
      className="map-canvas"
    >
      <MapRefSetter mapRef={mapRef} />
      <TileLayer
        url={ESRI_SATELLITE_URL}
        attribution={ESRI_ATTRIBUTION}
        maxZoom={19}
      />

      <MapClickHandler enabled={mapClickEnabled} onClick={onMapClick} />

      {cables.map((cable) => (
        <CableLine
          key={cable.id}
          cable={cable}
          selected={cable.id === selectedCableId}
          interactive={selectEnabled}
          onSelect={onCableSelect}
        />
      ))}

      {cablePreviewPath.length > 1 ? (
        <Polyline
          positions={cablePreviewPath.map(
            (point) => [point.lat, point.lng] as [number, number],
          )}
          interactive={false}
          pathOptions={{
            color: ACCENT_COLOR,
            weight: 3,
            opacity: 0.9,
            dashArray: "6 8",
            lineCap: "round",
          }}
        />
      ) : null}

      {cableMidpoints.map((point, index) => (
        <CircleMarker
          key={`${point.lat}:${point.lng}:${index}`}
          center={[point.lat, point.lng]}
          radius={4}
          interactive={false}
          pathOptions={{
            color: "#ffffff",
            weight: 2,
            fillColor: ACCENT_COLOR,
            fillOpacity: 1,
          }}
        />
      ))}

      {devices.map((device) => (
        <DeviceMarker
          key={device.id}
          device={device}
          selected={
            device.id === selectedDeviceId || device.id === cableStartDeviceId
          }
          selectable={markerSelectable}
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
