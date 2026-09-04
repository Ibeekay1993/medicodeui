# Ronsberger WhatsApp AI Brain — Architecture & Behavioral Specification

## 1. Purpose

This document defines the target architecture for the Ronsberger HMO WhatsApp assistant. The goal is to make the assistant genuinely conversational and context-aware instead of relying on an ever-growing collection of intent `if/else` rules.

The assistant must understand the user's **current goal**, relevant **conversation context**, extracted **entities**, missing information, ambiguity, and available system actions. AI may interpret language; deterministic application services remain authoritative for database writes, authorization rules, security, and status data.

Repository: `Ibeekay1993/medicodeui`
Application source root: `uicodereqeust-main/`
Supabase functions: `uicodereqeust-main/supabase/functions/`

## 2. Current production lesson

The live WhatsApp behavior demonstrates these requirements:

- A structured authorization sent as the first message can be processed.
- A user can greet first and later send a structured authorization; this must also work.
- A user can start an authorization conversationally and then provide fields across multiple messages.
- A user can switch from authorization to status questions without restarting the conversation.
- A status request must be understood from natural language such as `I need to understand the status for Segun`.
- A greeting must not permanently lock the conversation into a greeting state.
- A previous task must provide context, but must never override strong evidence in the current message.
- A complete authorization must never be silently ignored.

## 3. Target mental model

The system should behave like a stateful assistant with controlled tools:

```text
WhatsApp
   |
   v
Evolution API
   |
   v
whatsapp-webhook
   |
   v
whatsapp_messages queue
   |
   v
whatsapp-worker
   |
   v
AI CONVERSATION ORCHESTRATOR (the brain)
   |
   +-- current-message understanding
   +-- conversation context
   +-- intent / goal resolution
   +-- entity extraction
   +-- missing-field detection
   +-- ambiguity detection
   +-- task switching
   +-- tool selection
   |
   +----------------+-------------------+------------------+
   |                |                   |                  |
   v                v                   v                  v
Authorization   Status/Details      Provider/Help     General Chat
service         service             service            response
   |                |                   |                  |
   +----------------+-------------------+------------------+
                            |
                            v
                    Response Composer
                            |
                            v
                      Evolution API
                            |
                            v
                         WhatsApp
```

## 4. Core architectural rule

**The AI brain decides what the user means. Deterministic services decide what the system is allowed to do and what is actually true.**

Gemini must never directly invent or mutate authorization records. It may return structured intent/entities/tool requests. The worker validates the decision and calls deterministic functions.

Examples:

- AI says `AUTHORIZATION_STATUS` for Segun -> deterministic database lookup.
- AI says `SUBMIT_AUTHORIZATION` with patient fields -> deterministic validation and `submit-authorization` call.
- AI says `CANCEL_AUTHORIZATION` -> deterministic authorization/cancellation policy.
- AI says `GENERAL_CONVERSATION` -> response generation is allowed.

## 5. Message understanding model

Every message must be evaluated using both:

1. The current message.
2. Relevant stored conversation state.

Do not use a simplistic `previousIntent -> currentIntent` chain.

The current message has precedence when it contains strong evidence.

### Example

Previous state:

```json
{
  "active_goal": "GREETING"
}
```

Current message:

```text
Full Name: AKIN TEHINGBOLA
NHIS No: 2871250-1
Diagnosis: HTN
Drugs: Amlodipine 10mg x30
```

Final interpretation must be authorization submission, not greeting.

## 6. Intent taxonomy

Use stable semantic intents rather than multiplying one-off intents:

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

The implementation may internally normalize several of these into a smaller `goal` enum, but externally visible behavior must remain compatible with existing functionality.

## 7. Goal model

The brain should also resolve a higher-level goal:

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

`intent` describes the linguistic classification; `goal` describes the business objective.

## 8. Authorization evidence priority

A message containing multiple recognizable authorization fields is a strong authorization signal.

Strong fields include:

