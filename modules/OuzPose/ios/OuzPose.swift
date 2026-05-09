import ExpoModulesCore
import MLKitPoseDetection

public class OuzPose: Module {
  public func definition() -> ModuleDefinition {
    Name("OuzPose")

    Events("onChange")

    // Phase 0a 검증용: ML Kit 라이브러리가 실제로 링크되어 있는지 확인.
    // PoseDetector 인스턴스 생성을 시도 → 성공하면 ML Kit Pose Detection iOS SDK 가
    // 우리 빌드에 정상 포함됨을 확인.
    Function("getMLKitInfo") {
      let options = PoseDetectorOptions()
      options.detectorMode = .stream
      let detector = PoseDetector.poseDetector(options: options)
      _ = detector
      return "iOS: GoogleMLKit/PoseDetection 링크됨, BlazePose 33pt 사용 가능"
    }

    AsyncFunction("setValueAsync") { (value: String) in
      self.sendEvent("onChange", [
        "value": value
      ])
    }

    // 후속 커밋: View 정의 + 카메라 + 실시간 pose detection 이벤트.
    View(OuzPoseView.self) {
      Prop("url") { (view: OuzPoseView, url: URL) in
        if view.webView.url != url {
          view.webView.load(URLRequest(url: url))
        }
      }
      Events("onLoad")
    }
  }
}
