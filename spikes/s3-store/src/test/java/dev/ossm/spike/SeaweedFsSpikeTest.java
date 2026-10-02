package dev.ossm.spike;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CompleteMultipartUploadRequest;
import software.amazon.awssdk.services.s3.model.CompletedMultipartUpload;
import software.amazon.awssdk.services.s3.model.CompletedPart;
import software.amazon.awssdk.services.s3.model.CreateMultipartUploadRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.UploadPartRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.UploadPartPresignRequest;

/**
 * Ticket 02 spike: does SeaweedFS satisfy what OSSM needs from an S3-compatible store? Only the AWS SDK v2 S3 client
 * (configurable endpoint) and plain HTTP against presigned URLs are used, never a SeaweedFS-specific API.
 *
 * <p>Lines starting with "SPIKE " in the output are the findings.
 */
class SeaweedFsSpikeTest {

    static final String IMAGE = "chrislusf/seaweedfs:4.48";
    static final String ACCESS_KEY = "ossm-access";
    static final String SECRET_KEY = "ossm-secret-key";
    static final String BUCKET = "ossm";
    static final int S3_PORT = 8333;
    static final int MB = 1024 * 1024;

    static GenericContainer<?> store;
    static S3Client s3;
    static S3Presigner presigner;
    static URI endpoint;
    static final HttpClient http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();

    static void log(String line) {
        System.out.println("SPIKE " + line);
    }

    @BeforeAll
    static void start() throws Exception {
        long t0 = System.nanoTime();
        store = new GenericContainer<>(IMAGE)
                .withCommand("server", "-dir=/data", "-s3")
                .withEnv("AWS_ACCESS_KEY_ID", ACCESS_KEY)
                .withEnv("AWS_SECRET_ACCESS_KEY", SECRET_KEY)
                .withExposedPorts(S3_PORT)
                .waitingFor(Wait.forListeningPorts(S3_PORT));
        store.start();
        long portOpen = ms(t0);

        endpoint = URI.create("http://" + store.getHost() + ":" + store.getMappedPort(S3_PORT));
        var credentials = StaticCredentialsProvider.create(AwsBasicCredentials.create(ACCESS_KEY, SECRET_KEY));
        var pathStyle = S3Configuration.builder().pathStyleAccessEnabled(true).build();
        s3 = S3Client.builder()
                .endpointOverride(endpoint)
                .region(Region.US_EAST_1)
                .credentialsProvider(credentials)
                .serviceConfiguration(pathStyle)
                .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
                .build();
        presigner = S3Presigner.builder()
                .endpointOverride(endpoint)
                .region(Region.US_EAST_1)
                .credentialsProvider(credentials)
                .serviceConfiguration(pathStyle)
                .build();

        // Port-open is not readiness: poll until an authenticated call succeeds.
        long deadline = System.nanoTime() + Duration.ofSeconds(60).toNanos();
        while (true) {
            try {
                s3.listBuckets();
                break;
            } catch (Exception e) {
                if (System.nanoTime() > deadline) throw e;
                Thread.sleep(250);
            }
        }
        long ready = ms(t0);
        s3.createBucket(b -> b.bucket(BUCKET));
        log("testcontainers.startup: port-open=" + portOpen + "ms authenticated-ready=" + ready + "ms");
        log("memory.idle: " + dockerMemory());
    }

    @AfterAll
    static void stop() throws Exception {
        log("memory.after-tests: " + dockerMemory());
        long t0 = System.nanoTime();
        store.stop();
        log("testcontainers.teardown: " + ms(t0) + "ms");
    }

    static long ms(long fromNanos) {
        return Duration.ofNanos(System.nanoTime() - fromNanos).toMillis();
    }

    static String dockerMemory() throws Exception {
        var p = new ProcessBuilder("docker", "stats", "--no-stream", "--format", "{{.MemUsage}} cpu={{.CPUPerc}}", store.getContainerId())
                .redirectErrorStream(true)
                .start();
        var out = new String(p.getInputStream().readAllBytes()).trim();
        p.waitFor();
        return out;
    }

    /** Deterministic content: part i is a fixed pseudo-random block, so any range can be recomputed. */
    static byte[] block(int partIndex, int size) {
        var bytes = new byte[size];
        new Random(partIndex).nextBytes(bytes);
        return bytes;
    }

    record Uploaded(String sha256, long size, int partSize, int parts) {}

