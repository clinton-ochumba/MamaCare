module.exports = {
  Audio: {
    requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
    setAudioModeAsync: jest.fn(async () => {}),
    Recording: {
      createAsync: jest.fn(async () => ({
        recording: {
          stopAndUnloadAsync: jest.fn(async () => {}),
          getURI: jest.fn(() => 'file:///tmp/rec.m4a'),
        },
      })),
    },
    RecordingOptionsPresets: { HIGH_QUALITY: {} },
  },
};
