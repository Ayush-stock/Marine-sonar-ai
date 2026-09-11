import "leaflet/dist/leaflet.css";

import L from "leaflet";

import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

import { useEffect } from "react";

const CENTER = [
  15.20,
  72.75,
];

const TRACK = [
  [15.12, 72.55],
  [15.14, 72.61],
  [15.16, 72.67],
  [15.18, 72.73],
  [15.20, 72.79],
  [15.22, 72.85],
  [15.25, 72.90],
  [15.28, 72.95],
];

const OFFSETS = [
  [0.005, 0.005],
  [-0.004, 0.008],
  [0.006, -0.006],
  [-0.006, -0.004],
];

function markerLetter(type) {
  const value =
    String(
      type || ""
    ).toLowerCase();

  if (
    value.includes(
      "mine"
    )
  ) {
    return "M";
  }

  if (
    value.includes(
      "shipwreck"
    )
  ) {
    return "S";
  }

  if (
    value.includes(
      "ghost"
    )
  ) {
    return "N";
  }

  if (
    value.includes(
      "pipeline"
    )
  ) {
    return "P";
  }

  return "A";
}

function markerTitle(type) {
  const value =
    String(
      type || ""
    ).toLowerCase();

  if (
    value.includes(
      "mine"
    )
  ) {
    return "Mine Cylinder";
  }

  if (
    value.includes(
      "shipwreck"
    )
  ) {
    return "Shipwreck";
  }

  if (
    value.includes(
      "ghost"
    )
  ) {
    return "Ghost Net";
  }

  if (
    value.includes(
      "pipeline"
    )
  ) {
    return "Submarine Pipeline";
  }

  return "Anomaly";
}

function createIcon(
  type
) {
  const letter =
    markerLetter(type);

  return L.divIcon({
    className:
      "sonar-map-marker-wrap",

    html: `
      <div
        class="sonar-map-marker"
        aria-label="${markerTitle(
          type
        )}"
      >
        ${letter}
      </div>
    `,

    iconSize: [
      38,
      38,
    ],

    iconAnchor: [
      19,
      19,
    ],

    popupAnchor: [
      0,
      -20,
    ],
  });
}

function RecenterMap({
  markers,
}) {
  const map =
    useMap();

  useEffect(() => {
    if (!markers.length) {
      map.setView(
        CENTER,
        10
      );

      return;
    }

    const positions =
      markers.map(
        (marker) =>
          marker.position
      );

    const bounds =
      L.latLngBounds(
        positions
      );

    map.fitBounds(
      bounds,
      {
        padding: [
          45,
          45,
        ],

        maxZoom: 11,
      }
    );
  }, [
    markers,
    map,
  ]);

  return null;
}

export default function MapView({
  detections = [],
}) {
  const markers =
    detections.map(
      (
        detection,
        index
      ) => {
        const base =
          TRACK[
            (index + 3) %
              TRACK.length
          ];

        const offset =
          OFFSETS[
            index %
              OFFSETS.length
          ];

        return {
          ...detection,

          position: [
            base[0] +
              offset[0],

            base[1] +
              offset[1],
          ],
        };
      }
    );

  return (
    <div className="map-container">

      <div className="map-title-overlay">
        <span>
          GEOSPATIAL ANALYSIS
        </span>

        <strong>
          GIS Detection Map
        </strong>

        <small>
          Detected anomalies plotted
          along the simulated survey track.
        </small>
      </div>

      <MapContainer
        center={
          CENTER
        }
        zoom={10}
        scrollWheelZoom={
          true
        }
        className="sonar-map"
      >

        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Polyline
          positions={
            TRACK
          }
          pathOptions={{
            color:
              "#1769aa",

            weight: 4,

            opacity: 0.85,

            dashArray:
              "10 8",
          }}
        />

        <RecenterMap
          markers={
            markers
          }
        />

        {markers.map(
          (
            marker
          ) => (
            <Marker
              key={
                marker.id
              }
              position={
                marker.position
              }
              icon={createIcon(
                marker.type
              )}
            >

              <Popup>

                <div className="map-popup">

                  <strong>
                    {
                      markerTitle(
                        marker.type
                      )
                    }
                  </strong>

                  <span>
                    Confidence:{" "}
                    {Math.round(
                      marker.confidence *
                        100
                    )}
                    %
                  </span>

                  <span>
                    Latitude:{" "}
                    {marker.position[0].toFixed(
                      4
                    )}
                  </span>

                  <span>
                    Longitude:{" "}
                    {marker.position[1].toFixed(
                      4
                    )}
                  </span>

                  <small>
                    Simulated survey position
                  </small>

                </div>

              </Popup>

            </Marker>
          )
        )}

      </MapContainer>

      <div className="map-legend">

        <span>
          <b className="legend-m">
            M
          </b>
          Mine Cylinder
        </span>

        <span>
          <b className="legend-s">
            S
          </b>
          Shipwreck
        </span>

        <span>
          <b className="legend-n">
            N
          </b>
          Ghost Net
        </span>

        <span>
          <b className="legend-p">
            P
          </b>
          Submarine Pipeline
        </span>

      </div>

      {!markers.length && (
        <div className="map-empty-overlay">
          Run an analysis to place
          detected targets on the
          survey map.
        </div>
      )}

    </div>
  );
}