- Full Name / Patient Name / Name
- NHIA / NHIS / Policy Number
- Diagnosis / Clinical Complaint
- Treatment / Drugs / Medication
- Procedure / Procedures
- Investigation / Investigations
- Services / Consultation
- Referral information

At least two strong field families should normally be enough to route into authorization understanding. A complete set must be treated as a high-confidence authorization submission regardless of greetings or conversational preamble.

Examples that MUST be authorization-aware:

```text
Good morning. I want to submit this patient.
Name: Segun Akinoe
NHIA No: 1234567
Diagnosis: Malaria
Treatment: Artemether/Lumefantrine
```

```text
Hello, please see request below.
Full Name: Akin Tehingbola
NHIS No: 2871250-1
Diagnosis: HTN
Drugs: Amlodipine 10mg
```

## 9. Field normalization

Normalize aliases without destroying the original text.

| Canonical field | Examples |
|---|---|
| patientName | Name, Full Name, Patient Name |
| policyNumber | NHIA No, NHIS No, NHIA Number, NHIS Number, Policy No |
| diagnosis | Diagnosis, Clinical Complaint, Impression |
| treatment | Treatment, Drugs, Medication, Medications |
| procedure | Procedure, Procedures |
| investigation | Investigation, Investigations, Test, Tests |
| requestedService | Services, Consultation, Requested Service |
| originatingHospital | From, Hospital, Facility, Clinic |
| referralHospital | Referred to |
| patientPhone | Phone, Phone No, Patient Phone |

Preserve raw message text for auditability.

## 10. Conversation state

The stored conversation state should conceptually contain:

```typescript
interface ConversationState {
  senderPhone: string;
  activeGoal: string | null;
  activeIntent: string | null;
  activePatientName: string | null;
  activePolicyNumber: string | null;
  collectedFields: Record<string, unknown>;
  missingFields: string[];
  conversationSummary: string | null;
  lastTool: string | null;
  lastAuthorizationRequestId: string | null;
  stateVersion: number;
  updatedAt: string;
}
```

Do not rely on an LLM's hidden memory. The database is the source of conversation state.

## 11. State transitions

Valid transitions include:

```text
NONE -> GREETING
NONE -> SUBMIT_AUTHORIZATION
NONE -> CHECK_STATUS
NONE -> GENERAL_ASSISTANCE

GREETING -> SUBMIT_AUTHORIZATION
GREETING -> CHECK_STATUS
GREETING -> PROVIDER_QUERY
GREETING -> GENERAL_CONVERSATION

SUBMIT_AUTHORIZATION -> CONTINUE_AUTHORIZATION
SUBMIT_AUTHORIZATION -> AUTHORIZATION_COMPLETE
SUBMIT_AUTHORIZATION -> CHECK_STATUS
SUBMIT_AUTHORIZATION -> CANCEL_OR_RESTART

CONTINUE_AUTHORIZATION -> CONTINUE_AUTHORIZATION
CONTINUE_AUTHORIZATION -> AUTHORIZATION_COMPLETE
CONTINUE_AUTHORIZATION -> CHECK_STATUS
CONTINUE_AUTHORIZATION -> CANCEL_OR_RESTART

ANY -> CHECK_STATUS
ANY -> GENERAL_CONVERSATION
ANY -> CANCEL_OR_RESTART
```

The important rule is that users can switch tasks naturally.

## 12. Task switching

A new message must be allowed to supersede the previous task when the new message clearly expresses a different goal.

Example:

```text
User: I want to submit an authorization.
Bot: Please provide patient details.
User: Actually, what is the status of Segun's previous request?
```

Final goal = `CHECK_STATUS`, not `CONTINUE_AUTHORIZATION`.

The system should preserve unfinished authorization context for later recovery unless the user explicitly cancels/restarts or starts a clearly different patient/task.

## 13. Ambiguity handling

Never guess when database identity is ambiguous.

Example:

