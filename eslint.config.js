import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'config/**', 'docs/**', 'apps/web/dist/**', 'apps/web/vite.config.ts'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['error', 'warn', 'log'] }],
    },
  },
  {
    files: ['**/*.test.ts', 'apps/api/src/test/**'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);
