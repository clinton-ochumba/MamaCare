export default {
  name: "MamaCare",
  slug: "mamacare",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#FF6B9D"
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#FF6B9D"
    },
    package: "com.mamacare.app",
    permissions: [
      "RECORD_AUDIO",
      "READ_EXTERNAL_STORAGE",
      "WRITE_EXTERNAL_STORAGE",
      "SEND_SMS",
      "READ_SMS",
      "RECEIVE_SMS"
    ]
  },
  plugins: [
    "expo-secure-store",
    "expo-av"
  ],
  extra: {
    eas: {
      projectId: "06abe469-7f63-48ba-a824-83cb02a8da56"
}
},
owner: "ochumba"
};