    /** Multipart upload where every part goes to a presigned UploadPart URL, like the browser will. */
    static Uploaded multipartViaPresignedUrls(String key, int totalMb, int partMb) throws Exception {
        int partSize = partMb * MB;
        int parts = totalMb / partMb;
        var upload = s3.createMultipartUpload(CreateMultipartUploadRequest.builder()
                .bucket(BUCKET).key(key).contentType("audio/flac").build());
        var digest = MessageDigest.getInstance("SHA-256");
        var completed = new ArrayList<CompletedPart>();
        for (int i = 1; i <= parts; i++) {
            var data = block(i, partSize);
            digest.update(data);
            var presigned = presigner.presignUploadPart(UploadPartPresignRequest.builder()
                    .signatureDuration(Duration.ofMinutes(15))
                    .uploadPartRequest(UploadPartRequest.builder()
                            .bucket(BUCKET).key(key).uploadId(upload.uploadId()).partNumber(i).build())
                    .build());
            var response = http.send(
                    HttpRequest.newBuilder(presigned.url().toURI())
                            .PUT(HttpRequest.BodyPublishers.ofByteArray(data))
                            .build(),
                    HttpResponse.BodyHandlers.discarding());
            assertEquals(200, response.statusCode(), "part " + i);
            var etag = response.headers().firstValue("ETag").orElseThrow();
            completed.add(CompletedPart.builder().partNumber(i).eTag(etag).build());
        }
        s3.completeMultipartUpload(CompleteMultipartUploadRequest.builder()
                .bucket(BUCKET).key(key).uploadId(upload.uploadId())
                .multipartUpload(CompletedMultipartUpload.builder().parts(completed).build())
                .build());
        return new Uploaded(HexFormat.of().formatHex(digest.digest()), (long) parts * partSize, partSize, parts);
    }

