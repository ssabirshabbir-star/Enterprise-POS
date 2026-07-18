# Microsoft Visual C++ Runtime Prerequisite

Enterprise POS managed PostgreSQL uses the official Microsoft Visual C++ v14 x64 Redistributable as
a prerequisite for the PostgreSQL 17.10 Windows runtime.

Production managed PostgreSQL provisioning remains disabled until the full clean Windows Sandbox
certification matrix is reviewed and approved.

## Official Payload

- Product: Microsoft Visual C++ Redistributable 2015-2022 x64
- Filename: `vc_redist.x64.exe`
- Official source: `https://aka.ms/vc14/vc_redist.x64.exe`
- Documentation: `https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist`
- Pinned SHA-256: `843068991daaa1f73ad9f6239bce4d0f6a07a51f18c37ea2a867e9beca71295c`
- Observed version during certification preparation: `14.51.36247.0`
- Expected signer: `Microsoft Corporation`

The payload is an external release input. Do not commit the executable to Git. Place it at:

```text
D:\Enterprise-POS-release-inputs\prerequisites\microsoft-vc-runtime\vc_redist.x64.exe
```

## Packaging Policy

The normal production package includes only prerequisite manifest/documentation resources and
excludes `.exe` files. Certification builds may include the exact pinned Microsoft executable as an
explicit external resource after hash and signature verification.

## Install Policy

The supported install arguments are:

```text
vc_redist.x64.exe /install /passive /norestart
```

The installer must be verified before execution. Success is accepted only after post-install runtime
detection confirms a compatible x64 runtime. Exit codes `3010` and `1641` are restart-required
outcomes; PostgreSQL initialization must remain blocked until runtime readiness is rechecked after
restart.

Enterprise POS does not uninstall the shared Microsoft runtime during app uninstall. It is centrally
serviced by Microsoft and may be used by other applications.
