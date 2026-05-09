import { requireNativeView } from 'expo';
import * as React from 'react';

import { OuzPoseViewProps } from './OuzPose.types';

const NativeView: React.ComponentType<OuzPoseViewProps> =
  requireNativeView('OuzPose');

export default function OuzPoseView(props: OuzPoseViewProps) {
  return <NativeView {...props} />;
}
