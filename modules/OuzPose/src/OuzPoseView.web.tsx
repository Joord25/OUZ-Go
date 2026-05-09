import * as React from 'react';

import { OuzPoseViewProps } from './OuzPose.types';

export default function OuzPoseView(props: OuzPoseViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
