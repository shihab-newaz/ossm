package dev.ossm.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
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
 * running API gains, loses or renames an operation, or changes the response codes, without the
 * contract being updated.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(PostgresTestConfiguration.class)
class OpenApiContractTest {

  private static final Path CONTRACT = Path.of("..", "contract", "openapi.yaml");

  @LocalServerPort int port;

  @Test
  @SuppressWarnings("unchecked")
  void runningApiMatchesCommittedContract() throws Exception {
    Map<String, Object> committed = new Yaml().load(Files.readString(CONTRACT));
    Map<String, Object> running =
        new ObjectMapper().readValue(Http.get(port, "/v3/api-docs").body(), Map.class);

    assertThat(operations(running))
        .as("operations served by the API vs contract/openapi.yaml")
        .isEqualTo(operations(committed));
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
                      method.toUpperCase()
                          + " "
                          + path
                          + " "
                          + operation.get("operationId")
                          + " "
                          + statuses);
                }));
    return result;
  }
}
