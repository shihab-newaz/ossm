package dev.ossm.api.web;

import io.swagger.v3.oas.annotations.media.Schema;

/** Documents the RFC 9457 body that error responses carry; never instantiated. */
@Schema(description = "RFC 9457 problem details")
public record Problem(String type, String title, Integer status, String detail, String instance) {}
