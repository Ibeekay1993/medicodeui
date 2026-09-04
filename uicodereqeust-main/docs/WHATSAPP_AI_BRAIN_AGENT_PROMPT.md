# CODING AGENT MASTER PROMPT — RONsBERGER WHATSAPP AI BRAIN

You are working directly in the `Ibeekay1993/medicodeui` repository.

Repository root relevant to this work:

`uicodereqeust-main/`

Read these documents before changing code:

- `uicodereqeust-main/docs/WHATSAPP_AI_BRAIN_SPEC.md`
- `uicodereqeust-main/docs/WHATSAPP_AI_BRAIN_IMPLEMENTATION_PLAN.md`
- existing WhatsApp setup/webhook documentation

## MISSION

Upgrade the WhatsApp assistant into a genuinely context-aware conversational authorization assistant by introducing an AI conversation orchestration/brain layer.

The goal is NOT to make the system more complicated for its own sake.

The goal is to eliminate the current brittle behavior where the assistant sometimes understands a request when it arrives directly but becomes confused when the user first starts a conversation, changes topic, continues an unfinished request, or asks a natural-language status question.

The system must understand the user's **current intent + current goal + relevant previous context**, while deterministic services remain responsible for database operations and business truth.

## IMPORTANT: DO NOT BLINDLY REWRITE THE WORKER

The existing WhatsApp worker already contains valuable production behavior. Inspect it first.

Preserve unless there is evidence that a change is required:

- webhook integration
- Evolution API integration
- queued message processing
- race-safe claiming
- retry/backoff
- multi-patient splitting
- deterministic authorization field extraction
- conversation persistence
- authorization creation
- sender-scoped status lookup
- message-to-authorization linkage
- duplicate protection
- request IDs
- approval/rejection handling
- notification outbox
- no UUID exposure in WhatsApp responses
- security boundaries

Do not remove existing working functionality to implement the brain.

## FIRST: AUDIT THE CURRENT SYSTEM

Before changing code:

1. Read the entire current `whatsapp-worker/index.ts`.
2. Read `whatsapp-webhook/index.ts`.
3. Read `submit-authorization/index.ts`.
4. Read relevant WhatsApp migrations.
5. Read existing diagnostic/replay function.
6. Search Git history for recent WhatsApp, Gemini, intent, conversation, and routing changes.
7. Identify where Gemini is called.
8. Identify where its result is normalized.
9. Identify where current conversation state is read/written.
10. Identify every intent branch.
11. Identify every generic fallback.
12. Identify every place a message can finish without sending a response.
13. Identify every place an error can be swallowed.
14. Run current tests/type checking before modifications.

Do not claim the architecture is broken without showing the actual code path.

## CURRENT BEHAVIOR TO FIX

The following live behavior is representative:

### Works

```text
User: Full Name: AKIN TEHINGBOLA
NHIS No: 2871250-1
Diagnosis: HTN
Drugs: Amlodipine Tablet 10mg x30
FROM UNIVERSITY HEALTH SERVICE

Bot: Your medical authorization request for AKIN TEHINGBOLA has been received successfully.
```

Also works when the user sends a complete request after ordinary conversation in some cases.

### Fails intermittently / contextually

```text
User: Good evening
Bot: greeting

User: I want to submit a new request
Bot: asks for patient name, NHIA/policy, diagnosis, treatment/service

User: Name: Segun Akinoe
NHIA No: 1234567
Diagnosis: Malaria
Treatment: Paractemaol Artemether/Lumefantrine
From University Health Services

Bot: sometimes no response
```

Another failure:

```text
User: Hello
Bot: greeting

User: I want to ask for a health provider
Bot: generic fallback

User: I need to understand the status for Segun
Bot: generic fallback
```

The desired system must understand these naturally.

## ARCHITECTURAL TARGET

Implement this conceptual flow:

```text
WhatsApp
   ↓
Evolution API
   ↓
whatsapp-webhook
   ↓
whatsapp_messages
   ↓
whatsapp-worker
   ↓
AI CONVERSATION BRAIN / ORCHESTRATOR
   ├── current message understanding
   ├── relevant conversation context
   ├── goal detection
   ├── intent resolution
   ├── entity extraction
   ├── missing field detection
   ├── task switching
   ├── ambiguity detection
   └── tool selection
            ↓
   deterministic business service
            ↓
   actual database/tool result
            ↓
   response composer
            ↓
   Evolution API
            ↓
   WhatsApp
```

## CRITICAL DESIGN PRINCIPLE

AI interprets language.

Deterministic application services execute business actions.

