# DEV_HANDOFF.md — OUZ Go (개발 핸드오프 문서)

> 작성일: 2026-05-09
> 대상: 임주용 (대표/트레이너, TS·React 익숙, RN 첫 경험) + 합류 예정 팀
> 기반: PRD v2.0 (2026-05-09) · CLAUDE.md
> 위치: `/Users/joord/Desktop/Joord/OUZ-Go/`

---

## 0. 이 문서를 어떻게 읽나

- 1번 (프로젝트 개요) → 5분 안에 "왜 / 무엇을" 잡기.
- 2번 (개발 환경 셋업) → macOS 위에서 따라 치면 그대로 됨.
- 3번 (Phase 0) → **이번 주에 실제로 할 작업**. 푸쉬업 1개를 카운트하는 데모까지.
- 4-6번 (Phase 1 / 1.5 / 2) → 아직 시작 X. 큰 그림.
- 7번 (RN 학습 가이드) → TS/React 머리에서 RN 머리로 변환.
- 8-9번 → 참고 자료 + 우리 팀 룰.

**일정·시간 추정은 모두 "대략" 라벨링.** 실제 진행 중 변경 가능.

**용어 라벨 규칙 (CLAUDE.md 1번):**
- **[검증]** = 외부 사례 또는 우리 측정으로 확인됨
- **[추정]** = 합리적 가정이지만 미검증
- **[결정]** = 우리 팀 결정 (검증되진 않았지만 일단 이렇게 간다)
- **[가설]** = 시작값일 뿐. Phase 0 측정 후 변경 가능 (PRD 부록 A 원칙)

---

## 1. 프로젝트 개요

### 1-1. 무엇을 만드는가

**Vision AI 운동 카운트 + 12명 그룹 vlog SNS** 의 네이티브 앱 (iOS + Android).

- 카메라가 자동으로 푸쉬업·스쿼트·런지·사이드 크런치·점프잭 5종을 30초 동안 카운트.
- 30초 끝 시점에 5초 영상 자동 추출.
- 친구 4-12명 그룹에 자동 공유 → 저녁 8시에 split-screen vlog 자동 합본.
- 사용자는 **편집·자랑·카운트를 직접 하지 않는다**. AI 가 다 한다.

상세 비전은 `PRD.md` 1-5절 참조.

### 1-2. 왜 Expo (Native) 로 피봇했나

PRD v1 은 Next.js Web 으로 시작했으나, v2 에서 **Expo + React Native** 로 피봇.

| 이유 | 내용 |
|---|---|
| **App Store / Play Store 등록** [결정] | SetLog 트렌드 탑승 = 스토어 등록이 필수. Web 은 X. |
| **카메라 frame processor 성능** [검증] | vision-camera 의 GPU thread frame processor = 실시간 ML 추론 안정 24+ FPS 가능 (PushUp Time 사례). Web getUserMedia + WASM 은 frame drop 잦음. |
| **단일 코드베이스** [검증] | Expo + EAS Build → iOS/Android 동시 빌드. 네이티브 진입 비용 ↓. |
| **APNs / FCM silent push** [검증] | Phase 2 vlog 그룹 알림은 native push 필수. PWA push 는 iOS 제약 큼. |

### 1-3. 왜 Google ML Kit (BlazePose 33pt)

- **PushUp Time 사례** [검증]: 동일 스택 (RN + ML Kit Pose) production 작동 확인.
- **on-device 무료** [검증]: 모델 ~6MB. 서버 비용 0.
- **MissionFit 데모 영상 7장** [검증]: 33pt 기반 카운트 알고리즘 (state machine + 임계 가로선) 작동 확인 (2026-05-08 분석).
- 대안 (MediaPipe 직접, VAY 자체 모델) → R&D 비용 큼. Phase 0 에서는 검증된 ML Kit 만.
- 대안 라이브러리 [추정]: `@gymbrosinc/react-native-mediapipe-pose` — Phase 0 에서 ML Kit plugin 빌드 실패 시 fallback.

### 1-4. 핵심 결정 5개 요약

1. **30초 시간 기반 세션** [결정] — 목표 reps 도달이 아니라 "30초 동안 최대한 많이". Tabata/HIIT 패러다임. 한국 헬린이 친화 [추정].
2. **카운트 알고리즘 = state machine + 임계 가로선** [검증, MissionFit 7장]. 사이클 1회 = 1 rep. 자세 리셋 메시지로 강제.
3. **카메라 angle 운동별 다름** [검증, MissionFit] — 푸쉬업·런지·사이드 크런치 = 측면 / 스쿼트·점프잭 = 정면.
4. **Phase별 백엔드 도입** [결정] — Phase 0~1 백엔드 0 (로컬). Phase 1.5 에 Firebase 도입. 쓸데없는 셋업 비용 0.
5. **가이드 영상 = 임주용 대표 자가 촬영** [결정] — 트레이너 정체성 자산. YouTube Shorts 호스팅 (CDN 비용 0).

### 1-5. 핵심 원칙 (PRD 부록 A 발췌)

> **평가 방식 자유 변경 가능.** 임계값·관절 각도·거리·시간은 자유 조합. Phase 0~1 동안 임주용 대표 직접 측정 → 튜닝. 사용자 데이터 누적 후 A/B 변경 가능. **이 문서의 코드는 시작 가설**이지 고정 사양이 아님.

