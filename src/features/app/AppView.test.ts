import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CENTERED_LANDING_BODY_TEXT,
  CENTERED_LANDING_HEADING_TEXT,
  getCenteredLandingBodyClassName,
  getCenteredLandingComposerClassName,
  getCenteredLandingContentClassName,
  getCenteredLandingHeadingClassName,
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

  it("uses supporting copy and spacing that match the landing layout", () => {
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
});
