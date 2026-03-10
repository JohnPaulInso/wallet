import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'smart.wallet1',
  appName: 'Wallet App',
  webDir: 'www',
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email', 'https://www.googleapis.com/auth/gmail.readonly'],
      serverClientId: '64186651619-g5m873h1uim4n4iv76ovv7skv3jltv8b.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