---

## 2. 개발 환경 셋업 (macOS)

### 2-1. 사전 요구사항

| 항목 | 비용 | 시점 |
|---|---|---|
| Apple Developer Program | $99/년 | TestFlight 첫 배포 직전 (Phase 1 진입 시) |
| Google Play Console | $25 (일회) | Play Internal 배포 직전 (Phase 1 진입 시) |
| GitHub 계정 | 무료 | 즉시 |
| Expo 계정 (EAS Build) | 무료 (월 30 build) | 즉시 |
| Firebase 계정 | 무료 (Spark plan) | Phase 1.5 진입 시 |

**확인 필요 (대표님 결정):** Apple Developer 가입을 Phase 0 끝나기 전에 미리 할지 (인증 처리에 1-3일 소요), Phase 0 끝나고 검증 결과 본 뒤 할지. 기본 권장 = Phase 0 검증 성공 직후 가입.

### 2-2. 단계별 명령어

#### Step A. Node + Xcode + Android Studio

```bash
# Node 22 LTS (2026년 표준)
brew install node@22

# Xcode (App Store 에서 설치, ~10GB)
# 설치 후:
sudo xcode-select --install
sudo xcodebuild -license accept

# CocoaPods (iOS 네이티브 빌드)
sudo gem install cocoapods

# Android Studio (https://developer.android.com/studio)
# 설치 후 SDK / Emulator 설치 (Android 14, API 34 권장)
# ~/.zshrc 에 ANDROID_HOME 추가:
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
```

[검증 필요 (2026-05)]: Xcode / Android Studio 최신 버전 호환성. `npx expo-doctor` 로 확인.

#### Step B. Expo CLI + EAS CLI

```bash
npm install -g expo-cli eas-cli
eas login   # Expo 계정 로그인
```

#### Step C. iOS Simulator + Android Emulator 검증

```bash
# iOS Simulator (Xcode 함께 설치됨)
open -a Simulator

# Android Emulator (Android Studio AVD Manager 에서 Pixel 7 / API 34 생성)
emulator -list-avds
emulator -avd Pixel_7_API_34
```

#### Step D. 신규 프로젝트 생성

```bash
cd /Users/joord/Desktop/Joord/OUZ-Go
npx create-expo-app . --template tabs   # 현재 디렉토리에 생성
```

`--template tabs` = expo-router + 기본 탭 구조 포함 (PRD 7-3 컴포넌트 트리 준비).

#### Step E. 핵심 라이브러리 설치

```bash
# 카메라 + ML Kit
npx expo install react-native-vision-camera
npm install react-native-vision-camera-mlkit   # plugin
npx expo install react-native-worklets-core    # frame processor 의존

# 그래픽 (스켈레톤 렌더)
npx expo install @shopify/react-native-skia

# 음성 + 저장
npx expo install expo-speech
npx expo install @react-native-async-storage/async-storage

# 스타일링
npm install nativewind tailwindcss@3.4
# (NativeWind 4 셋업 추가 단계: app.json 수정 + babel.config.js 수정 — Expo 공식 가이드 참조)

# YouTube PIP (가이드 영상)
npm install react-native-youtube-iframe react-native-webview
```

[검증 필요 (2026-05)]: 위 라이브러리 버전들이 Expo SDK 53 와 호환되는지 `npx expo install --check` 로 확인. 버전 미스매치 시 즉시 수정.

### 2-3. **중요: vision-camera 는 Expo Go 미지원** [검증]

**Expo Go 앱 (앱스토어 무료)** 으로는 vision-camera frame processor 가 작동 X. 반드시 **dev build** 필요.

```bash
# dev build = "내 앱의 dev 버전"을 EAS 가 빌드해서 시뮬/디바이스에 설치
eas build:configure
eas build --profile development --platform ios
eas build --profile development --platform android

# 빌드 끝나면 EAS 가 QR / 다운로드 링크 줌 → 시뮬에 설치
```

빌드 시간 [추정]: 첫 빌드 약 15-25분 (EAS 무료 큐). 이후 코드 변경은 `npx expo start --dev-client` 로 hot reload.

### 2-4. 빠른 동작 확인

```bash
# Metro 번들러 시작
npx expo start --dev-client

# i = iOS 시뮬, a = Android 에뮬
# 터미널에서 키 누르면 dev build 가 자동으로 앱 열고 connect
```

`app/(tabs)/index.tsx` 텍스트 바꿔서 hot reload 작동하면 OK.

---

## 3. Phase 0 상세 — Vision AI 검증 (대략 1주, 백엔드 0)

**목표:** Expo + ML Kit + vision-camera 우리 환경에서 작동 검증. 푸쉬업 1개 카운트까지.

### 3-1. 검증 기준 (PRD 9절)

- [ ] 앱 실행 ≤ 5초
- [ ] 카메라 frame processor FPS ≥ 24
- [ ] 푸쉬업 카운트 정확도 ≥ 80% (10회 시도)
- [ ] iOS / Android 카메라 권한 정상 동작

### 3-2. Day-by-day (대략)

#### Day 1 — 프로젝트 init + dev build 첫 빌드

