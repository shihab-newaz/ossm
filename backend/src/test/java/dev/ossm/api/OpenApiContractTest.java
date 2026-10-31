package dev.ossm.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.yaml.snakeyaml.Yaml;
import tools.jackson.databind.ObjectMapper;

/**
 * The committed contract (contract/openapi.yaml) is the source of truth. This fails when the
 * running API gains, loses or renames an operation, changes its response codes, or changes the
 * properties of a schema, without the contract being updated.
 *
 * <p>Operations and schemas marked {@code x-ossm-planned: true} in the contract are left out: the
 * web UI builds against them before the backend serves them. The ticket that implements one removes
 * its marker, and from then on it is checked like everything else.
 */
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

  private Map<String, Object> committedContract() throws Exception {
    return withoutPlanned(new Yaml().load(Files.readString(CONTRACT)));
  }

  private static final String PLANNED = "x-ossm-planned";

  /** The contract minus what is marked as planned: operations, paths left empty, and schemas. */
  @SuppressWarnings("unchecked")
  private static Map<String, Object> withoutPlanned(Map<String, Object> spec) {
    var paths = (Map<String, Map<String, Object>>) spec.get("paths");
    paths
        .values()
        .forEach(
            methods ->
                methods
                    .entrySet()
                    .removeIf(
                        e ->
                            Boolean.TRUE.equals(
                                ((Map<String, Object>) e.getValue()).get(PLANNED))));
    paths.values().removeIf(Map::isEmpty);
    var components = (Map<String, Object>) spec.getOrDefault("components", Map.of());
    var schemas = (Map<String, Map<String, Object>>) components.getOrDefault("schemas", Map.of());
    schemas.values().removeIf(schema -> Boolean.TRUE.equals(schema.get(PLANNED)));
    return spec;
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> runningContract() throws Exception {
    return new ObjectMapper().readValue(Http.get(port, "/v3/api-docs").body(), Map.class);
  }

  @SuppressWarnings("unchecked")
  private static TreeSet<String> operations(Map<String, Object> spec) {
    var result = new TreeSet<String>();
    var paths = (Map<String, Map<String, Object>>) spec.get("paths");
    paths.forEach(
        (path, methods) ->
            methods.forEach(
                (method, op) -> {
                  var operation = (Map<String, Object>) op;
                  var statuses =
                      new TreeSet<>(((Map<String, Object>) operation.get("responses")).keySet());
                  result.add(
                      "%s %s %s %s"
                          .formatted(
                              method.toUpperCase(), path, operation.get("operationId"), statuses));
                }));
    return result;
  }

  /** One line per schema: its name, property names and required property names. */
  @SuppressWarnings("unchecked")
  private static TreeSet<String> schemas(Map<String, Object> spec) {
    var result = new TreeSet<String>();
    var components = (Map<String, Object>) spec.getOrDefault("components", Map.of());
    var schemas = (Map<String, Map<String, Object>>) components.getOrDefault("schemas", Map.of());
    schemas.forEach(
        (name, schema) -> {
          var properties = (Map<String, Object>) schema.getOrDefault("properties", Map.of());
          var required = (List<String>) schema.getOrDefault("required", List.of());
          result.add(
              "%s properties=%s required=%s"
                  .formatted(name, new TreeSet<>(properties.keySet()), new TreeSet<>(required)));
        });
    return result;
  }
}
