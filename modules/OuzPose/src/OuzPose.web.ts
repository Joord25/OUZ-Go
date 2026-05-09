import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './OuzPose.types';

type OuzPoseEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class OuzPose extends NativeModule<OuzPoseEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(OuzPose, 'OuzPose');
