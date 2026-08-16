// In-memory relay for the accessibility screenshot stream ("See Screen").
// The client device POSTs JPEG frames; subscribed parent dashboards receive
// them over a streaming HTTP response (newline-delimited JSON). Nothing is
// persisted to MongoDB — frames only live in memory for as long as someone
// is watching (plus a short cache so a late subscriber sees the last frame).

const subscribers = new Map(); // deviceId -> Set<ServerResponse>
const lastFrames = new Map(); // deviceId -> {image, seq, timestamp, width, height, savedAt}
const LAST_FRAME_TTL_MS = 30000;

const writeLine = (res, payload) => res.write(`${JSON.stringify(payload)}\n`);

const addSubscriber = (deviceId, res) => {
  if (!subscribers.has(deviceId)) subscribers.set(deviceId, new Set());
  subscribers.get(deviceId).add(res);
  const last = lastFrames.get(deviceId);
  if (last && Date.now() - last.savedAt < LAST_FRAME_TTL_MS) {
    writeLine(res, {type: 'frame', ...pickFrame(last), cached: true});
  }
  writeLine(res, {type: 'status', subscribers: subscribers.get(deviceId).size});
};

const removeSubscriber = (deviceId, res) => {
  const set = subscribers.get(deviceId);
  if (!set) return;
  set.delete(res);
  if (!set.size) subscribers.delete(deviceId);
};

const isSubscribed = (deviceId, res) => subscribers.get(deviceId)?.has(res) || false;

const subscriberCount = deviceId => subscribers.get(deviceId)?.size || 0;

const pickFrame = frame => ({image: frame.image, seq: frame.seq, timestamp: frame.timestamp, width: frame.width, height: frame.height});

const publishFrame = (deviceId, frame) => {
  lastFrames.set(deviceId, {...pickFrame(frame), savedAt: Date.now()});
  const set = subscribers.get(deviceId);
  if (!set) return 0;
  const payload = {type: 'frame', ...pickFrame(frame)};
  for (const res of set) {
    try {
      writeLine(res, payload);
    } catch (error) {
      set.delete(res);
    }
  }
  return set.size;
};

const writePing = (deviceId, res) => {
  try {
    writeLine(res, {type: 'ping', timestamp: Date.now()});
  } catch (error) {
    removeSubscriber(deviceId, res);
  }
};

const getLastFrame = deviceId => lastFrames.get(deviceId) || null;

const pruneLastFrames = () => {
  const now = Date.now();
  for (const [deviceId, frame] of lastFrames) {
    if (now - frame.savedAt > LAST_FRAME_TTL_MS) lastFrames.delete(deviceId);
  }
};

setInterval(pruneLastFrames, 60000).unref();

module.exports = {addSubscriber, removeSubscriber, isSubscribed, subscriberCount, publishFrame, writePing, getLastFrame, LAST_FRAME_TTL_MS};
