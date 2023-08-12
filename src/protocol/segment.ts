import { StreamFrame } from './frame';

const DATA_MAX_SIZE = 1024 * 4;

// 大帧拆分
function frameSegment(frame: StreamFrame): Array<StreamFrame> {
    let offset = 0;
    let offset2 = 0;
    if (!frame.data || frame.data.length < DATA_MAX_SIZE) {
        return [frame];
    }
    const len = frame.data.length;
  
    const list: Array<StreamFrame> = [];
    while (true) {
        offset2 = offset + DATA_MAX_SIZE;
        if (offset2 > len) {
            offset2 = len;
        }
        const frame2 = new StreamFrame(frame.type, frame.tunnelId, frame.streamId);
        frame2.data = frame.data.slice(offset, offset2);
        list.push(frame2);
        offset = offset2;
        if (offset2 === len) {
            break;
        }
    }
    return list;
}

export { frameSegment };