- 2-2 의 Step D, E 까지 완료.
- `eas build --profile development` iOS + Android 둘 다 빌드.
- 시뮬레이터에 설치 → tabs 템플릿이 뜨면 OK.
- **검증:** 앱 실행 ≤ 5초.

#### Day 2 — `app/(dev)/pose-demo.tsx` 라우트 + 카메라 권한

- `app/(dev)/pose-demo.tsx` 생성 (PRD 7-3).
- 카메라 권한 요청 + 카메라 preview 만 띄우기.
- iOS: `app.json` → `plugins` 에 `react-native-vision-camera` 추가 (`cameraPermissionText` 사유 작성).
- Android: 동일 plugin 옵션 → `permissions: ["android.permission.CAMERA"]` 자동.
- **검증:** 시뮬·에뮬에서 카메라 미리보기 나옴 (Mac 카메라 → iOS 시뮬 라우팅).

라우트 spec:

```typescript
// app/(dev)/pose-demo.tsx
// 책임: ML Kit + vision-camera 통합 검증용. production X.
// Props: 없음 (라우트)
// 화면 구조:
//   - 풀스크린 카메라
//   - Skia overlay = 33pt 스켈레톤
//   - 하단 카운트 텍스트 + "Reset" 버튼
//   - 우상단 FPS 디버그 텍스트
// 의존성: react-native-vision-camera, react-native-vision-camera-mlkit,
//         @shopify/react-native-skia, expo-speech
// Phase 1 진입 시 폐기 또는 production 컴포넌트로 흡수.
```

#### Day 3 — vision-camera frame processor + ML Kit pose plugin 통합

핵심 보일러플레이트 (의사 코드 + 실제 호출 형태):

```typescript
// app/(dev)/pose-demo.tsx (발췌)
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor } from "react-native-vision-camera";
import { useResizePlugin } from "vision-camera-resize-plugin";
import { detectPose } from "react-native-vision-camera-mlkit";
import { useSharedValue } from "react-native-worklets-core";

export default function PoseDemo() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");   // 측면 운동 = back, 정면 운동 = front (Phase 1)
  const poseShared = useSharedValue<Pose | null>(null);

  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";
    // ML Kit native plugin 호출 — frame 을 GPU thread 에서 직접 처리
    const result = detectPose(frame, { mode: "stream" });
    if (result?.landmarks) {
      poseShared.value = result;   // shared value → JS thread 와 공유
    }
  }, []);

  if (!hasPermission) return <PermissionPrompt onRequest={requestPermission} />;
  if (!device) return <NoCameraText />;

  return (
    <View style={{ flex: 1 }}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
        fps={30}
      />
      <PoseSkeleton pose={poseShared} />
      <RepCounterDebug pose={poseShared} />
    </View>
  );
}
```

[검증 필요 (2026-05)]: `react-native-vision-camera-mlkit` 의 정확한 API 시그니처 (위 `detectPose` 는 추정 형태). `npm view react-native-vision-camera-mlkit` 로 README 확인 후 수정.

- **검증:** Metro 콘솔에 `pose.landmarks.length === 33` 로그 찍힘.

#### Day 4 — Skia 33pt 스켈레톤 그리기

```typescript
// components/workout/vision/PoseSkeleton.tsx
import { Canvas, Circle, Line } from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";

const CONNECTIONS: [number, number][] = [
  [11, 12],  // 어깨-어깨
  [11, 13], [13, 15],  // 좌팔
  [12, 14], [14, 16],  // 우팔
  [11, 23], [12, 24],  // 어깨-엉덩이
  [23, 24],  // 엉덩이
  [23, 25], [25, 27],  // 좌다리
  [24, 26], [26, 28],  // 우다리
  // ...PRD 부록 A 의 BlazePose 33pt 인덱스 매핑 참고
];

export function PoseSkeleton({ pose }) {
  const points = useDerivedValue(() => {
    return pose.value?.landmarks ?? [];
  });

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      {CONNECTIONS.map(([a, b], i) => (
        <Line
          key={i}
          p1={{ x: points.value[a]?.x, y: points.value[a]?.y }}
          p2={{ x: points.value[b]?.x, y: points.value[b]?.y }}
          color="#FFA500"
          strokeWidth={3}
        />
      ))}
      {points.value.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={5} color="#00FF88" />
      ))}
    </Canvas>
  );
}
```

[추정]: ML Kit 의 landmark 좌표가 정규화 (0~1) 인지 픽셀인지에 따라 `frame size` 곱해야 함. 첫 빌드 후 콘솔에서 확인.

- **검증:** 시뮬에서 사람 비추면 스켈레톤이 따라옴. FPS ≥ 24.

#### Day 5 — RepCounter state machine (푸쉬업)

