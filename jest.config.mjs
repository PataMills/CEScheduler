export default {
  testEnvironment: 'node',
  // Only run API tests with Jest; UI tests are handled by Playwright
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/ui/'],
  transform: {}
};
