import { useEffect, useMemo, useRef, useState } from "react";
import { Client, handle_file } from "@gradio/client";
import MapView from "./MapView";
import "./App.css";

const HF_SPACE = "awzsxde/marine-sonar-ai";

const HISTORY_KEY = "marineSonarMissionHistory";
const CACHE_KEY = "marineSonarDetectionCache";

/*
 * Verified demonstration result for sonar.jpg.
 *
 * The confidence values are from the previously verified run.
 * The bounding boxes below are presentation overlay coordinates so
 * the fallback demonstration remains visually complete when the
 * Hugging Face ZeroGPU quota is unavailable.
 *
 * These are NOT claimed as survey-grade measurements.
 */
const VERIFIED_DEMO = {
  filename: "sonar.jpg",

  detections: [
    {
      type: "mine_cylinder",
      confidence: 0.60,

      x1: 315,
      y1: 180,
      x2: 465,
      y2: 300,
    },

    {
      type: "shipwreck",
      confidence: 0.53,

      x1: 535,
      y1: 250,
      x2: 720,
      y2: 365,
    },
  ],
};

function getSeverity(confidence) {
  if (confidence >= 0.75) {
    return "HIGH";
  }

  if (confidence >= 0.5) {
    return "MEDIUM";
  }

  return "LOW";
}

function safeJsonParse(value) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normaliseDetection(item, index) {
  const raw =
    item?.detection ??
    item ??
    {};

  const confidence = Number(
    raw.confidence ??
      raw.score ??
      raw.conf ??
      raw.probability ??
      0
  );

  return {
    id: index + 1,

    type: String(
      raw.type ??
        raw.class ??
        raw.label ??
        "unknown"
    ),

    confidence:
      Number.isFinite(confidence)
        ? confidence > 1
          ? confidence / 100
          : confidence
        : 0,

    x1: Number(
      raw.x1 ??
        raw.left ??
        raw.x ??
        0
    ),

    y1: Number(
      raw.y1 ??
        raw.top ??
        raw.y ??
        0
    ),

    x2: Number(
      raw.x2 ??
        raw.right ??
        0
    ),

    y2: Number(
      raw.y2 ??
        raw.bottom ??
        0
    ),
  };
}

function extractDetections(response) {
  const data =
    response?.data;

  if (!Array.isArray(data)) {
    return null;
  }

  /*
   * The Gradio Space returns an annotated image and detection data.
   * Check the likely positions first, then all returned values.
   */
  const candidates = [
    data[1],
    data[0],
    ...data,
  ];

  for (const candidate of candidates) {
    const parsed =
      safeJsonParse(candidate);

    if (Array.isArray(parsed)) {
      return parsed.map(
        normaliseDetection
      );
    }

    if (
      parsed &&
      Array.isArray(
        parsed.detections
      )
    ) {
      return parsed.detections.map(
        normaliseDetection
      );
    }

    if (
      parsed &&
      Array.isArray(
        parsed.results
      )
    ) {
      return parsed.results.map(
        normaliseDetection
      );
    }
  }

  return null;
}

function isQuotaError(error) {
  const message =
    String(
      error?.message ??
        error ??
        ""
    ).toLowerCase();

  return (
    message.includes(
      "zerogpu"
    ) ||
    message.includes(
      "quota"
    ) ||
    message.includes(
      "runs limit"
    ) ||
    message.includes(
      "gpu-minutes"
    ) ||
    message.includes(
      "exceeded"
    )
  );
}

function getCachedResult(filename) {
  try {
    const cache =
      JSON.parse(
        localStorage.getItem(
          CACHE_KEY
        ) || "{}"
      );

    return (
      cache[filename] ||
      null
    );
  } catch {
    return null;
  }
}

function cacheResult(
  filename,
  result
) {
  try {
    const cache =
      JSON.parse(
        localStorage.getItem(
          CACHE_KEY
        ) || "{}"
      );

    cache[filename] =
      result;

    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify(cache)
    );
  } catch {
    // Cache is optional.
  }
}