```text
User: What is the status of Segun?
```

If multiple matching requests exist, ask for clarification:

```text
I found more than one request for Segun. Please provide the request number or the approximate date of the request so I can check the correct one.
```

Do not fabricate a request ID or status.

## 14. Confidence model

Use confidence internally:

```text
HIGH
MEDIUM
LOW
```

High-confidence structured authorization should not be overridden by conversational context.

Medium-confidence requests should collect missing information.

Low-confidence messages should receive a helpful clarification rather than the generic fallback.

## 15. Tool contract

The brain may request tools such as:

```typescript
type BrainTool =
  | "submit_authorization"
  | "find_authorization_requests"
  | "get_authorization_status"
  | "get_authorization_details"
  | "cancel_authorization"
  | "get_provider_information";
```

The brain must never receive raw database credentials or service-role secrets.

## 16. Structured brain output

Use a schema similar to:

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
  ambiguity?: {
    required: boolean;
    reason?: string;
    candidates?: string[];
  };
  responseHint?: string | null;
  tool?: BrainTool | null;
}
```

## 17. Authorization completion rule

Authorization submission is complete only when the deterministic validator has:

- patient name
- NHIA/NHIS/policy number
- diagnosis or clinical complaint
- at least one requested medical service represented by treatment/drugs, procedure, investigation, or other valid requested service

Do not require the exact word `Treatment`.

Do not require patient phone when the WhatsApp sender is already known.

Do not treat an identical policy number as proof that two different patients are duplicates.

Duplicate protection must happen after patient/request identity is evaluated.

## 18. Generic fallback rule

The generic:

```text
Thank you for contacting Ronsberger HMO...
```

must be a last-resort fallback only.

It must never be used merely because the AI is uncertain when deterministic signals can identify a likely task.

If uncertainty remains, ask a targeted clarification.

## 19. No silent failures

Every queued inbound message must end in one of:

```text
processed successfully
processed with clarification response
processed with business response
retryable error
terminal error with logged reason
```

A complete authorization message must never disappear without a trace.

## 20. Observability

Every processing attempt should log:

```text
message_id
sender
conversation_state_before
raw_message_length
strong_auth_signal
brain_intent
brain_goal
brain_confidence
extracted_entities
missing_fields
selected_action
selected_tool
conversation_state_after
execution_result
response_send_result
error
```

Never log API keys, service-role keys, webhook tokens, or other secrets.

## 21. Safety boundary

This is a medical authorization workflow, not an autonomous clinical decision maker.

The AI may classify and extract information. It must not independently approve/reject medical treatment, invent clinical facts, or alter authorization decisions. Human/business-system decisions remain authoritative.

## 22. Compatibility requirements

The redesign must preserve:

- Evolution API integration.
- `whatsapp-webhook` behavior unless investigation proves a webhook change is required.
- Queue processing.
- Race-safe message claiming.
- `authorization_requests` schema.
- `submit-authorization` internal API.
- Existing status/detail/approval/rejection functionality.
- Request IDs such as `REQ-YYYYMMDD-NNN`.
- Message-to-authorization linkage.
- Proactive WhatsApp notifications.
- Duplicate protection.
- Sender-scoped authorization lookups.
- Multi-patient submissions.
- Security and service-role isolation.

## 23. Anti-patterns prohibited

Do NOT:

- replace Gemini with a huge regex-only system;
- add dozens of special-case `if` statements for individual phrases;
- let previous intent permanently control the next message;
- let the LLM write directly to Supabase;
- expose UUIDs to WhatsApp users;
- invent missing patient/request data;
- use the generic fallback as an error sink;
- silently swallow database or Evolution errors;
- modify the webhook merely to solve a worker routing problem;
- deploy untested changes directly to production.

## 24. Acceptance principle

The assistant is considered conversationally intelligent only when a user can naturally move among greetings, authorization submission, missing information, status, details, provider questions, and general conversation without needing to use a rigid command syntax.
