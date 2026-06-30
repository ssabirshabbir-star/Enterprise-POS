# Design Tokens Specification

## Document Metadata

| Field         | Value                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Document      | Design Tokens Specification                                                                                                                  |
| Version       | 1.0                                                                                                                                          |
| Status        | Draft for Review                                                                                                                             |
| Scope         | Design token categories, naming, intent, and governance                                                                                      |
| Applies To    | Desktop POS; Future Web Edition; Future Cloud Edition; Future ERP Editions                                                                   |
| Depends On    | 20_ENTERPRISE_PRODUCT_EXPERIENCE_BLUEPRINT.md; 21_ENTERPRISE_PRODUCT_LANGUAGE_AND_TERMINOLOGY_STANDARD.md; 22_PRODUCT_DESIGN_CONSTITUTION.md |
| Next Document | 24_LAYOUT_PATTERNS.md                                                                                                                        |

## Purpose

This document defines the Enterprise POS design token system that will later guide UI modernization.

It defines token categories, naming principles, intent, and governance. It does not define final
production CSS, components, layouts, wireframes, or implementation code.

Design tokens must help Enterprise POS preserve a consistent premium commercial identity while
protecting cashier speed, desktop productivity, accessibility, and future ERP scalability.

## Token Authority

Higher authority:

- Project Constitution
- 20_ENTERPRISE_PRODUCT_EXPERIENCE_BLUEPRINT.md
- 21_ENTERPRISE_PRODUCT_LANGUAGE_AND_TERMINOLOGY_STANDARD.md
- 22_PRODUCT_DESIGN_CONSTITUTION.md

This document controls:

- Token category definitions
- Token naming philosophy
- Token usage intent
- Token governance
- Token amendment rules

Lower authority:

- Component specifications
- Layout patterns
- Interaction patterns
- Desktop UX rules
- CSS implementations
- Renderer implementations
- Module UI implementations

If implementation tokens conflict with this document, implementation must be revised unless this
document is formally amended.

## Token Philosophy

Enterprise POS tokens must support:

- Premium commercial appearance
- Fast cashier workflows
- Desktop-first density
- Calm long-session readability
- Role-aware workspaces
- Consistent module behavior
- Future Web, Cloud, Mobile, and ERP editions
- Accessibility by default

Tokens must be semantic before they are visual. A token should describe product purpose, state,
role, or hierarchy whenever possible.

Token names should remain stable even if visual values change later.

## Token Naming Model

Token names should follow a predictable hierarchy:

```text
category.intent.role.state.variant
```

Examples:

```text
color.action.primary.default
color.status.success.background
space.layout.section
radius.surface.panel
shadow.elevation.popover
motion.feedback.fast
layer.modal
density.table.compact
workspace.sell.accent
```

Token names must be:

- Human-readable
- Stable over time
- Purpose-driven
- Consistent with product terminology
- Independent from implementation technology

Avoid token names that describe temporary visual choices only.

## Color Tokens

Color tokens define the product's visual identity and hierarchy.

Core color token categories:

- `color.brand.*`
- `color.surface.*`
- `color.text.*`
- `color.border.*`
- `color.action.*`
- `color.status.*`
- `color.workspace.*`
- `color.chart.*`
- `color.overlay.*`

Color tokens must support both calm workspaces and vibrant commercial identity. Color must be used
for meaning, hierarchy, and workflow guidance, not decoration alone.

Color tokens must support Light Theme, Dark Theme, and High Contrast Theme without changing product
meaning or workflow hierarchy.

## Semantic Color Tokens

Semantic color tokens must describe business meaning.

Required semantic groups:

- `color.status.success.*`
- `color.status.warning.*`
- `color.status.danger.*`
- `color.status.info.*`
- `color.status.neutral.*`
- `color.stock.low.*`
- `color.stock.out.*`
- `color.payment.paid.*`
- `color.payment.due.*`
- `color.permission.disabled.*`
- `color.validation.error.*`

Semantic color tokens must be used consistently across UI, reports, notifications, charts, and
future editions.

Color must never be the only way status is communicated.

