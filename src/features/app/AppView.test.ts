import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import {
  CENTERED_LANDING_BODY_TEXT,
  CENTERED_LANDING_HEADING_TEXT,
  CHAT_HOME_CENTER_TITLE_TEXT,
  getCenteredLandingBodyClassName,
  getCenteredLandingComposerClassName,
  getCenteredLandingContentClassName,
  getCenteredLandingHeadingClassName,
  getChatHomeNavActionClassName,
  getChatHomeNavBrandClassName,
  getChatHomeTopNavClassName,
  getChatHeaderClassNameForFloatingToggle,
  getFloatingSidebarToggleContainerClassName
} from "./AppView";

describe("features/app/AppView", () => {
  it("keeps the floating sidebar toggle close to the mac traffic lights", () => {
    assert.equal(
      getFloatingSidebarToggleContainerClassName(true),
      "absolute left-[104px] top-3 z-20"
    );
    assert.equal(
      getFloatingSidebarToggleContainerClassName(false),
      "absolute left-4 top-4 z-20"
    );
  });

  it("keeps chat header text clear of the mac titlebar toggle", () => {
    assert.equal(
      getChatHeaderClassNameForFloatingToggle(true, true),
      "pl-[152px] sm:pl-[156px]"
    );
    assert.equal(
      getChatHeaderClassNameForFloatingToggle(true, false),
      "pl-[140px] sm:pl-[144px]"
    );
    assert.equal(getChatHeaderClassNameForFloatingToggle(false, true), undefined);
  });

  it("uses the shared reading stage width for the centered landing composer", () => {
    assert.equal(
      getCenteredLandingComposerClassName(),
      "chat-reading-stage mx-auto w-full min-w-0 max-w-[1120px]"
    );
  });

  it("keeps the centered landing title grounded in the Echo workspace brand", () => {
    assert.equal(CENTERED_LANDING_HEADING_TEXT, "Start a conversation with Echo");
    assert.equal(
      getCenteredLandingHeadingClassName(),
      "landing-title-hero mx-auto max-w-[780px] text-center text-[38px] leading-[1] tracking-[-0.05em] text-foreground sm:text-[48px] md:text-[58px]"
    );
  });

  it("uses supporting copy and spacing that match the dark-glass landing layout", () => {
    assert.equal(
      CENTERED_LANDING_BODY_TEXT,
      "Draft, review, and keep moving without leaving the conversation."
    );
    assert.equal(
      getCenteredLandingBodyClassName(),
      "mx-auto mt-4 max-w-[620px] text-center text-[15px] leading-[1.75] text-muted-foreground/80 sm:text-[16px]"
    );
    assert.equal(
      getCenteredLandingContentClassName(),
      "flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-8 pt-8 sm:px-5 sm:pb-10 sm:pt-10"
    );
  });

  it("uses a lighter desktop toolbar shell for the landing page", () => {
    assert.equal(CHAT_HOME_CENTER_TITLE_TEXT, "Echo");
    assert.equal(
      getChatHomeTopNavClassName(),
      "chat-reading-stage mx-auto grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 px-4 pb-5 pt-4 sm:px-5"
    );
    assert.equal(
      getChatHomeNavBrandClassName(),
      "text-[15px] font-semibold uppercase tracking-[0.2em] text-foreground/86"
    );
    assert.equal(
      getChatHomeNavActionClassName(),
      "text-[12px] font-medium uppercase tracking-[0.18em] text-foreground/52 transition-colors hover:text-foreground/84"
    );
  });

  it("keeps the landing nav minimal with just the core text actions", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { __ChatHomeTopNavForTest } = await import("./AppView");

    const markup = renderToStaticMarkup(
      createElement(__ChatHomeTopNavForTest, {
        onOpenSearch: () => {},
        onExportArchive: () => {}
      })
    );

    assert.match(markup, />Echo</);
    assert.match(markup, />Chat Workspace</);
    assert.match(markup, />Search</);
    assert.match(markup, />Export</);
    assert.doesNotMatch(markup, /aria-label="More actions"/);
    assert.doesNotMatch(markup, /aria-label="Open profile settings"/);
  });

});