```typescript
// components/workout/vision/RepCounter.ts (의사 코드)
type State = "UP" | "DOWN" | "RESET";

class PushupRepCounter {
  private state: State = "RESET";
  private lastTransitionAt = Date.now();
  private repCount = 0;
  private downEnteredAt = 0;

  onPose(pose: Pose) {
    const elbowAngle = angleBetween(
      pose.LEFT_SHOULDER, pose.LEFT_ELBOW, pose.LEFT_WRIST
    );

    // RESET → UP: 팔 펴짐
    if (this.state === "RESET" && elbowAngle >= 160) {
      this.transition("UP");
    }
    // UP → DOWN: 팔 접힘
    else if (this.state === "UP" && elbowAngle <= 90) {
      this.transition("DOWN");
      this.downEnteredAt = Date.now();
    }
    // DOWN → UP: 다시 펴짐 = 1 rep!
    else if (this.state === "DOWN" && elbowAngle >= 160) {
      const repDuration = (Date.now() - this.downEnteredAt) / 1000;
      if (repDuration >= 0.8) {     // minRepDuration 체크
        this.repCount++;
        speak(`${this.repCount}`);   // expo-speech
      }
      this.transition("UP");
    }
  }

  private transition(next: State) {
    this.state = next;
    this.lastTransitionAt = Date.now();
  }
}
```

[가설]: `elbowAngle >= 160` / `<= 90` 임계값. PRD 부록 A 의 시작값. Phase 0 측정 후 변경 가능 (PRD "평가 방식 자유 변경 가능" 원칙).

- **검증:** 푸쉬업 10회 시도 → 정확도 ≥ 80% (8개 이상 카운트).

#### Day 6 — expo-speech 음성 카운트

```typescript
import * as Speech from "expo-speech";

function speakCount(n: number) {
  Speech.speak(String(n), {
    language: "ko-KR",
    pitch: 1.1,    // 밝은 톤
    rate: 1.0,
  });
}

// 마지막 5초 카운트다운 = 강한 톤
function speakCountdown(sec: number) {
  Speech.speak(String(sec), {
    language: "ko-KR",
    pitch: 1.3,
    rate: 1.2,
  });
}
```

[검증 필요]: iOS 시뮬은 TTS 음성 작동, 안드 에뮬은 환경에 따라 X. 실기기 검증 권장.

- **검증:** 푸쉬업 1회 → "하나" 음성 출력.

#### Day 7 — 통합 + 실기기 검증 + 회고

- iOS 실기기 (대표님 폰) + Android 실기기에서 dev build 검증.
- FPS / 정확도 측정 → 문서화.
- **Phase 1 진입 결정:** 검증 4개 기준 모두 통과 → 진입. 1개 미달 → 원인 분석 후 재시도 또는 fallback (MediaPipe direct).

### 3-3. Phase 0 산출물

- `app/(dev)/pose-demo.tsx` — 푸쉬업 카운트 데모.
- `components/workout/vision/PoseSkeleton.tsx` — Phase 1 재사용.
- `components/workout/vision/RepCounter.ts` — Phase 1 재사용.
- 측정 결과 메모 (정확도 / FPS / 임계값 튜닝값).

---

## 4. Phase 1 상세 — Vision AI 정식 통합 (대략 3-4주, 백엔드 0)

**목표:** 5종 운동 통합 + 30초 세션 + TestFlight/Play Internal 배포.

### 4-1. 컴포넌트 단위 spec

PRD 7-3 트리 기반. 각 컴포넌트의 책임/props/state/의존성.

#### `VisionWorkoutSession.tsx` — 메인 컨테이너

```typescript
type Props = {
  exerciseId: "pushup" | "squat" | "lunge" | "side_crunch" | "jumping_jack";
};
// State:
//   - phase: "preStart" | "countdown" | "active" | "complete"
//   - elapsedSec: number (0 → 30)
//   - repCount: number
// 책임:
//   - phase 머신 관리 (preStart → countdown → active → complete)
//   - 30초 타이머
//   - 좌/우 운동 (런지, 사이드 크런치) 의 좌 15초 + 우 15초 분할
// 의존성: PoseDetector, RepCounter, RepCountCard, ResetMessage, GuideVideoPip
```

#### `VisionPreStart.tsx` — 시작 전 가이드

```typescript
type Props = {
  exerciseId: string;
  onReady: () => void;
};
// 책임:
//   1. 카메라 angle 가이드 (정면/측면 — 운동별)
//   2. 거리 바 (DistanceBar) 정상 영역
//   3. 시작 트리거 (StartTriggerDetector — 팔꿈치-무릎 교차 2번)
//   4. "5,4,3,2,1, 시작!" expo-speech
```

#### `PoseDetector.tsx` — vision-camera + ML Kit 래퍼

```typescript
type Props = {
  cameraAngle: "front" | "side";   // exerciseDetectionConfig 에서
  onPose: (pose: Pose) => void;    // worklet → JS thread bridge
};
// State: 카메라 device, permission, frame processor
// 책임: vision-camera + ML Kit plugin 통합. Phase 0 의 pose-demo 코드 정리본.
```

#### `RepCounter.tsx` — state machine 카운트 로직

```typescript
type Props = {
  exerciseId: string;
  onRepCounted: (rep: { index: number; grade: "perfect" | "good" | "ok" }) => void;
};
// State: 현재 state (UP/DOWN/RESET), repCount
// 책임:
//   - exerciseDetectionConfig 에서 운동별 state 조건 로드
//   - 각 frame 마다 평가 → state 전환
//   - DOWN→UP 사이클 완료 = onRepCounted 호출
//   - resetMessage 노출 트리거 (자세 리셋 강제)
```

