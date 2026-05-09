Pod::Spec.new do |s|
  s.name           = 'OuzPose'
  s.version        = '1.0.0'
  s.summary        = 'OUZ-Go pose detection (Google ML Kit BlazePose 33pt)'
  s.description    = 'Custom Expo native module for real-time 33-keypoint pose detection on iOS using Google ML Kit Pose Detection.'
  s.author         = ''
  s.homepage       = 'https://github.com/Joord25/OUZ-Go'
  s.platforms      = {
    :ios => '15.5'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'GoogleMLKit/PoseDetection'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_VERSION' => '5.0'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
