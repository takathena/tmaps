import { MapContainer, TileLayer } from "react-leaflet";

const ESRI_SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

// Tampilan awal peta: Indonesia. Pengguna bebas menggeser dan memperbesar peta.
const INITIAL_CENTER: [number, number] = [-2.5489, 118.0149];
const INITIAL_ZOOM = 5;

export function MapView() {
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
    </MapContainer>
  );
}
