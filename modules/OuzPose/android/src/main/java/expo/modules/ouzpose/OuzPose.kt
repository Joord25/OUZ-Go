package expo.modules.ouzpose

import com.google.mlkit.vision.pose.PoseDetection
import com.google.mlkit.vision.pose.defaults.PoseDetectorOptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OuzPose : Module() {
  override fun definition() = ModuleDefinition {
    Name("OuzPose")

    Function("getMLKitInfo") {
      val options = PoseDetectorOptions.Builder()
        .setDetectorMode(PoseDetectorOptions.STREAM_MODE)
        .build()
      val detector = PoseDetection.getClient(options)
      detector.close()
      "Android: com.google.mlkit:pose-detection 링크됨, BlazePose 33pt 사용 가능"
    }

    // Phase 0b iOS 우선. Android 카메라 + pose 는 다음 세션.
    View(OuzPoseView::class) {
      Events("onPose")
    }
  }
}
