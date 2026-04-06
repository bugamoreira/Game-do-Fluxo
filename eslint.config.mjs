import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'public', 'node_modules', '.netlify'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Allow unused vars prefixed with _
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // Allow any during migration (remove in Fase 2 full typing)
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow non-null assertions (common in React refs)
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
