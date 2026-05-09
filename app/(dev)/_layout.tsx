import { Stack } from 'expo-router';

export default function DevLayout() {
  return (
    <Stack>
      <Stack.Screen name="pose-demo" options={{ title: 'Pose Demo (Phase 0)' }} />
    </Stack>
  );
}
