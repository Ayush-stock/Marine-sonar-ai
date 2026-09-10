import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
} from "react-leaflet";

import L from "leaflet";
import "leaflet/dist/leaflet.css";

/*
  These coordinates represent a SIMULATED marine survey.
  They are not extracted from the sonar image.
*/
const surveyTrack = [
  [15.12, 72.55],
  [15.14, 72.60],
  [15.16, 72.65],
  [15.18, 72.70],
  [15.20, 72.75],
  [15.22, 72.80],
  [15.24, 72.85],
  [15.26, 72.90],
  [15.28, 72.95],
];

/*
  Create a marker according to the detected object type.
*/
const createDetectionIcon = (type) => {
  let symbol = "!";

  if (type === "shipwreck") {
    symbol = "S";
  } else if (type === "mine_cylinder") {
    symbol = "M";
  } else if (type === "ghost_net") {
    symbol = "N";
  } else if (type === "submarine_pipeline") {
    symbol = "P";
  }

  return new L.DivIcon({
    className: "custom-marker",

    html: `
      <div
        class="map-marker"
        title="${type}"
      >
        ${symbol}
      </div>
    `,

    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
};

function MapView({ detections }) {

  /*
    Use the middle of the simulated survey
    as the initial map position.
  */
  const center = [15.20, 72.75];

  /*
    Match detections to positions along the survey track.

    If there are more detections than track points,
    the last available position is reused.
  */
  const detectionPositions = detections.map(
    (detection, index) => {

      const positionIndex =
        Math.min(
          index + 3,
          surveyTrack.length - 1
        );

      return {
        ...detection,
        latitude:
          surveyTrack[positionIndex][0],
        longitude:
          surveyTrack[positionIndex][1],
      };
    }
  );

  return (
    <section className="map-section">

      {/* ================= MAP HEADER ================= */}

      <div className="map-header">

        <div>

          <span className="eyebrow">
            GEOSPATIAL ANALYSIS
          </span>

          <h2>
            GIS Detection Map
          </h2>

          <p>
            Detected anomalies plotted along the
            simulated survey track.
          </p>

        </div>

        <span className="demo-location">
          SIMULATED POSITION
        </span>

      </div>

      {/* ================= MAP LEGEND ================= */}

      <div className="map-legend">

        <strong>
          Legend
        </strong>

        <span>
          <span className="legend-marker">
            M
          </span>
          Mine Cylinder
        </span>

        <span>
          <span className="legend-marker">
            S
          </span>
          Shipwreck
        </span>

        <span>
          <span className="legend-marker">
            N
          </span>
          Ghost Net
        </span>

        <span>
          <span className="legend-marker">
            P
          </span>
          Submarine Pipeline
        </span>

      </div>

      {/* ================= MAP ================= */}

      <div className="map-container">

        <MapContainer
          center={center}
          zoom={8}
          scrollWheelZoom={true}
          style={{
            height: "100%",
            width: "100%",
          }}
        >

          {/* BASE MAP */}

          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* SIMULATED SURVEY TRACK */}

          <Polyline
            positions={surveyTrack}
            pathOptions={{
              color: "#1976d2",
              weight: 4,
              opacity: 0.85,
              dashArray: "8 8",
            }}
          />

          {/* DETECTION MARKERS */}

          {detectionPositions.map(
            (detection, index) => {

              const {
                latitude,
                longitude,
              } = detection;

              return (
                <Marker
                  key={index}
                  position={[
                    latitude,
                    longitude,
                  ]}
                  icon={createDetectionIcon(
                    detection.type
                  )}
                >

                  <Popup>

                    <div className="popup-content">

                      <h3>
                        {detection.type}
                      </h3>

                      <p>
                        <strong>
                          Detection:
                        </strong>{" "}
                        #{index + 1}
                      </p>

                      <p>
                        <strong>
                          Confidence:
                        </strong>{" "}
                        {(
                          detection.confidence *
                          100
                        ).toFixed(0)}
                        %
                      </p>

                      <p>
                        <strong>
                          Latitude:
                        </strong>{" "}
                        {latitude.toFixed(4)}
                      </p>

                      <p>
                        <strong>
                          Longitude:
                        </strong>{" "}
                        {longitude.toFixed(4)}
                      </p>

                      <span className="popup-demo">
                        Simulated survey position
                      </span>

                    </div>

                  </Popup>

                </Marker>
              );
            }
          )}

        </MapContainer>

      </div>

      {/* ================= MAP FOOTNOTE ================= */}

      <div className="map-note">

        <span>
          ●
        </span>

        <div>
          <strong>
            Survey Track
          </strong>

          <p>
            Blue dashed line represents the
            simulated vessel survey path.
          </p>
        </div>

        <div className="map-disclaimer">
          Coordinates are simulated for the MVP.
          Actual deployment will use vessel GPS/INS
          and sonar geometry for georeferencing.
        </div>

      </div>

    </section>
  );
}

export default MapView;