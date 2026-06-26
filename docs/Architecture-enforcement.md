# ARCHITECTURE ENFORCEMENT RULES

This file ensures strict adherence to clean architecture.

--------------------------------------------------
CORE RULE
--------------------------------------------------

Renderer can ONLY talk to system via:

window.posApi

No exceptions.

--------------------------------------------------
STRICT LAYER FLOW

Renderer
→ Preload
→ Controller
→ Service
→ Repository
→ Database

Reverse flow is allowed only as return response.

--------------------------------------------------
FORBIDDEN PATTERNS

DO NOT:

- Call database from renderer
- Call repository from renderer
- Put SQL in services or controllers
- Put business logic in renderer
- Mix UI logic with services
- Skip IPC layer

--------------------------------------------------
RESPONSIBILITY ISOLATION

Repository:
- ONLY SQL queries

Service:
- Business logic only

Controller:
- IPC only

Renderer:
- UI only

Preload:
- API bridge only

--------------------------------------------------
NO DUPLICATION RULE

If logic exists in service:

- It must NOT exist in renderer
- It must NOT exist in controller

--------------------------------------------------
FEATURE STRUCTURE ENFORCEMENT

Each module must follow:

module/
  controller.js
  service.js
  repository.js
  permissions.js

No deviations allowed.

--------------------------------------------------
IMPORT RULES

Renderer must NEVER import:

- database
- services
- repositories

Only allowed:

- window.posApi

--------------------------------------------------
CIRCULAR DEPENDENCY PROHIBITION

Never allow:

A → B → A dependency loops

--------------------------------------------------
ONLINE COMPATIBILITY RULE

All business logic must remain backend-compatible for future API migration.

Electron must act as a client, not a logic holder.

--------------------------------------------------
FINAL PRINCIPLE

UI should be replaceable without touching business logic.