## Typography Tokens

Typography tokens define text hierarchy and reading comfort.

Token categories:

- `type.family.*`
- `type.size.*`
- `type.weight.*`
- `type.lineHeight.*`
- `type.label.*`
- `type.heading.*`
- `type.body.*`
- `type.data.*`
- `type.action.*`
- `type.monospace.*`

Typography tokens must support:

- Long desktop sessions
- Dense data grids
- Clear module titles
- Fast scanning
- Legible totals and numeric values
- Accessible reading hierarchy

Typography tokens must not be chosen for visual style alone. They must support product speed and
readability.

## Spacing Tokens

Spacing tokens define consistent relationships between UI elements.

Token categories:

- `space.inline.*`
- `space.stack.*`
- `space.inset.*`
- `space.layout.*`
- `space.form.*`
- `space.table.*`
- `space.dialog.*`
- `space.dashboard.*`

Spacing must support two design modes:

- Calm spacing for forms, settings, dialogs, and decision screens.
- Productive density for tables, inventory, purchases, reports, and cashier workflows.

Spacing tokens must prevent each module from inventing its own rhythm.

## Sizing Tokens

Sizing tokens define stable control, surface, and workspace dimensions.

Token categories:

- `size.control.*`
- `size.icon.*`
- `size.sidebar.*`
- `size.header.*`
- `size.table.row.*`
- `size.action.*`
- `size.dialog.*`
- `size.panel.*`

Sizing tokens must protect:

- Click/tap targets where appropriate
- Keyboard focus stability
- Table row consistency
- Action bar predictability
- Desktop viewport support

Sizing tokens must not force tablet-like spacing into dense desktop workflows.

## Radius Tokens

Radius tokens define the product's rounded geometry.

Token categories:

- `radius.control.*`
- `radius.surface.*`
- `radius.panel.*`
- `radius.dialog.*`
- `radius.badge.*`
- `radius.full.*`

Radius must feel modern and premium without making enterprise data screens look toy-like.

Different component families may use different radius intent, but the system must remain coherent.

## Shadow and Elevation Tokens

Shadow/elevation tokens define hierarchy, layering, and separation.

Token categories:

- `shadow.surface.*`
- `shadow.elevation.*`
- `shadow.focus.*`
- `shadow.overlay.*`
- `shadow.action.*`

Shadows must support clarity. They should separate surfaces, emphasize temporary layers, and guide
attention without creating visual noise.

Elevation must not replace proper spacing or information hierarchy.

## Surface Tokens

Surface tokens define the hierarchy of product areas and containers.

Token categories:

- `surface.app.*`
- `surface.workspace.*`
- `surface.panel.*`
- `surface.table.*`
- `surface.form.*`
- `surface.modal.*`
- `surface.elevated.*`

Surface tokens must help users understand where work happens, where context lives, and where
temporary overlays begin.

## Border Tokens

Border tokens define containment, separation, and state.

Token categories:

- `border.width.*`
- `border.color.*`
- `border.style.*`
- `border.focus.*`
- `border.validation.*`
- `border.table.*`

Borders must support:

- Table readability
- Form clarity
- Focus visibility
- Validation states
- Module surface separation

Borders must not make screens feel heavy or grid-locked unless dense data presentation requires it.

## Motion Tokens

Motion tokens define timing and behavior for transitions and feedback.

Token categories:

- `motion.duration.*`
- `motion.easing.*`
- `motion.feedback.*`
- `motion.navigation.*`
- `motion.overlay.*`
- `motion.loading.*`

Motion must be functional, fast, and subtle.

Motion must not delay cashier workflows, hide state changes, or create uncertainty.

Reduced-motion support must be planned for future implementation.

## Icon Tokens

Icon tokens define icon behavior and product-wide icon consistency.

Token categories:

- `icon.size.*`
- `icon.stroke.*`
- `icon.fill.*`
- `icon.action.*`
- `icon.status.*`
- `icon.workspace.*`
- `icon.disabled.*`

Icon tokens must support clarity and speed. Icons must not replace labels where meaning would become
unclear.

## Media and Illustration Tokens

