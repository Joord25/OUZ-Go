import ExpoModulesCore
import MLKitPoseDetection

public class OuzPose: Module {
  public func definition() -> ModuleDefinition {
    Name("OuzPose")

    // ML Kit 라이브러리 링크 검증용 (Phase 0a). 유지.
    Function("getMLKitInfo") {
      let options = PoseDetectorOptions()
      options.detectorMode = .stream
      let detector = PoseDetector.poseDetector(options: options)
      _ = detector
      return "iOS: GoogleMLKit/PoseDetection 링크됨, BlazePose 33pt 사용 가능"
    }

    // Phase 0b: OuzPoseView = 카메라 + ML Kit pose detection.
    // onPose 이벤트로 33 landmarks 와 frame 차원 전달.
    View(OuzPoseView.self) {
      Events("onPose")
    }
  }
}