    @Test
    void multipartUpload250MbThroughPresignedPartUrls() throws Exception {
        long t0 = System.nanoTime();
        var up = multipartViaPresignedUrls("audio/big.flac", 250, 25);
        long uploadMs = ms(t0);

        var head = s3.headObject(HeadObjectRequest.builder().bucket(BUCKET).key("audio/big.flac").build());
        assertEquals(up.size(), head.contentLength());
        assertEquals("audio/flac", head.contentType());

        // Full read-back, byte-for-byte via hash.
        t0 = System.nanoTime();
        var digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = s3.getObject(GetObjectRequest.builder().bucket(BUCKET).key("audio/big.flac").build())) {
            var buf = new byte[1 << 16];
            for (int n; (n = in.read(buf)) > 0; ) digest.update(buf, 0, n);
        }
        assertEquals(up.sha256(), HexFormat.of().formatHex(digest.digest()));
        log("multipart.250mb: PASS parts=" + up.parts() + " upload=" + uploadMs + "ms readback=" + ms(t0) + "ms sha256-roundtrip=ok");
    }

    @Test
    void presignedGetAndPutIncludingExpiry() throws Exception {
        var key = "audio/presign.bin";
        var payload = block(99, 1 * MB);

        var putUrl = presigner.presignPutObject(PutObjectPresignRequest.builder()
                .signatureDuration(Duration.ofMinutes(5))
                .putObjectRequest(PutObjectRequest.builder().bucket(BUCKET).key(key).contentType("application/octet-stream").build())
                .build());
        var put = http.send(HttpRequest.newBuilder(putUrl.url().toURI())
                .header("Content-Type", "application/octet-stream")
                .PUT(HttpRequest.BodyPublishers.ofByteArray(payload)).build(), HttpResponse.BodyHandlers.discarding());
        assertEquals(200, put.statusCode());

        var getUrl = presigner.presignGetObject(GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofMinutes(5))
                .getObjectRequest(GetObjectRequest.builder().bucket(BUCKET).key(key).build())
                .build());
        var get = http.send(HttpRequest.newBuilder(getUrl.url().toURI()).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        assertEquals(200, get.statusCode());
        assertArrayEquals(payload, get.body());

        // Tampered signature must be rejected.
        var bad = http.send(HttpRequest.newBuilder(URI.create(getUrl.url().toString().replaceAll("X-Amz-Signature=.{4}", "X-Amz-Signature=0000"))).GET().build(),
                HttpResponse.BodyHandlers.discarding());
        assertTrue(bad.statusCode() == 403 || bad.statusCode() == 400, "tampered: " + bad.statusCode());

        // Expiry.
        var shortLived = presigner.presignGetObject(GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofSeconds(2))
                .getObjectRequest(GetObjectRequest.builder().bucket(BUCKET).key(key).build())
                .build());
        var before = http.send(HttpRequest.newBuilder(shortLived.url().toURI()).GET().build(), HttpResponse.BodyHandlers.discarding());
        Thread.sleep(4000);
        var after = http.send(HttpRequest.newBuilder(shortLived.url().toURI()).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, before.statusCode());
        assertTrue(after.statusCode() == 403 || after.statusCode() == 400, "expired: " + after.statusCode());
        log("presigned.get-put-expiry: PASS put=200 get=200 tampered=" + bad.statusCode() + " within-expiry=" + before.statusCode() + " after-expiry=" + after.statusCode());
    }

    @Test
    void rangeReadsIncludingSuffixAndOpenEnded() throws Exception {
        var key = "audio/ranges.flac";
        // 8 MB parts so ranges below straddle part boundaries.
        var up = multipartViaPresignedUrls(key, 40, 8);
        var whole = new ByteArrayOutputStream();
        for (int i = 1; i <= up.parts(); i++) whole.write(block(i, up.partSize()));
        var expected = whole.toByteArray();
        var url = presigner.presignGetObject(GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofMinutes(5))
                .getObjectRequest(GetObjectRequest.builder().bucket(BUCKET).key(key).build())
                .build()).url().toURI();

        record Case(String header, int from, int toInclusive) {}
        int size = expected.length;
        var cases = List.of(
                new Case("bytes=0-0", 0, 0),
                new Case("bytes=1000-1999", 1000, 1999),
                new Case("bytes=" + (8 * MB - 10) + "-" + (8 * MB + 10), 8 * MB - 10, 8 * MB + 10), // across a part boundary
                new Case("bytes=" + (size - 5000) + "-", size - 5000, size - 1), // open-ended
                new Case("bytes=-4096", size - 4096, size - 1), // suffix
                new Case("bytes=" + (size - 10) + "-" + (size + 1000), size - 10, size - 1)); // end past EOF is clamped
        var summary = new StringBuilder();
        for (var c : cases) {
            var r = http.send(HttpRequest.newBuilder(url).header("Range", c.header()).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
            assertEquals(206, r.statusCode(), c.header());
            var want = java.util.Arrays.copyOfRange(expected, c.from(), c.toInclusive() + 1);
            assertArrayEquals(want, r.body(), c.header());
            var contentRange = r.headers().firstValue("Content-Range").orElse("<missing>");
            assertEquals("bytes " + c.from() + "-" + c.toInclusive() + "/" + size, contentRange, c.header());
            summary.append(c.header().replaceAll("\\d{6,}", "N")).append("=206 ");
        }
        var plain = http.send(HttpRequest.newBuilder(url).GET().build(), HttpResponse.BodyHandlers.discarding());
        var acceptRanges = plain.headers().firstValue("Accept-Ranges").orElse("<missing>");
        var unsatisfiable = http.send(HttpRequest.newBuilder(url).header("Range", "bytes=" + (size + 100) + "-").GET().build(), HttpResponse.BodyHandlers.discarding());
        log("range.reads: PASS " + summary + "accept-ranges-header=" + acceptRanges + " beyond-eof=" + unsatisfiable.statusCode());
    }

    @Test
    void keyConventionsAndMetadata() {
        var audioKey = "audio/ab/abcdef0123456789.mp3";
        var coverKey = "covers/ab/abcdef0123456789.jpg";
        s3.putObject(PutObjectRequest.builder().bucket(BUCKET).key(audioKey).contentType("audio/mpeg")
                .metadata(java.util.Map.of("original-filename", "Song Title.mp3")).build(), RequestBody.fromBytes(block(1, 1024)));
        s3.putObject(PutObjectRequest.builder().bucket(BUCKET).key(coverKey).contentType("image/jpeg").build(), RequestBody.fromBytes(block(2, 512)));

        var audio = s3.headObject(HeadObjectRequest.builder().bucket(BUCKET).key(audioKey).build());
        assertEquals("audio/mpeg", audio.contentType());
        assertEquals("Song Title.mp3", audio.metadata().get("original-filename"));
        assertEquals("image/jpeg", s3.headObject(HeadObjectRequest.builder().bucket(BUCKET).key(coverKey).build()).contentType());

        var audioList = s3.listObjectsV2(ListObjectsV2Request.builder().bucket(BUCKET).prefix("audio/ab/").build());
        assertEquals(1, audioList.keyCount());
        var coverList = s3.listObjectsV2(ListObjectsV2Request.builder().bucket(BUCKET).prefix("covers/").build());
        assertEquals(1, coverList.keyCount());

        s3.deleteObject(b -> b.bucket(BUCKET).key(coverKey));
        var gone = s3.listObjectsV2(ListObjectsV2Request.builder().bucket(BUCKET).prefix("covers/").build());
        assertEquals(0, gone.keyCount());
        log("conventions: PASS single bucket '" + BUCKET + "', keys audio/<aa>/<sha256>.<ext> and covers/<aa>/<sha256>.<ext>, content-type, user metadata, prefix listing, delete");
    }

    /** Observation only: what happens with the SDK's default checksum behaviour (it changed in 2025). */
    @Test
    void sdkDefaultChecksumBehaviour() {
        var credentials = StaticCredentialsProvider.create(AwsBasicCredentials.create(ACCESS_KEY, SECRET_KEY));
        try (var defaults = S3Client.builder()
                .endpointOverride(endpoint).region(Region.US_EAST_1).credentialsProvider(credentials)
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .build()) {
            defaults.putObject(PutObjectRequest.builder().bucket(BUCKET).key("probe/default-checksum.bin").build(), RequestBody.fromBytes(block(5, 4096)));
            defaults.getObject(GetObjectRequest.builder().bucket(BUCKET).key("probe/default-checksum.bin").build()).readAllBytes();
            log("sdk.default-checksums: ok (no WHEN_REQUIRED override needed)");
        } catch (Exception e) {
            log("sdk.default-checksums: FAILS with SDK defaults, WHEN_REQUIRED override needed: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    /** Observation only: optional S3 features OSSM might be tempted to use. Failures here are findings, not test failures. */
    @Test
    void optionalFeatureProbes() throws Exception {
        probe("versioning", () -> s3.putBucketVersioning(b -> b.bucket(BUCKET).versioningConfiguration(v -> v.status("Enabled"))));
        probe("object-tagging", () -> {
            s3.putObject(PutObjectRequest.builder().bucket(BUCKET).key("probe/tag.bin").build(), RequestBody.fromBytes(new byte[8]));
            s3.putObjectTagging(b -> b.bucket(BUCKET).key("probe/tag.bin").tagging(t -> t.tagSet(ts -> ts.key("k").value("v"))));
        });
        probe("lifecycle", () -> s3.putBucketLifecycleConfiguration(b -> b.bucket(BUCKET).lifecycleConfiguration(l -> l.rules(
                r -> r.id("expire-incomplete").status("Enabled").filter(f -> f.prefix("tmp/"))
                        .abortIncompleteMultipartUpload(a -> a.daysAfterInitiation(1))))));
        probe("copy-object", () -> s3.copyObject(b -> b.sourceBucket(BUCKET).sourceKey("probe/tag.bin").destinationBucket(BUCKET).destinationKey("probe/copy.bin")));
        probe("batch-delete", () -> s3.deleteObjects(b -> b.bucket(BUCKET).delete(d -> d.objects(o -> o.key("probe/copy.bin"), o -> o.key("probe/tag.bin")))));
        probe("list-multipart-uploads", () -> s3.listMultipartUploads(b -> b.bucket(BUCKET)));
        probe("abort-multipart", () -> {
            var u = s3.createMultipartUpload(b -> b.bucket(BUCKET).key("probe/aborted.bin"));
            s3.abortMultipartUpload(b -> b.bucket(BUCKET).key("probe/aborted.bin").uploadId(u.uploadId()));
        });
        probe("put-bucket-cors", () -> s3.putBucketCors(b -> b.bucket(BUCKET).corsConfiguration(c -> c.corsRules(r -> r
                .allowedOrigins("http://localhost:8080").allowedMethods("GET", "PUT").allowedHeaders("*").exposeHeaders("ETag").maxAgeSeconds(600)))));

        // CORS preflight as a browser would send it for a direct presigned PUT.
        var preflight = http.send(HttpRequest.newBuilder(endpoint.resolve("/" + BUCKET + "/audio/x.mp3"))
                .method("OPTIONS", HttpRequest.BodyPublishers.noBody())
                .header("Origin", "http://localhost:8080")
                .header("Access-Control-Request-Method", "PUT")
                .header("Access-Control-Request-Headers", "content-type")
                .build(), HttpResponse.BodyHandlers.discarding());
        log("probe.cors-preflight: status=" + preflight.statusCode()
                + " allow-origin=" + preflight.headers().firstValue("Access-Control-Allow-Origin").orElse("<none>")
                + " allow-methods=" + preflight.headers().firstValue("Access-Control-Allow-Methods").orElse("<none>")
                + " expose=" + preflight.headers().firstValue("Access-Control-Expose-Headers").orElse("<none>"));
    }

    static void probe(String name, ThrowingRunnable r) {
        try {
            r.run();
            log("probe." + name + ": supported");
        } catch (Exception e) {
            log("probe." + name + ": NOT supported/failed: " + e.getClass().getSimpleName() + ": " + String.valueOf(e.getMessage()).lines().findFirst().orElse(""));
        }
    }

    interface ThrowingRunnable {
        void run() throws Exception;
    }
}
