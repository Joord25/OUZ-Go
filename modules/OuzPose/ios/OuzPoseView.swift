import ExpoModulesCore
import AVFoundation
import MLKitPoseDetection
import MLKitVision

// Phase 0b: 카메라 + ML Kit BlazePose 33pt 실시간 검출.
// cameraPosition prop ("front" / "back") 으로 카메라 전환.

class OuzPoseView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate {
  let onPose = EventDispatcher()

  private let captureSession = AVCaptureSession()
  private var previewLayer: AVCaptureVideoPreviewLayer!
  private let videoOutput = AVCaptureVideoDataOutput()
  private let videoQueue = DispatchQueue(label: "ouzpose.video", qos: .userInitiated)
  private let poseDetector: PoseDetector
  private var currentPosition: AVCaptureDevice.Position = .back

  // 33 landmark 순서 (BlazePose).
  private static let landmarkOrder: [PoseLandmarkType] = [
    .nose,
    .leftEyeInner, .leftEye, .leftEyeOuter,
    .rightEyeInner, .rightEye, .rightEyeOuter,
    .leftEar, .rightEar,
    .mouthLeft, .mouthRight,
    .leftShoulder, .rightShoulder,
    .leftElbow, .rightElbow,
    .leftWrist, .rightWrist,
    .leftPinkyFinger, .rightPinkyFinger,
    .leftIndexFinger, .rightIndexFinger,
    .leftThumb, .rightThumb,
    .leftHip, .rightHip,
    .leftKnee, .rightKnee,
    .leftAnkle, .rightAnkle,
    .leftHeel, .rightHeel,
    .leftToe, .rightToe
  ]

  required init(appContext: AppContext? = nil) {
    let options = PoseDetectorOptions()
    options.detectorMode = .stream
    self.poseDetector = PoseDetector.poseDetector(options: options)
    super.init(appContext: appContext)
    clipsToBounds = true
    captureSession.sessionPreset = .hd1280x720

    videoOutput.setSampleBufferDelegate(self, queue: videoQueue)
    videoOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
    videoOutput.alwaysDiscardsLateVideoFrames = true
    if captureSession.canAddOutput(videoOutput) {
      captureSession.addOutput(videoOutput)
    }

    previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
    previewLayer.videoGravity = .resizeAspectFill
    layer.addSublayer(previewLayer)

    configureInput(position: currentPosition)
    DispatchQueue.global(qos: .userInitiated).async {
      self.captureSession.startRunning()
    }
  }

  // JS prop "cameraPosition" 변경 시 호출.
  func setCameraPosition(_ position: String) {
    let newPosition: AVCaptureDevice.Position = (position == "front") ? .front : .back
    if newPosition == currentPosition { return }
    currentPosition = newPosition
    DispatchQueue.global(qos: .userInitiated).async {
      self.configureInput(position: newPosition)
    }
  }

  private func configureInput(position: AVCaptureDevice.Position) {
    captureSession.beginConfiguration()
    captureSession.inputs.forEach { captureSession.removeInput($0) }
    if let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
       let input = try? AVCaptureDeviceInput(device: camera),
       captureSession.canAddInput(input) {
      captureSession.addInput(input)
    } else {
      print("[OuzPose] 카메라 (\(position == .front ? "front" : "back")) 초기화 실패")
    }
    captureSession.commitConfiguration()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer?.frame = bounds
  }

  // MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    let isFront = (currentPosition == .front)
    let visionImage = VisionImage(buffer: sampleBuffer)
    visionImage.orientation = isFront ? .leftMirrored : .right

    // Buffer 원본 = 가로 (e.g. 1280x720). orientation=.right/.leftMirrored 적용 시
    // ML Kit 는 90° 회전한 portrait 좌표계 (720x1280) 로 landmark 반환.
    // → JS 에 보낼 frame 차원은 swap 한 값.
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    let rawW = CVPixelBufferGetWidth(pixelBuffer)
    let rawH = CVPixelBufferGetHeight(pixelBuffer)
    let rotatedW = rawH
    let rotatedH = rawW

    poseDetector.process(visionImage) { [weak self] poses, error in
      guard let self = self,
            error == nil,
            let pose = poses?.first
      else { return }

      let landmarks: [[String: Any]] = Self.landmarkOrder.map { type in
        let lm = pose.landmark(ofType: type)
        // 전면 카메라: ML Kit landmark x 는 카메라 raw 좌표 (mirror 안 된 상태).
        // 화면 preview 는 mirror 표시 → 좌표도 mirror 해줘야 화면과 일치.
        let finalX = isFront ? (CGFloat(rotatedW) - lm.position.x) : lm.position.x
        return [
          "x": finalX,
          "y": lm.position.y,
          "z": lm.position.z,
          "inFrameLikelihood": lm.inFrameLikelihood
        ]
      }

      DispatchQueue.main.async {
        self.onPose([
          "landmarks": landmarks,
          "frameWidth": rotatedW,
          "frameHeight": rotatedH
        ])
      }
    }
  }
}
