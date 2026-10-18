import { Query, Resolver, GraphQLModule } from '@nestjs/graphql';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureUploads } from '../src/components/upload/upload.http.js';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { Server } from 'node:http';
import { graphqlConfig } from '../src/libs/graphql/graphql.config.js';
import { UploadResolver } from '../src/components/upload/upload.resolver.js';
import {
  UploadService,
  MAX_UPLOAD_SIZE,
} from '../src/components/upload/upload.service.js';
import { MemberService } from '../src/components/member/member.service.js';

@Resolver()
class TestQuery {
  @Query(() => Boolean) ready() {
    return true;
  }
}

describe('GraphQL image uploads', () => {
  let app: INestApplication<Server>;
  let directory: string;
  const priorDirectory = process.env.UPLOAD_DIR;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=',
    'base64',
  );

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'medconnect-upload-'));
    process.env.UPLOAD_DIR = directory;
    const fixture = await Test.createTestingModule({
      imports: [GraphQLModule.forRoot({ ...graphqlConfig, graphiql: false })],
      providers: [
        TestQuery,
        UploadResolver,
        UploadService,
        {
          provide: MemberService,
          useValue: {
            authenticateAccessToken: async (token: string) => {
              if (token !== 'valid')
                throw new UnauthorizedException('Invalid access token');
              return { _id: 'test-member', memberType: 'USER' };
            },
          },
        },
      ],
    }).compile();
    app = fixture.createNestApplication();
    configureUploads(app);
    await app.listen(0, '127.0.0.1');
  });
  afterEach(async () => {
    for (const entry of await readdir(directory))
      await rm(join(directory, entry), { recursive: true, force: true });
  });
  afterAll(async () => {
    await app?.close();
    await rm(directory, { recursive: true, force: true });
    if (priorDirectory === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = priorDirectory;
  });

  function upload(
    buffers = [png],
    target = 'member',
    token = 'valid',
    mime = 'image/png',
    multiple = false,
  ) {
    const query = multiple
      ? 'mutation($files: [Upload!]!, $target: String!) { imagesUploader(files: $files, target: $target) }'
      : 'mutation($file: Upload!, $target: String!) { imageUploader(file: $file, target: $target) }';
    const variables = multiple
      ? { files: buffers.map(() => null), target }
      : { file: null, target };
    const map = Object.fromEntries(
      buffers.map((_, i) => [
        String(i),
        [multiple ? `variables.files.${i}` : 'variables.file'],
      ]),
    );
    let req = request(app.getHttpServer())
      .post('/graphql')
      .set('Apollo-Require-Preflight', 'true');
    if (token) req = req.set('Authorization', `Bearer ${token}`);
    req = req
      .field('operations', JSON.stringify({ query, variables }))
      .field('map', JSON.stringify(map));
    for (const [i, buffer] of buffers.entries())
      req = req.attach(String(i), buffer, {
        filename: '../../unsafe.png',
        contentType: mime,
      });
    return req;
  }

  it('saves an image with a generated name', async () => {
    const response = await upload().expect(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.imageUploader).toMatch(
      /^\/uploads\/member\/[a-f0-9-]+\.png$/,
    );
    expect(await readdir(join(directory, 'member'))).toHaveLength(1);
    const fetched = await request(app.getHttpServer())
      .get(response.body.data.imageUploader)
      .expect(200);
    expect(fetched.body).toEqual(png);
    await writeFile(join(directory, 'member', '.pending.tmp'), png);
    await request(app.getHttpServer())
      .get('/uploads/member/.pending.tmp')
      .expect(404);
  });
  it('preserves batch order and cleans all files when any image fails', async () => {
    const good = await upload(
      [png, png],
      'clinic',
      'valid',
      'image/png',
      true,
    ).expect(200);
    expect(good.body.errors).toBeUndefined();
    expect(good.body.data.imagesUploader).toHaveLength(2);
    const bad = await upload(
      [png, Buffer.from('not an image')],
      'member',
      'valid',
      'image/png',
      true,
    ).expect(200);
    expect(bad.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(await readdir(join(directory, 'member'))).toEqual([]);
  });
  it.each(['', 'invalid'])('rejects unauthorized token %j', async (token) => {
    const response = await upload([png], 'member', token).expect(200);
    expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    expect(await readdir(directory)).toEqual([]);
  });
  it.each(['../member', 'product'])(
    'rejects invalid target %s',
    async (target) => {
      const response = await upload([png], target).expect(200);
      expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
      expect(await readdir(directory)).toEqual([]);
    },
  );
  it.each(['text/html', 'image/svg+xml', 'constructor'])(
    'rejects unsupported format %s',
    async (mime) => {
      const response = await upload([png], 'member', 'valid', mime).expect(200);
      expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    },
  );
  it('rejects oversized uploads and removes partial files', async () => {
    const response = await upload([Buffer.alloc(MAX_UPLOAD_SIZE + 1)]);
    expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(await readdir(join(directory, 'member'))).toEqual([]);
  });
  it('rejects more than five files', async () => {
    await upload(
      Array(6).fill(png),
      'member',
      'valid',
      'image/png',
      true,
    ).expect(413);
    expect(await readdir(directory)).toEqual([]);
  });
  it('requires the Apollo preflight header', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .field('operations', JSON.stringify({ query: '{ ready }' }))
      .field('map', '{}')
      .expect(400);
    expect(response.body.errors).toBeDefined();
  });
});
