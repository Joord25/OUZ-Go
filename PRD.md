# PRD — OUZ Go

**Vision AI 운동 카운트 + 12명 그룹 vlog SNS**

> 작성일: 2026-05-06
> 작성: 임주용 (대표) × Claude Code
> 위치: `/Users/joord/Desktop/Joord/OUZ-Go/`
> 본 앱과 분리된 신규 프로젝트 (오운잘 ohunjal-ai 와 별개 또는 향후 통합)

---

## 1. 비전 / 미션

**"운동 싫어하는 한국 사람들이 친구 12명 그룹과 자연스럽게 운동하고 자랑하는 vlog 앱."**

- 한국 Z세대가 SetLog 로 *일상*을 공유하듯, OUZ-Go 는 *운동*을 공유.
- Vision AI 가 자동으로 카운트 → 5초 영상 자동 추출 → 그룹 split-screen vlog 자동 합본.
- 사용자가 직접 편집 / 자랑 / 카운트 X. **AI 가 다 한다**.

---

## 2. 배경 — 진단

### 2-1. 본질적 욕구 3가지 (마케팅 회의 결과, 2026-05-06)

| 욕구 | 진짜 원함 |
|---|---|
| **꿀빨이** | 적은 input, 큰 output. 시간 ↓ × 효과 ↑ |
| **자랑** | 같은 부족(tribe) 인정 |
| **유산** | 정체성 · 증거 누적 |

> Seth Godin (*This Is Marketing*, Ch.6 — Tribes): "사람들은 자기와 같은 사람들과 연결되고 싶어한다."

### 2-2. DAN(Do Absolutely Nothing) 본능

운동 싫은 사람의 진짜 욕구 = 운동 자체가 싫은 게 아니라 **운동에 따라오는 비용**이 싫음:

- 결정 피로 (뭘 할지 모름)
- 시간 (1시간 부담)
- 사회적 부담 (헬스장 사람 시선)
- 결과 불확실성 (해도 효과 있나)
- 죄책감 (안 한 날 자책)

→ OUZ-Go 미션 재정의: **"운동을 시키는 앱"이 아니라 "운동의 비용을 0에 가깝게 만드는 앱"**

---

## 3. 시장 분석

| 경쟁자 | 카테고리 | 강점 | 우리 대비 약점 |
|---|---|---|---|
| **MissionFit** (한국, .re.kr) | Vision AI 미션 플랫폼 | 카메라 자세 분석 33pt | B2B 추정, 일반 유저 X, vlog X |
| **Onyx Fitness** (글로벌) | Vision AI 운동 앱 | 3D pose, 리더보드 | 영문권 한정 |
| **Kemtai** (B2B 의료) | Vision AI 재활 | 의료 정확도 | B2B 한정, 가격 X |
| **VAY Sports** (글로벌) | Vision AI 자체 모델 | 2D→3D 변환 | R&D 비용 큼, 영문권 |
| **SetLog** (한국, newchat) | 일상 vlog SNS | Z세대 1위, 12명 그룹 | 운동 X |
| **Strava** (글로벌) | 러닝/사이클 결과 카드 | 글로벌 대표 | 영상 X, 그룹 vlog X |

→ **OUZ-Go 카테고리 = "Vision AI 운동 vlog 그룹 SNS" (한국 + 글로벌 모두 비어있음)**

> April Dunford (*Obviously Awesome*, Ch.5): 카테고리 비교 우위는 *기존 카테고리 안에서 한 가지 명확한 superpower* 로 결정. 우리 superpower = **"카운트도 자랑도 vlog도 자동"**.

---

## 4. 타겟 페르소나

### Primary — "운동 의지 약한 한국 20-30대"
- 헬스장 다님 (또는 다닐 의향)
- 의지 박약 — 작은 마찰에도 안 감
- 친구 그룹 4-12명 있음 (회사 부서, 동호회, 지인)
- 인스타 / 카톡 셰어 활발
- Vision AI · BeReal · SetLog 같은 트렌드 익숙

### Secondary — "운동 시작하고 싶지만 부담 큰 헬린이"
- 운동 안 했음
- 헬스장 가기 부담 (사회적 시선)
- 홈트 / 맨몸 운동 관심
- 친구가 권유하면 따라옴

