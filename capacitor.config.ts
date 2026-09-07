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
    // (2026-07-13) Use SocialLogin config; prev: GoogleAuth config
    SocialLogin: {
      providers: {
        google: true,
      },
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_wallet',
      iconColor: '#111827',
    },
  },
};

export default config;
