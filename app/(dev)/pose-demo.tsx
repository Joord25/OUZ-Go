import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import { useTensorflowModel } from 'react-native-fast-tflite';

// Phase 0 검증용 라우트.
// 목적: vision-camera + fast-tflite 가 우리 환경에서 작동하는지 단계별 확인.
// 추론/스켈레톤/카운트는 후속 커밋.

export default function PoseDemo() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  const model = useTensorflowModel(
    require('../../assets/models/pose_landmark_lite.tflite')
  );

  const [permRequested, setPermRequested] = useState(false);

  useEffect(() => {
    if (!hasPermission && !permRequested) {
      setPermRequested(true);
      requestPermission();
    }
  }, [hasPermission, permRequested, requestPermission]);

  const modelStatus =
    model.state === 'loaded'
      ? 'loaded ✓'
      : model.state === 'loading'
        ? 'loading...'
        : model.state === 'error'
          ? `error: ${model.error?.message ?? 'unknown'}`
          : 'idle';

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
        <Text style={styles.statusText}>📷 Camera: {hasPermission ? '권한 OK' : '권한 X'}</Text>
        <Text style={styles.statusText}>📱 Device: {device ? `${device.position}` : 'none'}</Text>
        <Text style={styles.statusText}>🧠 Model: {modelStatus}</Text>
        {model.state === 'loaded' && (
          <Text style={styles.statusText}>
            inputs: {model.model.inputs.length} / outputs: {model.model.outputs.length}
          </Text>
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
  statusText: {
    color: '#fff',
    fontSize: 14,
    marginVertical: 2,
  },
});