#### `ThresholdLine.tsx` — 임계 가로선 시각화 [검증 패턴]

```typescript
type Props = {
  exerciseId: string;
  pose: Pose;
};
// 책임: 운동별 임계 가로선을 화면에 그림.
//   - squat: 무릎 y 좌표 (LEFT_KNEE.y) 위치
//   - lunge: 발목 + offsetRatio (BACK_ANKLE.y * 0.7) 위치
//   - 기타 운동: 임계 가로선 없으면 null
// 시각: 주황 점선 (대기) / 녹색 실선 (통과 순간 펄스)
```

#### `ResetMessage.tsx` — "자세 리셋 대기 중" [검증 MissionFit 카피]

```typescript
type Props = {
  show: boolean;
  message: string;   // exerciseDetectionConfig.resetMessage
};
// 시각: 다크 박스 + 주황 테두리 + ⚠️ 아이콘 + 텍스트
// 트리거: state === "RESET" 일 때
```

#### `RepCountCard.tsx` — 하단 카드

```typescript
type Props = {
  reps: number;       // 카운트업
  remainSec: number;  // 카운트다운 30 → 0
};
// 단순 표시. 시각: PRD 5-1 ASCII UI 의 하단 카드.
```

#### `GuideVideoPip.tsx` — PIP 영상

```typescript
type Props = {
  youtubeId: string;  // 임주용 대표 자가 촬영 영상
};
// State: 위치 (드래그) — AsyncStorage 저장 / 로드
// 책임: react-native-youtube-iframe + 드래그 (react-native-gesture-handler / Animated)
// 무음 + 무한 루프
```

### 4-2. 5종 운동 통합 순서 [결정]

[추정]: 검증 난이도 + 가이드 영상 촬영 난이도 순.

1. **푸쉬업** (Phase 0 에서 검증 완료) — Day 1
2. **스쿼트** (정면 카메라, hip y < knee y, 단순) — Day 2-3
3. **점프잭** (정면 카메라, 손목 거리 + above head) — Day 4-5
4. **런지** (측면, 좌 15초 + 우 15초 분할 로직 추가) — Day 6-8
5. **사이드 크런치** (측면, 거리 기반 평가) — Day 9-10

### 4-3. 30초 시간 기반 세션 흐름

```
1. preStart phase
   - 거리 바 정상 + 카메라 angle 가이드
   - 시작 트리거 (팔꿈치-무릎 교차 2번)
2. countdown phase (5초)
   - "5, 4, 3, 2, 1, 시작!" expo-speech
3. active phase (30초)
   - RepCounter 활성
   - 좌/우 운동: 15초마다 음성 "좌측 끝, 이제 우측"
   - 마지막 5초 카운트다운 "5, 4, 3, 2, 1!"
4. complete phase
   - 30초 만료 시 자동 종료
   - 음성 "30초 동안 X개! 잘했어요"
   - 운동 기록 AsyncStorage 저장
   - "다시" / "다음 운동" 버튼
```

### 4-4. 카메라 angle 가이드 UX [검증 MissionFit]

운동 시작 전에 시각 + 음성 가이드:

| 운동 | 카메라 angle | 가이드 메시지 |
|---|---|---|
| 푸쉬업 | 측면 | "폰을 옆으로 두세요" + 측면 아이콘 |
| 스쿼트 | 정면 | "폰을 앞에 두세요" + 정면 아이콘 |
| 런지 | 측면 | "폰을 옆으로 두세요" |
| 사이드 크런치 | 측면 | "폰을 옆으로 두세요" |
| 점프잭 | 정면 | "폰을 앞에 두세요" |

[추정]: 자동 angle 감지 (어깨-엉덩이 정렬로 판정) → Phase 1 후반에 추가. 초반엔 사용자 수동 확인.

### 4-5. AsyncStorage 스키마 (Phase 1 — 백엔드 0)

```typescript
// 운동 기록 1개 = 1 row
type WorkoutRecord = {
  id: string;             // uuid
  exerciseId: string;     // "pushup" 등
  reps: number;
  durationSec: number;    // 보통 30
  completedAt: number;    // unix ms
  config: {
    minRepDuration: number;
    threshold: any;       // 당시 임계값 스냅샷 (튜닝 대비)
  };
};

// AsyncStorage key
const KEY_RECORDS = "ouz:workouts:v1";
const KEY_PIP_POSITION = "ouz:pip-pos:v1";
const KEY_USER_BASELINE = "ouz:user-baseline:v1";   // 부록 B
```

Phase 1.5 에 Firestore 마이그레이션 (5번 절).

### 4-6. TestFlight + Play Internal 배포 흐름

```bash
# preview build (release 모드, dev menu X)
eas build --profile preview --platform ios
eas build --profile preview --platform android

# iOS: TestFlight 업로드
eas submit --platform ios --latest

# Android: Play Internal 업로드
eas submit --platform android --latest --track internal
```

`eas.json` 의 `submit` 섹션에 Apple Connect / Play Console 정보 사전 입력.

[검증 필요]: 첫 TestFlight 등록 = Apple 심사 1-3일 [추정]. App Store 정식 출시 X (Phase 2 까지 보류).

친구 20명 분배:
- iOS: TestFlight 그룹 초대 링크
- Android: Play Internal 테스터 이메일 등록 + 옵트인 링크

