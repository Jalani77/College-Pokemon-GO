"use client";

import { divIcon } from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import type { LocationQuest } from "@/lib/types";

export default function CampusMap({ locations, onClaim, claimedIds }: {
  locations: LocationQuest[];
  onClaim: (location: LocationQuest) => void;
  claimedIds: string[];
}) {
  const first = locations[0];

  return (
    <MapContainer center={[first.lat, first.lng]} zoom={16} scrollWheelZoom={false} className="leaflet-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
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