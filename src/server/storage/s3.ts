import "server-only";
import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { assertValidKey, type ByteRange, type StorageProvider } from "./types";

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

/**
 * Adaptér pre Cloudflare R2 / MinIO / AWS S3. Bucket musí byť súkromný –
 * sťahovanie aj tak ide cez náš route handler (token, Range, počítadlo).
 */
export class S3CompatibleStorage implements StorageProvider {
  readonly driver = "S3_COMPATIBLE" as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async putFile(key: string, localPath: string, contentType: string): Promise<void> {
    assertValidKey(key);
    // Multipart upload po 64 MiB – zvládne aj viacgigabajtové mapy
    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: key, Body: createReadStream(localPath), ContentType: contentType },
      partSize: 64 * 1024 * 1024,
      queueSize: 4,
      leavePartsOnError: false,
    });
    await upload.done();
    await unlink(localPath);
  }

  async putBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
    assertValidKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async read(key: string, range?: ByteRange): Promise<Readable> {
    assertValidKey(key);
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: range ? `bytes=${range.start}-${range.end}` : undefined,
      }),
    );
    if (!result.Body) throw new Error(`Prázdna odpoveď S3 pre ${key}`);
    if (result.Body instanceof Readable) return result.Body;
    return Readable.fromWeb(result.Body.transformToWebStream() as Parameters<typeof Readable.fromWeb>[0]);
  }

  async size(key: string): Promise<number | null> {
    assertValidKey(key);
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return head.ContentLength ?? null;
    } catch (error) {
      if (error instanceof NotFound) return null;
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
