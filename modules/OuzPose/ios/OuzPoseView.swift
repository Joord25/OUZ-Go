import ExpoModulesCore
import AVFoundation
import MLKitPoseDetection
import MLKitVision

// Phase 0b: 카메라 + ML Kit BlazePose 33pt 실시간 검출.
// 검증 후 Phase 0c-e: Skia 스켈레톤 / state machine / 음성 추가.

class OuzPoseView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate {
  // JS 로 33 landmarks 전달.
  let onPose = EventDispatcher()

  private let captureSession = AVCaptureSession()
  private var previewLayer: AVCaptureVideoPreviewLayer!
  private let videoOutput = AVCaptureVideoDataOutput()
  private let videoQueue = DispatchQueue(label: "ouzpose.video", qos: .userInitiated)
  private let poseDetector: PoseDetector

  // 33 landmark 순서 (BlazePose). JS 측이 이 인덱스 순서대로 받음.
  private static let landmarkOrder: [PoseLandmarkType] = [
    .nose,
    .leftEyeInner, .leftEye, .leftEyeOuter,
    .rightEyeInner, .rightEye, .rightEyeOuter,
    .leftEar, .rightEar,
    .mouthLeft, .mouthRight,
    .leftShoulder, .rightShoulder,
    .leftElbow, .rightElbow,
    .leftWrist, .rightWrist,
    .leftPinky, .rightPinky,
    .leftIndex, .rightIndex,
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
    setupCamera()
  }

  private func setupCamera() {
    captureSession.sessionPreset = .hd1280x720

    // 측면/정면 운동에 따라 prop 으로 받을 예정. 지금은 back default.
    let position: AVCaptureDevice.Position = .back
    guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
          let input = try? AVCaptureDeviceInput(device: camera),
          captureSession.canAddInput(input)
    else {
      print("[OuzPose] 카메라 초기화 실패")
      return
    }
    captureSession.addInput(input)

    videoOutput.setSampleBufferDelegate(self, queue: videoQueue)
    videoOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
    videoOutput.alwaysDiscardsLateVideoFrames = true
    if captureSession.canAddOutput(videoOutput) {
      captureSession.addOutput(videoOutput)
    }

    previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
    previewLayer.videoGravity = .resizeAspectFill
    layer.addSublayer(previewLayer)

    DispatchQueue.global(qos: .userInitiated).async {
      self.captureSession.startRunning()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer?.frame = bounds
  }

  // MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    let visionImage = VisionImage(buffer: sampleBuffer)
    visionImage.orientation = .right  // back camera + portrait

    // Stream mode 라 sync 호출 OK (ML Kit 가 내부 큐 관리).
    poseDetector.process(visionImage) { [weak self] poses, error in
      guard let self = self,
            error == nil,
            let pose = poses?.first
      else { return }

      // Frame 차원 (landmark x,y 의 pixel 좌표계 기준).
      let frameDims = CMSampleBufferGetImageBuffer(sampleBuffer).map { pixelBuffer -> (Int, Int) in
        return (CVPixelBufferGetWidth(pixelBuffer), CVPixelBufferGetHeight(pixelBuffer))
      } ?? (0, 0)

      let landmarks: [[String: Any]] = Self.landmarkOrder.map { type in
        let lm = pose.landmark(ofType: type)
        return [
          "x": lm.position.x,
          "y": lm.position.y,
          "z": lm.position.z,
          "inFrameLikelihood": lm.inFrameLikelihood
        ]
      }

      DispatchQueue.main.async {
        self.onPose([
          "landmarks": landmarks,
          "frameWidth": frameDims.0,
          "frameHeight": frameDims.1
        ])
      }
    }
  }
}
