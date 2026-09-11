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


/*
 * Simulated survey path used by the current prototype.
 *
 * These positions are NOT live GPS coordinates.
 */
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


/*
 * Offsets keep multiple detections from sitting directly
 * on top of each other.
 */
const OFFSETS = [
  [0.005, 0.005],
  [-0.004, 0.008],
  [0.006, -0.006],
  [-0.006, -0.004],
];


/* =========================================================
   DETECTION HELPERS
========================================================= */

function isUnknown(
  detection
) {
  const type =
    String(
      detection?.type || ""
    ).toLowerCase();

  const channel =
    String(
      detection?.channel || ""
    ).toLowerCase();

  return (
    channel ===
      "background_anomaly" ||
    type.includes(
      "unnamed"
    ) ||
    type.includes(
      "anomaly"
    )
  );
}


function getDisplayName(
  type
) {
  const value =
    String(
      type || ""
    ).toLowerCase();

  if (
    value ===
    "mine_cylinder"
  ) {
    return "Mine Cylinder";
  }

  if (
    value ===
    "shipwreck"
  ) {
    return "Shipwreck";
  }

  if (
    value ===
    "ghost_net"
  ) {
    return "Ghost Net";
  }

  if (
    value ===
      "submarine_pipeline" ||
    value ===
      "pipeline"
  ) {
    return "Submarine Pipeline";
  }

  if (
    value ===
    "unnamed_anomaly"
  ) {
    return "Unknown Anomaly";
  }

  return (
    type ||
    "Unknown Target"
  );
}


function markerLetter(
  detection
) {
  if (
    isUnknown(
      detection
    )
  ) {
    return "A";
  }

  const value =
    String(
      detection?.type || ""
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

  return "T";
}


function markerColor(
  detection
) {
  return isUnknown(
    detection
  )
    ? "#f59e0b"
    : "#2563eb";
}


/* =========================================================
   MAP ICON
========================================================= */

function createIcon(
  detection
) {
  const color =
    markerColor(
      detection
    );

  const letter =
    markerLetter(
      detection
    );

  return L.divIcon({

    className:
      "sonar-map-marker-wrap",

    html: `
      <div
        class="sonar-map-marker"
        aria-label="${getDisplayName(
          detection?.type
        )}"
        style="
          width:38px;
          height:38px;
          display:flex;
          align-items:center;
          justify-content:center;
          border-radius:50%;
          background:${color};
          border:3px solid #ffffff;
          box-shadow:0 4px 12px rgba(0,0,0,0.30);
          color:#ffffff;
          font-weight:900;
          font-size:13px;
        "
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
      -22,
    ],
  });
}


/* =========================================================
   MAP RECENTER
========================================================= */

function RecenterMap({
  markers,
}) {
  const map =
    useMap();


  useEffect(() => {

    if (
      !markers.length
    ) {

      map.setView(
        CENTER,
        10
      );

      return;
    }


    const positions =
      markers.map(
        (
          marker
        ) =>
          marker.position
      );


    const bounds =
      L.latLngBounds(
        positions
      );


    /*
     * Keep enough padding so markers do not disappear
     * underneath the title overlay or legend.
     */

    map.fitBounds(
      bounds,
      {
        paddingTopLeft: [
          90,
          120,
        ],

        paddingBottomRight: [
          90,
          100,
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


/* =========================================================
   POPUP
========================================================= */

function DetectionPopup({
  detection,
  position,
}) {
  const unknown =
    isUnknown(
      detection
    );

  const color =
    markerColor(
      detection
    );


  return (

    <div
      className="map-popup"
      style={{
        minWidth:
          "210px",

        display:
          "flex",

        flexDirection:
          "column",

        gap:
          "6px",
      }}
    >

      <strong
        style={{
          color,
          fontSize:
            "15px",
        }}
      >
        {
          getDisplayName(
            detection?.type
          )
        }
      </strong>


      <span
        style={{
          color,
          fontWeight:
            800,

          fontSize:
            "10px",

          letterSpacing:
            "0.06em",
        }}
      >
        {
          unknown
            ? "UNKNOWN ANOMALY"
            : "KNOWN TARGET"
        }
      </span>


      <span>
        AI Confidence:{" "}
        {
          Math.round(
            (
              detection?.confidence ||
              0
            ) * 100
          )
        }%
      </span>


      <span>
        Shadow Check:{" "}
        {
          unknown
            ? "Not Applicable"
            : (
                detection?.shadow_check ||
                "Review"
              )
        }
      </span>


      <span>
        Estimated Height:{" "}
        {
          detection?.estimated_height_m !==
            null &&
          detection?.estimated_height_m !==
            undefined
            ? `${detection.estimated_height_m} m`
            : "N/A"
        }
      </span>


      <span>
        Status:{" "}
        {
          detection?.verification_status ||
          "Needs Review"
        }
      </span>


      <span>
        Latitude:{" "}
        {
          position[0].toFixed(
            4
          )
        }
      </span>


      <span>
        Longitude:{" "}
        {
          position[1].toFixed(
            4
          )
        }
      </span>


      <small
        style={{
          marginTop:
            "3px",

          color:
            "#7f93a3",

          fontSize:
            "10px",

          lineHeight:
            "1.4",
        }}
      >
        Simulated survey position
      </small>

    </div>
  );
}


/* =========================================================
   MAIN MAP
========================================================= */

export default function MapView({
  detections = [],
}) {

  const markers =
    detections.map(
      (
        detection,
        index
      ) => {

        /*
         * Spread targets along the simulated track.
         *
         * The first two detections are deliberately placed
         * away from the large map title so they are visible.
         */

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

    <div
      className="map-container"
      style={{
        position:
          "relative",
      }}
    >


      {/* MAP TITLE */}

      <div className="map-title-overlay">

        <span>
          GEOSPATIAL ANALYSIS
        </span>


        <strong>
          GIS Detection Map
        </strong>


        <small>
          Blue = recognised target
          {" · "}
          Orange = unknown candidate
        </small>

      </div>


      {/* MAP */}

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


        {/* SURVEY TRACK */}

        <Polyline
          positions={
            TRACK
          }
          pathOptions={{
            color:
              "#1769aa",

            weight:
              4,

            opacity:
              0.85,

            dashArray:
              "10 8",
          }}
        />


        <RecenterMap
          markers={
            markers
          }
        />


        {/* DETECTION MARKERS */}

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
              icon={
                createIcon(
                  marker
                )
              }
            >

              <Popup>

                <DetectionPopup
                  detection={
                    marker
                  }
                  position={
                    marker.position
                  }
                />

              </Popup>

            </Marker>

          )
        )}

      </MapContainer>


      {/* LEGEND */}

      <div className="map-legend">

        <span>

          <b
            className="legend-m"
            style={{
              background:
                "#2563eb",

              color:
                "#ffffff",
            }}
          >
            T
          </b>

          Known Target

        </span>


        <span>

          <b
            className="legend-n"
            style={{
              background:
                "#f59e0b",

              color:
                "#ffffff",

              borderRadius:
                "50%",

              display:
                "inline-flex",

              alignItems:
                "center",

              justifyContent:
                "center",

              width:
                "24px",

              height:
                "24px",

              marginRight:
                "6px",
            }}
          >
            A
          </b>

          Unknown Candidate

        </span>

      </div>


      {!markers.length && (

        <div className="map-empty-overlay">

          Run an analysis to place
          detected contacts on the
          simulated survey map.

        </div>

      )}

    </div>
  );
}