Media and illustration tokens define governance for non-component visual assets.

Token categories:

- `media.product.*`
- `media.emptyState.*`
- `media.help.*`
- `media.campaign.*`
- `illustration.emptyState.*`
- `illustration.onboarding.*`
- `illustration.warning.*`

Media and illustration tokens must support product clarity and premium commercial identity. They
must not make operational screens feel decorative or toy-like.

## Z-Index and Layer Tokens

Layer tokens define stacking order and interaction priority.

Token categories:

- `layer.base`
- `layer.sticky`
- `layer.dropdown`
- `layer.popover`
- `layer.modal`
- `layer.confirmation`
- `layer.toast`
- `layer.system`

Layer tokens must prevent invisible overlays, blocked clicks, broken dialogs, and inconsistent modal
behavior.

Layers must be documented before implementation in CSS or components.

## Backdrop Tokens

Backdrop tokens define the treatment of temporary blocking or focus-shifting surfaces.

Token categories:

- `backdrop.modal.*`
- `backdrop.drawer.*`
- `backdrop.loading.*`
- `backdrop.confirmation.*`
- `backdrop.system.*`

Backdrop tokens must prevent hidden interaction blockers, unclear modal states, and inconsistent
overlay behavior.

## Density Tokens

Density tokens define how compact or spacious an interface should feel.

Token categories:

- `density.cashier.*`
- `density.table.*`
- `density.dashboard.*`
- `density.form.*`
- `density.manager.*`
- `density.owner.*`
- `density.erp.*`

Density must be role-aware and workflow-aware.

Guidance:

- Billing should be fast and clear.
- Inventory, Purchases, Reports, and Sales History may be denser.
- Settings, User Management, and dangerous workflows should be calmer.
- ERP editions may support higher density where trained users need it.

## State Tokens

State tokens define interaction and lifecycle states.

Token categories:

- `state.default.*`
- `state.hover.*`
- `state.focus.*`
- `state.active.*`
- `state.selected.*`
- `state.disabled.*`
- `state.loading.*`
- `state.error.*`
- `state.warning.*`
- `state.success.*`
- `state.readonly.*`

State tokens must make interactions predictable and accessible.

Disabled, placeholder, and Phase 2 states must not look like active workflow actions.

## Focus Tokens

Focus tokens define visible focus behavior for keyboard and accessibility workflows.

Token categories:

- `focus.keyboard.*`
- `focus.mouse.*`
- `focus.danger.*`
- `focus.modal.*`
- `focus.table.*`
- `focus.form.*`

Focus tokens must remain visible, predictable, and consistent across desktop workflows.

## Feedback Tokens

Feedback tokens define product-wide message and notification behavior.

Token categories:

- `feedback.toast.*`
- `feedback.banner.*`
- `feedback.inline.*`
- `feedback.validation.*`
- `feedback.success.*`
- `feedback.warning.*`
- `feedback.error.*`
- `feedback.info.*`

Feedback tokens must keep messages compact, professional, and non-blocking unless the workflow is
dangerous or requires user correction.

## Role and Workspace Tokens

Role and workspace tokens define identity and context for role-aware experiences.

Token categories:

- `role.cashier.*`
- `role.seniorCashier.*`
- `role.storeManager.*`
- `role.branchManager.*`
- `role.administrator.*`
- `role.owner.*`
- `role.erpUser.*`
- `workspace.sell.*`
- `workspace.stock.*`
- `workspace.customers.*`
- `workspace.money.*`
- `workspace.growth.*`
- `workspace.control.*`
- `workspace.platform.*`

Role/workspace tokens must support orientation without turning each workspace into a separate visual
product.

## Chart and Data Visualization Tokens

Chart tokens define data visualization consistency.

Token categories:

- `chart.series.*`
- `chart.axis.*`
- `chart.grid.*`
- `chart.positive.*`
- `chart.negative.*`
- `chart.neutral.*`
- `chart.warning.*`
- `chart.highlight.*`

Chart tokens must support:

- Dashboard summaries
- Reports
- Sales trends
- Stock risk
- Payment breakdowns
- Customer/supplier insights

