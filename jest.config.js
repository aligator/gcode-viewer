module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    "Lut": "<rootDir>/fake.js",
  }
};