import ExpoModulesCore
import MLKitPoseDetection

public class OuzPose: Module {
  public func definition() -> ModuleDefinition {
    Name("OuzPose")

    Function("getMLKitInfo") {
      let options = PoseDetectorOptions()
      options.detectorMode = .stream
      let detector = PoseDetector.poseDetector(options: options)
      _ = detector
      return "iOS: GoogleMLKit/PoseDetection 링크됨, BlazePose 33pt 사용 가능"
    }

    View(OuzPoseView.self) {
      Events("onPose")
      Prop("cameraPosition") { (view: OuzPoseView, position: String) in
        view.setCameraPosition(position)
      }
    }
  }
}
