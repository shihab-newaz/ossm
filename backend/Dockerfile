FROM eclipse-temurin:25-jdk AS build
WORKDIR /src
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle gradle
RUN ./gradlew --no-daemon --version
COPY src src
RUN ./gradlew --no-daemon bootJar -x test && mv build/libs/*-SNAPSHOT.jar /app.jar

FROM eclipse-temurin:25-jre
# ffprobe and ffmpeg read video files for ingest; they never transcode (ADR 0010).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 10001 ossm
USER ossm
COPY --from=build /app.jar /app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app.jar"]
