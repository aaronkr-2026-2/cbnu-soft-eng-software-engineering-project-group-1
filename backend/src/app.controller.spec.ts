import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('returns MedConnect API metadata', () => {
      expect(appController.getApiInfo()).toEqual({
        name: 'MedConnect API',
        version: 'v1',
        status: 'ok',
      });
    });
  });
});
