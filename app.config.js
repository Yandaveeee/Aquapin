const fs = require('fs');
const path = require('path');
const mobileConfig = require('./apps/mobile/app.json');

const expo = mobileConfig.expo;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const delimiterIndex = line.indexOf('=');
    if (delimiterIndex <= 0) continue;

    const key = line.slice(0, delimiterIndex).trim();
    if (!key || key.startsWith('#') || process.env[key] !== undefined) continue;

    let value = line.slice(delimiterIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '.env'));
loadEnvFile(path.join(__dirname, 'apps/mobile/.env'));

const publicEnvKeys = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_MAPS_API_KEY',
  'EXPO_PUBLIC_GROQ_API_KEY',
];

const publicExtra = publicEnvKeys.reduce((acc, key) => {
  acc[key] = process.env[key] || '';
  return acc;
}, {});

module.exports = {
  ...expo,
  extra: {
    ...(expo.extra || {}),
    ...publicExtra,
  },
  icon: './apps/mobile/assets/icon.png',
  splash: {
    ...expo.splash,
    image: './apps/mobile/assets/splash-icon.png',
  },
  android: {
    ...expo.android,
    adaptiveIcon: {
      ...expo.android.adaptiveIcon,
      foregroundImage: './apps/mobile/assets/android-icon-foreground.png',
      backgroundImage: './apps/mobile/assets/android-icon-background.png',
      monochromeImage: './apps/mobile/assets/android-icon-monochrome.png',
    },
  },
  web: {
    ...expo.web,
    favicon: './apps/mobile/assets/favicon.png',
  },
};
