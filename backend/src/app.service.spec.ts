import { AppService } from './app.service.js';

// describe groups tests for the same service.
describe('AppService', () => {
  it('returns the API name, version, and status', () => {
    // Arrange: create the service. This service has no dependencies to mock.
    const service = new AppService();

    // Act: call the method being tested.
    const result = service.getApiInfo();

    // Assert: toEqual compares the object's contents with the expected values.
    expect(result).toEqual({
      name: 'MedConnect API',
      version: 'v1',
      status: 'ok',
    });
  });
});
