export default {
  '*.{js,jsx}': ['eslint --fix --max-warnings=0 --no-warn-ignored', 'prettier --write'],
  '*.{json,md,yml,yaml,html,css}': 'prettier --write',
};
