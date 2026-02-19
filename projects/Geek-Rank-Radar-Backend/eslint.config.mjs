import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-restricted-globals': ['error',
        { name: 'parseInt', message: 'Use Number.parseInt(value, 10) instead.' },
        { name: 'parseFloat', message: 'Use Number.parseFloat(value) instead.' },
      ],
      'prefer-const': 'error',
      'no-var': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'src/generated/'],
  },
);
