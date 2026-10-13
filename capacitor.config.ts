import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'in.interestledger.app',
  appName: 'InterestLedger',
  webDir: 'dist',
  android: {
    // Records stay in the WebView's own IndexedDB on the phone.
    allowMixedContent: false,
  },
}

export default config
