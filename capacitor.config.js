/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: "com.codeai.ide",
  appName: "CodeAI IDE",
  webDir: "dist",
  android: {
    allowMixedContent: true,
    initialFocus: true,
  },
  server: {
    androidScheme: "https",
    cleartext: true,
    // Allow GitHub API calls from WebView
    hostname: "codeai.app",
  },
  plugins: {
    Preferences: {},
  },
};

module.exports = config;
