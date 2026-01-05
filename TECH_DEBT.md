# Tech Debt

## Dependencies warnings (pytest output)

- passlib: deprecation warning for Python 3.13 removal of `crypt`
  - Action: upgrade `passlib` / `argon2-cffi`, verify hashes and auth flows.
  - Risk: future Python upgrade will break password hashing if not addressed.

- opentelemetry instrumentation: `pkg_resources` deprecation
  - Action: upgrade opentelemetry instrumentation to a version that avoids `pkg_resources`
    or pin `setuptools<81` temporarily.
  - Risk: noisy warnings now, future compatibility issues later.

- protobuf / google._upb warnings about `PyType_Spec` metaclass
  - Action: upgrade `protobuf` to a version compatible with Python 3.14.
  - Risk: future Python upgrade will fail import/runtime behavior.