Gemini must NOT directly write to the database.

Gemini must NOT invent authorization status.

Gemini must NOT approve or reject medical requests.

Gemini must NOT fabricate patient information.

The AI may say:

```json
{
  "goal": "CHECK_STATUS",
  "action": "LOOKUP_STATUS",
  "patientName": "Segun"
}
```

The application then queries Supabase and supplies the actual result.

## BRAIN INPUT

The brain should receive:

```typescript
interface BrainInput {
  messageText: string;
  senderPhone: string;
  conversationState: ConversationState | null;
  recentRelevantMessages: Array<{
    role: "user" | "assistant";
    text: string;
  }>;
  deterministicSignals: {
    strongAuthorization: boolean;
    rawFields: Record<string, string | null>;
  };
}
```

Do not dump an unlimited WhatsApp transcript into Gemini. Provide a bounded, relevant context window and stored task state.

## BRAIN OUTPUT

Implement a strict structured output:

```typescript
interface BrainDecision {
  intent: string;
  goal: string;
  confidence: number;
  action:
    | "RESPOND"
    | "COLLECT_INFORMATION"
    | "SUBMIT_AUTHORIZATION"
    | "LOOKUP_STATUS"
    | "LOOKUP_DETAILS"
    | "CANCEL"
    | "ASK_CLARIFICATION"
    | "NO_ACTION";
  entities: {
    patientName?: string | null;
    policyNumber?: string | null;
    diagnosis?: string | null;
    treatment?: string | null;
    procedure?: string | null;
    investigation?: string | null;
    requestedService?: string | null;
    patientPhone?: string | null;
    originatingHospital?: string | null;
    referralHospital?: string | null;
    queryPatientName?: string | null;
    queryPolicyNumber?: string | null;
  };
  missingFields: string[];
  ambiguity: {
    required: boolean;
    reason?: string | null;
  };
  responseHint?: string | null;
  tool?:
    | "submit_authorization"
    | "find_authorization_requests"
    | "get_authorization_status"
    | "get_authorization_details"
    | "cancel_authorization"
    | "get_provider_information"
    | null;
}
```

If the existing Gemini response type can be safely evolved rather than replaced, do so incrementally.

## INTENT/GOAL STANDARD

Supported intents:

```text
GREETING
GENERAL_CONVERSATION
HELP
NEW_AUTHORIZATION
INCOMPLETE_AUTHORIZATION
CONTINUE_AUTHORIZATION
AUTHORIZATION_STATUS
APPROVAL_QUERY
REJECTION_QUERY
AUTHORIZATION_DETAILS
CANCELLATION
PROVIDER_QUERY
UNKNOWN
```

Supported goals:

```text
START_CONVERSATION
SUBMIT_AUTHORIZATION
CONTINUE_AUTHORIZATION
CHECK_STATUS
CHECK_APPROVAL
CHECK_REJECTION_REASON
VIEW_REQUEST_DETAILS
ASK_PROVIDER_INFORMATION
CANCEL_OR_RESTART
GENERAL_ASSISTANCE
```

## PRECEDENCE RULES

Do not let stale conversation context dominate current evidence.

Recommended precedence:

### P0 — Explicit cancellation/restart

If explicit, process cancellation/restart.

### P1 — Strong current-message authorization evidence

If current message contains multiple structured authorization fields, treat it as authorization-related regardless of whether it starts with:

- Hi
- Hello
- Good morning
- Good afternoon
- Good evening
- please
- I have a request
- see below
- I want to submit this

### P2 — Explicit current task request

Examples:

```text
I want to submit a request
Check Segun's status
Has Segun been approved?
Why was Segun rejected?
What was submitted for Segun?
Which providers can I use?
```

### P3 — Contextual continuation

If the current message supplies missing fields for an active authorization task, merge it into the active task.

### P4 — General conversation

Only use this when no stronger task signal exists.

## STRONG AUTHORIZATION SIGNAL

The existing deterministic detector should be retained/improved.

Canonical fields:

```text
Name / Full Name / Patient Name
NHIA / NHIS / Policy Number
Diagnosis / Clinical Complaint / Impression
Treatment / Drugs / Medication
Procedure / Procedures
Investigation / Investigations / Test
Services / Consultation
From / Hospital / Facility / Clinic
Referred to
```

A complete structured request must be high confidence.

## IMPORTANT: GREETING IS AN EVENT, NOT A STATE LOCK

Never implement behavior equivalent to:

```typescript
if (previousIntent === "GREETING") {
  // future messages are treated as greeting
}
```

Instead:

```typescript
const decision = resolveCurrentGoal(currentMessage, context);
```

