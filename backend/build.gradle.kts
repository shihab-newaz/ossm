plugins {
    java
    id("org.springframework.boot") version "4.1.1"
    id("io.spring.dependency-management") version "1.1.7"
    id("com.diffplug.spotless") version "8.0.0"
}

group = "dev.ossm"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-session-jdbc")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    // Argon2PasswordEncoder delegates to BouncyCastle.
    implementation("org.bouncycastle:bcprov-jdk18on:1.86")
    // Vendor-neutral object store access, and persistent Postgres-backed jobs (core library: no Boot starter).
    implementation(platform("software.amazon.awssdk:bom:2.55.10"))
    implementation("software.amazon.awssdk:s3")
    implementation("com.github.kagkarlsson:db-scheduler:16.12.0")
    // Tags, cover art and duration on the JVM, no ffmpeg.
    implementation("net.jthink:jaudiotagger:3.0.1")
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    implementation("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

    // Serves /v3/api-docs so a test can compare the running API with contract/openapi.yaml.
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-api:3.1.1")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.testcontainers:testcontainers-postgresql")
    testImplementation("org.testcontainers:testcontainers")
    testImplementation("org.yaml:snakeyaml")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<Test> {
    useJUnitPlatform()
    inputs.file("../contract/openapi.yaml")
}

// The restart tests start and stop whole APIs against the shared database and rely on only their
// own worker picking up ingest jobs. Other test classes leave cached Spring contexts alive in the
// same JVM, and those schedulers keep polling, so a job could be taken by a stranger and the test
// flakes. Running them in a JVM of their own removes the competition.
val restartTests by tasks.registering(Test::class) {
    description = "Ingest restart and crash-recovery tests, alone in their own JVM."
    group = "verification"
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    filter { includeTestsMatching("*IngestSurvivesRestartTest") }
    shouldRunAfter(tasks.test)
}

tasks.test {
    filter { excludeTestsMatching("*IngestSurvivesRestartTest") }
    finalizedBy(restartTests)
}

spotless {
    java {
        googleJavaFormat()
    }
}
