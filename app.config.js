export default {
  name: "MamaCare",
  slug: "mamacare",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#FF6B9D"
  },
  android: {
    package: "com.mamacare.app",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#FF6B9D"
    }
  },
  extra: {
    eas: {
      projectId: "06abe469-7f63-48ba-a824-83cb02a8da56"
    }
  },
  owner: "ochumba"
};
