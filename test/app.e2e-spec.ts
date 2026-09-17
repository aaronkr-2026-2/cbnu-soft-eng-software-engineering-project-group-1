import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from '../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<Server>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ name: 'MedConnect API', version: 'v1', status: 'ok' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('/status serves the visual status page without caching', async () => {
    const response = await request(app.getHttpServer())
      .get('/status')
      .expect(200)
      .expect('Content-Type', /text\/html/)
      .expect('Cache-Control', 'no-store');

    expect(response.text).toContain('Service status');
    expect(response.text).toContain('href="/health/live"');
    expect(response.text).toContain('href="/health/ready"');
    expect(response.text).toContain('href="/status/assets/status.css"');
    expect(response.text).toContain('src="/status/assets/status.js"');
  });

  it('serves status page styles and scripts with browser-compatible content types', async () => {
    const styles = await request(app.getHttpServer())
      .get('/status/assets/status.css')
      .expect(200)
      .expect('Content-Type', /text\/css/);
    expect(styles.text).toContain('.cards');

    const script = await request(app.getHttpServer())
      .get('/status/assets/status.js')
      .expect(200)
      .expect('Content-Type', /javascript/);
    expect(script.text).toContain('/health/ready');
  });
});
