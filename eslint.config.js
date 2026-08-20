// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Function은 Deno에서 돌고 앱 tsconfig 밖에 있다(tsconfig의 exclude와 같은 이유).
    ignores: ["dist/*", "supabase/functions/*"],
  }
]);
