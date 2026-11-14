# Computer Vision Vehicle Detection Module (OpenCV & CCTV)
## Cloud-Based Smart Parking Management System

### 1. Overview
The CCTV detection module uses **Computer Vision and OpenCV** to automatically detect vehicle occupancy within parking bays from surveillance video feeds.

The deployment uses the CPU-only `opencv-python-headless` package with NumPy and Requests. It does not install PyTorch, CUDA, or GPU runtime libraries; graphical preview flags are not available in this headless package.

### 2. Processing Pipeline
1. **Video Ingestion:** Reads video stream from an RTSP camera, webcam, or recorded MP4 footage.
2. **Grayscale & Filtering:** Converts frame to single-channel luminance, applies Gaussian blur ($5 \times 5$) to mitigate sensor noise and compression artifacts.
3. **Adaptive Thresholding:** Evaluates local neighborhood pixel contrast (`cv2.ADAPTIVE_THRESH_GAUSSIAN_C`), handling shadows, glare, and varying lighting.
4. **ROI Bounding Box Extraction:** Crops individual parking slot coordinate regions defined in `slot_config.json`.
5. **Pixel Density Metric:**
   $$\text{Density} = \frac{\text{Non-Zero Pixels}}{\text{Slot Area}}$$
   If $\text{Density} \ge \text{Threshold}$ (default $0.28$), the bay is classified as `OCCUPIED`; otherwise `FREE`.
6. **Cloud API Sync:** Transmits detection arrays directly to the Node.js backend (`POST /api/detection/update`) with `source: "CCTV"`.

---

### 3. Quickstart & Execution

For production API sync, export the server's `DETECTION_API_KEY` in the process environment and target an HTTPS endpoint. Never put the key in source control or a command-line argument that may be saved in shell history.

#### Step 1: Ensure Video & Configuration Exist
A synthetic 120-frame test video is generated in `sample-video/sample_parking.mp4`. To regenerate it anytime:
```bash
python sample-video/generate_synthetic_video.py
```

#### Step 2: Run CCTV Detection Node
Run detection in headless mode (ideal for servers or background terminal execution):
```bash
python detect.py --frames=60
```

Specifying a custom Cloud API URL:
```bash
python detect.py --api-url https://<YOUR_DEPLOYMENT_HOST>/api/detection/update
```
