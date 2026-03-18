import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentMessage, AgentStreamEnvelope } from "../../shared/agent-contracts";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../domain/settings/normalize";
import {
  buildAgentPermissionResolutionMessage,
  enqueueAgentPermissionFromEnvelope,
  markAgentPermissionResolving,
  mergeRuntimeAgentMessageDecorations,
  normalizeIncomingDraftFiles,
  removeAttachmentById,
  removeAgentPermissionQueueItems,
  summarizeBlockedAttachmentMessages,
  type PendingAgentPermission,
  withPersistedAutoDetectedCapabilities
} from "./controller-helpers";

const createSettingsWithModel = (model: string) =>
  normalizeSettings({
    ...DEFAULT_SETTINGS,
    model,
    providers: [
      {
        ...DEFAULT_SETTINGS.providers[0],
        id: "provider-1",
        model
      }
    ],
    activeProviderId: "provider-1"
  });

describe("features/app/controller-helpers", () => {
  it("persists inferred model capabilities when missing and model has detectable signals", () => {
    const source = createSettingsWithModel("gpt-5");
    const next = withPersistedAutoDetectedCapabilities(source);

    const capabilities = next.providers[0].modelCapabilities["gpt-5"];
    assert.ok(capabilities);
    assert.equal(capabilities.textInput, true);
    assert.equal(capabilities.imageInput, true);
    assert.equal(capabilities.reasoningDisplay, true);
  });

  it("promotes legacy all-disabled stored capability values", () => {
    const source = createSettingsWithModel("gpt-5");
    source.providers[0].modelCapabilities["gpt-5"] = {
      textInput: true,
      imageInput: false,
      audioInput: false,
      videoInput: false,
      reasoningDisplay: false
    };

    const next = withPersistedAutoDetectedCapabilities(source);
    const capabilities = next.providers[0].modelCapabilities["gpt-5"];

    assert.equal(capabilities.imageInput, true);
    assert.equal(capabilities.reasoningDisplay, true);
  });

  it("keeps messages stable by runId/role and restores missing assistant decorations", () => {
    const previous: AgentMessage[] = [
      {
        id: "user-stable",
        sessionId: "s1",
        role: "user",
        content: "hello",
        createdAt: "2026-03-02T00:00:00.000Z",
        runId: "r1"
      },
      {
        id: "assistant-stable",
        sessionId: "s1",
        role: "assistant",
        content: "answer",
        createdAt: "2026-03-02T00:00:01.000Z",
        runId: "r1",
        toolCalls: [
          {
            id: "t1",
            serverName: "server",
            toolName: "tool",
            status: "success",
            message: "ok"
          }
        ]
      }
    ];
    const incoming: AgentMessage[] = [
      {
        id: "user-volatile",
        sessionId: "s1",
        role: "user",
        content: "hello",
        createdAt: "2026-03-02T00:00:02.000Z",
        runId: "r1"
      },
      {
        id: "assistant-volatile",
        sessionId: "s1",
        role: "assistant",
        content: "",
        createdAt: "2026-03-02T00:00:03.000Z",
        runId: "r1",
        toolCalls: []
      }
    ];

    const merged = mergeRuntimeAgentMessageDecorations(incoming, previous);

    assert.equal(merged[0].id, "user-stable");
    assert.equal(merged[1].id, "assistant-stable");
    assert.equal(merged[1].content, "answer");
    assert.equal(merged[1].toolCalls?.length, 1);
    assert.equal(merged[1].toolCalls?.[0]?.id, "t1");
  });

  it("enqueues permission requests once and ignores non-permission events", () => {
    const queue: PendingAgentPermission[] = [];
    const permissionPayload: AgentStreamEnvelope = {
      sessionId: "s1",
      runId: "r1",
      seq: 1,
      timestamp: "2026-03-03T00:00:00.000Z",
      event: {
        type: "permission_request",
        requestId: "req-1",
        toolName: "Read",
        reason: "Need file access",
        supportsAlwaysAllow: true
      }
    };
    const textPayload: AgentStreamEnvelope = {
      sessionId: "s1",
      runId: "r1",
      seq: 2,
      timestamp: "2026-03-03T00:00:01.000Z",
      event: {
        type: "text_delta",
        text: "hello"
      }
    };

    const withPermission = enqueueAgentPermissionFromEnvelope(queue, permissionPayload);
    const withDuplicate = enqueueAgentPermissionFromEnvelope(withPermission, permissionPayload);
    const withText = enqueueAgentPermissionFromEnvelope(withPermission, textPayload);

    assert.equal(withPermission.length, 1);
    assert.equal(withPermission[0].requestId, "req-1");
    assert.equal(withPermission[0].supportsAlwaysAllow, true);
    assert.equal(withDuplicate.length, 1);
    assert.equal(withText.length, 1);
  });

  it("filters and marks permission queue entries predictably", () => {
    const queue: PendingAgentPermission[] = [
      {
        runId: "r1",
        sessionId: "s1",
        requestId: "req-1",
        supportsAlwaysAllow: false,
        resolving: false,
        createdAt: "2026-03-03T00:00:00.000Z"
      },
      {
        runId: "r2",
        sessionId: "s2",
        requestId: "req-2",
        supportsAlwaysAllow: false,
        resolving: false,
        createdAt: "2026-03-03T00:00:01.000Z"
      }
    ];

    const filtered = removeAgentPermissionQueueItems(queue, { runId: "r1" });
    const marked = markAgentPermissionResolving(queue, { runId: "r2", requestId: "req-2" }, true);

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].runId, "r2");
    assert.equal(marked[0].resolving, false);
    assert.equal(marked[1].resolving, true);
  });

  it("builds stable permission resolution messages", () => {
    assert.equal(
      buildAgentPermissionResolutionMessage("approved", false),
      "Approved by user (once)."
    );
    assert.equal(
      buildAgentPermissionResolutionMessage("approved", true),
      "Approved by user (always allow)."
    );
    assert.equal(
      buildAgentPermissionResolutionMessage("denied", true),
      "Denied by user."
    );
  });

  it("normalizes incoming draft files and summarizes blocked messages", () => {
    const first = { name: "a.txt" } as File;
    const second = { name: "b.txt" } as File;

    assert.deepEqual(normalizeIncomingDraftFiles(null), []);
    assert.deepEqual(normalizeIncomingDraftFiles([]), []);
    assert.deepEqual(normalizeIncomingDraftFiles([first, second]), [first, second]);

    assert.equal(summarizeBlockedAttachmentMessages([]), "");
    assert.equal(
      summarizeBlockedAttachmentMessages([
        "A",
        "A",
        "B",
        "C",
        "D"
      ]),
      "A；B；C"
    );
  });

  it("removes attachment by id and returns removed entry", () => {
    const first = { id: "a", name: "A" };
    const second = { id: "b", name: "B" };
    const source = [first, second];

    const removed = removeAttachmentById(source, "a");
    assert.equal(removed.removed, first);
    assert.deepEqual(removed.next, [second]);

    const missing = removeAttachmentById(source, "x");
    assert.equal(missing.removed, undefined);
    assert.deepEqual(missing.next, source);
  });
});
