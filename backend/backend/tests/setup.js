// Test setup file
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://localhost/infer_test';

// Suppress logs during tests
jest.mock('./src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));
