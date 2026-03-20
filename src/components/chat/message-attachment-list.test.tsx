import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getMessageAttachmentListCardClassName,
  getMessageAttachmentListWrapClassName,
  MessageAttachmentList
} from "./message-attachment-list";

describe("components/chat/message-attachment-list", () => {
  it("uses docked card styling instead of simple pills", () => {
    assert.equal(
      getMessageAttachmentListWrapClassName(true),
      "mt-3 flex flex-wrap justify-end gap-2.5"
    );
    assert.equal(
      getMessageAttachmentListWrapClassName(false),
      "mt-3 flex flex-wrap gap-2.5"
    );
    assert.equal(
      getMessageAttachmentListCardClassName(),
      "min-w-[220px] max-w-[280px] rounded-[22px] border border-border/50 bg-card/82 p-3 shadow-[0_16px_36px_rgba(79,60,35,0.08)] backdrop-blur-xl"
    );
  });

  it("renders image and text attachments as richer cards", () => {
    const markup = renderToStaticMarkup(
      <MessageAttachmentList
        isUser={false}
        attachments={[
          {
            id: "attachment-1",
            name: "brand_guidelines_v2.pdf",
            mimeType: "application/pdf",
            size: 4404019,
            kind: "file",
          },
          {
            id: "attachment-2",
            name: "notes.md",
            mimeType: "text/markdown",
            size: 420,
            kind: "text",
            textContent: "Editorial macOS look with warm neutral surfaces and precise spacing."
          }
        ]}
      />
    );

    assert.match(markup, /brand_guidelines_v2\.pdf/);
    assert.match(markup, /4\.2 MB/);
    assert.match(markup, /PDF/);
    assert.match(markup, /notes\.md/);
    assert.match(markup, /Editorial macOS look/);
    assert.match(markup, /rounded-\[22px\]/);
  });
});
