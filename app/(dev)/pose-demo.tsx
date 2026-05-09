import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import OuzPose from '../../modules/OuzPose';

// Phase 0a 검증: 자체 native module (OuzPose) 가 ML Kit Pose Detection
// iOS / Android SDK 와 정상 빌드/링크 되었는지 확인.
//
// 후속 커밋:
//  - vision-camera frame processor 또는 OuzPose 자체 카메라 view 로
//    실시간 카메라 frame 받기
//  - native 측에서 ML Kit Pose Detector 에 frame 전달 → 33 landmarks
//  - JS 로 onPose 이벤트 emit
//  - Skia 33pt 스켈레톤 렌더 + 푸쉬업 state machine

export default function PoseDemo() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  const [permRequested, setPermRequested] = useState(false);
  const [mlkitInfo, setMlkitInfo] = useState<string>('호출 전');
  const [mlkitError, setMlkitError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasPermission && !permRequested) {
      setPermRequested(true);
      requestPermission();
    }
  }, [hasPermission, permRequested, requestPermission]);

  useEffect(() => {
    try {
      const info = OuzPose.getMLKitInfo();
      setMlkitInfo(info);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setMlkitError(message);
    }
  }, []);

  return (
    <View style={styles.container}>
      {hasPermission && device ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
        />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            {!hasPermission ? '카메라 권한 요청 중...' : '카메라 디바이스 없음'}
          </Text>
        </View>
      )}

      <View style={styles.statusOverlay}>
        <Text style={styles.statusTitle}>Phase 0a — Native Module 검증</Text>
        <Text style={styles.statusText}>📷 Camera: {hasPermission ? '권한 OK' : '권한 X'}</Text>
        <Text style={styles.statusText}>📱 Device: {device ? device.position : 'none'}</Text>
        <Text style={styles.statusText}>🧠 ML Kit:</Text>
        {mlkitError ? (
          <Text style={styles.errorText}>error: {mlkitError}</Text>
        ) : (
          <Text style={styles.statusText}>{mlkitInfo}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#222',
  },
  placeholderText: {
    color: '#fff',
    fontSize: 16,
  },
  statusOverlay: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
  },
  statusTitle: {
    color: '#FFA500',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    marginVertical: 2,
  },
  errorText: {
    color: '#FF6464',
    fontSize: 13,
  },
});
