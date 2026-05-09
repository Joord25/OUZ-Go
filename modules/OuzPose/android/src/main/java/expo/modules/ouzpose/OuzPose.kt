package expo.modules.ouzpose

import com.google.mlkit.vision.pose.PoseDetection
import com.google.mlkit.vision.pose.defaults.PoseDetectorOptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.URL

class OuzPose : Module() {
  override fun definition() = ModuleDefinition {
    Name("OuzPose")

    Events("onChange")

    // Phase 0a 검증용: ML Kit 라이브러리가 실제로 링크되어 있는지 확인.
    // PoseDetector 클라이언트 생성을 시도 → 성공하면 ML Kit Pose Detection Android SDK 가
    // 우리 빌드에 정상 포함됨을 확인.
    Function("getMLKitInfo") {
      val options = PoseDetectorOptions.Builder()
        .setDetectorMode(PoseDetectorOptions.STREAM_MODE)
        .build()
      val detector = PoseDetection.getClient(options)
      detector.close()
      "Android: com.google.mlkit:pose-detection 링크됨, BlazePose 33pt 사용 가능"
    }

    AsyncFunction("setValueAsync") { value: String ->
      sendEvent("onChange", mapOf(
        "value" to value
      ))
    }

    // 후속 커밋: View 정의 + 카메라 + 실시간 pose detection 이벤트.
    View(OuzPoseView::class) {
      Prop("url") { view: OuzPoseView, url: URL ->
        view.webView.loadUrl(url.toString())
      }
      Events("onLoad")
    }
  }
}