The user must be able to say:

```text
Good morning
```

then:

```text
I need an authorization
```

then:

```text
Name: Segun
NHIA: 1234567
Diagnosis: Malaria
Treatment: Artemether/Lumefantrine
```

and the system must complete the task.

## TASK SWITCHING

Users can change their mind.

Example:

```text
User: I want to submit a request.
Bot: Please provide details.
User: Actually, what is the status of Segun's previous request?
```

The current goal becomes `CHECK_STATUS`.

Do not destroy the unfinished authorization context unless appropriate. Preserve it so the user can return later.

## STATUS INTELLIGENCE

Understand natural-language status requests:

```text
What's the status for Segun?
I need an update for Segun.
Any update on Segun?
Has Segun been approved?
Can you check NHIA 1234567?
What happened to my request?
```

Map to the correct deterministic lookup.

If multiple candidates exist, ask a targeted clarification.

Never return a generic fallback when the intent is confidently a status query.

## PROVIDER INTELLIGENCE

Understand:

```text
I want to ask for a health provider.
Which hospitals can I use?
Do you have providers in Ibadan?
Can you help me find a provider?
```

If provider data is not yet exposed as a deterministic tool, tell the user what is currently possible rather than fabricating provider information.

## AUTHORIZATION COMPLETENESS

Authorization submission requires:

1. Patient name.
2. NHIA/NHIS/policy number.
3. Diagnosis/clinical complaint.
4. At least one requested clinical service represented by treatment/drugs, procedure, investigation, consultation, or another valid requested service.

Do NOT require the literal field name `Treatment`.

Do NOT require patient phone if the WhatsApp sender identity is sufficient.

## MULTI-PATIENT

Preserve existing multi-patient block splitting.

Example:

```text
Full Name: Akin...
...
Full Name: Hamdallah...
...
Full Name: Adesola...
...
```

Each patient must become a separate authorization request where complete.

The brain may understand the entire message, but deterministic processing must keep patient records separated.

## DUPLICATE PROTECTION

Preserve existing duplicate protection.

Do not reject two different patients merely because they share the same test NHIA number.

Duplicate identity must include appropriate patient/request context.

## DATABASE SOURCE OF TRUTH

For status/details/approval/rejection responses:

```text
AI intent
   ↓
DB query
   ↓
actual result
   ↓
response
```

Never:

```text
AI guesses status
   ↓
WhatsApp
```

## RESPONSE POLICY

Use deterministic templates for:

- authorization received
- missing authorization information
- status
- approval
- rejection
- details
- cancellation confirmation

Use AI conversational replies for genuine conversation where appropriate.

The generic fallback:

```text
Thank you for contacting Ronsberger HMO.

If you need to submit a patient authorization or check the status of a request, please provide the details here.

— Ronsberger HMO
```

must be a last resort, not the normal response to uncertainty.

When uncertain, prefer a useful clarification:

```text
I can help with that. Are you trying to submit a new authorization, check an existing request, or find a provider?
```

## NO SILENT PROCESSING

Every inbound message must produce an observable terminal state.

Possible states:

```text
processed
awaiting_information
clarification_requested
retry
terminal_error
```

Never silently return from a branch without logging why.

## OBSERVABILITY

Add structured safe logging:

```json
{
  "stage": "brain_decision",
  "message_id": "...",
  "intent": "AUTHORIZATION_STATUS",
  "goal": "CHECK_STATUS",
  "confidence": 0.96,
  "action": "LOOKUP_STATUS",
  "strongAuthorization": false,
  "missingFields": [],
  "taskSwitch": true
}
```

Do not log secrets.

Avoid unnecessarily logging complete medical payloads. Prefer field presence and safe identifiers.

## TESTING

Create automated tests for all of these:

### 1. Direct structured request

```text
Name: John Doe
NHIA No: 1234567
Diagnosis: Malaria
Treatment: Artemether/Lumefantrine
```

Expected: SUBMIT_AUTHORIZATION.

### 2. Greeting then structured request

```text
Good morning
```
then structured request.

Expected: SUBMIT_AUTHORIZATION.

### 3. Conversational preamble + structured request

```text
Good morning, I have a request for you.
Name: Segun Akinoe
NHIA No: 1234567
Diagnosis: Malaria
Treatment: Artemether/Lumefantrine
```

Expected: SUBMIT_AUTHORIZATION.

### 4. Explicit start then details

```text
I want to submit a new request
```
then details across one or more messages.

Expected: CONTINUE_AUTHORIZATION -> SUBMIT_AUTHORIZATION.

