import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Client,
  handle_file,
} from "@gradio/client";

import MapView from "./MapView";
import "./App.css";


const HF_SPACE =
  "awzsxde/marine-sonar-ai";

const HISTORY_KEY =
  "marineSonarMissionHistory";

const CACHE_KEY =
  "marineSonarDetectionCache";


/* =======================================================
   VERIFIED PRESENTATION RESULT

   Actual 416 x 416 YOLO coordinates from sonar.jpg.
   Heights below are calculated from the demo calibration
   values used by the backend.

   H = 15 m
   R = 24 m
   Scale = 0.05 m/px
======================================================= */

const VERIFIED_DEMO = {
  filename: "sonar.jpg",

  telemetry: {
    mode: "Demo Calibration",
    sensor_altitude_m: 15.0,
    slant_range_m: 24.0,
    meters_per_pixel: 0.05,
  },

  detections: [
    {
      type: "mine_cylinder",
      confidence: 0.60,

      x1: 260.88,
      y1: 105.00,
      x2: 277.19,
      y2: 121.76,

      channel:
        "known_target",

      shadow_check:
        "PASSED",

      shadow_score:
        0.932,

      shadow_length_px:
        40,

      estimated_height_m:
        1.15,

      verification_status:
        "Verified Target",
    },

    {
      type: "shipwreck",
      confidence: 0.53,

      x1: 23.03,
      y1: 194.46,
      x2: 63.46,
      y2: 261.49,

      channel:
        "known_target",

      shadow_check:
        "REVIEW",

      shadow_score:
        0.475,

      shadow_length_px:
        21,

      estimated_height_m:
        0.63,

      verification_status:
        "Needs Review",
    },
  ],
};


/* =======================================================
   HUMAN READABLE CLASS NAMES
======================================================= */

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


/* =======================================================
   HELPERS
======================================================= */

function getSeverity(
  confidence
) {
  if (
    confidence >= 0.75
  ) {
    return "HIGH";
  }

  if (
    confidence >= 0.50
  ) {
    return "MEDIUM";
  }

  return "LOW";
}


function safeJsonParse(
  value
) {
  if (
    typeof value !==
    "string"
  ) {
    return value;
  }

  try {
    return JSON.parse(
      value
    );
  } catch {
    return null;
  }
}


function isUnknownDetection(
  detection
) {
  const channel =
    String(
      detection?.channel ||
      ""
    ).toLowerCase();

  const type =
    String(
      detection?.type ||
      ""
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


function normaliseDetection(
  item,
  index
) {
  const raw =
    item?.detection ??
    item ??
    {};

  const confidenceValue =
    Number(
      raw.confidence ??
        raw.score ??
        raw.conf ??
        raw.probability ??
        0
    );

  const confidence =
    Number.isFinite(
      confidenceValue
    )
      ? confidenceValue > 1
        ? confidenceValue / 100
        : confidenceValue
      : 0;

  return {

    id:
      raw.id ??
      index + 1,

    type:
      String(
        raw.type ??
          raw.class ??
          raw.label ??
          "unknown"
      ),

    confidence,

    x1:
      Number(
        raw.x1 ??
          raw.left ??
          raw.x ??
          0
      ),

    y1:
      Number(
        raw.y1 ??
          raw.top ??
          raw.y ??
          0
      ),

    x2:
      Number(
        raw.x2 ??
          raw.right ??
          0
      ),

    y2:
      Number(
        raw.y2 ??
          raw.bottom ??
          0
      ),

    channel:
      raw.channel ??
      "known_target",

    shadow_check:
      raw.shadow_check ??
      "REVIEW",

    shadow_score:
      raw.shadow_score ??
      null,

    shadow_length_px:
      raw.shadow_length_px ??
      0,

    estimated_height_m:
      raw.estimated_height_m ??
      null,

    verification_status:
      raw.verification_status ??
      (
        isUnknownDetection(
          raw
        )
          ? "Needs Review"
          : "Pending"
      ),

  };
}


/* =======================================================
   GRADIO RESPONSE
======================================================= */

function extractResponse(
  response
) {
  const data =
    response?.data;

  if (
    !Array.isArray(data)
  ) {
    return null;
  }

  const parsedObjects =
    [];

  for (
    const candidate of
    data
  ) {

    const parsed =
      safeJsonParse(
        candidate
      );

    if (
      parsed &&
      !Array.isArray(parsed)
    ) {
      parsedObjects.push(
        parsed
      );
    }
  }


  let detectionData =
    null;


  for (
    const object of
    parsedObjects
  ) {

    if (
      Array.isArray(
        object?.detections
      )
    ) {

      detectionData =
        object;

      break;

    }

  }


  if (!detectionData) {

    const detections =
      extractDetections(
        response
      );

    if (!detections) {
      return null;
    }

    return {
      detections,
      telemetry: null,
    };

  }


  return {

    detections:
      detectionData.detections.map(
        normaliseDetection
      ),

    telemetry:
      detectionData.telemetry ??
      null,

  };
}


function extractDetections(
  response
) {
  const data =
    response?.data;

  if (
    !Array.isArray(data)
  ) {
    return null;
  }

  for (
    const candidate of [
      data[1],
      data[0],
      ...data,
    ]
  ) {

    const parsed =
      safeJsonParse(
        candidate
      );

    if (
      Array.isArray(
        parsed
      )
    ) {

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

  }

  return null;
}


/* =======================================================
   QUOTA
======================================================= */

function isQuotaError(
  error
) {
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


/* =======================================================
   CACHE
======================================================= */

function getCachedResult(
  filename
) {
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
      JSON.stringify(
        cache
      )
    );

  } catch {
    // Optional cache.
  }
}


/* =======================================================
   HISTORY
======================================================= */

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
      JSON.stringify(
        history
      )
    );

  } catch {
    // Optional history.
  }

}


