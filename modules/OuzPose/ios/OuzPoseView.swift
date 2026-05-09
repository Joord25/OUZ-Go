import ExpoModulesCore
import AVFoundation
import MLKitPoseDetection
import MLKitVision

// Phase 0b: 카메라 + ML Kit BlazePose 33pt 실시간 검출.
//
// 핵심: Connection 레벨에서 회전을 portrait 로 강제 → 버퍼 가 portrait 로 도착.
// ML Kit visionImage.orientation = .up 으로 처리. landmark 좌표가 portrait 화면
// 좌표계와 동일 → JS aspectFill 매핑이 정확해짐.
//
// 전면 카메라 mirror 처리:
//  - preview connection: isVideoMirrored = true (자연스러운 거울 모드)
//  - data output connection: isVideoMirrored = false (ML Kit 는 raw 좌표 받음)
//  - 화면 표시용으로 landmark x 만 native 측에서 mirror.

class OuzPoseView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate {
  let onPose = EventDispatcher()

  private let captureSession = AVCaptureSession()
  private var previewLayer: AVCaptureVideoPreviewLayer!
  private let videoOutput = AVCaptureVideoDataOutput()
  private let videoQueue = DispatchQueue(label: "ouzpose.video", qos: .userInitiated)
  private let poseDetector: PoseDetector
  private var currentPosition: AVCaptureDevice.Position = .back

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

    guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
          let input = try? AVCaptureDeviceInput(device: camera),
          captureSession.canAddInput(input) else {
      print("[OuzPose] 카메라 초기화 실패 (\(position == .front ? "front" : "back"))")
      captureSession.commitConfiguration()
      return
    }
    captureSession.addInput(input)

    let isFront = (position == .front)

    // Data output connection: portrait 회전 + mirror 끄기 (raw label 보존).
    if let conn = videoOutput.connection(with: .video) {
      applyPortrait(conn)
      if conn.isVideoMirroringSupported {
        conn.automaticallyAdjustsVideoMirroring = false
        conn.isVideoMirrored = false
      }
    }

    // Preview connection: portrait 회전 + 전면 카메라는 mirror.
    if let conn = previewLayer.connection {
      applyPortrait(conn)
      if conn.isVideoMirroringSupported {
        conn.automaticallyAdjustsVideoMirroring = false
        conn.isVideoMirrored = isFront
      }
    }

    captureSession.commitConfiguration()
  }

  private func applyPortrait(_ connection: AVCaptureConnection) {
    if #available(iOS 17.0, *) {
      if connection.isVideoRotationAngleSupported(90) {
        connection.videoRotationAngle = 90
      }
    } else {
      if connection.isVideoOrientationSupported {
        connection.videoOrientation = .portrait
      }
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer?.frame = bounds
  }

  // MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    let isFront = (currentPosition == .front)
    let visionImage = VisionImage(buffer: sampleBuffer)
    // Connection 이 이미 portrait 로 회전 → buffer 도 portrait. ML Kit 는 그대로.
    visionImage.orientation = .up

    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    let frameW = CVPixelBufferGetWidth(pixelBuffer)
    let frameH = CVPixelBufferGetHeight(pixelBuffer)

    poseDetector.process(visionImage) { [weak self] poses, error in
      guard let self = self,
            error == nil,
            let pose = poses?.first
      else { return }

      let landmarks: [[String: Any]] = Self.landmarkOrder.map { type in
        let lm = pose.landmark(ofType: type)
        // 전면 카메라: data output 은 mirror 안 됨 → 화면 (mirror) 과 매칭 위해 x 반전.
        let finalX = isFront ? (CGFloat(frameW) - lm.position.x) : lm.position.x
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
          "frameWidth": frameW,
          "frameHeight": frameH
        ])
      }
    }
  }
}
