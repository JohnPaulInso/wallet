import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'smart.wallet1',
  appName: 'Smart Wallet',
  webDir: 'www',
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#00000000',
      overlaysWebView: true,
    },
    GoogleAuth: {
      scopes: ['profile', 'email', 'https://www.googleapis.com/auth/gmail.readonly'],
      serverClientId: '64186651619-3eb9ki680f4c8q2g2mese3c8hhfur23b.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_wallet',
      iconColor: '#111827',
    },
  },
};

export default config;