### 5. Status after greeting

```text
Hello
```
then:

```text
I need to understand the status for Segun
```

Expected: CHECK_STATUS.

### 6. Status while authorization is incomplete

```text
I want to submit a request
```
then:

```text
Actually, check Segun's previous request
```

Expected: task switch to CHECK_STATUS.

### 7. Provider question

```text
I want to ask for a health provider
```

Expected: PROVIDER_QUERY / ASK_PROVIDER_INFORMATION.

### 8. General conversation

```text
I want to test how smart you are
Is this all you can do?
Thank you
```

Expected: contextual conversational replies.

### 9. Hospital format

Use the actual Akin format from production.

Expected: authorization.

### 10. Procedures-only request

```text
Full Name: Hamdallah Oladejo
NHIS No: 2173578-1
Diagnosis: ? Fibroadenoma, ?Breast Cancer
Procedures: Breast Scan x2
```

Expected: valid authorization because procedure is a requested service.

### 11. Drugs-only request

Expected: valid authorization.

### 12. Investigation-only request

Expected: valid authorization.

### 13. Multi-patient request

Three patient blocks -> three separate authorization records.

### 14. Same policy, different patients

Expected: no false duplicate solely from policy number.

### 15. Ambiguous status

Multiple Segun requests -> clarification, not arbitrary selection.

## GEMINI FAILURE FALLBACK

If Gemini fails:

- Do not crash the entire message.
- Use deterministic strong authorization detection and field extraction where sufficient.
- For obvious structured authorization, continue safely.
- For uncertain messages, ask clarification or retry.

The system must not silently fail because the LLM call failed.

## SECURITY

Never expose:

- GEMINI_API_KEY
- SUPABASE_SERVICE_ROLE_KEY
- MEDAUTH_INTERNAL_API_KEY
- EVOLUTION_API_KEY
- webhook secrets
- worker secrets

Never put secrets in committed docs, logs, tests, or source.

## DATABASE MIGRATIONS

Only create migrations when actually required.

Before adding columns, inspect the current schema.

Prefer reusing existing `whatsapp_conversations` fields if sufficient.

If schema changes are necessary:

1. create a timestamped migration;
2. make it backward compatible where possible;
3. document it;
4. test it;
5. run database validation;
6. do not destroy production data.

## DEPLOYMENT RULE

Do not deploy until tests pass.

Do not modify `whatsapp-webhook` unless the investigation proves that a webhook change is necessary.

Deploy only the affected functions.

After deployment run controlled tests in this exact order:

1. `Good morning`
2. complete direct authorization
3. `Good morning` followed by authorization
4. `I want to submit a new request` followed by details
5. status query after greeting
6. status query after authorization
7. task switch from authorization to status
8. provider question
9. multi-patient request
10. duplicate request

Record each result.

## ACCEPTANCE CRITERIA

The work is complete only if:

- A greeting does not lock the conversation into greeting mode.
- A complete authorization is recognized regardless of conversational preamble.
- An authorization can be completed across multiple messages.
- Users can switch tasks naturally.
- Status questions work in natural language.
- Provider questions have a dedicated route.
- Ambiguity produces clarification.
- Generic fallback is rare and genuinely last-resort.
- No complete authorization silently disappears.
- Existing authorization/database/security functionality remains intact.
- Gemini remains an interpreter/orchestrator, not a source of business truth.
- Deterministic tools perform actual database actions.
- Automated tests cover the conversation matrix.

## GIT REQUIREMENTS

Work on a feature branch.

Make focused commits.

Do not commit secrets.

Before finalizing, show:

```bash
git status
git diff --stat
git diff
```

and explain each changed file.

## FINAL REPORT FORMAT

Return:

```text
ROOT CAUSE OF PREVIOUS CONVERSATIONAL FAILURES:

CURRENT ARCHITECTURE:

BRAIN/ORCHESTRATOR IMPLEMENTATION:

CURRENT-MESSAGE VS CONTEXT PRECEDENCE:

STATE MODEL:

TASK SWITCHING:

AUTHORIZATION ROUTING:

STATUS ROUTING:

PROVIDER ROUTING:

GEMINI SCHEMA/PROMPT CHANGES:

DETERMINISTIC FALLBACKS:

TOOLS:

DATABASE CHANGES:

FILES CHANGED:

TESTS RUN:

TEST RESULTS:

DEPLOYED FUNCTIONS:

LIVE WHATSAPP TEST RESULTS:

REGRESSION RISKS:

REMAINING WORK:
```

Do not report success merely because TypeScript compiles. The conversational test matrix must pass.