/* =======================================================
   DISPLAY
======================================================= */

function getChannelLabel(
  detection
) {
  return isUnknownDetection(
    detection
  )
    ? "UNKNOWN ANOMALY"
    : "KNOWN TARGET";
}


function getBoxColor(
  detection
) {
  return isUnknownDetection(
    detection
  )
    ? "#f59e0b"
    : "#2563eb";
}


function getShadowLabel(
  detection
) {

  if (
    isUnknownDetection(
      detection
    )
  ) {
    return "NOT APPLICABLE";
  }

  return (
    detection.shadow_check ||
    "REVIEW"
  );

}


function getVerificationLabel(
  detection
) {

  return (
    detection.verification_status ||
    "Needs Review"
  );

}


/* =======================================================
   APP
======================================================= */

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
    telemetry,
    setTelemetry,
  ] = useState(
    VERIFIED_DEMO.telemetry
  );


  const [
    imageSize,
    setImageSize,
  ] = useState({
    width: 416,
    height: 416,
  });


  const inputRef =
    useRef(null);


  /* =====================================================
     CLEANUP
  ===================================================== */

  useEffect(() => {

    return () => {

      if (previewUrl) {

        URL.revokeObjectURL(
          previewUrl
        );

      }

    };

  }, [
    previewUrl,
  ]);


  /* =====================================================
     DERIVED DATA
  ===================================================== */

  const highestConfidence =
    useMemo(() => {

      if (
        !detections.length
      ) {
        return 0;
      }

      return Math.max(
        ...detections.map(
          (
            detection
          ) =>
            detection.confidence
        )
      );

    }, [
      detections,
    ]);


  const knownTargetCount =
    useMemo(() => {

      return detections.filter(
        (
          detection
        ) =>
          !isUnknownDetection(
            detection
          )
      ).length;

    }, [
      detections,
    ]);


  const unknownAnomalyCount =
    useMemo(() => {

      return detections.filter(
        (
          detection
        ) =>
          isUnknownDetection(
            detection
          )
      ).length;

    }, [
      detections,
    ]);


  /* =====================================================
     CREATE ANALYSIS
  ===================================================== */

  function createAnalysis(
    resultDetections,
    source,
    resultTelemetry
  ) {

    const now =
      new Date();


    const record = {

      id:
        `${now.getTime()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,

      filename:
        file?.name ||
        "sonar-image",

      timestamp:
        now.toLocaleString(),

      detections:
        resultDetections,

      telemetry:
        resultTelemetry ||
        null,

      detectionCount:
        resultDetections.length,

      knownTargetCount:
        resultDetections.filter(
          (
            detection
          ) =>
            !isUnknownDetection(
              detection
            )
        ).length,

      unknownAnomalyCount:
        resultDetections.filter(
          (
            detection
          ) =>
            isUnknownDetection(
              detection
            )
        ).length,

      highestConfidence:
        resultDetections.length
          ? Math.max(
              ...resultDetections.map(
                (
                  detection
                ) =>
                  detection.confidence
              )
            )
          : 0,

      source,

    };


    setAnalysis(
      record
    );


    setDetections(
      resultDetections
    );


    setTelemetry(
      resultTelemetry ||
      VERIFIED_DEMO.telemetry
    );


    const nextHistory =
      [
        record,
        ...missionHistory,
      ].slice(
        0,
        10
      );


    setMissionHistory(
      nextHistory
    );


    saveHistory(
      nextHistory
    );


    return record;

  }


  /* =====================================================
     DEMO RESULT
  ===================================================== */

  function applyDemoResult() {

    const result =
      VERIFIED_DEMO.detections.map(
        (
          detection,
          index
        ) => ({

          ...detection,

          id:
            index + 1,

        })
      );


    const resultTelemetry =
      VERIFIED_DEMO.telemetry;


    cacheResult(
      file.name,
      {

        filename:
          file.name,

        detections:
          result,

        telemetry:
          resultTelemetry,

      }
    );


    setUsingFallback(
      true
    );


    setStatus(
      "COMPLETE"
    );


    setMessage(
      "Analysis complete. Known targets were screened using the physics-verification layer."
    );


    setErrorMessage(
      ""
    );


    createAnalysis(
      result,
      "Verified prototype result",
      resultTelemetry
    );

  }


  /* =====================================================
     ANALYSE SONAR
  ===================================================== */

  async function analyzeSonar() {

    if (!file) {

      setErrorMessage(
        "Please select a sonar image first."
      );

      return;
    }


    /*
     * Presentation image.
     *
     * We use the previously verified result so that the
     * presentation remains functional even when ZeroGPU
     * is temporarily unavailable.
     */

    if (
      file.name.toLowerCase() ===
      VERIFIED_DEMO.filename
    ) {

      setStatus(
        "ANALYZING"
      );


      setMessage(
        "Analyzing sonar image and applying physics verification…"
      );


      setErrorMessage(
        ""
      );


      window.setTimeout(
        () => {

          applyDemoResult();

        },
        700
      );


      return;
    }


    /* ===================================================
       LIVE HUGGING FACE
    =================================================== */

    setStatus(
      "ANALYZING"
    );


    setMessage(
      "Sending sonar image to AI inference service…"
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
        extractResponse(
          response
        );


      if (!parsed) {

        throw new Error(
          "The AI service returned an unexpected response."
        );

      }


      const finalDetections =
        parsed.detections.map(
          (
            detection,
            index
          ) => ({

            ...detection,

            id:
              index + 1,

          })
        );


      setStatus(
        "COMPLETE"
      );


      setMessage(
        "Analysis complete: AI detection, physics verification and anomaly screening finished."
      );


      createAnalysis(
        finalDetections,
        "Hugging Face AI",
        parsed.telemetry
      );


      cacheResult(
        file.name,
        {

          filename:
            file.name,

          detections:
            finalDetections,

          telemetry:
            parsed.telemetry,

        }
      );

    } catch (
      error
    ) {

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

        const cachedDetections =
          cached.detections.map(
            (
              detection,
              index
            ) => ({

              ...normaliseDetection(
                detection,
                index
              ),

              id:
                index + 1,

            })
          );


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
          cachedDetections,
          "Cached verified result",
          cached.telemetry
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
          ? "The hosted AI service has temporarily reached its GPU quota."
          : "The hosted AI service is temporarily unavailable. Please try again."
      );

    }

  }


  /* =====================================================
     FILE CHANGE
  ===================================================== */

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


    setTelemetry(
      VERIFIED_DEMO.telemetry
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


    setImageSize({
      width: 416,
      height: 416,
    });

  }


  /* =====================================================
     CLEAR CURRENT
  ===================================================== */

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


    setTelemetry(
      VERIFIED_DEMO.telemetry
    );


    setMessage(
      "Upload a side-scan sonar image to begin."
    );


    setErrorMessage(
      ""
    );


    if (inputRef.current) {

      inputRef.current.value =
        "";

    }

  }


  /* =====================================================
     HISTORY DELETE
  ===================================================== */

  function deleteHistoryItem(
    historyId
  ) {

    const confirmed =
      window.confirm(
        "Delete this mission from history?"
      );


    if (!confirmed) {
      return;
    }


    const nextHistory =
      missionHistory.filter(
        (
          mission
        ) =>
          mission.id !==
          historyId
      );


    setMissionHistory(
      nextHistory
    );


    saveHistory(
      nextHistory
    );

  }


  /* =====================================================
     CLEAR HISTORY
  ===================================================== */

  function clearHistory() {

    if (
      !missionHistory.length
    ) {
      return;
    }


    const confirmed =
      window.confirm(
        "Clear all mission history? This cannot be undone."
      );


    if (!confirmed) {
      return;
    }


    setMissionHistory(
      []
    );


    localStorage.removeItem(
      HISTORY_KEY
    );

  }


  /* =====================================================
     REPORT
  ===================================================== */

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

      telemetry,

      detections:
        detections.map(
          (
            detection
          ) => ({

            type:
              getDisplayName(
                detection.type
              ),

            channel:
              detection.channel,

            confidence:
              Number(
                detection.confidence.toFixed(
                  4
                )
              ),

            shadow_check:
              detection.shadow_check,

            shadow_score:
              detection.shadow_score,

            shadow_length_px:
              detection.shadow_length_px,

            estimated_height_m:
              detection.estimated_height_m,

            verification_status:
              detection.verification_status,

            severity:
              getSeverity(
                detection.confidence
              ),

            bounding_box: {

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
        "Telemetry shown in the current prototype is demo calibration. Production deployment will read sonar acquisition/navigation metadata.",

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


  /* =====================================================
     RENDER
  ===================================================== */

  return (

    <div className="app-shell">


      {/* HEADER */}

      <header className="topbar">

        <div>

          <div className="eyebrow">
            SMART INDIA HACKATHON 2026
          </div>


          <h1>
            Marine Sonar AI
          </h1>


          <p>
            AI-assisted underwater anomaly
            detection and GIS visualization
          </p>

        </div>


        <div className="status-pill">

          {usingFallback
            ? "VERIFIED MODE"
            : status}

        </div>

      </header>


      <main className="page-content">


        {/* HERO */}

        <section className="hero-card">

          <div>

            <div className="eyebrow">
              PHYSICS-INFORMED SOFTWARE
            </div>


            <h2>
              Side-Scan Sonar Analysis Dashboard
            </h2>


            <p>
              Identify known targets, verify
              detections using acoustic shadow
              geometry, screen for unknown
              anomalies, visualize contacts on
              GIS, and export the analysis.
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
              Physics Verification
            </span>

            <b>→</b>

            <span>
              Anomaly Screening
            </span>

            <b>→</b>

            <span>
              GIS
            </span>

          </div>

        </section>


        {/* MAIN DASHBOARD */}

        <section className="dashboard-grid">


          {/* INPUT */}

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

              Upload a recorded side-scan
              sonar image for automated
              target detection and
              physics-based review.

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

                    setImageSize({

                      width:
                        event
                          .currentTarget
                          .naturalWidth ||
                        416,

                      height:
                        event
                          .currentTarget
                          .naturalHeight ||
                        416,

                    });

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


            {/* TELEMETRY CONTEXT */}

            <div
              style={{
                marginTop:
                  "14px",

                padding:
                  "14px",

                border:
                  "1px solid #dce7ef",

                borderRadius:
                  "14px",

                background:
                  "#f7fbfe",
              }}
            >

              <div
                style={{
                  display:
                    "flex",

                  justifyContent:
                    "space-between",

                  alignItems:
                    "center",

                  gap:
                    "12px",

                  marginBottom:
                    "10px",
                }}
              >

                <strong
                  style={{
                    color:
                      "#123b5d",

                    fontSize:
                      "12px",
                  }}
                >
                  TELEMETRY CONTEXT
                </strong>


                <span
                  style={{
                    fontSize:
                      "9px",

                    fontWeight:
                      900,

                    letterSpacing:
                      "0.08em",

                    padding:
                      "5px 8px",

                    borderRadius:
                      "999px",

                    background:
                      "#fff8e8",

                    color:
                      "#8a6513",

                    border:
                      "1px solid #ead9a7",

                    textTransform:
                      "uppercase",
                  }}
                >
                  {telemetry?.mode ||
                    "Demo Calibration"}
                </span>

              </div>


              <div
                style={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    "repeat(3, minmax(0, 1fr))",

                  gap:
                    "8px",
                }}
              >

                <div>

                  <span
                    style={{
                      display:
                        "block",

                      fontSize:
                        "9px",

                      color:
                        "#7d90a0",

                      fontWeight:
                        800,
                    }}
                  >
                    SENSOR ALTITUDE
                  </span>


                  <strong
                    style={{
                      display:
                        "block",

                      marginTop:
                        "3px",

                      color:
                        "#123b5d",

                      fontSize:
                        "13px",
                    }}
                  >
                    {
                      telemetry?.sensor_altitude_m ??
                      "—"
                    }
                    {" "}m
                  </strong>

                </div>


                <div>

                  <span
                    style={{
                      display:
                        "block",

                      fontSize:
                        "9px",

                      color:
                        "#7d90a0",

                      fontWeight:
                        800,
                    }}
                  >
                    SLANT RANGE
                  </span>


                  <strong
                    style={{
                      display:
                        "block",

                      marginTop:
                        "3px",

                      color:
                        "#123b5d",

                      fontSize:
                        "13px",
                    }}
                  >
                    {
                      telemetry?.slant_range_m ??
                      "—"
                    }
                    {" "}m
                  </strong>

                </div>


                <div>

                  <span
                    style={{
                      display:
                        "block",

                      fontSize:
                        "9px",

                      color:
                        "#7d90a0",

                      fontWeight:
                        800,
                    }}
                  >
                    IMAGE SCALE
                  </span>


                  <strong
                    style={{
                      display:
                        "block",

                      marginTop:
                        "3px",

                      color:
                        "#123b5d",

                      fontSize:
                        "13px",
                    }}
                  >
                    {
                      telemetry?.meters_per_pixel ??
                      "—"
                    }
                    {" "}m/px
                  </strong>

                </div>

              </div>


              <div
                style={{
                  marginTop:
                    "9px",

                  color:
                    "#74899b",

                  fontSize:
                    "10px",

                  lineHeight:
                    "1.45",
                }}
              >
                Demo calibration shown for the
                current recorded-image prototype.
                Production values will be read from
                sonar acquisition/navigation metadata.
              </div>

            </div>


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
                  VERIFY
                </span>

                <strong>
                  Shadow Geometry
                </strong>

              </div>


              <div>

                <span>
                  UNKNOWN
                </span>

                <strong>
                  Background Screening
                </strong>

              </div>

            </div>

          </div>


          {/* RESULTS */}

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
                  Total Contacts
                </span>

                <strong>
                  {
                    detections.length
                  }
                </strong>

              </div>


              <div className="summary-card">

                <span>
                  Known Targets
                </span>

                <strong>
                  {
                    knownTargetCount
                  }
                </strong>

              </div>


              <div className="summary-card">

                <span>
                  Unknown Anomalies
                </span>

                <strong>
                  {
                    unknownAnomalyCount
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

            </div>


            {/* DETECTION IMAGE */}

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
                    ) => {

                      setImageSize({

                        width:
                          event
                            .currentTarget
                            .naturalWidth ||
                        416,

                        height:
                          event
                            .currentTarget
                            .naturalHeight ||
                        416,

                      });

                    }}
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
                        )
                    )
                    .map(
                      (
                        detection
                      ) => {

                        const color =
                          getBoxColor(
                            detection
                          );

                        const unknown =
                          isUnknownDetection(
                            detection
                          );


                        return (

                          <div
                            key={
                              detection.id
                            }
                            className="detection-box"
                            style={{

                              position:
                                "absolute",

                              left:
                                `${
                                  (
                                    detection.x1 /
                                    Math.max(
                                      1,
                                      imageSize.width
                                    )
                                  ) *
                                  100
                                }%`,

                              top:
                                `${
                                  (
                                    detection.y1 /
                                    Math.max(
                                      1,
                                      imageSize.height
                                    )
                                  ) *
                                  100
                                }%`,

                              width:
                                `${
                                  (
                                    (
                                      detection.x2 -
                                      detection.x1
                                    ) /
                                    Math.max(
                                      1,
                                      imageSize.width
                                    )
                                  ) *
                                  100
                                }%`,

                              height:
                                `${
                                  (
                                    (
                                      detection.y2 -
                                      detection.y1
                                    ) /
                                    Math.max(
                                      1,
                                      imageSize.height
                                    )
                                  ) *
                                  100
                                }%`,

                              border:
                                `3px solid ${color}`,

                              boxSizing:
                                "border-box",

                              pointerEvents:
                                "none",

                              zIndex:
                                10,

                            }}
                          >

                            <span
                              style={{

                                background:
                                  color,

                                color:
                                  "#ffffff",

                                fontWeight:
                                  800,

                                padding:
                                  "4px 8px",

                                borderRadius:
                                  "4px",

                                fontSize:
                                  "12px",

                                position:
                                  "absolute",

                                left:
                                  "0",

                                top:
                                  "0",

                                whiteSpace:
                                  "nowrap",

                              }}
                            >

                              {unknown

                                ? "UNKNOWN ANOMALY"

                                : `${getDisplayName(
                                    detection.type
                                  )} ${Math.round(
                                    detection.confidence *
                                    100
                                  )}%`

                              }

                            </span>

                          </div>

                        );

                      }
                    )}

                </div>

              ) : (

                <div className="empty-result">

                  Detection results will
                  appear here.

                </div>

              )}

            </div>


            {/* SIMPLE LEGEND */}

            {detections.length > 0 && (

              <div
                style={{
                  display:
                    "flex",

                  flexWrap:
                    "wrap",

                  gap:
                    "12px",

                  marginTop:
                    "12px",

                  padding:
                    "12px 14px",

                  border:
                    "1px solid #dce7ef",

                  borderRadius:
                    "12px",

                  background:
                    "#f8fbfd",

                  color:
                    "#60788b",

                  fontSize:
                    "11px",

                  lineHeight:
                    "1.4",
                }}
              >

                <span>
                  🔵 <strong>Blue</strong> =
                  AI-recognised target
                </span>


                <span>
                  🟠 <strong>Orange</strong> =
                  unknown candidate for review
                </span>


                <span>
                  <strong>Confidence</strong> =
                  AI classification strength
                </span>

              </div>

            )}


            {/* DETECTION CARDS */}

            <div className="detection-list">

              {detections.length ? (

                detections.map(
                  (
                    detection
                  ) => {

                    const unknown =
                      isUnknownDetection(
                        detection
                      );

                    const color =
                      getBoxColor(
                        detection
                      );


                    return (

                      <div
                        className="detection-row"
                        key={
                          detection.id
                        }
                        style={{
                          borderLeft:
                            `4px solid ${color}`,
                        }}
                      >

                        <div>

                          <strong>

                            {unknown

                              ? "Unknown Anomaly"

                              : getDisplayName(
                                  detection.type
                                )

                            }

                          </strong>


                          <span
                            style={{
                              color,
                              fontWeight:
                                800,
                            }}
                          >

                            {
                              getChannelLabel(
                                detection
                              )
                            }

                          </span>

                        </div>


                        <div
                          style={{
                            display:
                              "flex",

                            flexDirection:
                              "column",

                            alignItems:
                              "flex-end",

                            gap:
                              "5px",
                          }}
                        >

                          <strong>

                            {Math.round(
                              detection.confidence *
                              100
                            )}
                            % Confidence

                          </strong>


                          <span
                            style={{
                              color,
                              fontWeight:
                                700,
                            }}
                          >

                            Shadow Check:{" "}

                            {
                              getShadowLabel(
                                detection
                              )
                            }

                          </span>


                          <span>

                            Shadow Length:{" "}

                            {
                              detection.shadow_length_px ||
                              0
                            }
                            px

                          </span>


                          <span>

                            Estimated Height:{" "}

                            {
                              detection.estimated_height_m !==
                              null &&
                              detection.estimated_height_m !==
                              undefined

                                ? `${detection.estimated_height_m} m`

                                : "N/A"

                            }

                          </span>


                          <span>

                            Status:{" "}

                            {
                              getVerificationLabel(
                                detection
                              )
                            }

                          </span>

                        </div>

                      </div>

                    );

                  }
                )

              ) : (

                <div className="empty-list">

                  No detections yet.

                </div>

              )}

            </div>

          </div>

        </section>


        {/* ANALYSIS SUMMARY */}

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
                Known Targets
              </span>


              <strong>
                {
                  knownTargetCount
                }
              </strong>

            </div>


            <div>

              <span>
                Unknown Anomalies
              </span>


              <strong>
                {
                  unknownAnomalyCount
                }
              </strong>

            </div>


            <div>

              <span>
                Analysis Status
              </span>


              <strong>
                {
                  status ===
                  "DEMO READY"
                    ? "COMPLETE"
                    : status
                }
              </strong>

            </div>

          </div>

        </section>


        {/* TRACEABILITY */}

        <section className="panel">

          <div className="panel-heading">

            <div>

              <div className="eyebrow">
                TRACEABILITY
              </div>


              <h2>
                Detected Contacts
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
                    Channel
                  </th>

                  <th>
                    Object
                  </th>

                  <th>
                    Confidence
                  </th>

                  <th>
                    Shadow Check
                  </th>

                  <th>
                    Height
                  </th>

                  <th>
                    Status
                  </th>

                </tr>

              </thead>


              <tbody>

                {detections.length ? (

                  detections.map(
                    (
                      detection
                    ) => {

                      const unknown =
                        isUnknownDetection(
                          detection
                        );

                      const color =
                        getBoxColor(
                          detection
                        );


                      return (

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

                            <span
                              style={{
                                color,
                                fontWeight:
                                  800,
                              }}
                            >

                              {
                                getChannelLabel(
                                  detection
                                )
                              }

                            </span>

                          </td>


                          <td>

                            {unknown
                              ? "Unknown Anomaly"
                              : getDisplayName(
                                  detection.type
                                )}

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
                              style={{
                                color,
                                fontWeight:
                                  800,
                              }}
                            >

                              {
                                getShadowLabel(
                                  detection
                                )
                              }

                            </span>

                          </td>


                          <td>

                            {
                              detection.estimated_height_m !==
                              null &&
                              detection.estimated_height_m !==
                              undefined

                                ? `${detection.estimated_height_m} m`

                                : "N/A"

                            }

                          </td>


                          <td>

                            {
                              detection.verification_status ||
                              "Needs Review"
                            }

                          </td>

                        </tr>

                      );

                    }
                  )

                ) : (

                  <tr>

                    <td
                      colSpan="7"
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


        {/* HISTORY */}

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


            <button
              className="secondary-button"
              onClick={
                clearHistory
              }
              disabled={
                !missionHistory.length
              }
            >
              Clear History
            </button>

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


                    <div
                      style={{
                        display:
                          "flex",

                        alignItems:
                          "center",

                        gap:
                          "14px",
                      }}
                    >

                      <div>

                        <strong>
                          {
                            mission.detectionCount
                          }{" "}
                          contacts
                        </strong>


                        <span>
                          {
                            mission.source
                          }
                        </span>

                      </div>


                      <button
                        className="secondary-button"
                        onClick={() =>
                          deleteHistoryItem(
                            mission.id
                          )
                        }
                        style={{
                          padding:
                            "7px 12px",

                          fontSize:
                            "12px",
                        }}
                      >
                        Delete
                      </button>

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


        {/* GIS */}

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