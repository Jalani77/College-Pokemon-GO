"use client";

import { divIcon } from "leaflet";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { LocationQuest } from "@/lib/types";

function Recenter({ position }: { position: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, 16, { animate: true });
  }, [map, position]);
  return null;
}

export default function CampusMap({ locations, onClaim, claimedIds, gpsPosition }: {
  locations: LocationQuest[];
  onClaim: (location: LocationQuest) => void;
  claimedIds: string[];
  gpsPosition: [number, number] | null;
}) {
  const first = locations[0];
  const center = gpsPosition || (first ? [first.lat, first.lng] as [number, number] : [0, 0] as [number, number]);

  return (
    <MapContainer center={center} zoom={gpsPosition || first ? 16 : 2} scrollWheelZoom className="leaflet-map">
      <Recenter position={gpsPosition} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {gpsPosition && <CircleMarker center={gpsPosition} radius={9} pathOptions={{ color: "#fff", fillColor: "#397bd4", fillOpacity: 1, weight: 3 }}><Popup>Your location is shown only in this session.</Popup></CircleMarker>}
      {locations.map((location) => (
        <Marker
          key={location.id}
          position={[location.lat, location.lng]}
          icon={divIcon({ className: "outside-marker", html: '<span class="outside-marker__dot"></span>', iconSize: [28, 28], iconAnchor: [14, 14] })}
        >
          <Popup>
            <div className="map-popup">
              <span className="eyebrow">{location.demo ? "LOCAL DEMO QUEST" : "VERIFIED QUEST"}</span>
              <strong>{location.name}</strong>
              <p>{location.clue}</p>
              <small>Card: {location.cardName}</small>
              <button disabled={claimedIds.includes(location.id)} onClick={() => onClaim(location)}>
                {claimedIds.includes(location.id) ? "Already found" : "Claim discovery"}
              </button>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}