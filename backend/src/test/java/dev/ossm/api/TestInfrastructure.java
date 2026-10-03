package dev.ossm.api;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistrar;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;

/**
 * Real Postgres and a real S3-compatible store (SeaweedFS, the reference deployment). Neither is
 * ever mocked. Every integration test imports this one class so they share a single context.
 */
@TestConfiguration(proxyBeanMethods = false)
@Import(PostgresTestConfiguration.class)
public class TestInfrastructure {

  static final String ACCESS_KEY = "test-access";
  static final String SECRET_KEY = "test-secret-key";

  @Bean
  GenericContainer<?> objectStore() {
    return new GenericContainer<>("chrislusf/seaweedfs:4.48")
        .withCommand("server", "-dir=/data", "-s3")
        .withEnv("AWS_ACCESS_KEY_ID", ACCESS_KEY)
        .withEnv("AWS_SECRET_ACCESS_KEY", SECRET_KEY)
        .withExposedPorts(8333)
        .waitingFor(Wait.forListeningPorts(8333));
  }

  /** Browser and API reach the test store on the same address, so both properties match. */
  @Bean
  DynamicPropertyRegistrar storageProperties(GenericContainer<?> objectStore) {
    return registry -> {
      registry.add(
          "ossm.storage.endpoint",
          () -> "http://" + objectStore.getHost() + ":" + objectStore.getMappedPort(8333));
      registry.add(
          "ossm.storage.public-url",
          () -> "http://" + objectStore.getHost() + ":" + objectStore.getMappedPort(8333));
      registry.add("ossm.storage.access-key", () -> ACCESS_KEY);
      registry.add("ossm.storage.secret-key", () -> SECRET_KEY);
    };
  }
}