### 4-7. 임주용 대표 가이드 영상 5종 자가 촬영

각 운동 30초 내외, 16:9 가로형. YouTube Shorts 업로드 → ID 만 코드에서 사용:

```typescript
const GUIDE_VIDEOS = {
  pushup: "abc123",
  squat: "def456",
  lunge: "ghi789",
  side_crunch: "jkl012",
  jumping_jack: "mno345",
};
```

**확인 필요 (대표님 결정):** 5종 영상 촬영을 Phase 1 시작 전에 완료할지, Phase 1 진행 중에 병행할지. 권장 = Phase 0 검증 완료 직후 1주일 안에 5개 일괄 촬영.

---

## 5. Phase 1.5 — Firebase 도입 (대략 1-2주)

**목표:** 로컬 → 클라우드 마이그레이션. Auth + Firestore 만 (Storage / Functions 는 Phase 2).

### 5-1. 셋업 흐름

```bash
npm install @react-native-firebase/app @react-native-firebase/auth @react-native-firebase/firestore

# Firebase Console 에서:
# 1. 프로젝트 생성 (ouz-go-prod)
# 2. iOS 앱 등록 → GoogleService-Info.plist 다운 → ios/ 에 추가
# 3. Android 앱 등록 → google-services.json 다운 → android/app/ 에 추가
# 4. Auth → Google sign-in 활성화
# 5. Firestore → 시작 (us-central1 또는 asia-northeast3 서울)
```

[검증 필요 (2026-05)]: `@react-native-firebase` v22+ Expo SDK 53 호환. `app.json` plugins 에 추가 필요.

### 5-2. 로컬 → 클라우드 마이그레이션 (대략 50줄)

```typescript
// hooks/useMigrateLocalToCloud.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import auth from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";

const KEY_MIGRATED = "ouz:migrated:v1";

export async function migrateLocalToCloudOnce() {
  if (await AsyncStorage.getItem(KEY_MIGRATED)) return;

  const user = auth().currentUser;
  if (!user) return;   // 로그인 안 된 상태면 skip

  const raw = await AsyncStorage.getItem("ouz:workouts:v1");
  if (!raw) {
    await AsyncStorage.setItem(KEY_MIGRATED, "true");
    return;
  }

  const records: WorkoutRecord[] = JSON.parse(raw);
  const batch = firestore().batch();
  const userWorkouts = firestore().collection("users").doc(user.uid).collection("workouts");

  records.forEach((r) => {
    batch.set(userWorkouts.doc(r.id), {
      ...r,
      uid: user.uid,
      migratedAt: firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
  await AsyncStorage.setItem(KEY_MIGRATED, "true");
}
```

### 5-3. Firestore 보안 규칙 (시작 가설)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/workouts/{wid} {
      allow read, write: if request.auth.uid == uid;
    }
    // vlog_groups 는 Phase 2 에서 추가
  }
}
```

[가설]: Phase 2 vlog 그룹 규칙은 그룹 멤버십 체크 추가 필요.

---

## 6. Phase 2 개요 — Vlog 그룹 (대략 4-6주)

상세 spec 은 Phase 1 검증 후 별도 문서. 여기서는 아키텍처 outline 만.

### 6-1. 영상 녹화 + peak rep 추출

- **vision-camera recordVideo** — 운동 시작 시 녹화 시작, 30초 끝에 stop.
- **peak rep 시점 5초 추출** — RepCounter 가 각 rep timestamp 저장 → 가장 빠른/안정적 rep ±2.5초 = 5초 클립.
- 추출은 native (AVFoundation iOS / Camera2 Android) 또는 ffmpeg-kit RN. Phase 2 진입 시 결정.

### 6-2. Firebase Storage + APNs/FCM

- 5초 클립 → Firebase Storage 업로드 (1주일 자동 삭제 lifecycle rule).
- Cloud Functions trigger → 그룹 멤버에게 silent push (APNs/FCM via @react-native-firebase/messaging).

### 6-3. Split-screen vlog 합본 (Cloud Functions)

- 저녁 8시 cron Cloud Function.
- 그룹의 그날 vlog post 들을 ffmpeg 으로 2열×6행 합본.
- 결과 영상을 Storage 에 업로드 + 그룹 멤버에게 알림.

[추정]: ffmpeg Cloud Functions 비용 = 사용자 100명 × 그룹 평균 5명 × 5초 클립 6개 = 약 일 30분 ffmpeg 시간. Spark plan 무료 한도 안. Blaze plan 전환 시점 = DAU 1000 이상.

### 6-4. App Store / Play Store 등록

- App Store: 카메라 권한 사유 명확 / 가이드라인 4.0 (디자인) + 5.1.1 (privacy) 사전 검토.
- Play Store: data safety form / 카메라 sensitive permission 사유.
- 심사 기간 [추정]: iOS 1-3일, Android 즉시~1일.

---

## 7. RN 학습 가이드 — TS/React 익숙한 사람 대상

### 7-1. 핵심 차이점 5개

| 영역 | Web (React) | RN (Expo) |
|---|---|---|
| **DOM 요소** | `<div>`, `<span>`, `<p>`, `<img>` | `<View>`, `<Text>`, `<Image>`, `<ScrollView>` (모든 텍스트는 `<Text>` 안에 있어야 함!) |
| **스타일** | CSS / Tailwind / styled-components | StyleSheet 객체 / NativeWind (Tailwind for RN) |
| **레이아웃** | flexbox + grid + position | flexbox 만 (default `flex-direction: column`, web 은 `row`) |
| **이벤트** | onClick, onChange | onPress, onChangeText |
| **라우팅** | Next.js Router | Expo Router (file-based, Next.js 와 거의 동일) |
| **빌드** | webpack/vite → 정적 HTML | Metro → JS bundle + native shell |

#### `<View>` vs `<div>`

```tsx
// Web
<div className="flex flex-col gap-4 p-4">
  <p>Hello</p>
  <img src="..." />