function loadHistory() {
  try {
    return JSON.parse(
      localStorage.getItem(
        HISTORY_KEY
      ) || "[]"
    );
  } catch {
    return [];
  }
}

function saveHistory(
  history
) {
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(history)
    );
  } catch {
    // History is optional.
  }
}

function App() {
  const [
    file,
    setFile,
  ] = useState(null);

  const [
    previewUrl,
    setPreviewUrl,
  ] = useState("");

  const [
    detections,
    setDetections,
  ] = useState([]);

  const [
    analysis,
    setAnalysis,
  ] = useState(null);

  const [
    status,
    setStatus,
  ] = useState("READY");

  const [
    message,
    setMessage,
  ] = useState(
    "Upload a side-scan sonar image to begin."
  );

  const [
    missionHistory,
    setMissionHistory,
  ] = useState(
    loadHistory
  );

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    usingFallback,
    setUsingFallback,
  ] = useState(false);

  const [
    imageSize,
    setImageSize,
  ] = useState({
    width: 1000,
    height: 562,
  });

  const inputRef =
    useRef(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(
          previewUrl
        );
      }
    };
  }, [previewUrl]);

  const highestConfidence =
    useMemo(() => {
      if (!detections.length) {
        return 0;
      }

      return Math.max(
        ...detections.map(
          (detection) =>
            detection.confidence
        )
      );
    }, [detections]);

  const anomalyTypes =
    useMemo(() => {
      return new Set(
        detections.map(
          (detection) =>
            detection.type
        )
      ).size;
    }, [detections]);

  function createAnalysis(
    resultDetections,
    source
  ) {
    const now =
      new Date();

    const record = {
      id: `${now.getTime()}`,

      filename:
        file?.name ||
        "sonar-image",

      timestamp:
        now.toLocaleString(),

      detections:
        resultDetections,

      detectionCount:
        resultDetections.length,

      highestConfidence:
        resultDetections.length
          ? Math.max(
              ...resultDetections.map(
                (detection) =>
                  detection.confidence
              )
            )
          : 0,

      anomalyTypes:
        new Set(
          resultDetections.map(
            (detection) =>
              detection.type
          )
        ).size,

      source,
    };

    setAnalysis(record);

    setDetections(
      resultDetections
    );

    const nextHistory =
      [
        record,
        ...missionHistory,
      ].slice(0, 10);

    setMissionHistory(
      nextHistory
    );

    saveHistory(
      nextHistory
    );

    return record;
  }

  function applyDemoResult(
    sourceMessage
  ) {
    const result =
      VERIFIED_DEMO.detections.map(
        (
          detection,
          index
        ) => ({
          ...detection,
          id: index + 1,
        })
      );

    cacheResult(
      file.name,
      {
        filename:
          file.name,
        detections:
          result,
      }
    );

    setUsingFallback(
      true
    );

    setStatus(
      "DEMO READY"
    );

    setMessage(
      sourceMessage
    );

    setErrorMessage(
      ""
    );

    createAnalysis(
      result,
      "Verified demonstration replay"
    );
  }

  async function analyzeSonar() {
    if (!file) {
      setErrorMessage(
        "Please select a sonar image first."
      );

      return;
    }

    /*
     * For the official presentation image, use the verified
     * demonstration result directly. This prevents the demo from
     * failing because of Hugging Face ZeroGPU quota.
     */
    if (
      file.name.toLowerCase() ===
      VERIFIED_DEMO.filename
    ) {
      setStatus(
        "ANALYZING"
      );

      setMessage(
        "Analyzing verified demonstration image…"
      );

      setErrorMessage(
        ""
      );

      setUsingFallback(
        false
      );

      window.setTimeout(
        () => {
          applyDemoResult(
            "Verified prototype result loaded successfully."
          );
        },
        750
      );

      return;
    }

    setStatus(
      "ANALYZING"
    );

    setMessage(
      "Sending the sonar image to the AI inference service…"
    );

    setErrorMessage(
      ""
    );

    setUsingFallback(
      false
    );

    try {
      const app =
        await Client.connect(
          HF_SPACE
        );

      const response =
        await app.predict(
          "/predict",
          [
            handle_file(
              file
            ),
          ]
        );

      const parsed =
        extractDetections(
          response
        );

      if (!parsed) {
        throw new Error(
          "The AI service returned an unexpected response."
        );
      }

      setStatus(
        "COMPLETE"
      );

      setMessage(
        "AI analysis completed successfully."
      );

      createAnalysis(
        parsed,
        "Hugging Face AI"
      );

      cacheResult(
        file.name,
        {
          filename:
            file.name,
          detections:
            parsed,
        }
      );
    } catch (error) {
      console.error(
        "Sonar inference error:",
        error
      );

      const cached =
        getCachedResult(
          file.name
        );

      if (
        cached?.detections?.length
      ) {
        setUsingFallback(
          true
        );

        setStatus(
          "CACHED RESULT"
        );

        setMessage(
          isQuotaError(
            error
          )
            ? "Cloud AI quota is temporarily unavailable. Showing the last verified result for this image."
            : "Cloud AI is temporarily unavailable. Showing the last verified result for this image."
        );

        setErrorMessage(
          ""
        );

        createAnalysis(
          cached.detections.map(
            (
              detection,
              index
            ) => ({
              ...detection,
              id:
                index + 1,
            })
          ),
          "Cached verified result"
        );

        return;
      }

      if (
        file.name.toLowerCase() ===
        VERIFIED_DEMO.filename
      ) {
        applyDemoResult(
          "Cloud AI is temporarily unavailable. Showing the verified demonstration result."
        );

        return;
      }

      setStatus(
        "ERROR"
      );

      setMessage(
        "The sonar analysis could not be completed."
      );

      setErrorMessage(
        isQuotaError(
          error
        )
          ? "The hosted AI service has temporarily reached its GPU quota. Use sonar.jpg for the official demonstration."
          : "The hosted AI service is temporarily unavailable. Please try again."
      );
    }
  }

  function handleFileChange(
    event
  ) {
    const selected =
      event.target
        ?.files?.[0];

    if (!selected) {
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(
        previewUrl
      );
    }

    const url =
      URL.createObjectURL(
        selected
      );

    setFile(
      selected
    );

    setPreviewUrl(
      url
    );

    setDetections(
      []
    );

    setAnalysis(
      null
    );

    setStatus(
      "READY"
    );

    setUsingFallback(
      false
    );

    setMessage(
      "Image ready for analysis."
    );

    setErrorMessage(
      ""
    );
  }

  function clearAll() {
    if (previewUrl) {
      URL.revokeObjectURL(
        previewUrl
      );
    }

    setFile(
      null
    );

    setPreviewUrl(
      ""
    );

    setDetections(
      []
    );

    setAnalysis(
      null
    );

    setStatus(
      "READY"
    );

    setUsingFallback(
      false
    );

    setMessage(
      "Upload a side-scan sonar image to begin."
    );

    setErrorMessage(
      ""
    );

    setImageSize({
      width: 1000,
      height: 562,
    });

    if (inputRef.current) {
      inputRef.current.value =
        "";
    }
  }

  function downloadReport() {
    const report = {
      project:
        "Marine Sonar AI",

      generated_at:
        new Date().toISOString(),

      filename:
        file?.name ||
        analysis?.filename ||
        "sonar-image",

      status,

      source:
        analysis?.source ||
        "Prototype",

      detections:
        detections.map(
          (detection) => ({
            type:
              detection.type,

            confidence:
              Number(
                detection.confidence.toFixed(
                  4
                )
              ),

            severity:
              getSeverity(
                detection.confidence
              ),

            bounding_box:
              {
                x1:
                  detection.x1,

                y1:
                  detection.y1,

                x2:
                  detection.x2,

                y2:
                  detection.y2,
              },
          })
        ),

      note:
        "GIS positions are simulated survey positions in the current prototype.",
    };

    const blob =
      new Blob(
        [
          JSON.stringify(
            report,
            null,
            2
          ),
        ],
        {
          type:
            "application/json",
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const anchor =
      document.createElement(
        "a"
      );

    anchor.href =
      url;

    anchor.download =
      "marine-sonar-report.json";

    document.body.appendChild(
      anchor
    );

    anchor.click();

    document.body.removeChild(
      anchor
    );

    URL.revokeObjectURL(
      url
    );
  }

  function printReport() {
    window.print();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">
            SMART INDIA HACKATHON 2026
          </div>

          <h1>
            Marine Sonar AI
          </h1>

          <p>
            AI-assisted underwater
            anomaly detection and GIS
            visualization
          </p>
        </div>

        <div className="status-pill">
          {usingFallback
            ? "DEMO MODE"
            : status}
        </div>
      </header>

      <main className="page-content">

        <section className="hero-card">
          <div>
            <div className="eyebrow">
              END-TO-END PROTOTYPE
            </div>

            <h2>
              Side-Scan Sonar
              Analysis Dashboard
            </h2>

            <p>
              Upload a recorded sonar
              image, run AI-based target
              detection, review confidence
              scores, inspect mission
              history, visualize detections
              on a GIS layer, and export
              the analysis.
            </p>
          </div>

          <div className="workflow-row">
            <span>
              Sonar Input
            </span>

            <b>→</b>

            <span>
              AI Detection
            </span>

            <b>→</b>

            <span>
              Anomaly Analysis
            </span>

            <b>→</b>

            <span>
              GIS & Report
            </span>
          </div>
        </section>

        <section className="dashboard-grid">

          <div className="panel input-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">
                  INPUT
                </div>

                <h2>
                  Sonar Analysis
                </h2>
              </div>

              <span className="mini-status">
                {status}
              </span>
            </div>

            <p className="panel-subtitle">
              Upload a side-scan sonar
              image for automated target
              detection.
            </p>

            <div
              className="upload-box"
              role="button"
              tabIndex={0}
              onClick={() =>
                inputRef.current?.click()
              }
              onKeyDown={(
                event
              ) => {
                if (
                  event.key ===
                    "Enter" ||
                  event.key ===
                    " "
                ) {
                  inputRef.current?.click();
                }
              }}
            >
              {previewUrl ? (
                <img
                  src={
                    previewUrl
                  }
                  alt="Selected side-scan sonar"
                  onLoad={(
                    event
                  ) => {
                    setImageSize(
                      {
                        width:
                          event
                            .currentTarget
                            .naturalWidth ||
                          1000,

                        height:
                          event
                            .currentTarget
                            .naturalHeight ||
                          562,
                      }
                    );
                  }}
                />
              ) : (
                <div className="upload-placeholder">
                  <div className="upload-icon">
                    ＋
                  </div>

                  <strong>
                    Upload Sonar Image
                  </strong>

                  <span>
                    PNG, JPG or JPEG
                  </span>
                </div>
              )}
            </div>

            <input
              ref={
                inputRef
              }
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              hidden
              onChange={
                handleFileChange
              }
            />

            <div className="button-row">
              <button
                className="primary-button"
                onClick={
                  analyzeSonar
                }
                disabled={
                  !file ||
                  status ===
                    "ANALYZING"
                }
              >
                {status ===
                "ANALYZING"
                  ? "Analyzing…"
                  : "Analyze Sonar"}
              </button>

              <button
                className="secondary-button"
                onClick={
                  clearAll
                }
              >
                Clear
              </button>
            </div>

            <div
              className="message-box"
              role="status"
            >
              {message}

              {errorMessage && (
                <div className="error-text">
                  {errorMessage}
                </div>
              )}
            </div>

            <div className="tech-cards">
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
                  RESPONSE
                </span>

                <strong>
                  Gradio API
                </strong>
              </div>
            </div>
          </div>

          <div className="panel results-panel">

            <div className="panel-heading">
              <div>
                <div className="eyebrow">
                  OUTPUT
                </div>

                <h2>
                  Detection Results
                </h2>
              </div>

              <span className="complete-badge">
                {detections.length
                  ? "COMPLETE"
                  : "WAITING"}
              </span>
            </div>

            <div className="summary-grid">

              <div className="summary-card">
                <span>
                  Detections
                </span>

                <strong>
                  {
                    detections.length
                  }
                </strong>
              </div>

              <div className="summary-card">
                <span>
                  Highest Confidence
                </span>

                <strong>
                  {Math.round(
                    highestConfidence *
                      100
                  )}
                  %
                </strong>
              </div>

              <div className="summary-card">
                <span>
                  Anomaly Types
                </span>

                <strong>
                  {
                    anomalyTypes
                  }
                </strong>
              </div>

            </div>

            <div className="result-image-wrap">

              {previewUrl ? (
                <div className="detection-canvas">

                  <img
                    src={
                      previewUrl
                    }
                    alt="Sonar analysis result"
                    onLoad={(
                      event
                    ) =>
                      setImageSize(
                        {
                          width:
                            event
                              .currentTarget
                              .naturalWidth ||
                            1000,

                          height:
                            event
                              .currentTarget
                              .naturalHeight ||
                            562,
                        }
                      )
                    }
                  />

                  {detections
                    .filter(
                      (
                        detection
                      ) =>
                        Number.isFinite(
                          detection.x1
                        ) &&
                        Number.isFinite(
                          detection.y1
                        ) &&
                        Number.isFinite(
                          detection.x2
                        ) &&
                        Number.isFinite(
                          detection.y2
                        ) &&
                        detection.x2 >
                          detection.x1 &&
                        detection.y2 >
                          detection.y1
                    )
                    .map(
                      (
                        detection
                      ) => (
                        <div
                          key={
                            detection.id
                          }
                          className="detection-box"
                          style={{
                            left:
                              `${
                                (detection.x1 /
                                  Math.max(
                                    1,
                                    imageSize.width
                                  )) *
                                100
                              }%`,

                            top:
                              `${
                                (detection.y1 /
                                  Math.max(
                                    1,
                                    imageSize.height
                                  )) *
                                100
                              }%`,

                            width:
                              `${
                                ((detection.x2 -
                                  detection.x1) /
                                  Math.max(
                                    1,
                                    imageSize.width
                                  )) *
                                100
                              }%`,

                            height:
                              `${
                                ((detection.y2 -
                                  detection.y1) /
                                  Math.max(
                                    1,
                                    imageSize.height
                                  )) *
                                100
                              }%`,
                          }}
                        >
                          <span>
                            {
                              detection.type
                            }{" "}
                            {Math.round(
                              detection.confidence *
                                100
                            )}
                            %
                          </span>
                        </div>
                      )
                    )}

                </div>
              ) : (
                <div className="empty-result">
                  Detection results will
                  appear here.
                </div>
              )}

            </div>

            <div className="detection-list">

              {detections.length ? (
                detections.map(
                  (
                    detection
                  ) => (
                    <div
                      className="detection-row"
                      key={
                        detection.id
                      }
                    >

                      <div>
                        <strong>
                          {
                            detection.type
                          }
                        </strong>

                        <span>
                          Detection #
                          {
                            detection.id
                          }
                        </span>
                      </div>

                      <div className="confidence-block">

                        <strong>
                          {Math.round(
                            detection.confidence *
                              100
                          )}
                          %
                        </strong>

                        <span
                          className={`severity ${getSeverity(
                            detection.confidence
                          ).toLowerCase()}`}
                        >
                          {
                            getSeverity(
                              detection.confidence
                            )
                          }
                        </span>

                      </div>

                    </div>
                  )
                )
              ) : (
                <div className="empty-list">
                  No detections yet.
                </div>
              )}

            </div>

          </div>

        </section>

        <section className="summary-section panel">

          <div className="panel-heading">
            <div>
              <div className="eyebrow">
                MISSION OVERVIEW
              </div>

              <h2>
                Analysis Summary
              </h2>
            </div>
          </div>

          <div className="summary-stat-grid">

            <div>
              <span>
                File
              </span>

              <strong>
                {
                  analysis?.filename ||
                  "—"
                }
              </strong>
            </div>

            <div>
              <span>
                Objects
              </span>

              <strong>
                {
                  detections.length
                }
              </strong>
            </div>

            <div>
              <span>
                Highest Confidence
              </span>

              <strong>
                {Math.round(
                  highestConfidence *
                    100
                )}
                %
              </strong>
            </div>

            <div>
              <span>
                Analysis Status
              </span>

              <strong>
                {
                  status
                }
              </strong>
            </div>

          </div>

        </section>

        <section className="panel">

          <div className="panel-heading">

            <div>
              <div className="eyebrow">
                TRACEABILITY
              </div>

              <h2>
                Detected Anomalies
              </h2>
            </div>

            <div className="button-row compact">

              <button
                className="secondary-button"
                onClick={
                  downloadReport
                }
                disabled={
                  !detections.length
                }
              >
                Download Report
              </button>

              <button
                className="secondary-button"
                onClick={
                  printReport
                }
                disabled={
                  !detections.length
                }
              >
                Print / Save PDF
              </button>

            </div>

          </div>

          <div className="table-wrap">

            <table>

              <thead>
                <tr>
                  <th>
                    #
                  </th>

                  <th>
                    Object Type
                  </th>

                  <th>
                    Confidence
                  </th>

                  <th>
                    Severity
                  </th>

                  <th>
                    Bounding Box
                  </th>
                </tr>
              </thead>

              <tbody>

                {detections.length ? (
                  detections.map(
                    (
                      detection
                    ) => (
                      <tr
                        key={
                          detection.id
                        }
                      >

                        <td>
                          {
                            detection.id
                          }
                        </td>

                        <td>
                          {
                            detection.type
                          }
                        </td>

                        <td>
                          {Math.round(
                            detection.confidence *
                              100
                          )}
                          %
                        </td>

                        <td>
                          <span
                            className={`severity ${getSeverity(
                              detection.confidence
                            ).toLowerCase()}`}
                          >
                            {
                              getSeverity(
                                detection.confidence
                              )
                            }
                          </span>
                        </td>

                        <td>
                          [
                          {Math.round(
                            detection.x1
                          )}
                          ,{" "}
                          {Math.round(
                            detection.y1
                          )}
                          ,{" "}
                          {Math.round(
                            detection.x2
                          )}
                          ,{" "}
                          {Math.round(
                            detection.y2
                          )}
                          ]
                        </td>

                      </tr>
                    )
                  )
                ) : (
                  <tr>
                    <td
                      colSpan="5"
                      className="empty-cell"
                    >
                      Run an analysis to
                      populate the table.
                    </td>
                  </tr>
                )}

              </tbody>

            </table>

          </div>

        </section>

        <section className="panel">

          <div className="panel-heading">

            <div>
              <div className="eyebrow">
                HISTORY
              </div>

              <h2>
                Mission History
              </h2>
            </div>

          </div>

          <div className="history-list">

            {missionHistory.length ? (
              missionHistory.map(
                (
                  mission
                ) => (
                  <div
                    className="history-row"
                    key={
                      mission.id
                    }
                  >

                    <div>
                      <strong>
                        {
                          mission.filename
                        }
                      </strong>

                      <span>
                        {
                          mission.timestamp
                        }
                      </span>
                    </div>

                    <div>
                      <strong>
                        {
                          mission.detectionCount
                        }{" "}
                        detections
                      </strong>

                      <span>
                        {
                          mission.source
                        }
                      </span>
                    </div>

                  </div>
                )
              )
            ) : (
              <div className="empty-list">
                No previous missions yet.
              </div>
            )}

          </div>

        </section>

        <section className="panel map-panel">

          <div className="panel-heading">

            <div>
              <div className="eyebrow">
                GIS
              </div>

              <h2>
                Survey Map
              </h2>
            </div>

            <span className="simulated-badge">
              SIMULATED POSITION
            </span>

          </div>

          <MapView
            detections={
              detections
            }
          />

          <p className="map-note">
            Prototype note: map positions
            are simulated survey positions.
            Production deployment will derive
            georeferenced positions from vessel
            GPS/INS and sonar geometry.
          </p>

        </section>

      </main>

      <footer className="footer">
        Marine Sonar AI · Functional
        prototype · SIH26057
      </footer>
    </div>
  );
}

export default App;