plugins {
    java
}

repositories {
    mavenCentral()
}

java {
    toolchain { languageVersion = JavaLanguageVersion.of(25) }
}

dependencies {
    testImplementation(platform("software.amazon.awssdk:bom:2.55.10"))
    testImplementation("software.amazon.awssdk:s3")
    testImplementation("org.testcontainers:testcontainers:2.0.5")
    testImplementation(platform("org.junit:junit-bom:5.13.4"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testRuntimeOnly("org.slf4j:slf4j-simple:2.0.17")
}

tasks.test {
    useJUnitPlatform()
    maxHeapSize = "1g"
    testLogging {
        events("passed", "failed", "skipped")
        showStandardStreams = true
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}