</div>

// RN (NativeWind 4)
<View className="flex flex-col gap-4 p-4">
  <Text>Hello</Text>
  <Image source={{ uri: "..." }} />
</View>
```

**Gotcha:** RN 은 모든 텍스트가 `<Text>` 안에 있어야 함. `<View>{"hello"}</View>` 는 런타임 에러.

#### StyleSheet vs CSS

```tsx
// Web Tailwind
<div className="bg-orange-500 text-white">

// RN NativeWind 4 (동일하게 작동)
<View className="bg-orange-500">
  <Text className="text-white">

// RN StyleSheet (전통 방식, NativeWind 안 쓸 때)
const styles = StyleSheet.create({
  card: { backgroundColor: "#FFA500", padding: 16 },
  text: { color: "#fff" },
});
<View style={styles.card}>
  <Text style={styles.text}>...</Text>
</View>
```

NativeWind 4 권장 [결정] (TS/React 친화).

### 7-2. Expo Router vs Next.js Router

거의 동일.

```
app/
├── (tabs)/             ← 그룹 라우트 (Next 의 (group) 동일)
│   ├── _layout.tsx     ← 탭 레이아웃 (Next 의 layout.tsx)
│   ├── index.tsx       ← /
│   └── settings.tsx    ← /settings
├── workout/[exerciseId].tsx   ← /workout/pushup (dynamic)
└── (dev)/pose-demo.tsx        ← /pose-demo (dev 용 그룹)
```

차이:
- Next 의 server component → RN 은 모두 client (서버 X).
- Link: `<Link href="/workout/pushup">` 동일.
- params: `import { useLocalSearchParams } from "expo-router"`.

### 7-3. React Hooks — RN 동일 / 차이점

대부분 동일. 차이:

- `useEffect` 동일.
- `useRef` 동일.
- **`react-native-reanimated`** = animation 전용 hook (`useSharedValue`, `useDerivedValue`, `useAnimatedStyle`). worklet (UI thread 함수) 개념. vision-camera frame processor 가 worklet 사용.
- **`react-native-worklets-core`** = vision-camera 의 GPU thread 와 JS thread 사이 shared value bridge.

worklet = "이 함수는 UI thread / GPU thread 에서 직접 실행됨" 의미. 함수 첫 줄에 `"worklet";` 지시어. 일반 JS function 처럼 보이지만 closure / async 제약 있음.

### 7-4. Native module 개념 — 대부분의 시간엔 JS 만

- **JS 코드 (TS)** = 우리가 99% 작성하는 것. 비즈니스 로직, UI, hooks.
- **Native code (Obj-C / Swift / Kotlin)** = 라이브러리 작성자가 작성. 우리는 import 만.
- 우리 프로젝트에서 native 코드 직접 작성할 일 = **거의 없음**. vision-camera, ML Kit plugin, expo-speech 모두 native 미리 작성됨.
- 단, native dep 추가 시 `npx expo prebuild --clean` 필요할 수 있음 (자동 또는 수동 ios/android/ 디렉토리 생성).

### 7-5. 추천 학습 순서 (대략 1-2주 자투리 시간)

1. **공식 튜토리얼** (Expo) — https://docs.expo.dev/tutorial/introduction/ — 4시간
2. **React Native Express** — https://www.reactnative.express/ — 2시간 훑기
3. **Expo Router 공식** — https://docs.expo.dev/router/introduction/ — 1시간
4. **react-native-vision-camera 문서** — https://react-native-vision-camera.com/ — 2시간
5. **react-native-skia 데모** — https://shopify.github.io/react-native-skia/ — 1시간
6. **`@shopify/react-native-skia` + `react-native-reanimated` 블로그** — frame processor + worklet 이해

권장: Phase 0 진행하면서 막히는 부분만 이때 학습. 책상에 앉아서 다 읽지 말고 dirty hand approach.

---

## 8. 참고 자료

### 공식 문서
- **Expo:** https://docs.expo.dev/
- **react-native-vision-camera:** https://react-native-vision-camera.com/
- **react-native-vision-camera-mlkit:** https://github.com/yasintorun/react-native-vision-camera-mlkit (저장소 정확 여부 [검증 필요 2026-05])
- **Google ML Kit Pose Detection:** https://developers.google.com/ml-kit/vision/pose-detection
- **MediaPipe Pose Landmarker (BlazePose 원본):** https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
- **expo-speech:** https://docs.expo.dev/versions/latest/sdk/speech/
- **Expo Router:** https://docs.expo.dev/router/introduction/
- **NativeWind 4:** https://www.nativewind.dev/
- **@shopify/react-native-skia:** https://shopify.github.io/react-native-skia/
- **EAS Build:** https://docs.expo.dev/build/introduction/
- **@react-native-firebase:** https://rnfirebase.io/

### 한국 RN 커뮤니티
- **React Native Korea** — https://reactnative.kr/
- **카카오 / 토스 RN 사례** — 블로그 검색 ("토스 react native")

### 직접 참고 사례
- **PushUp Time** — App Store 검색. RN + ML Kit Pose 동일 스택 production [검증 PRD v2].
- **MissionFit** — https://www.missionfit.re.kr/ — 카운트 알고리즘 (state machine + 임계 가로선) 시각 패턴 출처 [검증 7장 데모 영상 2026-05-08].
- **SetLog** — 카테고리 비교 / 12명 그룹 패러다임.
  - https://play.google.com/store/apps/details?id=com.newchat.setlog
  - https://apps.apple.com/us/app/setlog/id6587576438

### 한국 오픈소스 (Vision AI 운동 — 학습용)
- HELF (SSAFY 6기): https://github.com/ehhclaire/HELF
- MyPT: https://github.com/osamhack2021/AI_APP_MyPT_StrongFriends

---

## 9. 개발 룰 — 검증된 사실 vs 추정 vs 우리 결정

### 9-1. CLAUDE.md 핵심 (필수 숙지)

1. **Think Before Coding**
   - 가정은 명시. 불분명하면 멈추고 질문.
   - 검증된 사실 / 추정 / 일반 패턴 = 3개 따로. 절대 conflate X.
   - 모르면 "I don't know" 라고 말함.
2. **Simplicity First**
   - 요청 안 한 기능 추가 X.
   - 일회용 코드에 추상화 X.
   - 200줄 → 50줄 가능하면 다시 써라.
3. **Surgical Changes**
   - 인접 코드 "개선" X. 형식·주석·리팩터 손대지 마라.
   - 매 변경 라인은 사용자 요청에 직접 추적 가능해야 함.
4. **Goal-Driven Execution**
   - 검증 기준 명시. "make it work" 같은 약한 기준 X.
   - 매 step → verify check.

### 9-2. 우리 프로젝트만의 룰

- **임계값은 시작 가설** (PRD 부록 A): `elbowAngle 90/160`, `minRepDuration 0.8s` 등은 모두 시작값. Phase 0 측정 후 변경 가능. 코드에 `// [가설] Phase 0 측정 필요` 주석 권장.
- **평가 방식 자유 변경 가능** (PRD 부록 A): 임계점 / 각도 / 거리 / 시간 자유 조합. `exerciseDetectionConfig.ts` 의 `StateCondition` union type 활용.
- **카메라 angle 운동별 다름** [검증]: 절대 통일 X. front / side 분기 유지.
- **이모지 X** (`feedback_no_emoji`): 코드 / UI / 커밋 메시지 / 회의록 모두 X. (단, PRD 의 ⚠️ 같은 시각 마커는 UI 디자인 의도이므로 예외 — 디자인 시스템에 명시.)
- **회의록 의무** (`feedback_meeting_log.md`): 큰 결정 = 별도 .md 로 기록.
- **UI 카피 마이너스 X** (`feedback_product_positioning.md`): "안 했네요" 같은 마이너스 톤 금지. "한 번 더 가요!" 같은 플러스.
- **다음 단계 1-2 선제 제안** (`feedback_proactive_followup.md`): 작업 끝 → 다음 1-2개 제안.

