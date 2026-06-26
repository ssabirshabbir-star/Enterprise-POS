\# EXECUTION CONTROL RULES (CRITICAL SYSTEM SAFETY LAYER)



This file defines how ALL changes must be executed in the Enterprise POS system.



\--------------------------------------------------

ABSOLUTE RULE

\--------------------------------------------------



NEVER directly modify large-scale architecture without audit.



No feature development is allowed before structural validation.



\--------------------------------------------------

PHASE-BASED DEVELOPMENT

\--------------------------------------------------



All work must follow strict phases:



PHASE 1: AUDIT ONLY

\- Read codebase

\- Identify structure

\- Identify problems

\- DO NOT modify code



PHASE 2: REPORT ONLY

\- Provide full analysis report

\- Include file paths

\- Include risks

\- Include migration map



PHASE 3: APPROVAL REQUIRED

\- No changes allowed until explicit approval is given



PHASE 4: MINIMAL SAFE CHANGES

\- Only one module at a time

\- No cross-module changes

\- No refactor outside scope



PHASE 5: VERIFICATION

\- Ensure system still runs

\- Ensure no UI breaks

\- Ensure no IPC break



\--------------------------------------------------

STRICT PROHIBITIONS

\--------------------------------------------------



NEVER:



\- Rewrite entire project structure

\- Replace full files without reason

\- Mix multiple modules in one change

\- Modify login system without explicit instruction

\- Change preload/main IPC structure globally

\- Move files without mapping old → new



\--------------------------------------------------

GOD FILE PREVENTION

\--------------------------------------------------



If a file exceeds:



\- 500 lines → refactor required

\- 1000 lines → split mandatory

\- 1500 lines → must be split immediately



Never allow:



\- business logic + UI + DB in same file



\--------------------------------------------------

SAFE CHANGE RULE



Every change must include:



\- File path

\- Reason

\- Risk level

\- Rollback plan



\--------------------------------------------------

SYSTEM STABILITY PRIORITY



Order of priority:



1\. Data integrity

2\. System stability

3\. Existing functionality

4\. New features

5\. Refactoring



Never break working features for optimization.

