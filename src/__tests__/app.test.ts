/**
 * API smoke tests - tests app routes without starting the server
 */

import request from 'supertest';
import app from '../app';

describe('API', () => {
  describe('GET /health', () => {
    it('should return 200 and healthy status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        message: 'Server is running',
        data: expect.objectContaining({
          status: 'healthy',
          environment: expect.any(String),
          timestamp: expect.any(String),
        }),
      });
    });
  });

  describe('404 handler', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/api/v1/nonexistent');
      expect(res.status).toBe(404);
    });
  });
});
