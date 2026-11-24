import { divIcon } from 'leaflet';
import { MapContainer, Marker, TileLayer, Tooltip } from 'react-leaflet';
import { SEVERITIES, type Severity, type Site } from '@floodwatch/shared';
import { MapLegend } from './MapLegend';

interface Props {
  sites: { site: Site; levelCm: number; severity: Severity }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// One icon per (severity, selected) pair, so markers aren't rebuilt on every reading.
const icons = new Map<string, ReturnType<typeof divIcon>>();
function markerIcon(severity: Severity, selected: boolean) {
  const key = `${severity}:${selected}`;
  if (!icons.has(key)) {
    const size = selected ? 22 : severity === 'critical' ? 18 : 14;
    icons.set(key, divIcon({
      className: `site-marker ${severity} ${selected ? 'selected' : ''}`,
      html: `<span class="marker" style="--c:${SEVERITIES[severity].color}"><span class="dot"></span></span>`,
      iconSize: [size, size],
    }));
  }
  return icons.get(key)!;
}

export function SiteMap({ sites, selectedId, onSelect }: Props) {
  return (
    <div className="relative h-full w-full">
      <MapContainer center={[18.535, 73.855]} zoom={12} maxZoom={14} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer
          attribution='Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          maxZoom={14} // shortcut: Esri prints road names from z15, so cap zoom to stay label-free
          className="dark-tiles"
        />
        {sites.map(({ site, levelCm, severity }) => (
          <Marker
            key={site.id}
            position={[site.lat, site.lng]}
            icon={markerIcon(severity, site.id === selectedId)}
            title={`${site.name}: ${SEVERITIES[severity].label}`}
            zIndexOffset={severity === 'critical' ? 1000 : 0}
            eventHandlers={{ click: () => onSelect(site.id) }}
          >
            <Tooltip direction="top" offset={[0, -10]}>
              <span className="block font-semibold">{site.name}</span>
              <span style={{ color: SEVERITIES[severity].color }}>{levelCm.toFixed(1)} cm · {SEVERITIES[severity].roadImpact}</span>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
      <MapLegend />
    </div>
  );
}
