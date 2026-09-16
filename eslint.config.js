import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', '.wrangler/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
);
