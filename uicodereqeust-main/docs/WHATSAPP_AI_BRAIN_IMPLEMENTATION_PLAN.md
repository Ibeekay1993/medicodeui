# Ronsberger WhatsApp AI Brain — Implementation Plan

## Objective

Implement a production-grade conversational orchestration layer without breaking the existing WhatsApp authorization pipeline.

The implementation must be incremental. First inspect the current code and create tests. Then implement the smallest architecture that satisfies the behavior in `WHATSAPP_AI_BRAIN_SPEC.md`.

## Existing repository facts

The current worker is located at:

`uicodereqeust-main/supabase/functions/whatsapp-worker/index.ts`

The repository currently contains:

- `whatsapp-webhook`
- `whatsapp-worker`
- `submit-authorization`
- `whatsapp-diag-replay`
- WhatsApp-related migrations and documentation

The worker already has a deterministic authorization field detector, Gemini extraction/classification, multi-patient splitting, conversation state handling, message/authorization linkage, race-safe claiming, status handling, and notification behavior. These must be preserved unless code inspection proves a change is required.

## Phase 0 — Baseline

Before editing:

1. Checkout/create a feature branch.
2. Inspect the current worker, webhook, submit-authorization function, relevant migrations, and tests.
3. Record current behavior.
4. Run TypeScript checks and existing tests.
5. Search Git history for recent WhatsApp/Gemini/conversation changes.
6. Identify exactly where intent, conversation state, and routing currently occur.

Do not rewrite the worker before understanding the current flow.

## Phase 1 — Extract pure intelligence functions

Create testable pure functions where practical:

```text
normalizeIncomingMessage()
hasStrongAuthIndicators()
extractAuthFieldsFromRaw()
normalizeIntent()
resolveGoal()
mergeConversationContext()
detectTaskSwitch()
validateAuthorizationCompleteness()
detectAmbiguity()
```

Pure functions should not perform network or database operations.

## Phase 2 — Brain decision contract

Create a small module, for example:

`supabase/functions/whatsapp-worker/brain.ts`

or an equivalent location that fits the repository.

The module should expose a function conceptually like:

```typescript
export async function resolveConversation(
  input: BrainInput,
): Promise<BrainDecision>
```

where:

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

The return value must conform to the contract in `WHATSAPP_AI_BRAIN_SPEC.md`.

## Phase 3 — Deterministic precedence

Use the following precedence:

### P0: Explicit cancellation/restart

Examples:

- cancel
- cancel this
- start over
- forget this request

Only treat as cancellation when context supports it or wording is explicit.

### P1: Strong structured authorization evidence

If current message has strong authorization evidence, it must enter authorization interpretation even if it contains greeting or conversation text.

Example:

```text
Good morning. Please see the request.
Full Name: Akin Tehingbola
NHIS No: 2871250-1
Diagnosis: HTN
Drugs: Amlodipine 10mg x30
```

This cannot become GREETING.

### P2: Explicit task language

Examples:

```text
I want to submit a new request
Check the status of Segun
Why was Hannah rejected?
What was approved for John?
Which health providers can I use?
```

### P3: Contextual continuation

If the current message supplies missing fields for an active authorization task, merge it into that task.

### P4: General conversation

Only use general conversation when the message genuinely has no stronger task signal.

## Phase 4 — Current message beats stale context

This is mandatory.

Do not implement:

```typescript
if (conversation.intent === "GREETING") {
  // treat all future messages as greeting
}
```

Instead, determine the current goal from the current message plus context.

A greeting is an event, not a permanent conversation state.

## Phase 5 — Conversation context

Persist task context, not merely last intent.

Recommended structure:

```typescript
interface ConversationState {
  senderPhone: string;
  activeGoal: string | null;
  activeIntent: string | null;
  collectedFields: {
    patientName?: string | null;
    policyNumber?: string | null;
    diagnosis?: string | null;
    treatment?: string | null;
    procedure?: string | null;
    investigation?: string | null;
    requestedService?: string | null;
    originatingHospital?: string | null;
    referralHospital?: string | null;
    patientPhone?: string | null;
  };
  missingFields: string[];
  activePatientName?: string | null;
  activePolicyNumber?: string | null;
  lastAuthorizationRequestId?: string | null;
  conversationSummary?: string | null;
  stateVersion: number;
  updatedAt: string;
}
```

Use the actual existing database schema where possible rather than introducing redundant columns without justification.

## Phase 6 — Task switching

Support:

```text
User: I want to submit a request.
Bot: Please provide details.
User: Actually, what is the status of Segun?
```

The current task becomes CHECK_STATUS.

Do not destroy the unfinished authorization context unless the user explicitly cancels or begins a clearly new patient/request.

## Phase 7 — Authorization merge

For an active authorization conversation:

1. Read current stored state.
2. Analyze current message.
3. Extract any newly supplied fields.
4. Merge only non-empty new fields.
5. Detect explicit new patient identity.
6. If a new patient is clearly introduced, reset patient-specific collected fields while preserving sender-level conversation context.
7. Revalidate completeness.
8. If incomplete, ask only for the missing information.
9. If complete, submit once.

Never silently drop a message because the state is unexpected.

## Phase 8 — Status lookup

