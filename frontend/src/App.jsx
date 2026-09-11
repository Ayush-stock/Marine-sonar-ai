import { useEffect, useState } from "react";
import { Client, handle_file } from "@gradio/client";
import "./App.css";
import MapView from "./MapView";

const HF_SPACE = "awzsxde/marine-sonar-ai";

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const [missionHistory, setMissionHistory] = useState(() => {
    const saved = localStorage.getItem("marineSonarHistory");

    if (!saved) {
      return [];
    }

    try {
      return JSON.parse(saved);
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(
      "marineSonarHistory",
      JSON.stringify(missionHistory)
    );
  }, [missionHistory]);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];

    if (!selectedFile) {
      return;
    }

    setFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
    setResult(null);
  };

  const analyzeSonar = async () => {
    if (!file) {
      return;
    }

    setLoading(true);
    setResult(null);

    const startTime = performance.now();

    try {
      const app = await Client.connect(HF_SPACE);

      const response = await app.predict("/predict", [
        handle_file(file),
      ]);

      const processingTime = (
        (performance.now() - startTime) /
        1000
      ).toFixed(2);

      const detectionData = response.data[1];

      let data = detectionData;

      if (typeof detectionData === "string") {
        data = JSON.parse(detectionData);
      }

      const detections = Array.isArray(data?.detections)
        ? data.detections
        : [];

      const detectionCount =
        Number(data?.detection_count) || detections.length;

      const imageWidth =
        Number(data?.image_width) || 1;

      const imageHeight =
        Number(data?.image_height) || 1;

      const highestConfidence =
        detections.length > 0
          ? Math.max(
              ...detections.map(
                (detection) =>
                  Number(detection.confidence) || 0
              )
            )
          : 0;

      const uniqueObjects = [
        ...new Set(
          detections.map(
            (detection) => detection.type
          )
        ),
      ];

      const objectTypes =
        uniqueObjects.length > 0
          ? uniqueObjects.join(", ")
          : "None";

      const missionNumber =
        missionHistory.length + 1;

      const mission = {
        id: Date.now(),
        missionNumber,
        filename: file.name,
        detectionCount,
        highestConfidence,
        anomalyTypes: uniqueObjects.length,
        objectTypes,
        status:
          detectionCount > 0
            ? "Anomaly Detected"
            : "Clear",
        processingTime,
        timestamp:
          new Date().toLocaleString(),
        detections,
      };

      setResult({
        filename: file.name,
        image_width: imageWidth,
        image_height: imageHeight,
        detection_count: detectionCount,
        detections,
        processing_time: processingTime,
        mission_number: missionNumber,
      });

      setMissionHistory(
        (previousHistory) => [
          ...previousHistory,
          mission,
        ]
      );
    } catch (error) {
      console.error("Hugging Face error:", error);

      setResult({
        error:
          "Unable to connect to the AI service. Please try again."
      });
    }

    setLoading(false);
  };

  const clearCurrentAnalysis = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
  };

  const clearHistory = () => {
    setMissionHistory([]);
  };

  const highestConfidence =
    result &&
    result.detections.length > 0
      ? Math.max(
          ...result.detections.map(
            (detection) =>
              Number(detection.confidence) || 0
          )
        )
      : 0;

  const anomalyTypes =
    result &&
    result.detections.length > 0
      ? new Set(
          result.detections.map(
            (detection) =>
              detection.type
          )
        ).size
      : 0;

  const getSeverity = (confidence) => {
    if (confidence >= 0.75) {
      return "HIGH";
    }

    if (confidence >= 0.5) {
      return "MEDIUM";
    }

    return "LOW";
  };

  const getDemoCoordinates = (index) => {
    return {
      latitude: 15.2 + index * 0.03,
      longitude: 72.8 + index * 0.03,
    };
  };

  const downloadReport = () => {
    if (!result || result.error) {
      return;
    }

    const report = {
      report_title:
        "Marine Sonar AI Detection Report",

      mission_id:
        `MISSION-${String(
          result.mission_number
        ).padStart(3, "0")}`,

      generated_at:
        new Date().toLocaleString(),

      source_image:
        result.filename,

      detection_summary: {
        total_detections:
          result.detection_count,

        anomaly_types:
          anomalyTypes,

        highest_confidence:
          `${(
            highestConfidence * 100
          ).toFixed(0)}%`,

        survey_status:
          result.detection_count > 0
            ? "ANOMALY DETECTED"
            : "NO ANOMALY DETECTED",

        processing_time:
          `${result.processing_time}s`,
      },

      detections:
        result.detections.map(
          (detection, index) => {
            const coordinates =
              getDemoCoordinates(index);

            return {
              detection_number:
                index + 1,

              object_type:
                detection.type,

              confidence:
                `${(
                  detection.confidence *
                  100
                ).toFixed(0)}%`,

              severity:
                getSeverity(
                  detection.confidence
                ),

              bounding_box: {
                x1: detection.x1,
                y1: detection.y1,
                x2: detection.x2,
                y2: detection.y2,
              },

              demonstration_coordinates: {
                latitude:
                  coordinates.latitude.toFixed(4),

                longitude:
                  coordinates.longitude.toFixed(4),
              },
            };
          }
        ),

      geolocation_status:
        "Demonstration coordinates are used in the current MVP.",
    };

    const blob = new Blob(
      [
        JSON.stringify(
          report,
          null,
          2
        ),
      ],
      {
        type: "application/json",
      }
    );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    link.download =
      `marine-sonar-report-${String(
        result.mission_number
      ).padStart(3, "0")}.json`;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    if (!result || result.error) {
      return;
    }

    const missionId =
      `MISSION-${String(
        result.mission_number
      ).padStart(3, "0")}`;

    const detectionRows =
      result.detections
        .map((detection, index) => {
          const coordinates =
            getDemoCoordinates(index);

          return `
            <tr>
              <td>${index + 1}</td>
              <td>${detection.type}</td>
              <td>${(
                detection.confidence * 100
              ).toFixed(0)}%</td>
              <td>${getSeverity(
                detection.confidence
              )}</td>
              <td>${coordinates.latitude.toFixed(
                4
              )}</td>
              <td>${coordinates.longitude.toFixed(
                4
              )}</td>
            </tr>
          `;
        })
        .join("");

    const printWindow =
      window.open(
        "",
        "_blank",
        "width=1000,height=800"
      );

    if (!printWindow) {
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>
            ${missionId} - Marine Sonar AI Report
          </title>

          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 40px;
              color: #17212b;
            }

            h1 {
              margin-bottom: 5px;
            }

            h2 {
              margin-top: 30px;
            }

            .subtitle {
              color: #66788a;
            }

            .header-box {
              border-bottom: 2px solid #102a43;
              padding-bottom: 20px;
            }

            .stats {
              display: grid;
              grid-template-columns:
                repeat(4, 1fr);
              gap: 12px;
              margin-top: 20px;
            }

            .stat {
              padding: 15px;
              background: #f0f4f8;
              border-radius: 8px;
            }

            .stat-label {
              color: #66788a;
              font-size: 12px;
            }

            .stat-value {
              display: block;
              margin-top: 6px;
              font-size: 20px;
              font-weight: bold;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
            }

            th,
            td {
              padding: 12px;
              border: 1px solid #d9e2ec;
              text-align: left;
            }

            th {
              background: #f0f4f8;
            }

            .geo-note {
              margin-top: 24px;
              color: #66788a;
              font-size: 12px;
            }

            .footer {
              margin-top: 40px;
              color: #7b8794;
              font-size: 12px;
            }
          </style>
        </head>

        <body>

          <div class="header-box">

            <h1>
              Marine Sonar AI
            </h1>

            <div class="subtitle">
              Underwater Marine Debris &
              Anomaly Detection Report
            </div>

            <p>
              <strong>Mission:</strong>
              ${missionId}
            </p>

            <p>
              <strong>Image:</strong>
              ${result.filename}
            </p>

            <p>
              <strong>Generated:</strong>
              ${new Date().toLocaleString()}
            </p>

          </div>

          <h2>
            Analysis Summary
          </h2>

          <div class="stats">

            <div class="stat">
              <span class="stat-label">
                Total Detections
              </span>

              <span class="stat-value">
                ${result.detection_count}
              </span>
            </div>

            <div class="stat">
              <span class="stat-label">
                Highest Confidence
              </span>

              <span class="stat-value">
                ${(
                  highestConfidence * 100
                ).toFixed(0)}%
              </span>
            </div>

            <div class="stat">
              <span class="stat-label">
                Anomaly Types
              </span>

              <span class="stat-value">
                ${anomalyTypes}
              </span>
            </div>

            <div class="stat">
              <span class="stat-label">
                Processing Time
              </span>

              <span class="stat-value">
                ${result.processing_time}s
              </span>
            </div>

          </div>

          <h2>
            Detected Anomalies
          </h2>

          <table>

            <thead>
              <tr>
                <th>#</th>
                <th>Object Type</th>
                <th>Confidence</th>
                <th>Severity</th>
                <th>Latitude</th>
                <th>Longitude</th>
              </tr>
            </thead>

            <tbody>
              ${detectionRows}
            </tbody>

          </table>

          <div class="geo-note">
            Geolocation status:
            demonstration coordinates are used
            in the current MVP.
          </div>

          <div class="footer">
            Generated by Marine Sonar AI
          </div>

        </body>
      </html>
    `);

    printWindow.document.close();

    printWindow.focus();

    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  return (
    <div className="app">

      <header className="header">

        <div className="brand">

          <div className="brand-icon">
            MS
          </div>

          <div>

            <h1>
              Marine Sonar AI
            </h1>

            <p>
              Underwater Marine Debris &
              Anomaly Detection
            </p>

          </div>

        </div>

        <div className="system-status">

          <span className="status-dot"></span>

          <div>

            <strong>
              AI System Online
            </strong>

            <span>
              Hugging Face · YOLO Sonar
            </span>

          </div>

        </div>

      </header>

      <section className="pipeline">

        <div className="pipeline-step active">
          <span>01</span>
          <strong>Upload</strong>
        </div>

        <div className="pipeline-line"></div>

        <div className="pipeline-step active">
          <span>02</span>
          <strong>AI Detection</strong>
        </div>

        <div className="pipeline-line"></div>

        <div className="pipeline-step active">
          <span>03</span>
          <strong>Analysis</strong>
        </div>

        <div className="pipeline-line"></div>

        <div className="pipeline-step active">
          <span>04</span>
          <strong>GIS Mapping</strong>
        </div>

        <div className="pipeline-line"></div>

        <div className="pipeline-step">
          <span>05</span>
          <strong>Report</strong>
        </div>

      </section>

      <main className="dashboard">

        <section className="panel">

          <div className="section-heading">

            <div>

              <span className="eyebrow">
                INPUT
              </span>

              <h2>
                Sonar Analysis
              </h2>

            </div>

            <span className="live-badge">
              READY
            </span>

          </div>

          <p className="subtitle">
            Upload a side-scan sonar image
            for automated anomaly detection.
          </p>

          <label
            className={
              preview
                ? "upload-box has-image"
                : "upload-box"
            }
          >

            <input
              type="file"
              accept="image/*"
              onChange={
                handleFileChange
              }
            />

            {preview ? (

              <img
                src={preview}
                alt="Uploaded sonar"
                className="preview"
              />

            ) : (

              <div className="upload-placeholder">

                <div className="upload-icon">
                  +
                </div>

                <strong>
                  Select Sonar Image
                </strong>

                <span>
                  JPG, JPEG or PNG
                </span>

                <small>
                  Side-scan sonar imagery
                </small>

              </div>

            )}

          </label>

          <div className="button-row">

            <button
              className="analyze-button"
              onClick={
                analyzeSonar
              }
              disabled={
                !file || loading
              }
            >
              {loading
                ? "Analyzing Sonar..."
                : "Analyze Sonar"}
            </button>

            {result &&
              !result.error && (

                <button
                  className="clear-button"
                  onClick={
                    clearCurrentAnalysis
                  }
                >
                  Clear
                </button>

              )}

          </div>

          <div className="model-info">

            <div>

              <span>
                MODEL
              </span>

              <strong>
                YOLOv8 Sonar
              </strong>

            </div>

            <div>

              <span>
                OUTPUT
              </span>

              <strong>
                Object Detection
              </strong>

            </div>

            <div>

              <span>
                HOST
              </span>

              <strong>
                Hugging Face
              </strong>

            </div>

          </div>

        </section>

        <section className="panel">

          <div className="section-heading">

            <div>

              <span className="eyebrow">
                OUTPUT
              </span>

              <h2>
                Detection Results
              </h2>

            </div>

            {result &&
              !result.error && (

                <span className="result-badge">
                  COMPLETE
                </span>

              )}

          </div>

          {!result && !loading && (

            <div className="empty-state">

              <div className="empty-icon">
                ◎
              </div>

              <p>
                No analysis performed
              </p>

              <span>
                Upload a sonar image to begin.
              </span>

            </div>

          )}

          {loading && (

            <div className="empty-state">

              <div className="spinner"></div>

              <p>
                Processing sonar image...
              </p>

              <span>
                Connecting to hosted AI model.
              </span>

            </div>

          )}

          {result?.error && (

            <div className="error-box">
              {result.error}
            </div>

          )}

          {result &&
            !result.error && (

              <>

                <div className="summary">

                  <div>
                    <span>
                      Detections
                    </span>

                    <strong>
                      {result.detection_count}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Highest Confidence
                    </span>

                    <strong>
                      {(
                        highestConfidence *
                        100
                      ).toFixed(0)}
                      %
                    </strong>
                  </div>

                  <div>
                    <span>
                      Anomaly Types
                    </span>

                    <strong>
                      {anomalyTypes}
                    </strong>
                  </div>

                </div>

                {preview && (

                  <div className="detection-image-container">

                    <img
                      src={preview}
                      alt="Analyzed sonar"
                      className="detection-image"
                    />

                    {result.detections.map(
                      (
                        detection,
                        index
                      ) => (

                        <div
                          key={index}
                          className="bounding-box"
                          style={{
                            left: `${
                              (detection.x1 /
                                result.image_width) *
                              100
                            }%`,

                            top: `${
                              (detection.y1 /
                                result.image_height) *
                              100
                            }%`,

                            width: `${
                              ((detection.x2 -
                                detection.x1) /
                                result.image_width) *
                              100
                            }%`,

                            height: `${
                              ((detection.y2 -
                                detection.y1) /
                                result.image_height) *
                              100
                            }%`,
                          }}
                        >

                          <span className="box-label">
                            {detection.type}{" "}
                            {(
                              detection.confidence *
                              100
                            ).toFixed(0)}
                            %
                          </span>

                        </div>

                      )
                    )}

                  </div>

                )}

                {result.detection_count === 0 ? (

                  <div className="no-detection">
                    No anomaly detected.
                  </div>

                ) : (

                  <div className="detections">

                    {result.detections.map(
                      (
                        detection,
                        index
                      ) => (

                        <div
                          className="detection-card"
                          key={index}
                        >

                          <div>

                            <strong>
                              {detection.type}
                            </strong>

                            <span>
                              Detection #
                              {index + 1}
                            </span>

                          </div>

                          <div className="confidence">
                            {(
                              detection.confidence *
                              100
                            ).toFixed(0)}
                            %
                          </div>

                        </div>

                      )
                    )}

                  </div>

                )}

              </>

            )}

        </section>

      </main>

      {result &&
        !result.error && (

          <section className="mission-summary">

            <div className="mission-header">

              <div>

                <span className="eyebrow">
                  CURRENT MISSION
                </span>

                <h2>
                  Analysis Summary
                </h2>

                <p>
                  Overview of the current sonar analysis.
                </p>

              </div>

              <div
                className={
                  result.detection_count > 0
                    ? "survey-status detected"
                    : "survey-status clear"
                }
              >
                {result.detection_count > 0
                  ? "ANOMALY DETECTED"
                  : "NO ANOMALY DETECTED"}
              </div>

            </div>

            <div className="summary-grid">

              <div className="summary-card">

                <span>
                  Total Detections
                </span>

                <strong>
                  {result.detection_count}
                </strong>

              </div>

              <div className="summary-card">

                <span>
                  Highest Confidence
                </span>

                <strong>
                  {(
                    highestConfidence *
                    100
                  ).toFixed(0)}
                  %
                </strong>

              </div>

              <div className="summary-card">

                <span>
                  Anomaly Types
                </span>

                <strong>
                  {anomalyTypes}
                </strong>

              </div>

              <div className="summary-card">

                <span>
                  Processing Time
                </span>

                <strong>
                  {result.processing_time}s
                </strong>

              </div>

            </div>

            <div className="report-actions">

              <button
                className="report-button"
                onClick={
                  downloadReport
                }
              >
                Download Report
              </button>

              <button
                className="print-button"
                onClick={
                  printReport
                }
              >
                Print / Save PDF
              </button>

            </div>

          </section>

        )}

      {result &&
        !result.error &&
        result.detection_count > 0 && (

          <section className="mission-summary">

            <div className="mission-header">

              <div>

                <span className="eyebrow">
                  AI OUTPUT
                </span>

                <h2>
                  Detected Anomalies
                </h2>

                <p>
                  Objects identified in the current sonar image.
                </p>

              </div>

            </div>

            <div className="table-wrapper">

              <table className="detection-table">

                <thead>

                  <tr>
                    <th>#</th>
                    <th>Object Type</th>
                    <th>Confidence</th>
                    <th>Severity</th>
                  </tr>

                </thead>

                <tbody>

                  {result.detections.map(
                    (
                      detection,
                      index
                    ) => (

                      <tr
                        key={index}
                      >

                        <td>
                          {index + 1}
                        </td>

                        <td>
                          <strong>
                            {detection.type}
                          </strong>
                        </td>

                        <td>
                          {(
                            detection.confidence *
                            100
                          ).toFixed(0)}
                          %
                        </td>

                        <td>

                          <span
                            className={`severity ${getSeverity(
                              detection.confidence
                            ).toLowerCase()}`}
                          >
                            {getSeverity(
                              detection.confidence
                            )}
                          </span>

                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          </section>

        )}

      <section className="mission-summary">

        <div className="mission-header">

          <div>

            <span className="eyebrow">
              HISTORY
            </span>

            <h2>
              Mission History
            </h2>

            <p>
              Previous sonar analyses stored in this browser.
            </p>

          </div>

          {missionHistory.length > 0 && (

            <button
              className="clear-history-button"
              onClick={
                clearHistory
              }
            >
              Clear History
            </button>

          )}

        </div>

        {missionHistory.length === 0 ? (

          <div className="history-empty">

            <div className="empty-icon">
              ◴
            </div>

            <p>
              No previous missions
            </p>

            <span>
              Completed analyses will appear here.
            </span>

          </div>

        ) : (

          <div className="table-wrapper">

            <table className="detection-table">

              <thead>

                <tr>

                  <th>
                    Mission
                  </th>

                  <th>
                    Image
                  </th>

                  <th>
                    Detected Objects
                  </th>

                  <th>
                    Detections
                  </th>

                  <th>
                    Confidence
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Time
                  </th>

                </tr>

              </thead>

              <tbody>

                {[...missionHistory]
                  .reverse()
                  .map(
                    (mission) => (

                      <tr
                        key={
                          mission.id
                        }
                      >

                        <td>

                          <strong>
                            #
                            {String(
                              mission.missionNumber
                            ).padStart(
                              3,
                              "0"
                            )}
                          </strong>

                        </td>

                        <td className="history-filename">
                          {mission.filename}
                        </td>

                        <td className="history-objects">
                          {mission.objectTypes}
                        </td>

                        <td>
                          {mission.detectionCount}
                        </td>

                        <td>
                          {(
                            mission.highestConfidence *
                            100
                          ).toFixed(0)}
                          %
                        </td>

                        <td>

                          <span
                            className={
                              mission.status ===
                              "Anomaly Detected"
                                ? "history-status anomaly"
                                : "history-status clear"
                            }
                          >
                            {mission.status}
                          </span>

                        </td>

                        <td>
                          {mission.timestamp}
                        </td>

                      </tr>

                    )
                  )}

              </tbody>

            </table>

          </div>

        )}

      </section>

      {result &&
        !result.error &&
        result.detection_count > 0 && (

          <MapView
            detections={
              result.detections
            }
          />

        )}

      <footer className="footer">

        <div>

          <strong>
            Marine Sonar AI
          </strong>

          <span>
            AI-powered side-scan sonar analysis
          </span>

        </div>

        <span>
          MVP Demonstration
        </span>

      </footer>

    </div>
  );
}

export default App;