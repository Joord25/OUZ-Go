package expo.modules.ouzpose

import android.content.Context
import android.widget.TextView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

// Phase 0b: iOS 우선 검증. Android 카메라 + ML Kit pose 통합은 다음 세션.
// 현재는 placeholder TextView 만 표시 (Android 컴파일 보장).
class OuzPoseView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onPose by EventDispatcher()

  init {
    val placeholder = TextView(context).apply {
      text = "OuzPose Android — 다음 세션 구현 예정"
      textSize = 14f
    }
    addView(placeholder)
  }
}