> Kevin Kelly ([1000 True Fans](https://kk.org/thetechnium/1000-true-fans/)): 운동 안 하는 사람 99% 무시. **이미 시작한 1000명** 의 retention 강화.

---

## 5. 핵심 기능

### 5-1. Vision AI 자동 카운트 (Phase 1 — MVP)

#### 적용 범위
- **맨몸운동 5종** (Phase 1) — 푸쉬업, 스쿼트, 런지, 사이드 크런치, 점프잭
- 카메라 angle 운동별 다름 (정면 / 측면) — MissionFit 검증 패턴

#### 기술
- **Google ML Kit Pose Detection** (BlazePose 33pt, on-device, 무료)
- react-native-vision-camera-mlkit plugin
- 서버 비용 0 (Phase 0~1)
- iOS + Android native (Expo)

#### 세션 패러다임 — 시간 기반 30초 (확정)
- 목표 reps 도달 X → **30초 동안 최대한 많이** (Tabata/HIIT 식)
- 카운트는 카운트업 (0 → ?) + 시간은 카운트다운 (30 → 0)
- 좌/우 양쪽 운동 (런지, 사이드 크런치) = 좌 15초 + 우 15초

#### 시작 흐름
```
1. 카메라 ON → 거리 가이드 자동 측정 (양팔 옆으로 펼침)
2. 거리 OK + keypoint 인식 OK → 시작 트리거 안내
3. 시작 트리거: 팔꿈치 ↔ 무릎 교차 2번 (웜업 톤)
4. 음성 "5, 4, 3, 2, 1, 시작!"
5. 자동 카운트 시작:
   - 카운트업 음성 ("하나, 둘, 셋...")
   - 30초 카운트다운 (시각 + 마지막 5초 음성 "5, 4, 3, 2, 1")
6. 30초 만료 → 자동 완료 → "30초 동안 X개!"
7. 운동 끝 5초 영상 자동 추출 → 그룹에 공유 (Phase 2)
```

#### 카운트 평가 (검증된 MissionFit 패턴 + 우리 자체 설계)

| 축 | 방식 | 사례 | 출처 |
|---|---|---|---|
| **State machine** | DOWN→UP 사이클 1회 = 1 rep | "자세 리셋 대기 중" 메시지로 강제 | ✓ MissionFit 검증 |
| **임계 가로선** | keypoint y 좌표가 임계선 통과 | 스쿼트 = hip y < 무릎 y | ✓ MissionFit 검증 |
| **카메라 angle 분기** | 정면 / 측면 운동별 | 푸쉬업 = 측면, 스쿼트 = 정면 | ✓ MissionFit 검증 |
| **자세 평가** | 각도 보충 | 무릎 각도 < 110° = Perfect | 우리 자체 설계 |
| **속도 검증** | minRepDuration | 1 rep < 0.8초 = "천천히" | 우리 자체 설계 |
| **시각 피드백** | 주황(대기) → 녹색(성공) 2색 | 녹색 원 펄스 = 카운트 | ✓ MissionFit 검증 |

#### 4단계 판정 (우리 자체 설계 — MissionFit은 2색만 검증됨)

| 등급 | 조건 | 카운트 | 음성 |
|---|---|---|---|
| **Perfect** | DOWN 임계 깊이 ✓ + 각도 ✓ + 속도 ✓ | +1 | "하나" (밝은 톤) |
| **Good** | DOWN 임계 ✓ + 각도 부분 | +1 | "조금 더 깊게" |
| **OK** | DOWN 임계 ✓ + 속도 빠름 | +1 | "천천히" |
| **Invalid** | DOWN 임계 미달 | 0 | "자세 리셋 대기 중" 메시지 |

→ 카운트는 너그럽게, 코칭은 정확하게.

#### UI 디자인

```
┌────────────────────────┐
│ [거리 바]               │ ← 상단 50px (포지셔닝)
├────────────────────────┤
│                         │
│  [카메라 풀스크린]       │
│  [33pt 스켈레톤 (Skia)]  │
│  ━━━━━━━━━━━━━━━━━━━   │ ← 임계 가로선 (검증된 패턴)
│  ◯ 주황(대기)/녹색(성공) │ ← 시각 마커
│                         │
│  ┌────────────────┐     │
│  │ ⚠️ 자세 리셋    │     │ ← 자세 리셋 메시지 (필요 시)
│  │  대기 중       │     │   (검증된 MissionFit 패턴)
│  └────────────────┘     │
│                         │
│           ┌───────┐     │
│           │ 가이드│     │ ← 우하단 PIP (드래그)
│           │ 영상  │     │   YouTube Shorts (무음, 무한 루프)
│           └───────┘     │
│                         │
├────────────────────────┤
│ ╔═══╗      ╔══════╗    │
│ ║ 03║      ║00:24 ║    │ ← 하단 카드
│ ╚═══╝      ╚══════╝    │   Reps = 카운트업, Time = 카운트다운
│ Reps↑       Time↓ 30s   │
└────────────────────────┘
```

### 5-2. 운동 vlog 그룹 SNS (Phase 2 — 핵심 BM)

#### 핵심 컨셉
**SetLog 패턴을 운동에 응용** — 매시간 알림 X, 운동 끝 시점만 자동 추출.

#### 흐름
```
1. 친구 4-12명 그룹 형성 (카톡 링크 / 코드)
2. 누가 운동 시작 → Vision AI 카운트 + 동시 영상 녹화 (vision-camera recordVideo, AVFoundation/Camera2)
3. 운동 끝 (30초) → peak rep 시점 5초 영상 자동 추출
4. 그룹에 silent push ("홍길동이 30초 동안 푸쉬업 30개 함") — APNs/FCM
5. 하루 끝 (저녁 8시) → 그룹의 그날 운동 자동 split-screen vlog (Cloud Functions)
6. SNS 셰어 (인스타 릴스 native share sheet / 카톡 expo-sharing)
```

#### 그룹 정책

| 항목 | 정책 |
|---|---|
| **최대 인원** | 12명 (SetLog 동일) |
| **최소 인원** | 1명 (혼자도 작동 — 개인 vlog) |
| **초대** | 카톡 링크 / 코드 (closed only) |
| **공개 그룹** | X — 모르는 사람 섞임 X |
| **그룹당 1유저 가입 한도** | 5개 (알림 spam 방지) |

#### Vlog UI — 12명 split-screen

**옵션 A: 2열 × 6행** (모바일 9:16 자연 fit)

```
┌────────┬────────┐
│ 홍길동  │ 김철수  │   각 칸: 50% × 16%
├────────┼────────┤   가로형 영상
│ 박영희  │ 이지원  │
├────────┼────────┤
│ ...    │ ...    │
├────────┼────────┤
│ ...    │ ...    │
├────────┼────────┤
│ ...    │ ...    │
├────────┼────────┤
│ 안 함   │ 안 함   │  ← FOMO (안 한 사람도 노출)
└────────┴────────┘
```

#### 알림 정책
- 운동 끝 → silent push (그룹 멤버에게 무음 알림)
- 저녁 8시 → 하루 요약 1회 ("오늘 우리 그룹 5명 운동")
- 개별 알림 끄기 가능

### 5-3. 비동기 친구 챌린지 (Phase 1.5 — 선택)

```
홍길동이 푸쉬업 50개 함 → 셰어 카드 → 친구 클릭
→ 같은 운동 동일 환경 → 결과 비교 카드 자동
```

- Critical mass 0 (1:1 만 작동)
- 시간 약속 X (각자 편한 시간)
- Phase 2 (vlog 그룹) 이 자연 포함하므로 우선순위 낮음

---

## 6. UX/UI 디자인 가이드

### 6-1. 음성 가이드 (expo-speech 단독)

**4 카테고리 (시작 가이드 / 카운트 / 자세 피드백 / 세트 종료) 모두 expo-speech**

- 한국어 자연어 ("벌써 30초 가까이!" / "한 번 더 가요!")
- iOS Siri 한국어 보이스 / 안드 Google TTS — native 직접 호출
- 화면 텍스트 X — 카운트 음성만
- PIP 영상 = 무음 (음성 채널 우리 가이드 단독)
- 30초 카운트다운 마지막 5초 = 강한 톤 음성 ("5, 4, 3, 2, 1!")

### 6-2. 시작 트리거 — 팔꿈치 ↔ 무릎 교차 2번

- 웜업 톤 (운동 시작 분위기)
- 일상 동작과 안 겹침 (우연 트리거 0)
- 첫 사용자는 시각 데모 PIP 0.5초 미리보기로 학습 (반복 재생)
- 누운 자세 운동은 폴백 (예: "양손 흔들기")

### 6-3. 거리 가이드

- 양팔 옆으로 펼침 → 양 손목 keypoint 가 화면 폭의 60-90% 점유 시 적정
- 음성: "뒤로 물러서세요" / "조금 가깝게" / "좋아요"
- 사용자별 비례 자동 캘리브레이션 (어깨/엉덩이/발목 baseline) — 부록 B 참고
- 운동별 카메라 angle 가이드 (검증된 패턴): 정면 또는 측면. 시작 화면에 표시 (예: "측면으로 폰을 두세요")

### 6-4. 시각 피드백 패턴 (검증된 MissionFit 패턴 + 우리 보강)

| 상태 | 시각 | 출처 |
|---|---|---|
| 대기 | 주황색 원 (목표 keypoint 위치 마커) | ✓ 검증 |
| 임계 가로선 | 주황 점선 또는 실선 (운동별 위치) | ✓ 검증 |
| 도달 (성공) | 녹색 원 펄스 0.3s | ✓ 검증 |
| **자세 리셋 강제** | 다크 박스 + 주황 테두리 + ⚠️ + "자세 리셋 대기 중" | ✓ 검증 (MissionFit 정확 카피) |
| 부족 (Invalid) | 빨간 원 (잠깐) | 우리 보강 |

### 6-5. PIP 가이드 영상

- **가이드 영상 = 임주용 대표 직접 촬영** (트레이너 정체성 자산)
- 호스팅: 임주용 대표 YouTube Shorts → ID 사용 (CDN 비용 0)
- 운동 5종 × 1개 영상 = Phase 1 시작 전 5개 자가 제작
- 우하단 코너 (드래그 위치 이동, AsyncStorage 저장)
- 라이브러리: `react-native-youtube-iframe`
- 무음 + 무한 루프
- 닫기 X 버튼 (사용자 자유)
- 우상단 [▶ 가이드] 버튼으로 다시 띄우기

---

## 7. 기술 스택 / 아키텍처

### 7-1. 프론트엔드 (Native — Expo)

```
- Expo SDK 53+ + React Native + TypeScript (strict)
  - 단일 코드베이스 → iOS + Android 동시 빌드
  - EAS Build → TestFlight / Play Internal → App Store / Play Store
- NativeWind 4 (Tailwind for RN)
- react-native-vision-camera
  - frame processor (GPU thread, 실시간 ML 추론)
  - recordVideo (AVFoundation / Camera2 native)
- Google ML Kit Pose Detection (BlazePose 기반)
  - react-native-vision-camera-mlkit plugin
  - 33 keypoint, on-device 추론 (모델 ~6MB)
  - PushUp Time 동일 스택 (production 검증)
- expo-speech (iOS/Android native TTS, 한국어)
- expo-router (file-based 라우팅)
- AsyncStorage / MMKV (Phase 0~1 로컬 저장)
```

### 7-2. 백엔드 (Phase별 도입)

**Phase 0 ~ 1 초반: 백엔드 0** — 모든 데이터 로컬 저장 (AsyncStorage / MMKV).

**Phase 1 후반 ~ Phase 2 진입 시:**
```
- Firebase Auth (Google 로그인)
- Firestore (DB + snapshot listener — 비동기 + 느슨한 실시간 OK)
- Cloud Functions (Node 22)
- Firebase Storage (영상 저장, 1주일 자동 삭제)
- FCM + APNs (silent push — vlog 그룹 알림, native 강점)
- WebSocket / WebRTC X (불필요)
```

→ Vision AI 자체 검증 (Phase 0~1 초반) 까지는 백엔드 셋업 0. 사용자 운동 기록은 로컬에. Phase 1 후반 ~ Phase 2 진입 시 Firebase 도입 + 로컬 → 클라우드 마이그레이션 (50줄 코드).

### 7-3. 컴포넌트 구조 (Expo / RN)

```
app/                                   ← expo-router 라우팅
├── (tabs)/
│   ├── index.tsx                      ← 홈 (운동 목록)
│   └── settings.tsx                   ← 설정
├── workout/[exerciseId].tsx           ← 운동 세션 진입
└── (dev)/pose-demo.tsx                ← Phase 0 검증용

components/workout/vision/             ← Vision AI 운동 (Phase 1)
├── VisionWorkoutSession.tsx           ← 메인 (30초 시간 기반 세션)
├── VisionPreStart.tsx                 ← 시작 전 가이드
├── PoseDetector.tsx                   ← vision-camera + ML Kit 래퍼
├── PoseSkeleton.tsx                   ← 33pt 시각화 (Skia frame processor)
├── DistanceBar.tsx                    ← 상단 거리 가이드
├── ThresholdLine.tsx                  ← 임계 가로선 시각화 (검증된 패턴)
├── StartTriggerDetector.tsx           ← 팔꿈치-무릎 교차
├── RepCounter.tsx                     ← state machine 카운트 로직
├── RepCountCard.tsx                   ← 하단 카운트 + 시간 카드
├── ResetMessage.tsx                   ← "자세 리셋 대기 중" 메시지 (검증된 패턴)
├── GuideVideoPip.tsx                  ← PIP 영상 (react-native-youtube-iframe)
├── exerciseDetectionConfig.ts         ← 운동별 state machine 데이터 (부록 A)
└── usePoseDetection.ts                ← vision-camera frame processor hook

components/social/vlog/                ← Vlog 그룹 (Phase 2)
├── VlogGroup.tsx                      ← 그룹 메인 화면
├── VlogGroupCreate.tsx                ← 그룹 생성/초대
├── VlogPlayer.tsx                     ← split-screen vlog 플레이어
├── VlogCapture.tsx                    ← 운동 끝 영상 추출 (vision-camera)
├── VlogShare.tsx                      ← SNS 셰어 (expo-sharing + Instagram URL scheme)
└── useVlogGroup.ts                    ← Firestore listener hook
```

### 7-4. Firestore 스키마

```typescript
// vlog_groups/{groupId}
{
  name: string;
  ownerUid: string;
  memberUids: string[];        // 최대 12
  inviteCode: string;
  createdAt: Timestamp;
}

// vlog_groups/{groupId}/posts/{postId}
{
  uid: string;
  exerciseName: string;
  reps: number;
  duration: number;
  videoUrl: string;            // Firebase Storage
  thumbnailUrl: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;        // 1주일 후 자동 삭제
}

// challenges/{challengeId} (Phase 1.5)
{
  challengerUid: string;
  targetUid: string;
  exerciseName: string;
  targetReps: number;
  status: "pending" | "completed" | "expired";
  challengerResult?: { reps, time };
  targetResult?: { reps, time };
}
```

---

## 8. 단계별 Roadmap

### Phase 0 — Vision AI 검증 (1주, 백엔드 0)

**목표:** Expo + ML Kit + react-native-vision-camera 우리 환경에서 작동 검증.

```
1. npx create-expo-app — 신규 프로젝트 init
2. react-native-vision-camera + react-native-vision-camera-mlkit plugin 설치
3. app/(dev)/pose-demo.tsx — 검증용 라우트
4. ML Kit Pose Detection 통합 + 카메라 + 33pt 스켈레톤 (Skia)
5. 푸쉬업 1개 state machine 카운트 (UP→DOWN→UP 사이클)
6. expo-speech 카운트 음성
7. iOS (Expo Go + dev build) + Android 검증
```

**검증 기준:**
- 앱 실행 ≤ 5초
- 카메라 frame processor FPS ≥ 24
- 푸쉬업 카운트 정확도 ≥ 80% (10회 시도)
- iOS / Android 카메라 권한 정상

### Phase 1 — Vision AI 정식 통합 (3-4주, 백엔드 0)

```
1. VisionWorkoutSession 컴포넌트 (30초 시간 기반 세션)
2. 운동 5종 state machine 통합 (부록 A)
   - 푸쉬업 (측면), 스쿼트 (정면), 런지 (측면), 사이드 크런치 (측면), 점프잭 (정면)
3. 거리 가이드 + 시작 트리거 + 카메라 angle 가이드
4. 임계 가로선 + 주황/녹색 시각 마커 + 자세 리셋 메시지
5. PIP 가이드 영상 5종 (임주용 대표 자가 제작 → YouTube Shorts)
6. 4단계 판정 + 음성 가이드 (expo-speech)
7. 운동 기록 로컬 저장 (AsyncStorage)
8. TestFlight + Play Internal 친구 20명 배포
```

### Phase 1.5 — Firebase 도입 (1-2주, Phase 2 진입 직전)

```
1. Firebase Auth (Google 로그인)
2. Firestore — 운동 기록 클라우드 동기 (로컬 → 클라우드 마이그레이션 50줄)
3. Cloud Functions Node 22 셋업
```

### Phase 2 — Vlog 그룹 (4-6주, 핵심 BM, App Store / Play Store 정식 출시)

```
1. 그룹 생성 / 초대 시스템 (카톡 링크)
2. vision-camera recordVideo 영상 자동 녹화
3. peak rep 시점 5초 추출 (AVFoundation/Camera2 native)
4. Firebase Storage 업로드 (1주일 자동 삭제)
5. 그룹 vlog split-screen 플레이어
6. SNS 셰어 (인스타 릴스 native share sheet, 카톡 expo-sharing)
7. APNs + FCM silent push (운동 끝 + 저녁 8시 요약)
8. App Store / Play Store 정식 등록
```

### Phase 3 — 확장 (PMF 후)

- 추가 운동 종목 (5종 → 10종 → 20종, 임주용 대표 영상 추가 제작)
- 단계제 메뉴 (MissionFit 패턴 — 운동 결합 단계)
- 그룹 vs 그룹 (단체전)
- 동네 단위 랭킹 (당근마켓 식)
- 토너먼트 / 시즌제

---

## 9. KPI / 성공 지표

### Phase 0 (검증)
- [ ] iOS / Android frame processor FPS ≥ 24
- [ ] 앱 실행 시간 ≤ 5초
- [ ] 푸쉬업 카운트 정확도 ≥ 80% (10회 시도 기준)
- [ ] vision-camera + ML Kit plugin 빌드 성공 (EAS Build)

### Phase 1 (Vision AI PMF)
- DAU 100명+
- Vision 모드 사용 비율 ≥ 30% (전체 운동 중)
- 첫 사용자 카운트 성공률 ≥ 70%
- 사용자 음성 피드백 평가 평균 ≥ 4.0/5

### Phase 2 (vlog 그룹 retention)
- 그룹 가입 비율 ≥ 50% (유저 중)
- 일일 그룹 활성 ≥ 30%
- 7일 retention ≥ 40%
- 그룹당 평균 멤버 ≥ 5명
- 인스타 셰어 비율 ≥ 10% (vlog 생성 중)

---

## 10. 위험 / 가정 / 의존성

### 위험

| 위험 | 영향 | 확률 | 대응 |
|---|---|---|---|
| react-native-vision-camera-mlkit plugin 안정성 | 높음 | 중 | Phase 0 사전 검증, 대안 라이브러리 (@gymbrosinc/react-native-mediapipe-pose) |
| App Store 심사 거절 | 높음 | 낮음 | 카메라 권한 명확 사유 + 가이드라인 사전 검토 |
| Expo dev build vs Expo Go 간극 | 중 | 중 | dev build 즉시 도입 (vision-camera 는 Expo Go 미지원) |
| 카메라 권한 거부율 | 중 | 높음 | 수동 카운트 폴백 |
| 영상 저장 비용 폭증 (Phase 2) | 중 | 중 | 1주일 자동 삭제 + 압축 |
| 그룹 critical mass 부족 | 중 | 낮음 | 1명 그룹도 작동 (개인 vlog) |
| 한국 정서 자랑 거부감 | 중 | 중 | 부드러운 톤 (날것 vlog) |
| 부정 행위 (cheating) | 낮음 | 중 | state machine + 자세 리셋 강제 + Phase 2 vlog 노출 |
| 헬스장 와이파이 약함 | 낮음 | 높음 | 클라이언트 추론, 영상 후 업로드 |

### 가정

- iOS 16+ / Android 12+ 사용자 비중 ≥ 80%
- 친구 그룹 형성 의지 있는 유저 ≥ 30%
- 운동 끝 영상 자동 공유 거부감 낮음 (그룹 limited 환경, 수동 confirm 옵션 제공)
- 30초 시간 도전 패러다임 = 한국 헬린이 층 친화적 (Tabata/HIIT 트렌드)

### 의존성

- Google ML Kit Pose Detection 무료 정책 유지
- react-native-vision-camera + ML Kit plugin maintenance 지속
- Expo SDK 안정성 (53+)
- Firebase 가격 정책 안정 (Phase 2 진입 시)
- Apple Developer Program ($99/년) + Google Play Console ($25 일회) 계정 유지

---

## 11. 차별화 매트릭스

| 우리 강점 | 경쟁자 약점 |
|---|---|
| **AI 자동 플랜 생성** (오운잘 자산) | MissionFit/Onyx 미션 카탈로그 정해짐 |
| **컨디션 기반 강도 조절** | 다른 앱 일률적 |
| **임주용 트레이너 정체성 + 본인 직접 시연 영상** | 다른 앱 익명 / 스톡 영상 |
| **한국어 음성 가이드** | 다른 앱 영어 |
| **그룹 vlog (SetLog 패턴)** | 어떤 운동 앱도 X |
| **PIP 가이드 영상 동시** (대표 직접 촬영) | 다른 앱 시작 전 영상만 |
| **App Store + Play Store 정식 출시** (SetLog 트렌드 탑승) | MissionFit B2B (스토어 X) |
| **한국 일반 헬스 유저 시장** | MissionFit B2B, Onyx 영문권 |
| **30초 시간 도전 (Tabata/HIIT 식)** | MissionFit/Onyx 목표 reps 도달 식 |

→ **카테고리 = "Vision AI 운동 vlog 그룹 SNS" (세계 최초)**

---

## 12. 자문단 검증

| 자문 | 의견 | 출처 |
|---|---|---|
| **Seth Godin** | 변화: "혼자 운동" → "그룹 일상 공유". 부족(tribe) 형성 = 4-12명. 정확. | *This Is Marketing* (2018), Ch.6 |
| **Kevin Kelly** | 1000 True Fans 형성 도구로 *친밀 그룹*이 가장 강력. critical mass 매칭보다 친밀이 핵심. | [The Technium](https://kk.org/thetechnium/1000-true-fans/) |
| **김경록 (일헥타르)** | Stage 1 (현재 팬덤 < 20명) 에 적합. 12명 그룹은 critical mass 4-5명만 있어도 작동. | [1ha.me](https://1ha.me/) · [Maily](https://maily.so/1haco) |
| **April Dunford** | 카테고리 = "Vision AI 운동 vlog 그룹" 비어있음. 차별화 명확. | *Obviously Awesome* Ch.5 |
| **BJ Fogg** | 행동 = 동기 × 능력 × 트리거. 꿀빨이 모드 = 능력 ↑ → 행동 ↑. | *Tiny Habits* (Stanford) |
| **James Clear** | 정체성 변화 = 작은 행동의 누적이 만든 증거. vlog 누적 = 정체성 강화. | *Atomic Habits* Ch.6 |

---

## 13. 다음 액션

### 즉시 (이번 주)
1. **PRD v2.0 검토 / 컨펌** (대표)
2. **Phase 0 — Expo 프로젝트 init** (`npx create-expo-app`)
3. **react-native-vision-camera + ML Kit plugin 설치 + 카메라 + 스켈레톤 검증**
4. Apple Developer + Google Play Console 가입 (TestFlight 준비)
5. **가이드 영상 5종 자가 촬영** — 임주용 대표 (운동당 1개, 30초 내외)

### 단기 (1-2주)
6. Phase 0 검증 결과 → Phase 1 정식 진입 결정
7. 운동 5종 state machine 임계값 측정 (임주용 직접, 운동당 30-60분)
8. 친구 5-10명 TestFlight 배포 → 카운트 정확도 피드백

### 중기 (3-6주)
9. Phase 1 Vision AI 정식 통합 (Expo + ML Kit)
10. Phase 1.5 Firebase 도입
11. Phase 2 Vlog 그룹 시스템 구축

### 장기 (PMF 후)
12. App Store / Play Store 정식 출시 + 마케팅 Stage 2 진입
13. SetLog 트렌드 즉시 탑승 캠페인
14. 운동 5종 → 10종 → 20종 확장

---

## 부록 A — 운동별 State Machine 임계값 (v2 — 검증 패턴 기반)

**검증 출처:** MissionFit 데모 영상 7장 (런지, 스쿼트, 점프 스쿼트, 팔벌려뛰기) — 2026-05-08

**검증된 패턴:**
1. State machine — DOWN→UP 사이클 1회 = 1 rep, "자세 리셋 대기 중" 메시지로 강제
2. 임계 가로선 — keypoint y 좌표가 임계선 통과 = 상태 전환
3. 운동별 카메라 angle 다름 (정면 / 측면)
4. 시각 마커 = 주황 (대기) → 녹색 (성공) 2색

**평가 방식 자유 변경 가능 (대표님 운영 원칙):**
- 같은 운동도 임계점 / 관절 각도 / 거리 / 시간 등 자유 조합
- Phase 0~1 동안 임주용 대표 직접 측정 → 임계값 튜닝
- 사용자 데이터 누적 후 A/B 테스트 → 알고리즘 변경 가능
- 아래 config는 **시작 가설**이지 고정 사양이 아님

```typescript
// components/workout/vision/exerciseDetectionConfig.ts

type Keypoint = string;  // ML Kit BlazePose 33pt — 'LEFT_SHOULDER', 'RIGHT_HIP', etc.

// 평가 방식 — 운동마다 자유 선택/조합
type StateCondition =
  | { kind: "thresholdY"; target: Keypoint; ref: Keypoint; offsetRatio?: number; relation: "above" | "below" }
  | { kind: "distance"; pA: Keypoint; pB: Keypoint; max?: number; min?: number; requireAboveHead?: boolean }
  | { kind: "angle"; joints: [Keypoint, Keypoint, Keypoint]; max?: number; min?: number };

type ExerciseConfig = {
  category: "lower" | "upper" | "core" | "full" | "cardio";
  level?: number;                          // Phase 3 단계제 도입 대비
  cameraAngle: "front" | "side";
  states: { UP: StateCondition; DOWN: StateCondition };
  formGrades?: { perfect: StateCondition; good: StateCondition; ok: StateCondition };
  minRepDuration: number;                  // 가짜 rep 차단
  maxRepDuration: number;                  // 일시정지 감지
  resetMessage: string;                    // "자세 리셋 대기 중" 안내
  durationSec: number;                     // 30초 (좌/우 양쪽은 15+15)
};

export const EXERCISE_DETECTION: Record<string, ExerciseConfig> = {
  pushup: {
    category: "upper",
    cameraAngle: "side",
    states: {
      UP:   { kind: "angle", joints: ["SHOULDER","ELBOW","WRIST"], min: 160 },
      DOWN: { kind: "angle", joints: ["SHOULDER","ELBOW","WRIST"], max: 90 },
    },
    formGrades: {
      perfect: { kind: "angle", joints: ["SHOULDER","ELBOW","WRIST"], max: 75 },
      good:    { kind: "angle", joints: ["SHOULDER","ELBOW","WRIST"], max: 90 },
      ok:      { kind: "angle", joints: ["SHOULDER","ELBOW","WRIST"], max: 110 },
    },
    minRepDuration: 0.8,
    maxRepDuration: 5,
    resetMessage: "팔을 펴고 시작 자세로 돌아가세요",
    durationSec: 30,
  },

  squat: {
    // 검증 (MissionFit 스샷 6,7): hip y가 무릎 y 위/아래로 통과
    category: "lower",
    cameraAngle: "front",
    states: {
      UP:   { kind: "thresholdY", target: "LEFT_HIP", ref: "LEFT_KNEE", relation: "above" },
      DOWN: { kind: "thresholdY", target: "LEFT_HIP", ref: "LEFT_KNEE", relation: "below" },
    },
    minRepDuration: 0.8,
    maxRepDuration: 5,
    resetMessage: "일어서서 시작 자세로 돌아가세요",
    durationSec: 30,
  },

  lunge: {
    // 검증 (MissionFit 스샷 1,2): 뒷다리 무릎 y가 임계 가로선 (발목 + offset) 위/아래
    category: "lower",
    cameraAngle: "side",
    states: {
      UP:   { kind: "thresholdY", target: "BACK_KNEE", ref: "BACK_ANKLE", offsetRatio: 0.3, relation: "above" },
      DOWN: { kind: "thresholdY", target: "BACK_KNEE", ref: "BACK_ANKLE", offsetRatio: 0.3, relation: "below" },
    },
    minRepDuration: 0.8,
    maxRepDuration: 5,
    resetMessage: "일어서서 시작 자세로 돌아가세요",
    durationSec: 30,                        // 좌 15초 + 우 15초 분할
  },

  side_crunch: {
    category: "core",
    cameraAngle: "side",
    states: {
      UP:   { kind: "distance", pA: "RIGHT_ELBOW", pB: "LEFT_KNEE", min: 0.4 },
      DOWN: { kind: "distance", pA: "RIGHT_ELBOW", pB: "LEFT_KNEE", max: 0.2 },
    },
    minRepDuration: 0.5,
    maxRepDuration: 4,
    resetMessage: "몸을 펴고 시작 자세로 돌아가세요",
    durationSec: 30,                        // 좌 15초 + 우 15초 분할
  },

  jumping_jack: {
    // 검증 (MissionFit 스샷 8,9): 양 손목이 머리 위에서 만남
    // "손을 내리고 두 발을 모아 차렷 하세요" 메시지 = 검증된 자세 리셋
    category: "cardio",
    cameraAngle: "front",
    states: {
      UP:   { kind: "distance", pA: "LEFT_WRIST", pB: "RIGHT_WRIST", max: 0.3, requireAboveHead: true },
      DOWN: { kind: "distance", pA: "LEFT_WRIST", pB: "RIGHT_WRIST", min: 0.5 },
    },
    minRepDuration: 0.4,
    maxRepDuration: 2,
    resetMessage: "손을 내리고 두 발을 모아 차렷 하세요",
    durationSec: 30,
  },
};

// 부록 B의 calibrateBaseline() 결과를 곱해서 절대 임계값으로 변환.
// 모든 임계값은 baseline 비율 (절대 픽셀 X).
```

## 부록 B — 자동 캘리브레이션 알고리즘

```typescript
// 사용자별 비례 baseline (개인 키 / 카메라 거리 차이 흡수)
function calibrateBaseline(landmarks) {
  return {
    shoulderWidth: distance(landmarks.LEFT_SHOULDER, landmarks.RIGHT_SHOULDER),
    hipY: (landmarks.LEFT_HIP.y + landmarks.RIGHT_HIP.y) / 2,
    ankleY: (landmarks.LEFT_ANKLE.y + landmarks.RIGHT_ANKLE.y) / 2,
    bodyHeight: ankleY - landmarks.NOSE.y,
  };
}

// 모든 임계값은 baseline의 비율로 (절대 픽셀 X)
function isWithinThreshold(rawDistance, baseline, ratio) {
  return rawDistance < baseline.shoulderWidth * ratio;
}
```

## 부록 C — 메모리 룰 / 자문단 / 소스

### 메모리 룰 적용
- `feedback_meeting_log.md` — 회의 기록 의무 (이 PRD 가 회의 기록 역할)
- `feedback_no_emoji` — 이모지 X
- `feedback_product_positioning.md` — UI 카피 마이너스 X
- `feedback_proactive_followup.md` — 다음 단계 1-2 선제 제안
- `user_trainer_founder.md` — 트레이너+개발자 정체성 자산
- `feedback_user_attention_span.md` — 1개월 한계 + 4주 청킹

### 외부 소스
- [SetLog (newchat) Google Play](https://play.google.com/store/apps/details?id=com.newchat.setlog)
- [SetLog App Store](https://apps.apple.com/us/app/setlog/id6587576438)
- [MissionFit](https://www.missionfit.re.kr/)
- [Onyx Fitness](https://apps.apple.com/us/app/onyx-fitness/id1623367426)
- [Kemtai](https://kemtai.com/)
- [VAY Sports](https://www.vay.ai/)
- [QuickPose iOS SDK](https://quickpose.ai/)
- [MediaPipe Pose Landmarker (Google)](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
- [Strava](https://www.strava.com/)

### 한국 오픈소스 참고
- [HELF (SSAFY 6기)](https://github.com/ehhclaire/HELF)
- [MyPT (군 해커톤 수상)](https://github.com/osamhack2021/AI_APP_MyPT_StrongFriends)
- [나의 운동 친구](https://github.com/ha-jinwoo/MyHealthFriend)

---

**문서 버전:** v2.0 (Native pivot — Expo + ML Kit, MissionFit 검증 반영)
**최종 수정:** 2026-05-09
**작성:** 임주용 × Claude
**다음 검토:** Phase 0 검증 완료 후 (2026-05-16 추정)

**v2.0 변경 사항 요약:**
- Tech: Next.js Web → Expo Native (App Store / Play Store 정식 출시 목표)
- SDK: MediaPipe BlazePose → Google ML Kit Pose Detection (BlazePose 기반, RN plugin 안정성)
- 백엔드: 일괄 도입 → Phase별 도입 (Phase 0~1 백엔드 0)
- 카운트 알고리즘: 단일 임계 → State machine + 임계 가로선 (MissionFit 검증)
- 세션 패러다임: 목표 reps 도달 → 30초 시간 기반
- 가이드 영상: 외부 자산 → 임주용 대표 자가 촬영 (트레이너 정체성 강화)
- 부록 A: 검증된 운동 5종 state machine + 자세 리셋 메시지
- 평가 방식: 자유 변경 가능 원칙 명시 (임계점 / 각도 / 거리 자유 조합)
