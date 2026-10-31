# 1. Walking skeleton and the contract

Ticket 01. ADR 0003.

## Goal

The thinnest end-to-end system that every later slice builds on: one command starts the stack, the browser reaches the API through the same origin, and CI fails if the API changes without the contract changing.

## Learn first

- Spring Boot project layout with Gradle (Kotlin DSL), and a Java toolchain pinned in the build.
- Virtual threads in Spring Boot (`spring.threads.virtual.enabled`), and why a blocking-I/O app benefits from them.
- Flyway: a versioned migration history table, and why a baseline exists from day one.
- Testcontainers with Spring Boot's `@ServiceConnection`.
- What an OpenAPI document describes, and the difference between generating the spec from code and generating code from the spec.

## Procedure

1. Create the Spring Boot app (web, actuator, validation, JDBC/JPA, Flyway, the PostgreSQL driver). Pin Java 25 in `java.toolchain`.
2. Configure it in `application.yaml`:
   - `spring.threads.virtual.enabled: true`
   - `spring.jpa.hibernate.ddl-auto: validate` and `open-in-view: false`
   - `spring.jackson.default-property-inclusion: non_null`, so optional contract fields are absent rather than `null`
   - structured console logging (`logging.structured.format.console: ecs`)
   - only the `health` actuator endpoint exposed
3. Add `V1__baseline.sql`. It only enables `pg_trgm`. The point is that Flyway has a history table before any real table exists.
4. Add a health endpoint, then the Testcontainers Postgres configuration (`PostgresTestConfiguration`), then a test that calls the health endpoint over HTTP.
5. Hand-author `contract/openapi.yaml` with the health operation only.
6. Serve the running API's own description at `/v3/api-docs` (springdoc; the Swagger UI is switched off).
7. Write `OpenApiContractTest`: it loads the committed contract and the running `/v3/api-docs` and fails if they differ.
8. Wire CI: format check, tests, web checks, image builds (see rung 0).
9. Write the first three ADRs for decisions already made: object store, Postgres, contract-first.

## Decisions and why

- **Contract first, hand-authored (ADR 0003).** The web app and the backend are separate slices and must not drift. Every API change is a contract change first.
- **The contract test compares more than operations.** ADR 0003 describes it as comparing operations and response codes. The test itself also compares, per schema, the property names and the required property names. It does not compare types, formats or descriptions; those are reviewed by people and by the generated client.
- **Problem details for errors.** Errors use RFC 9457 (`application/problem+json`), through one `Problem` record and a handler.

## Pitfalls

- Letting the ORM create tables hides the real schema from review. `validate` makes a mismatch fail at startup instead.
- Generating the spec only from controller annotations makes the code the source of truth, which defeats the point of a contract the web team reads first.

## Snippets

Excerpts from the repo at `f2948f2`. `...` marks lines left out.

**`backend/src/main/resources/application.yaml`**: the settings that carry decisions.

```yaml
spring:
  threads:
    virtual:
      enabled: true
  jpa:
    open-in-view: false
    hibernate:
      ddl-auto: validate          # Flyway owns the schema; a mismatch fails at startup
  jackson:
    # Absent rather than null, so optional contract fields are simply missing.
    default-property-inclusion: non_null
logging:
  structured:
    format:
      console: ecs
management:
  endpoints:
    web:
      exposure:
        include: health
springdoc:
  api-docs:
    path: /v3/api-docs
  swagger-ui:
    enabled: false
```

**`V1__baseline.sql`**: the whole migration.

```sql
-- Baseline so Flyway has a history table from day one. Real tables arrive with the slices that need them.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

**`backend/build.gradle.kts`**: toolchain and the dependencies that matter at this rung.

```kotlin
plugins {
    java
    id("org.springframework.boot") version "4.1.1"
    id("io.spring.dependency-management") version "1.1.7"
    id("com.diffplug.spotless") version "8.0.0"
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    implementation("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")
    // Serves /v3/api-docs so a test can compare the running API with contract/openapi.yaml.
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-api:3.1.1")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.testcontainers:testcontainers-postgresql")
}

tasks.withType<Test> {
    useJUnitPlatform()
    inputs.file("../contract/openapi.yaml")   // edit the contract and the tests rerun
}

spotless {
    java {
        googleJavaFormat()
    }
}
```

**`OpenApiContractTest`**: the check that stops drift. It turns each side into sets of comparable strings.

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestInfrastructure.class)
class OpenApiContractTest {

  private static final Path CONTRACT = Path.of("..", "contract", "openapi.yaml");

  @LocalServerPort int port;

  @Test
  void runningApiMatchesCommittedContract() throws Exception {
    var committed = committedContract();
    var running = runningContract();

    assertThat(operations(running))
        .as("operations served by the API vs contract/openapi.yaml")
        .isEqualTo(operations(committed));
    assertThat(schemas(running))
        .as("schema properties served by the API vs contract/openapi.yaml")
        .isEqualTo(schemas(committed));
  }
  ...
  // One line per operation: "GET /api/v1/tracks listTracks [200, 401]"
  result.add("%s %s %s %s".formatted(method.toUpperCase(), path, operation.get("operationId"), statuses));
  // One line per schema: "Album properties=[...] required=[...]"
  result.add("%s properties=%s required=%s".formatted(name, new TreeSet<>(properties.keySet()), new TreeSet<>(required)));
}
```

What to notice: the string-per-item trick makes `assertThat(...).isEqualTo(...)` print a readable diff. The test reads the contract with a relative path, so Gradle must run it from `backend/`.

## Checkpoint

You are done with this rung when:

- [ ] `GET /api/v1/health` answers 200 in an HTTP-level test against a real Postgres container.
- [ ] Adding a new endpoint without touching `contract/openapi.yaml` makes `OpenApiContractTest` fail, and the failure message tells you which operation is the difference.
- [ ] Adding a property to a response record without updating the contract also fails it.
- [ ] Starting the app against an empty database applies V1 and records it in Flyway's history table.

## Reference code

`backend/build.gradle.kts`, `backend/src/main/resources/application.yaml`, `V1__baseline.sql`, `backend/src/test/java/dev/ossm/api/OpenApiContractTest.java`, `HealthEndpointTest.java`, `contract/openapi.yaml`.
