package dev.ossm.api.library;

import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/** A streamed body is bytes, not a JSON schema: keep it out of the generated contract. */
@Configuration
class OpenApiTypes {

  static {
    SpringDocUtils.getConfig().addResponseTypeToIgnore(StreamingResponseBody.class);
  }
}
