from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from PIL import Image
import os
import shutil
import uuid

app = FastAPI(title="Marine Sonar AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = YOLO("models/best_detector.pt")

UPLOAD_FOLDER = "backend/uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


@app.get("/")
def home():
    return {
        "message": "Marine Sonar AI API is running"
    }


@app.post("/detect")
async def detect_sonar(file: UploadFile = File(...)):

    filename = f"{uuid.uuid4()}_{file.filename}"
    file_path = os.path.join(UPLOAD_FOLDER, filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Get original image dimensions
    with Image.open(file_path) as image:
        image_width, image_height = image.size

    results = model.predict(
        source=file_path,
        conf=0.10
    )

    detections = []

    for result in results:

        for box in result.boxes:

            class_id = int(box.cls[0])
            confidence = float(box.conf[0])

            detections.append({
                "type": model.names[class_id],
                "confidence": round(confidence, 2),
                "x1": round(float(box.xyxy[0][0]), 2),
                "y1": round(float(box.xyxy[0][1]), 2),
                "x2": round(float(box.xyxy[0][2]), 2),
                "y2": round(float(box.xyxy[0][3]), 2)
            })

    return {
        "filename": file.filename,
        "image_width": image_width,
        "image_height": image_height,
        "detection_count": len(detections),
        "detections": detections
    }