### 9-3. 검증 필요 항목 (2026-05 시점)

이 문서 작성 시점 [추정] 인 항목들. Phase 0 진행 중 실제 확인 필요:

- [ ] `react-native-vision-camera-mlkit` plugin 의 정확한 패키지명 + API 시그니처.
- [ ] Expo SDK 53 와 vision-camera / Skia / Firebase 호환 버전 매트릭스.
- [ ] iOS 시뮬에서 카메라 입력 (Mac 카메라 → 시뮬 라우팅) 안정성.
- [ ] ML Kit landmark 좌표 정규화 (0~1) vs 픽셀 — 시각화 시 frame size 곱 필요 여부.
- [ ] Android 에뮬에서 expo-speech 한국어 보이스 작동 여부 (실기기 fallback 권장).
- [ ] EAS Build 무료 큐 대기 시간 (혼잡 시간대).

### 9-4. 확인 필요 (대표님 결정 대기)

- Apple Developer 가입 시점 (Phase 0 전 vs Phase 0 후).
- 가이드 영상 5종 촬영 시점 (Phase 0 직후 일괄 vs Phase 1 병행).
- TestFlight 친구 20명 명단 (Phase 1 후반).
- Firebase 도입 시점이 Phase 1 후반 vs Phase 2 직전 — 운동 기록 누적 양에 따라 결정.
- 초기 출시 영문권 포함 여부 (Phase 2 App Store 등록 시).

---

**문서 버전:** v1.0 (Phase 0 시작 직전 핸드오프)
**작성:** 임주용 × Claude
**다음 업데이트:** Phase 0 완료 시점 (대략 2026-05-16)
