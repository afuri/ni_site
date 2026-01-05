from __future__ import annotations

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.sampling import TraceIdRatioBased
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace.export import ConsoleSpanExporter

from app.core.config import settings


def setup_tracing() -> None:
    if not settings.OTEL_ENABLED:
        return

    service_name = settings.OTEL_SERVICE_NAME or settings.APP_NAME
    resource = Resource.create({"service.name": service_name})
    sampler = TraceIdRatioBased(settings.OTEL_SAMPLE_RATIO)
    provider = TracerProvider(resource=resource, sampler=sampler)

    if settings.OTEL_EXPORTER_OTLP_ENDPOINT:
        exporter = OTLPSpanExporter(endpoint=settings.OTEL_EXPORTER_OTLP_ENDPOINT)
    else:
        exporter = ConsoleSpanExporter()

    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