Charts must prioritize clarity over decoration.

## Print and Receipt Tokens

Print and receipt tokens define governance for output surfaces.

Token categories:

- `print.report.*`
- `print.invoice.*`
- `print.summary.*`
- `receipt.thermal.*`
- `receipt.pdf.*`
- `receipt.whatsapp.*`
- `receipt.reprint.*`

Print and receipt tokens must preserve readability, official terminology, and customer-facing
professionalism across printed, PDF, and shared outputs.

## Brand Tokens

Brand tokens define product identity, edition identity, and future deployment branding boundaries.

Token categories:

- `brand.product.*`
- `brand.edition.*`
- `brand.workspace.*`
- `brand.platform.*`
- `brand.partner.*`
- `brand.license.*`

Branding tokens may support future product editions and white-label deployments, but they remain
governed by Product Design Governance. Branding must never bypass licensing, platform authority, or
commercial protection rules.

## Accessibility Token Rules

Tokens must support accessibility requirements from the beginning.

Rules:

- Color tokens must support text readability.
- Status tokens must not rely on color alone.
- Focus tokens must remain visible.
- Typography tokens must support comfortable reading.
- Motion tokens must allow reduced-motion behavior.
- Density tokens must not make interactive controls unusable.
- State tokens must distinguish disabled, readonly, selected, and active states.

Accessibility must be part of token governance, not a later patch.

## Desktop-First Token Rules

Tokens must be optimized for desktop-first operation.

Rules:

- Support 1366x768 as a serious production viewport.
- Support larger desktop monitors without excessive whitespace.
- Support dense data grids.
- Support keyboard focus and scanner-first workflows.
- Support long-shift visual comfort.
- Support role-aware workspaces.
- Avoid mobile-first sizing assumptions in core desktop screens.

Future mobile or companion applications may adapt token usage, but they must preserve the same
product philosophy.

## Future Theme Support

Tokens must allow future themes without changing product meaning.

Possible future theme dimensions:

- Standard desktop theme
- Light Theme
- Dark Theme
- High-contrast accessibility theme
- Low-fatigue long-shift theme
- Future web/cloud adaptation
- Future role or edition accenting

Themes must not break terminology, workflow hierarchy, or licensing boundaries.

High Contrast Theme must remain available as an accessibility path, not merely a visual preference.

Dark Theme must preserve readability, status meaning, and long-session comfort.

Light Theme must remain the default baseline unless a future approved product decision changes it.

## Localization and RTL Token Readiness

Tokens must remain ready for future localization and right-to-left language support.

Rules:

- Text-related tokens must allow language expansion.
- Layout-adjacent token names must avoid left/right assumptions where start/end meaning is intended.
- Icons and directional affordances must be reviewable for right-to-left contexts.
- Spacing and sizing tokens must support longer localized labels.
- Status and feedback tokens must preserve meaning across languages.
- Print and receipt tokens must preserve readability for localized output.

No translations are defined in this document. Localization-specific token values or adaptations must
be approved in future implementation documents.

## Token Governance

Token changes must be controlled.

Rules:

- New tokens must have a clear product purpose.
- Tokens must not duplicate existing intent under a different name.
- Module-specific tokens must be avoided unless a genuine workflow need exists.
- Visual-only tokens should be converted into semantic tokens where possible.
- Token naming must follow the Product Language & Terminology Standard.
- Token changes must be reviewed for accessibility, desktop productivity, and future ERP impact.

No module may create its own token language when a system token exists.

## Amendment Policy

Before changing the token system, prepare:

1. Current token or category.
2. Reason it is insufficient.
3. Proposed token or category.
4. Modules affected.
5. Future documents affected.
6. Accessibility impact.
7. Desktop productivity impact.
8. Migration plan.
9. Product Owner approval.

If a task requires breaking this token specification, stop and report:

`Design token conflict found. Approval required before proceeding.`

## Final Principle

Design tokens must make Enterprise POS more consistent, more productive, more accessible, and more
commercially trustworthy.

Tokens are not decoration. They are product governance.