Status queries must be natural-language capable.

Examples:

```text
What's the status for Segun?
I need an update on Segun.
Has Segun been approved?
Any update on my request?
Can you check the request for NHIA 1234567?
```

The brain extracts patient name/number. Deterministic lookup must remain sender-scoped and use actual database records.

If there are multiple matches, ask for clarification.

Never fabricate status.

## Phase 9 — Provider query

Add a semantic `PROVIDER_QUERY` / `ASK_PROVIDER_INFORMATION` path.

Examples:

```text
I want to ask for a health provider.
Which hospitals can I use?
Do you have providers in Ibadan?
How can I find an approved provider?
```

If provider data is not currently available as a tool/data source, respond honestly and guide the user instead of pretending to have provider data.

## Phase 10 — Response composition

Keep business responses deterministic where the exact wording matters:

- authorization received
- status
- approval
- rejection
- missing required information

Use AI-generated conversational responses only for genuine conversational cases or where natural wording is explicitly appropriate.

Every response should be concise and WhatsApp-friendly.

## Phase 11 — Observability

Introduce structured logs for every brain decision:

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

Do not log secrets or full sensitive clinical payloads unnecessarily. Where possible, log field presence rather than complete values.

## Phase 12 — Error handling

Never allow a brain/DB/tool error to result in silence.

On recoverable AI failure:

1. Use deterministic strong-signal detection.
2. If authorization fields are sufficient, continue using deterministic fields.
3. Otherwise ask a targeted clarification or schedule retry.

On database failure:

- log exact safe error
- mark message retryable/failed according to existing queue policy
- do not claim the authorization was received unless persistence succeeded

On Evolution send failure:

- log the send error
- retain retry behavior

## Phase 13 — Tests

Create unit/integration tests covering at minimum:

### Greeting

```text
Hi
Good morning
Hello
Good evening 😂
```

Expected: GREETING.

### General conversation

```text
I want to test how smart you are
Is this all you can do?
Thank you
Okay
```

Expected: natural conversational response, not generic authorization fallback.

### Direct authorization

```text
Name: John Doe
NHIA No: 1234567
Diagnosis: Malaria
Treatment: Artemether/Lumefantrine
From University Health Services
```

Expected: submit authorization.

### Authorization after greeting

```text
User: Good morning
Bot: greeting
User: Name: John Doe...
```

Expected: submit authorization.

### Authorization after explicit task start

```text
User: I want to submit a new request
Bot: asks for details
User: Name: Segun...
```

Expected: merge and submit.

### Authorization with conversational preamble

```text
Hello 😂 I have a request for you:
Full Name: Akin Tehingbola
NHIS No: 2871250-1
Diagnosis: HTN
Drugs: Amlodipine 10mg x30
```

Expected: authorization.

### Hospital format

Support `Full Name`, `NHIS No`, `Diagnosis`, `Drugs`, `Procedures`, `Investigations`, `Services`, and `From`.

### Status

```text
What's the status for Segun?
I need an update for Segun.
Has Segun been approved?
Check NHIA 1234567.
```

Expected: status lookup path.

### Task switching

```text
User: I want to submit a request.
User: Actually check Segun's status.
```

Expected: status lookup, not continuation of authorization.

### Ambiguous patient

Multiple matching requests.

Expected: clarification.

### Multi-patient message

Three patient blocks in one message.

Expected: three separate authorization processing paths with correct message linkage.

### Duplicate protection

Repeated identical request.

Expected: existing duplicate behavior, no duplicate authorization.

### Same policy number, different patient

Two different patient names with same test NHIA number.

Expected: do not reject solely because policy number is identical.

## Phase 14 — Regression protection

Do not remove or weaken:

- race-safe claim logic
- sender-scoped status queries
- message-to-authorization linkage
- request IDs
- notification outbox
- retry/backoff
- multi-patient splitting
- duplicate protection
- no-UUID WhatsApp responses
- database schema compatibility
- webhook behavior

## Phase 15 — Deployment

Do not deploy until:

1. TypeScript passes.
2. Unit tests pass.
3. Relevant integration/replay tests pass.
4. Git diff is reviewed.
5. No secrets are committed.
6. The implementation report identifies every changed file.

Then deploy only the changed Edge Functions.

After deployment perform controlled WhatsApp tests:

1. Greeting.
2. New authorization directly.
3. Greeting then authorization.
4. Explicit authorization start then details.
5. Status query after greeting.
6. Status query after authorization.
7. Task switch from authorization to status.
8. Multi-patient submission.

Record the observed result for each.

## Final implementation report

The coding agent must finish with:

```text
ARCHITECTURE:
What brain/orchestrator was introduced and why.

FILES CHANGED:
Exact paths and purpose.

DATABASE CHANGES:
Exact migrations, if any.

AI CHANGES:
Prompt/schema/model changes.

STATE CHANGES:
How conversation context works.

ROUTING RULES:
How current message and context interact.

TOOLS:
Which deterministic capabilities the brain can invoke.

TESTS:
Exact tests run and results.

DEPLOYMENT:
Exact functions deployed and result.

LIVE TESTS:
Exact scenarios and outcomes.

REGRESSIONS:
Anything that remains unresolved.
```
