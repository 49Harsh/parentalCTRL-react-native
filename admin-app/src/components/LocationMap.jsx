import {useEffect, useRef} from 'react';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';

// Vite's bundler breaks Leaflet's default icon paths — rebind them explicitly.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/**
 * OpenStreetMap view of a device's location history.
 * Shows the latest fix as the active marker and older fixes as a faint trail.
 */
export default function LocationMap({locations}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const trailRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current, {
      center: [20, 0],
      zoom: 2,
      attributionControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(mapRef.current);
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = [];
      trailRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    trailRef.current?.remove();
    trailRef.current = null;

    if (!locations?.length) return;

    const points = locations
      .slice()
      .reverse() // oldest → newest so the polyline draws the path in order
      .map(item => [item.latitude, item.longitude])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (!points.length) return;

    trailRef.current = L.polyline(points, {color: '#4f46e5', weight: 2, opacity: 0.5}).addTo(map);

    points.forEach(([lat, lng], index) => {
      const isLatest = index === points.length - 1;
      const marker = L.circleMarker([lat, lng], {
        radius: isLatest ? 8 : 4,
        color: isLatest ? '#047857' : '#6366f1',
        fillColor: isLatest ? '#10b981' : '#818cf8',
        fillOpacity: isLatest ? 0.9 : 0.5,
      }).addTo(map);
      const item = locations[locations.length - 1 - index];
      marker.bindPopup(
        `${isLatest ? 'Latest' : 'Previous'} fix<br/>${lat.toFixed(5)}, ${lng.toFixed(5)}<br/>` +
        `${new Date(item.capturedAt).toLocaleString()}` +
        (item.accuracy ? `<br/>±${Math.round(item.accuracy)} m` : ''),
      );
      markersRef.current.push(marker);
    });

    map.fitBounds(L.latLngBounds(points).pad(0.35), {maxZoom: 16});
  }, [locations]);

  return <div ref={containerRef} className="h-72 w-full rounded-xl z-0" />;
}
